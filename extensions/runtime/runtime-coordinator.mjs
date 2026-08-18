import { randomUUID } from "node:crypto";
import { createGitReadGate } from "./git-read-gate.mjs";
import { createMaintenanceConfigStore } from "./maintenance-config-store.mjs";
import { createMaintenanceController } from "./maintenance-controller.mjs";
import { mergePrivacyExcludedPaths } from "./privacy-policy.mjs";

const EXPLICIT_SCAN_COMMANDS = new Set(["picm-new", "picm-adopt", "picm-maintain"]);
const GUARDED_PATH_TOOLS = new Set(["read", "edit", "write", "grep", "find", "ls"]);
const WORKFLOW_CONTROL_TOOLS = new Set(["picm_scan_control", "picm_maintenance_policy"]);

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
  const policyPreviews = new Map();

  const sessionIdFor = (ctx) =>
    ctx.sessionManager?.getSessionId?.() ??
    ctx.sessionManager?.getSessionFile?.() ??
    ctx.sessionManager ??
    ctx;

  function pruneScans(now = Date.now()) {
    for (const [sessionId, workflow] of scanWorkflows) {
      if (workflow.expiresAt <= now) {
        scanWorkflows.delete(sessionId);
        activeScans.delete(sessionId);
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
      expiresAt: new Date(workflow.expiresAt).toISOString(),
      privacyReviewed: workflow.privacyReviewed,
      scanStarted: workflow.scanStarted,
      excludedPaths: [...workflow.excludedPaths],
    };
  }

  function authorizeWorkflow(ctx, command) {
    const sessionId = sessionIdFor(ctx);
    const expiresAt = Date.now() + scanWorkflowTtlMs;
    const workflow = {
      cwd: ctx.cwd,
      command,
      expiresAt,
      privacyReviewed: false,
      scanStarted: false,
      excludedPaths: [],
    };
    scanWorkflows.set(sessionId, workflow);
    activeScans.delete(sessionId);
    return workflowState(workflow);
  }

  function restoreWorkflow(ctx, state) {
    clearWorkflow(ctx);
    if (
      state?.status !== "authorized" ||
      state.cwd !== ctx.cwd ||
      !EXPLICIT_SCAN_COMMANDS.has(state.command)
    ) {
      return false;
    }
    const expiresAt = Date.parse(state.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
    let excludedPaths;
    try {
      excludedPaths = mergePrivacyExcludedPaths(ctx.cwd, state.excludedPaths ?? []);
    } catch {
      return false;
    }
    scanWorkflows.set(sessionIdFor(ctx), {
      cwd: ctx.cwd,
      command: state.command,
      expiresAt,
      privacyReviewed: state.privacyReviewed === true,
      scanStarted: state.scanStarted === true,
      excludedPaths,
    });
    return true;
  }

  async function scanControl(ctx, params) {
    const { action, path, excludedPaths = [], persist = false } = params;
    const sessionId = sessionIdFor(ctx);
    const workflow = workflowFor(ctx);
    const automaticState = automaticFor(ctx);
    const automatic = Boolean(automaticState);
    if (automaticState?.expiresAt <= Date.now()) {
      throw new Error("PICM_AUTOMATIC_SCAN_EXPIRED: automatic advisory safety boundary expired before settlement");
    }
    if (automatic && action !== "inventory") {
      throw new Error("PICM_AUTOMATIC_INVENTORY_ONLY: automatic advisory sessions may only request inventory");
    }
    if (action === "preflight") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, or /picm-maintain before preflight");
      }
      return {
        ok: true,
        action,
        authorized: true,
        active: false,
        command: workflow.command,
        ...await runtime(ctx.cwd).gate.preflight(),
        expiresAt: new Date(workflow.expiresAt).toISOString(),
      };
    }
    if (action === "privacy") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, or /picm-maintain before privacy review");
      }
      const store = runtime(ctx.cwd).store;
      const current = await store.read();
      if (!current.ok) throw new Error(`${current.code}: ${current.message}`);
      const additions = mergePrivacyExcludedPaths(ctx.cwd, excludedPaths);
      let persistedPrivacy = current.privacy;
      let configChanged = false;
      if (persist && additions.length > 0) {
        if (ctx.mode !== "tui") {
          throw new Error("PRIVACY_APPLY_TUI_ONLY: persistent privacy exclusions require interactive TUI confirmation");
        }
        const nextPrivacy = {
          excludedPaths: mergePrivacyExcludedPaths(
            ctx.cwd,
            current.privacy?.excludedPaths ?? [],
            additions,
          ),
        };
        const confirmed = await ctx.ui.confirm(
          "Persist PiCM privacy exclusions?",
          `Exact .picm/config.json patch:\n${JSON.stringify({ privacy: nextPrivacy }, null, 2)}`,
        );
        if (!confirmed) {
          return {
            ok: false,
            action,
            code: "PRIVACY_APPLY_DECLINED",
            message: "No privacy settings were changed and scan privacy review remains incomplete",
          };
        }
        const update = await store.compareAndUpdatePrivacy(current.privacy, nextPrivacy);
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
      workflow.expiresAt = Date.now() + scanWorkflowTtlMs;
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
      if ((!workflow && !automatic) || scan?.cwd !== ctx.cwd) {
        throw new Error("PICM_SCAN_NOT_ACTIVE: begin an explicitly authorized scan before requesting inventory");
      }
      const inventory = await runtime(ctx.cwd).gate.refreshInventory(path, scan.excludedPaths);
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
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, or /picm-maintain before scanning");
      }
      if (!workflow.privacyReviewed) {
        throw new Error("PICM_PRIVACY_NOT_REVIEWED: complete picm_scan_control privacy before scanning");
      }
      const config = await runtime(ctx.cwd).store.read();
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
      clearWorkflow(ctx);
    }
    const current = workflowFor(ctx);
    const active = activeScans.get(sessionIdFor(ctx));
    return {
      ok: true,
      action,
      authorized: Boolean(current),
      active: active?.cwd === ctx.cwd,
      ...(current ? workflowState(current) : {}),
    };
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
    clearActiveScan(ctx);
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
    if (workflow && !workflow.privacyReviewed) {
      if (event.toolName === "picm_scan_control") return { allowed: true };
      return {
        allowed: false,
        reason: "PiCM privacy review must complete before any agent tool can inspect or change the project",
      };
    }
    if (workflow && !workflow.scanStarted && scan?.cwd !== ctx.cwd) {
      if (event.toolName === "picm_scan_control") return { allowed: true };
      return {
        allowed: false,
        reason: "Begin the privacy-reviewed PiCM scan before using agent tools",
      };
    }

    try {
      if (scan?.cwd === ctx.cwd) {
        if (event.toolName === "picm_scan_control") return { allowed: true };
        if (event.toolName === "bash") return runtime(ctx.cwd).gate.checkBash(event.input?.command);
        if (!GUARDED_PATH_TOOLS.has(event.toolName)) {
          return { allowed: false, reason: "Unrecognized agent tools are blocked during active PiCM scans" };
        }
        return runtime(ctx.cwd).gate.checkPath(
          event.toolName,
          event.input?.path,
          scan.excludedPaths,
        );
      }

      if (workflow?.excludedPaths.length > 0) {
        if (WORKFLOW_CONTROL_TOOLS.has(event.toolName)) return { allowed: true };
        if (event.toolName === "bash") {
          return { allowed: false, reason: "Agent Bash is blocked while PiCM privacy exclusions are active" };
        }
        if (!GUARDED_PATH_TOOLS.has(event.toolName)) {
          return { allowed: false, reason: "Unrecognized agent tools are blocked while PiCM privacy exclusions are active" };
        }
        return runtime(ctx.cwd).gate.checkPrivacyPath(
          event.toolName,
          event.input?.path,
          workflow.excludedPaths,
        );
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

  async function maintenancePolicy(params, ctx) {
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
      const confirmed = await ctx.ui.confirm(
        "Apply PiCM maintenance policy?",
        `Exact .picm/config.json patch:\n${JSON.stringify(patch, null, 2)}`,
      );
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
    authorizeWorkflow,
    checkToolCall,
    clearWorkflow,
    dispose,
    maintenancePolicy,
    resetCycle,
    restoreWorkflow,
    scanControl,
    settle,
    startup,
  };
}
