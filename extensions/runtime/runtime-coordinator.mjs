import { randomUUID } from "node:crypto";
import { createGitReadGate } from "./git-read-gate.mjs";
import { createMaintenanceConfigStore } from "./maintenance-config-store.mjs";
import { createMaintenanceController } from "./maintenance-controller.mjs";
import { mergePrivacyExcludedPaths } from "./privacy-policy.mjs";

const EXPLICIT_SCAN_COMMANDS = new Set(["picm-new", "picm-adopt", "picm-maintain", "picm-optimize"]);
const GUARDED_PATH_TOOLS = new Set(["read", "edit", "write", "grep", "find", "ls"]);

export function createRuntimeCoordinator({
  packageRoot,
  scanWorkflowTtlMs = 2 * 60 * 60 * 1000,
  policyPreviewTtlMs = 10 * 60 * 1000,
  maxPolicyPreviews = 32,
} = {}) {
  const runtimes = new Map();
  const automaticReadOnlySessions = new Map();
  const scanWorkflows = new Map();
  const activeScans = new Map();
  const scanControlQueues = new Map();
  const policyPreviews = new Map();
  const toolExecutionSessions = new Map();

  const sessionIdFor = (ctx) =>
    ctx.sessionManager?.getSessionId?.() ??
    ctx.sessionManager?.getSessionFile?.() ??
    ctx.sessionManager ??
    ctx;

  function settleToolExecution(sessionId, state, lease) {
    if (state.calls.get(lease.toolCallId) !== lease) return;
    state.calls.delete(lease.toolCallId);
    if (state.completionFence === lease) state.completionFence = undefined;
    lease.resolve();
    if (state.calls.size === 0 && toolExecutionSessions.get(sessionId) === state) {
      toolExecutionSessions.delete(sessionId);
    }
  }

  function clearToolExecutions(sessionId) {
    const state = toolExecutionSessions.get(sessionId);
    if (!state) return false;
    toolExecutionSessions.delete(sessionId);
    for (const lease of state.calls.values()) lease.resolve();
    state.calls.clear();
    state.completionFence = undefined;
    return true;
  }

  function toolExecutionStateFor(ctx, create = false) {
    const sessionId = sessionIdFor(ctx);
    let state = toolExecutionSessions.get(sessionId);
    if (state?.cwd !== ctx.cwd) {
      clearToolExecutions(sessionId);
      state = undefined;
    }
    if (!state && create) {
      state = {
        cwd: ctx.cwd,
        nextSequence: 0,
        calls: new Map(),
        completionFence: undefined,
      };
      toolExecutionSessions.set(sessionId, state);
    }
    return state;
  }

  function pruneScans(now = Date.now()) {
    for (const [sessionId, workflow] of scanWorkflows) {
      if (!workflow.completed && workflow.expiresAt <= now) {
        scanWorkflows.delete(sessionId);
        activeScans.delete(sessionId);
        clearToolExecutions(sessionId);
      }
    }
    for (const [sessionId, scan] of activeScans) {
      if (scan.expiresAt <= now) activeScans.delete(sessionId);
    }
  }

  function workflowFor(ctx) {
    pruneScans();
    const sessionId = sessionIdFor(ctx);
    const workflow = scanWorkflows.get(sessionId);
    const scan = activeScans.get(sessionId);
    if ((workflow && workflow.cwd !== ctx.cwd) || (scan && scan.cwd !== ctx.cwd)) {
      scanWorkflows.delete(sessionId);
      activeScans.delete(sessionId);
      clearToolExecutions(sessionId);
      return undefined;
    }
    return workflow;
  }

  function clearActiveScan(ctx) {
    const sessionId = sessionIdFor(ctx);
    if (activeScans.get(sessionId)?.cwd === ctx.cwd) activeScans.delete(sessionId);
  }

  function clearWorkflow(ctx) {
    const sessionId = sessionIdFor(ctx);
    const hadWorkflow = scanWorkflows.delete(sessionId);
    const hadActiveScan = activeScans.delete(sessionId);
    const hadToolExecutions = clearToolExecutions(sessionId);
    return hadWorkflow || hadActiveScan || hadToolExecutions;
  }

  function workflowState(workflow) {
    return {
      cwd: workflow.cwd,
      command: workflow.command,
      expiresAt: new Date(workflow.expiresAt).toISOString(),
      preflightComplete: workflow.preflightComplete,
      privacyReviewed: workflow.privacyReviewed,
      scanStarted: workflow.scanStarted,
      maintenanceResetAttempted: workflow.maintenanceResetAttempted,
      completed: workflow.completed,
      excludedPaths: [...workflow.excludedPaths],
    };
  }

  function authorizeWorkflow(ctx, command) {
    const sessionId = sessionIdFor(ctx);
    clearToolExecutions(sessionId);
    const expiresAt = Date.now() + scanWorkflowTtlMs;
    const workflow = {
      cwd: ctx.cwd,
      command,
      expiresAt,
      preflightComplete: false,
      privacyReviewed: false,
      scanStarted: false,
      maintenanceResetAttempted: false,
      completed: false,
      excludedPaths: [],
    };
    scanWorkflows.set(sessionId, workflow);
    activeScans.delete(sessionId);
    return workflowState(workflow);
  }

  function restoreWorkflow(ctx, state) {
    clearWorkflow(ctx);
    if (
      (state?.status !== "authorized" && state?.status !== "completed") ||
      state.cwd !== ctx.cwd ||
      !EXPLICIT_SCAN_COMMANDS.has(state.command)
    ) {
      return false;
    }
    const completed = state.status === "completed";
    const parsedExpiresAt = Date.parse(state.expiresAt);
    const expiresAt = Number.isFinite(parsedExpiresAt) ? parsedExpiresAt : Date.now();
    if (!completed && (!Number.isFinite(parsedExpiresAt) || expiresAt <= Date.now())) return false;
    let excludedPaths;
    try {
      excludedPaths = mergePrivacyExcludedPaths(ctx.cwd, state.excludedPaths ?? []);
    } catch {
      if (!completed) return false;
      excludedPaths = [];
    }
    const completeState =
      typeof state.preflightComplete === "boolean" &&
      typeof state.privacyReviewed === "boolean" &&
      typeof state.scanStarted === "boolean" &&
      typeof state.maintenanceResetAttempted === "boolean" &&
      Array.isArray(state.excludedPaths);
    const preflightComplete = completeState && state.preflightComplete;
    const privacyReviewed = preflightComplete && state.privacyReviewed;
    scanWorkflows.set(sessionIdFor(ctx), {
      cwd: ctx.cwd,
      command: state.command,
      expiresAt,
      preflightComplete,
      privacyReviewed,
      scanStarted: privacyReviewed && state.scanStarted === true,
      maintenanceResetAttempted:
        privacyReviewed && state.maintenanceResetAttempted === true,
      completed,
      excludedPaths,
    });
    return true;
  }

  function requireCurrentWorkflow(sessionId, workflow) {
    if (scanWorkflows.get(sessionId) !== workflow || workflow.completed) {
      throw new Error("PICM_SCAN_STALE: workflow changed or completed while the scan action was running");
    }
  }

  function throwIfAborted(signal, code) {
    if (signal?.aborted) throw new Error(`${code}: operation was cancelled before mutation`);
  }

  async function runScanControl(ctx, params, execution = {}) {
    const { action, path, excludedPaths = [], persist = false } = params;
    const sessionId = sessionIdFor(ctx);
    const workflow = workflowFor(ctx);
    const automaticState = automaticFor(ctx);
    const automatic = Boolean(automaticState);
    if (workflow?.completed && action !== "status" && action !== "complete") {
      throw new Error("PICM_SCAN_COMPLETE: wait for the completed workflow to settle before starting another scan action");
    }
    if (automaticState?.expiresAt <= Date.now()) {
      throw new Error("PICM_AUTOMATIC_SCAN_EXPIRED: automatic advisory safety boundary expired before settlement");
    }
    if (automatic && action !== "inventory") {
      throw new Error("PICM_AUTOMATIC_INVENTORY_ONLY: automatic advisory sessions may only request inventory");
    }
    if (action === "preflight") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, /picm-maintain, or /picm-optimize before preflight");
      }
      const details = await runtime(ctx.cwd).gate.preflight();
      requireCurrentWorkflow(sessionId, workflow);
      workflow.preflightComplete = true;
      workflow.expiresAt = Date.now() + scanWorkflowTtlMs;
      return {
        ok: true,
        action,
        authorized: true,
        active: false,
        ...details,
        ...workflowState(workflow),
      };
    }
    if (action === "privacy") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, /picm-maintain, or /picm-optimize before privacy review");
      }
      if (!workflow.preflightComplete) {
        throw new Error("PICM_PREFLIGHT_INCOMPLETE: complete picm_scan_control preflight before privacy review");
      }
      const store = runtime(ctx.cwd).store;
      const current = await store.readPrivacyForReview();
      requireCurrentWorkflow(sessionId, workflow);
      if (!current.ok) throw new Error(`${current.code}: ${current.message}`);
      const additions = mergePrivacyExcludedPaths(ctx.cwd, excludedPaths);
      let persistedPrivacy = current.privacy;
      let configChanged = false;
      if (persist && additions.length > 0) {
        if (ctx.mode !== "tui") {
          throw new Error("PRIVACY_APPLY_TUI_ONLY: persistent privacy exclusions require interactive TUI confirmation");
        }
        const nextPrivacy = {
          ...(current.privacy ?? {}),
          excludedPaths: mergePrivacyExcludedPaths(
            ctx.cwd,
            current.privacy?.excludedPaths ?? [],
            additions,
          ),
        };
        throwIfAborted(execution.signal, "PICM_SCAN_ABORTED");
        const confirmed = await ctx.ui.confirm(
          "Persist PiCM privacy exclusions?",
          `Exact .picm/config.json patch:\n${JSON.stringify({ privacy: nextPrivacy }, null, 2)}`,
          { signal: execution.signal },
        );
        requireCurrentWorkflow(sessionId, workflow);
        throwIfAborted(execution.signal, "PICM_SCAN_ABORTED");
        if (!confirmed) {
          return {
            ok: false,
            action,
            code: "PRIVACY_APPLY_DECLINED",
            message: "No privacy settings were changed and scan privacy review remains incomplete",
          };
        }
        const update = await store.compareAndUpdatePrivacyForReview(current.privacy, nextPrivacy);
        requireCurrentWorkflow(sessionId, workflow);
        if (!update.ok) throw new Error(`${update.code}: ${update.message}`);
        if (update.conflict) throw new Error(`${update.code}: ${update.message}`);
        persistedPrivacy = nextPrivacy;
        configChanged = update.changed;
      }
      workflow.excludedPaths = mergePrivacyExcludedPaths(
        ctx.cwd,
        workflow.excludedPaths,
        persistedPrivacy?.excludedPaths ?? [],
        additions,
      );
      workflow.privacyReviewed = true;
      let maintenanceReset;
      if (!workflow.maintenanceResetAttempted) {
        if (workflow.command !== "picm-optimize") {
          maintenanceReset = await runtime(ctx.cwd).controller.resetExistingCycle();
          requireCurrentWorkflow(sessionId, workflow);
        }
        workflow.maintenanceResetAttempted = true;
      }
      workflow.expiresAt = Date.now() + scanWorkflowTtlMs;
      clearActiveScan(ctx);
      return {
        ok: true,
        action,
        authorized: true,
        active: false,
        configChanged,
        persisted: persist && additions.length > 0,
        maintenanceReset,
        ...workflowState(workflow),
      };
    }
    if (action === "inventory") {
      const scan = activeScans.get(sessionId);
      if ((!workflow && !automatic) || scan?.cwd !== ctx.cwd) {
        throw new Error("PICM_SCAN_NOT_ACTIVE: begin an explicitly authorized scan before requesting inventory");
      }
      const inventory = await runtime(ctx.cwd).gate.refreshInventory(path, scan.excludedPaths);
      if (workflow) requireCurrentWorkflow(sessionId, workflow);
      return {
        ok: true,
        action,
        authorized: Boolean(workflow),
        automatic,
        active: true,
        command: workflow?.command ?? "picm-maintain",
        worktree: inventory.worktree,
        isolated: inventory.isolated,
        candidates: [...inventory.candidates].sort(),
        excludedPaths: [...scan.excludedPaths],
        expiresAt: new Date((workflow ?? scan).expiresAt).toISOString(),
      };
    }
    if (action === "begin") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, /picm-maintain, or /picm-optimize before scanning");
      }
      if (!workflow.preflightComplete) {
        throw new Error("PICM_PREFLIGHT_INCOMPLETE: complete picm_scan_control preflight before scanning");
      }
      if (!workflow.privacyReviewed) {
        throw new Error("PICM_PRIVACY_NOT_REVIEWED: complete picm_scan_control privacy before scanning");
      }
      const config = await runtime(ctx.cwd).store.read();
      requireCurrentWorkflow(sessionId, workflow);
      if (!config.ok) throw new Error(`${config.code}: ${config.message}`);
      workflow.excludedPaths = mergePrivacyExcludedPaths(
        ctx.cwd,
        workflow.excludedPaths,
        config.privacy?.excludedPaths ?? [],
      );
      workflow.scanStarted = true;
      workflow.expiresAt = Date.now() + scanWorkflowTtlMs;
      activeScans.set(sessionId, {
        cwd: ctx.cwd,
        expiresAt: workflow.expiresAt,
        excludedPaths: [...workflow.excludedPaths],
      });
    } else if (action === "end") {
      clearActiveScan(ctx);
    } else if (action === "complete") {
      await waitForCompletionBarrier(ctx, execution.toolCallId, execution.signal);
      if (workflow && !workflow.completed) {
        requireCurrentWorkflow(sessionId, workflow);
        workflow.completed = true;
      }
      clearActiveScan(ctx);
      return {
        ok: true,
        action,
        ...(workflow ? workflowState(workflow) : {}),
        authorized: false,
        active: false,
        completed: Boolean(workflow),
      };
    }
    const current = workflowFor(ctx);
    const active = activeScans.get(sessionIdFor(ctx));
    return {
      ok: true,
      action,
      authorized: Boolean(current) && !current.completed,
      active: active?.cwd === ctx.cwd,
      ...(current ? workflowState(current) : {}),
    };
  }

  async function scanControl(ctx, params, execution) {
    const sessionId = sessionIdFor(ctx);
    const prior = scanControlQueues.get(sessionId) ?? Promise.resolve();
    let release;
    const turn = new Promise((resolveTurn) => { release = resolveTurn; });
    const queued = prior.then(() => turn);
    scanControlQueues.set(sessionId, queued);
    await prior;
    try {
      return await runScanControl(ctx, params, execution);
    } finally {
      release();
      if (scanControlQueues.get(sessionId) === queued) scanControlQueues.delete(sessionId);
    }
  }

  function runtime(cwd) {
    let value = runtimes.get(cwd);
    if (!value) {
      const gate = createGitReadGate({ cwd, packageRoot });
      const store = createMaintenanceConfigStore({ cwd, gate });
      value = { gate, store, controller: createMaintenanceController({ store }) };
      runtimes.set(cwd, value);
    }
    return value;
  }

  async function dispose(ctx) {
    clearAutomatic(ctx);
    clearWorkflow(ctx);
    const value = runtimes.get(ctx.cwd);
    runtimes.delete(ctx.cwd);
    await value?.gate.dispose();
  }

  function isWorkflowCompleted(ctx) {
    return workflowFor(ctx)?.completed === true;
  }

  function isAutomatic(ctx) {
    return Boolean(automaticFor(ctx));
  }

  function automaticFor(ctx) {
    const state = automaticReadOnlySessions.get(sessionIdFor(ctx));
    return state?.cwd === ctx.cwd ? state : undefined;
  }

  async function beginAutomatic(ctx) {
    const sessionId = sessionIdFor(ctx);
    const expiresAt = Date.now() + scanWorkflowTtlMs;
    const config = await runtime(ctx.cwd).store.read();
    if (!config.ok) throw new Error(`${config.code}: ${config.message}`);
    const excludedPaths = mergePrivacyExcludedPaths(
      ctx.cwd,
      config.privacy?.excludedPaths ?? [],
    );
    automaticReadOnlySessions.set(sessionId, { cwd: ctx.cwd, expiresAt });
    activeScans.set(sessionId, { cwd: ctx.cwd, expiresAt, excludedPaths });
  }

  function clearAutomatic(ctx) {
    const sessionId = sessionIdFor(ctx);
    if (automaticReadOnlySessions.get(sessionId)?.cwd === ctx.cwd) automaticReadOnlySessions.delete(sessionId);
  }

  function settle(ctx) {
    clearAutomatic(ctx);
    if (workflowFor(ctx)?.completed) {
      clearWorkflow(ctx);
      return true;
    }
    clearActiveScan(ctx);
    clearToolExecutions(sessionIdFor(ctx));
    return false;
  }

  function startToolExecution(event, ctx) {
    if (typeof event.toolCallId !== "string") return;
    const workflow = workflowFor(ctx);
    if (!workflow || workflow.completed) return;
    const sessionId = sessionIdFor(ctx);
    const state = toolExecutionStateFor(ctx, true);
    const prior = state.calls.get(event.toolCallId);
    if (prior) {
      state.calls.delete(event.toolCallId);
      if (state.completionFence === prior) state.completionFence = undefined;
      prior.resolve();
    }
    let resolveLease;
    const done = new Promise((resolveDone) => {
      resolveLease = resolveDone;
    });
    state.calls.set(event.toolCallId, {
      toolCallId: event.toolCallId,
      sequence: state.nextSequence++,
      workflow,
      admitted: false,
      barrierOperation: false,
      completion: false,
      done,
      resolve: resolveLease,
    });
    if (toolExecutionSessions.get(sessionId) !== state) {
      toolExecutionSessions.set(sessionId, state);
    }
  }

  function requiresCompletionBarrier(event) {
    return !(
      event.toolName === "picm_scan_control" && event.input?.action === "complete"
    );
  }

  function admitToolExecution(event, ctx) {
    const state = toolExecutionStateFor(ctx);
    const lease = state?.calls.get(event.toolCallId);
    const workflow = workflowFor(ctx);
    if (!lease || lease.workflow !== workflow || workflow?.completed) return;
    lease.admitted = true;
    lease.barrierOperation = requiresCompletionBarrier(event);
    lease.completion =
      event.toolName === "picm_scan_control" && event.input?.action === "complete";
    if (lease.completion && !state.completionFence) state.completionFence = lease;
  }

  function rejectToolExecution(event, ctx) {
    const sessionId = sessionIdFor(ctx);
    const state = toolExecutionStateFor(ctx);
    const lease = state?.calls.get(event.toolCallId);
    if (lease) settleToolExecution(sessionId, state, lease);
  }

  function endToolExecution(event, ctx) {
    const sessionId = sessionIdFor(ctx);
    const state = toolExecutionStateFor(ctx);
    const lease = state?.calls.get(event.toolCallId);
    if (lease) settleToolExecution(sessionId, state, lease);
  }

  function pendingCompletionBlocks(event, ctx) {
    const state = toolExecutionStateFor(ctx);
    const lease = state?.calls.get(event.toolCallId);
    const fence = state?.completionFence;
    return Boolean(lease && fence && lease !== fence && lease.sequence > fence.sequence);
  }

  async function waitForSettlements(settlements, signal) {
    if (signal?.aborted) {
      throw new Error("PICM_SCAN_ABORTED: completion was cancelled before the execution barrier settled");
    }
    if (settlements.length === 0) return;
    const all = Promise.all(settlements);
    if (!signal) {
      await all;
      return;
    }
    await new Promise((resolveWait, rejectWait) => {
      const onAbort = () => {
        rejectWait(new Error("PICM_SCAN_ABORTED: completion was cancelled before the execution barrier settled"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      all.then(resolveWait, rejectWait).finally(() => {
        signal.removeEventListener("abort", onAbort);
      });
    });
  }

  async function waitForCompletionBarrier(ctx, toolCallId, signal) {
    if (typeof toolCallId !== "string") return;
    const sessionId = sessionIdFor(ctx);
    const state = toolExecutionStateFor(ctx);
    const completion = state?.calls.get(toolCallId);
    if (!completion) return;
    if (!completion.admitted || !completion.completion || state.completionFence !== completion) {
      throw new Error("PICM_COMPLETION_LEASE_INVALID: completion did not retain its admitted execution lease");
    }
    const settlements = [...state.calls.values()]
      .filter((lease) =>
        lease !== completion &&
        lease.sequence < completion.sequence &&
        lease.workflow === completion.workflow &&
        lease.admitted &&
        lease.barrierOperation)
      .map((lease) => lease.done);
    await waitForSettlements(settlements, signal);
    if (
      toolExecutionSessions.get(sessionId) !== state ||
      state.calls.get(toolCallId) !== completion ||
      state.completionFence !== completion
    ) {
      throw new Error("PICM_SCAN_STALE: workflow execution leases changed while completion was waiting");
    }
  }

  function gateStateIsCurrent(ctx, workflow, scan) {
    const currentWorkflow = workflowFor(ctx);
    return (
      currentWorkflow === workflow &&
      currentWorkflow?.completed !== true &&
      activeScans.get(sessionIdFor(ctx)) === scan
    );
  }

  async function checkToolCall(event, ctx) {
    const automaticState = automaticFor(ctx);
    if (automaticState) {
      if (automaticState.expiresAt <= Date.now()) {
        return {
          allowed: false,
          reason: "Scheduled maintenance safety boundary expired before settlement; all agent tools are blocked",
        };
      }
      const automaticInventory = event.toolName === "picm_scan_control" && event.input?.action === "inventory";
      if (!automaticInventory && !["read", "grep", "find", "ls"].includes(event.toolName)) {
        return { allowed: false, reason: "Scheduled maintenance is advisory and read-only; this tool is blocked" };
      }
      if (automaticInventory) return { allowed: true };
    }

    const workflow = workflowFor(ctx);
    const sessionId = sessionIdFor(ctx);
    const scan = activeScans.get(sessionId);
    if (workflow?.completed) {
      if (event.toolName === "picm_scan_control") return { allowed: true };
      return {
        allowed: false,
        reason: "The completed PiCM workflow must settle before agent tools can access the project",
      };
    }
    if (workflow && pendingCompletionBlocks(event, ctx)) {
      return {
        allowed: false,
        reason: "PiCM completion was already admitted; later sibling tools are blocked",
      };
    }
    if (workflow && !workflow.privacyReviewed) {
      if (event.toolName === "picm_scan_control") return { allowed: true };
      return {
        allowed: false,
        reason: "PiCM privacy review must complete before any agent tool can inspect or change the project",
      };
    }
    if (workflow && event.toolName === "picm_scan_control") return { allowed: true };
    if (workflow && event.toolName === "picm_maintenance_policy") {
      if (event.input?.action === "preview" || workflow.scanStarted) return { allowed: true };
      return {
        allowed: false,
        reason: "Begin the privacy-reviewed PiCM scan before maintenance status or apply can access project config",
      };
    }
    if (workflow && scan?.cwd !== ctx.cwd) {
      if (event.toolName === "picm_scan_control") return { allowed: true };
      if (event.toolName === "read") {
        const trusted = await runtime(ctx.cwd).gate.checkTrustedPackageRead(
          event.toolName,
          event.input?.path,
        );
        if (trusted.allowed) {
          const currentWorkflow = workflowFor(ctx);
          if (currentWorkflow === workflow && !workflow.completed) return trusted;
        }
      }
      return {
        allowed: false,
        reason: "Begin the privacy-reviewed PiCM scan before using agent tools",
      };
    }

    try {
      if (scan?.cwd === ctx.cwd) {
        if (event.toolName === "bash") return runtime(ctx.cwd).gate.checkBash(event.input?.command);
        if (!GUARDED_PATH_TOOLS.has(event.toolName)) {
          return { allowed: false, reason: "Unrecognized agent tools are blocked during active PiCM scans" };
        }
        const decision = await runtime(ctx.cwd).gate.checkPath(
          event.toolName,
          event.input?.path,
          scan.excludedPaths,
        );
        if (!gateStateIsCurrent(ctx, workflow, scan)) {
          return { allowed: false, reason: "PiCM scan state changed while the guarded tool call was being checked" };
        }
        return decision;
      }

      if (workflow?.excludedPaths.length > 0) {
        if (event.toolName === "picm_scan_control") return { allowed: true };
        if (event.toolName === "bash") {
          return { allowed: false, reason: "Agent Bash is blocked while PiCM privacy exclusions are active" };
        }
        if (!GUARDED_PATH_TOOLS.has(event.toolName)) {
          return { allowed: false, reason: "Unrecognized agent tools are blocked while PiCM privacy exclusions are active" };
        }
        const decision = await runtime(ctx.cwd).gate.checkPrivacyPath(
          event.toolName,
          event.input?.path,
          workflow.excludedPaths,
        );
        if (!gateStateIsCurrent(ctx, workflow, scan)) {
          return { allowed: false, reason: "PiCM scan state changed while the privacy path was being checked" };
        }
        return decision;
      }
      return { allowed: true };
    } catch (error) {
      return { allowed: false, reason: `gate exception: ${error instanceof Error ? error.message : error}` };
    }
  }

  function prunePreviews(reserveSlot = false, now = Date.now()) {
    for (const [previewId, preview] of policyPreviews) {
      if (preview.expiresAt <= now) policyPreviews.delete(previewId);
    }
    while (reserveSlot && policyPreviews.size >= maxPolicyPreviews) {
      const oldest = policyPreviews.keys().next().value;
      if (typeof oldest !== "string") break;
      policyPreviews.delete(oldest);
    }
  }

  function retainPreview(cwd, maintenance) {
    prunePreviews(true);
    const previewId = `picm-maintenance-preview:${randomUUID()}`;
    const expiresAt = Date.now() + policyPreviewTtlMs;
    policyPreviews.set(previewId, {
      cwd,
      maintenance: structuredClone(maintenance),
      expiresAt,
      inUse: false,
    });
    return { previewId, expiresAt };
  }

  function reservePreview(cwd, previewId) {
    prunePreviews();
    const preview = policyPreviews.get(previewId);
    if (!preview) throw new Error("MAINTENANCE_PREVIEW_EXPIRED: previewId is unknown or expired; create a new preview");
    if (preview.cwd !== cwd) throw new Error("MAINTENANCE_PREVIEW_CWD_MISMATCH: previewId belongs to a different working directory");
    if (preview.inUse) throw new Error("MAINTENANCE_PREVIEW_IN_USE: previewId is already being applied");
    preview.inUse = true;
    return { preview, maintenance: structuredClone(preview.maintenance) };
  }

  function releasePreview(previewId, preview, consumed = false) {
    if (policyPreviews.get(previewId) !== preview) return;
    if (consumed) policyPreviews.delete(previewId);
    else preview.inUse = false;
  }

  async function maintenancePolicy(params, ctx, signal) {
    const controller = runtime(ctx.cwd).controller;
    if (params.action === "status") return controller.status();
    if (params.action === "preview") {
      if (!params.mode) throw new Error("mode is required for preview");
      const preview = controller.preview(params);
      if (!preview.ok) throw new Error(`${preview.code}: ${preview.message}`);
      const { previewId, expiresAt } = retainPreview(ctx.cwd, preview.maintenance);
      return { ...preview, previewId, expiresAt: new Date(expiresAt).toISOString() };
    }
    if (ctx.mode !== "tui") throw new Error("MAINTENANCE_APPLY_TUI_ONLY: apply is available only in interactive TUI mode");

    let previewId;
    let reservedPreview;
    let maintenance;
    if (params.previewId) {
      if (params.mode || params.intervalValue !== undefined || params.intervalUnit) {
        throw new Error("MAINTENANCE_PREVIEW_AMBIGUOUS: apply with previewId must not include policy fields");
      }
      previewId = params.previewId;
      const reserved = reservePreview(ctx.cwd, previewId);
      reservedPreview = reserved.preview;
      maintenance = reserved.maintenance;
    } else {
      if (!params.mode) throw new Error("mode is required for direct apply");
      const preview = controller.preview(params);
      if (!preview.ok) throw new Error(`${preview.code}: ${preview.message}`);
      maintenance = preview.maintenance;
    }

    const patch = { maintenance };
    try {
      throwIfAborted(signal, "MAINTENANCE_APPLY_ABORTED");
      const confirmed = await ctx.ui.confirm(
        "Apply PiCM maintenance policy?",
        `Exact .picm/config.json patch:\n${JSON.stringify(patch, null, 2)}`,
        { signal },
      );
      throwIfAborted(signal, "MAINTENANCE_APPLY_ABORTED");
      if (!confirmed) {
        return {
          ok: false,
          code: "MAINTENANCE_APPLY_DECLINED",
          message: previewId
            ? "No file was changed; previewId remains available until it expires"
            : "No file was changed",
          previewRetained: Boolean(previewId),
        };
      }
      const result = await controller.applyPolicy(maintenance);
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
      if (previewId && reservedPreview) releasePreview(previewId, reservedPreview, true);
      return result;
    } finally {
      if (previewId && reservedPreview) releasePreview(previewId, reservedPreview);
    }
  }

  async function startup(ctx, { appendEntry, sendUserMessage, scheduledPrompt }) {
    if (ctx.mode !== "tui" || workflowFor(ctx)) return;
    const seenKeys = new Set();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "picm-maintenance-due" && typeof entry.data?.dueKey === "string") {
        seenKeys.add(entry.data.dueKey);
      }
    }
    const decision = await runtime(ctx.cwd).controller.startupProbe({ mode: ctx.mode, seenKeys });
    if (!decision.ok) {
      ctx.ui.notify(`[picm-factory] Maintenance schedule check skipped: ${decision.message}`, "warning");
      return;
    }
    if (decision.action === "notify") {
      appendEntry("picm-maintenance-due", { dueKey: decision.dueKey, action: "notify" });
      ctx.ui.notify(`[picm-factory] PiCM maintenance is due (scheduled for ${decision.maintenance.nextDueAt}). Run /picm-maintain when ready.`, "info");
    } else if (decision.action === "dispatch") {
      try {
        await beginAutomatic(ctx);
        sendUserMessage(scheduledPrompt);
      } catch (error) {
        settle(ctx);
        const rollback = await runtime(ctx.cwd).controller.rollbackAutomaticClaim(decision.claim);
        const rollbackNote = rollback.ok && rollback.rolledBack
          ? "The due cycle remains pending."
          : `The claim could not be rolled back: ${rollback.message ?? rollback.code}.`;
        ctx.ui.notify(
          `[picm-factory] Automatic maintenance could not start: ${error instanceof Error ? error.message : error}. ${rollbackNote}`,
          "error",
        );
        return;
      }
      appendEntry("picm-maintenance-due", { dueKey: decision.dueKey, action: "dispatch" });
    }
  }

  async function resetCycle(ctx) {
    return runtime(ctx.cwd).controller.resetExistingCycle();
  }

  return {
    admitToolExecution,
    authorizeWorkflow,
    checkToolCall,
    clearWorkflow,
    dispose,
    endToolExecution,
    isWorkflowCompleted,
    maintenancePolicy,
    rejectToolExecution,
    resetCycle,
    restoreWorkflow,
    scanControl,
    settle,
    startToolExecution,
    startup,
  };
}
