import { randomUUID } from "node:crypto";
import { createGitReadGate } from "./git-read-gate.mjs";
import { createMaintenanceConfigStore } from "./maintenance-config-store.mjs";
import { createMaintenanceController } from "./maintenance-controller.mjs";
import { mergePrivacyExcludedPaths } from "./privacy-policy.mjs";

const EXPLICIT_SCAN_COMMANDS = new Set(["picm-new", "picm-adopt", "picm-maintain", "picm-optimize"]);
const GUARDED_PATH_TOOLS = new Set(["read", "edit", "write", "grep", "rg", "find", "ls"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasCompletedPicmSetup(config) {
  return isRecord(config) && (
    config.adoption?.status === "adopted" ||
    (
      config.generatedBy === "picm-factory" &&
      typeof config.profile === "string" &&
      typeof config.createdAt === "string" &&
      isRecord(config.paths)
    )
  );
}

export function createRuntimeCoordinator({
  packageRoot,
  canonicalPackageRoot,
  pathBindingLimits,
  createConfigStore = createMaintenanceConfigStore,
  policyPreviewTtlMs = 10 * 60 * 1000,
  maxPolicyPreviews = 32,
} = {}) {
  const runtimes = new Map();
  const scanWorkflows = new Map();
  const activeScans = new Map();
  const scanControlQueues = new Map();
  const policyPreviews = new Map();
  const activeToolBindings = new Map();

  const sessionIdFor = (ctx) =>
    ctx.sessionManager?.getSessionId?.() ??
    ctx.sessionManager?.getSessionFile?.() ??
    ctx.sessionManager ??
    ctx;

  function workflowFor(ctx) {
    const sessionId = sessionIdFor(ctx);
    const workflow = scanWorkflows.get(sessionId);
    const scan = activeScans.get(sessionId);
    if ((workflow && workflow.cwd !== ctx.cwd) || (scan && scan.cwd !== ctx.cwd)) {
      scanWorkflows.delete(sessionId);
      activeScans.delete(sessionId);
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
    return hadWorkflow || hadActiveScan;
  }

  function workflowState(workflow) {
    return {
      cwd: workflow.cwd,
      command: workflow.command,
      preflightComplete: workflow.preflightComplete,
      privacyReviewed: workflow.privacyReviewed,
      privacyFollowupPending: workflow.privacyFollowupPending,
      privacyQuestionIsConcise: workflow.privacyQuestionIsConcise,
      scanStarted: workflow.scanStarted,
      scanSettled: workflow.scanSettled,
      maintenanceResetAttempted: workflow.maintenanceResetAttempted,
      completed: workflow.completed,
      excludedPaths: [...workflow.excludedPaths],
    };
  }

  function authorizeWorkflow(ctx, command) {
    const sessionId = sessionIdFor(ctx);
    clearActiveScan(ctx);
    const workflow = {
      cwd: ctx.cwd,
      command,
      preflightComplete: false,
      privacyReviewed: false,
      privacyFollowupPending: false,
      privacyQuestionIsConcise: false,
      scanStarted: false,
      scanSettled: false,
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
      typeof state.scanSettled === "boolean" &&
      typeof state.maintenanceResetAttempted === "boolean" &&
      Array.isArray(state.excludedPaths);
    const preflightComplete = completeState && state.preflightComplete;
    const privacyFollowupPending = preflightComplete && state.privacyFollowupPending === true;
    const privacyReviewed = preflightComplete && state.privacyReviewed && !privacyFollowupPending;
    const privacyQuestionIsConcise =
      preflightComplete && !privacyReviewed && state.privacyQuestionIsConcise === true;
    scanWorkflows.set(sessionIdFor(ctx), {
      cwd: ctx.cwd,
      command: state.command,
      preflightComplete,
      privacyReviewed,
      privacyFollowupPending,
      privacyQuestionIsConcise,
      scanStarted: privacyReviewed && state.scanStarted === true,
      scanSettled: privacyReviewed && state.scanStarted === true && state.scanSettled === true,
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
    if (workflow?.completed && action !== "status" && action !== "complete") {
      throw new Error("PICM_SCAN_COMPLETE: wait for the completed workflow to settle before starting another scan action");
    }
    if (action === "preflight") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, /picm-maintain, or /picm-optimize before preflight");
      }
      const details = await runtimeFor(ctx).gate.preflight();
      requireCurrentWorkflow(sessionId, workflow);
      workflow.preflightComplete = true;
      workflow.privacyReviewed = false;
      workflow.privacyFollowupPending = false;
      workflow.privacyQuestionIsConcise = false;
      workflow.scanStarted = false;
      workflow.scanSettled = false;
      if (workflow.command === "picm-maintain" || workflow.command === "picm-optimize") {
        const current = await runtimeFor(ctx).store.readPrivacyForReview();
        requireCurrentWorkflow(sessionId, workflow);
        if (!current.ok) throw new Error(`${current.code}: ${current.message}`);
        if (Array.isArray(current.privacy?.excludedPaths)) {
          workflow.excludedPaths = mergePrivacyExcludedPaths(
            ctx.cwd,
            workflow.excludedPaths,
            current.privacy.excludedPaths,
          );
          workflow.privacyFollowupPending = true;
        }
        workflow.privacyQuestionIsConcise =
          workflow.privacyFollowupPending || hasCompletedPicmSetup(current.config);
      }
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
      const store = runtimeFor(ctx).store;
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
      workflow.privacyFollowupPending = false;
      workflow.privacyQuestionIsConcise = false;
      workflow.scanStarted = false;
      workflow.scanSettled = false;
      clearActiveScan(ctx);
      return {
        ok: true,
        action,
        authorized: true,
        active: false,
        configChanged,
        persisted: persist && additions.length > 0,
        ...workflowState(workflow),
      };
    }
    if (action === "inventory") {
      const scan = activeScans.get(sessionId);
      if (!workflow || scan?.cwd !== ctx.cwd) {
        throw new Error("PICM_SCAN_NOT_ACTIVE: begin an explicitly authorized scan before requesting inventory");
      }
      const inventory = await runtimeFor(ctx).gate.refreshInventory(path, scan.excludedPaths);
      requireCurrentWorkflow(sessionId, workflow);
      return {
        ok: true,
        action,
        authorized: true,
        active: true,
        command: workflow.command,
        worktree: inventory.worktree,
        isolated: inventory.isolated,
        candidates: [...inventory.candidates].sort(),
        excludedPaths: [...scan.excludedPaths],
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
      const config = await runtimeFor(ctx).store.read();
      requireCurrentWorkflow(sessionId, workflow);
      if (!config.ok) throw new Error(`${config.code}: ${config.message}`);
      workflow.excludedPaths = mergePrivacyExcludedPaths(
        ctx.cwd,
        workflow.excludedPaths,
        config.privacy?.excludedPaths ?? [],
      );
      workflow.scanStarted = true;
      workflow.scanSettled = false;
      activeScans.set(sessionId, {
        cwd: ctx.cwd,
        excludedPaths: [...workflow.excludedPaths],
      });
    } else if (action === "end") {
      const scan = activeScans.get(sessionId);
      if (!workflow || scan?.cwd !== ctx.cwd) {
        throw new Error("PICM_SCAN_NOT_ACTIVE: begin an explicitly authorized scan before ending it");
      }
      clearActiveScan(ctx);
      workflow.scanSettled = true;
    } else if (action === "complete") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke and finish a privacy-reviewed PiCM workflow before completion");
      }
      if (!workflow.preflightComplete) {
        throw new Error("PICM_PREFLIGHT_INCOMPLETE: complete picm_scan_control preflight before completion");
      }
      if (!workflow.privacyReviewed) {
        throw new Error("PICM_PRIVACY_NOT_REVIEWED: complete picm_scan_control privacy before completion");
      }
      if (!workflow.scanStarted) {
        throw new Error("PICM_SCAN_NOT_STARTED: begin the privacy-reviewed scan before completion");
      }
      if (!workflow.scanSettled || activeScans.get(sessionId)?.cwd === ctx.cwd) {
        throw new Error("PICM_SCAN_NOT_SETTLED: end the active privacy-reviewed scan before completion");
      }
      let maintenanceReset;
      if (!workflow.completed) {
        let maintenanceResetCommitted = false;
        requireCurrentWorkflow(sessionId, workflow);
        if (workflow.command === "picm-maintain" && !workflow.maintenanceResetAttempted) {
          throwIfAborted(execution.signal, "PICM_SCAN_ABORTED");
          maintenanceReset = await runtimeFor(ctx).controller.resetExistingCycle({ signal: execution.signal });
          requireCurrentWorkflow(sessionId, workflow);
          if (!maintenanceReset.ok || maintenanceReset.conflict) {
            const code = maintenanceReset.code ?? "MAINTENANCE_POLICY_ERROR";
            const reason = maintenanceReset.message ?? "maintenance cycle reset did not complete";
            const message = `Maintenance cycle was not reset (${code}: ${reason}). Resolve the configuration conflict or error, then retry picm_scan_control complete.`;
            return {
              ok: false,
              action,
              code,
              message,
              warning: message,
              maintenanceReset,
              ...workflowState(workflow),
              authorized: true,
              active: false,
            };
          }
          workflow.maintenanceResetAttempted = true;
          maintenanceResetCommitted = true;
        }
        if (!maintenanceResetCommitted) throwIfAborted(execution.signal, "PICM_SCAN_ABORTED");
        workflow.completed = true;
      }
      clearActiveScan(ctx);
      return {
        ok: true,
        action,
        ...workflowState(workflow),
        authorized: false,
        active: false,
        completed: true,
        maintenanceReset,
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
      const gate = createGitReadGate({
        cwd,
        packageRoot,
        canonicalPackageRoot,
        pathBindingLimits,
      });
      const store = createConfigStore({ cwd, gate });
      value = {
        gate,
        store,
        controller: createMaintenanceController({ store }),
        sessions: new Set(),
      };
      runtimes.set(cwd, value);
    }
    return value;
  }

  function runtimeFor(ctx) {
    const value = runtime(ctx.cwd);
    value.sessions.add(sessionIdFor(ctx));
    return value;
  }

  async function dispose(ctx) {
    clearWorkflow(ctx);
    const sessionId = sessionIdFor(ctx);
    for (const [key, binding] of activeToolBindings) {
      if (key.startsWith(`${sessionId}:`)) {
        activeToolBindings.delete(key);
        try { binding.release(); } catch {}
      }
    }
    const value = runtimes.get(ctx.cwd);
    value?.sessions.delete(sessionId);
    if (value?.sessions.size === 0) {
      runtimes.delete(ctx.cwd);
      try {
        await value.gate.dispose();
      } catch (error) {
        throw error;
      }
    }
  }

  async function hasAdoptedStatus(ctx) {
    const config = await runtimeFor(ctx).store.read();
    return config.ok && isRecord(config.config) && isRecord(config.config.adoption) && config.config.adoption.status === "adopted";
  }

  async function continueAdoptionAsMaintenance(ctx) {
    const workflow = workflowFor(ctx);
    if (!workflow || workflow.command !== "picm-adopt") {
      throw new Error("PICM_ADOPTION_CONTINUATION_UNAVAILABLE: finish an adopted workspace before starting initial maintenance");
    }
    if (!workflow.preflightComplete || !workflow.privacyReviewed) {
      throw new Error("PICM_PRIVACY_NOT_REVIEWED: complete adoption privacy review before starting initial maintenance");
    }
    if (!workflow.scanStarted || !workflow.scanSettled || activeScans.get(sessionIdFor(ctx))?.cwd === ctx.cwd) {
      throw new Error("PICM_SCAN_NOT_SETTLED: end the adoption scan before starting initial maintenance");
    }
    if (!await hasAdoptedStatus(ctx)) {
      throw new Error("PICM_ADOPTION_CONTINUATION_UNAVAILABLE: finish an adopted workspace before starting initial maintenance");
    }
    workflow.command = "picm-maintain";
    workflow.scanStarted = false;
    workflow.scanSettled = false;
    workflow.maintenanceResetAttempted = false;
    return workflowState(workflow);
  }

  function isWorkflowCompleted(ctx) {
    return workflowFor(ctx)?.completed === true;
  }

  function isAutomatic(_ctx) {
    return false;
  }

  function settle(ctx) {
    if (workflowFor(ctx)?.completed) {
      clearWorkflow(ctx);
      return true;
    }
    clearActiveScan(ctx);
    return false;
  }

  function startToolExecution(_event, _ctx) {}
  function admitToolExecution(_event, _ctx) {}
  function rejectToolExecution(_event, _ctx) {}

  function endToolExecution(event, ctx) {
    if (typeof event.toolCallId !== "string") return;
    const sessionId = sessionIdFor(ctx);
    const key = `${sessionId}:${event.toolCallId}`;
    const binding = activeToolBindings.get(key);
    if (binding) {
      activeToolBindings.delete(key);
      try { binding.release(); } catch {}
    }
  }

  function beginBoundPathExecution(toolCallId, ctx, toolName) {
    if (typeof toolCallId !== "string") return undefined;
    const sessionId = sessionIdFor(ctx);
    const key = `${sessionId}:${toolCallId}`;
    const binding = activeToolBindings.get(key);
    if (!binding) return undefined;
    if (binding.toolName !== toolName) {
      throw new Error("PICM_PATH_BINDING_MISMATCH: guarded path execution changed tool identity");
    }
    return binding;
  }

  async function checkToolCall(event, ctx) {
    const workflow = workflowFor(ctx);
    const sessionId = sessionIdFor(ctx);
    const scan = activeScans.get(sessionId);

    if (workflow?.completed) {
      return { allowed: true };
    }

    if (workflow && !workflow.privacyReviewed) {
      if (event.toolName === "picm_scan_control") return { allowed: true };
      if (event.toolName === "read") {
        const trusted = await runtimeFor(ctx).gate.checkTrustedPackageRead(
          event.toolName,
          event.input?.path,
        );
        if (trusted.allowed) {
          if (typeof trusted.canonicalPath === "string") event.input.path = trusted.canonicalPath;
          if (trusted.executionBinding && typeof event.toolCallId === "string") {
            const binding = runtimeFor(ctx).gate.bindPath(trusted.executionBinding);
            activeToolBindings.set(`${sessionId}:${event.toolCallId}`, binding);
          }
          return trusted;
        }
      }
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
      if (event.toolName === "read") {
        const trusted = await runtimeFor(ctx).gate.checkTrustedPackageRead(
          event.toolName,
          event.input?.path,
        );
        if (trusted.allowed) {
          if (typeof trusted.canonicalPath === "string") event.input.path = trusted.canonicalPath;
          if (trusted.executionBinding && typeof event.toolCallId === "string") {
            const binding = runtimeFor(ctx).gate.bindPath(trusted.executionBinding);
            activeToolBindings.set(`${sessionId}:${event.toolCallId}`, binding);
          }
          return trusted;
        }
      }
      return {
        allowed: false,
        reason: "Begin the privacy-reviewed PiCM scan before using agent tools",
      };
    }

    try {
      if (scan?.cwd === ctx.cwd) {
        if (event.toolName === "bash") return runtimeFor(ctx).gate.checkBash(event.input?.command);
        if (!GUARDED_PATH_TOOLS.has(event.toolName)) {
          return { allowed: false, reason: "Unrecognized agent tools are blocked during active PiCM scans" };
        }
        const decision = await runtimeFor(ctx).gate.checkPath(
          event.toolName,
          event.input?.path,
          scan.excludedPaths,
        );
        if (
          decision.allowed &&
          event.toolName === "read" &&
          typeof decision.canonicalPath === "string"
        ) {
          event.input.path = decision.canonicalPath;
        }
        if (decision.allowed && decision.executionBinding && typeof event.toolCallId === "string") {
          const binding = runtimeFor(ctx).gate.bindPath(decision.executionBinding);
          activeToolBindings.set(`${sessionId}:${event.toolCallId}`, binding);
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
        const decision = await runtimeFor(ctx).gate.checkPath(
          event.toolName,
          event.input?.path,
          workflow.excludedPaths,
        );
        if (
          decision.allowed &&
          event.toolName === "read" &&
          typeof decision.canonicalPath === "string"
        ) {
          event.input.path = decision.canonicalPath;
        }
        if (decision.allowed && decision.executionBinding && typeof event.toolCallId === "string") {
          const binding = runtimeFor(ctx).gate.bindPath(decision.executionBinding);
          activeToolBindings.set(`${sessionId}:${event.toolCallId}`, binding);
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
    const controller = runtimeFor(ctx).controller;
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

  async function startup(ctx, { appendEntry, promptMaintenanceWorkflow } = {}) {
    if (ctx.mode !== "tui" || workflowFor(ctx)) return;
    const seenKeys = new Set();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "picm-maintenance-due" && typeof entry.data?.dueKey === "string") {
        seenKeys.add(entry.data.dueKey);
      }
    }
    const decision = await runtimeFor(ctx).controller.startupProbe({ mode: ctx.mode, seenKeys });
    if (!decision.ok) {
      ctx.ui.notify(`[picm-factory] Maintenance schedule check skipped: ${decision.message}`, "warning");
      return;
    }
    if (decision.action === "due") {
      const widgetLines = [
        `PiCM maintenance is due (scheduled for ${decision.maintenance.nextDueAt}). Run /picm-maintain when ready.`,
      ];
      ctx.ui.setWidget("picm-maintenance-reminder", widgetLines);
      const choice = await ctx.ui.select(
        "PiCM maintenance is due. Choose an action:",
        ["Run Now", "Defer"],
      );
      if (choice === "Defer") {
        ctx.ui.setWidget("picm-maintenance-reminder", undefined);
        appendEntry("picm-maintenance-due", { dueKey: decision.dueKey, action: "defer" });
        ctx.ui.notify("Maintenance deferred. PiCM will ask again when you start a new session.", "info");
      } else if (choice === "Run Now") {
        if (promptMaintenanceWorkflow) {
          await promptMaintenanceWorkflow();
        }
      }
    }
  }

  async function resetCycle(ctx) {
    return runtimeFor(ctx).controller.resetExistingCycle();
  }

  return {
    admitToolExecution,
    authorizeWorkflow,
    beginBoundPathExecution,
    checkToolCall,
    clearWorkflow,
    continueAdoptionAsMaintenance,
    dispose,
    endToolExecution,
    hasAdoptedStatus,
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
