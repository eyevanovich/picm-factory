import { randomUUID } from "node:crypto";
import { createGitReadGate } from "./git-read-gate.mjs";
import { createMaintenanceConfigStore } from "./maintenance-config-store.mjs";
import { createMaintenanceController } from "./maintenance-controller.mjs";

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
    scanWorkflows.delete(sessionId);
    activeScans.delete(sessionId);
  }

  function authorizeWorkflow(ctx, command) {
    const sessionId = sessionIdFor(ctx);
    const expiresAt = Date.now() + scanWorkflowTtlMs;
    scanWorkflows.set(sessionId, { cwd: ctx.cwd, command, expiresAt });
    activeScans.set(sessionId, { cwd: ctx.cwd, expiresAt });
  }

  function scanControl(ctx, action) {
    const sessionId = sessionIdFor(ctx);
    const workflow = workflowFor(ctx);
    if (action === "begin") {
      if (!workflow) {
        throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, or /picm-maintain before scanning");
      }
      workflow.expiresAt = Date.now() + scanWorkflowTtlMs;
      activeScans.set(sessionId, { cwd: ctx.cwd, expiresAt: workflow.expiresAt });
    } else if (action === "end") {
      clearActiveScan(ctx);
    } else if (action === "complete") {
      clearWorkflow(ctx);
    }
    const current = workflowFor(ctx);
    return {
      ok: true,
      action,
      authorized: Boolean(current),
      active: activeScans.get(sessionIdFor(ctx))?.cwd === ctx.cwd,
      command: current?.command,
      expiresAt: current ? new Date(current.expiresAt).toISOString() : undefined,
    };
  }

  function runtime(cwd) {
    let value = runtimes.get(cwd);
    if (!value) {
      const gate = createGitReadGate({ cwd, packageRoot });
      const store = createMaintenanceConfigStore({ cwd, gate });
      value = { gate, controller: createMaintenanceController({ store }) };
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
    return automaticReadOnlySessions.get(sessionIdFor(ctx)) === ctx.cwd;
  }

  function beginAutomatic(ctx) {
    const sessionId = sessionIdFor(ctx);
    automaticReadOnlySessions.set(sessionId, ctx.cwd);
    activeScans.set(sessionId, { cwd: ctx.cwd, expiresAt: Date.now() + scanWorkflowTtlMs });
  }

  function clearAutomatic(ctx) {
    const sessionId = sessionIdFor(ctx);
    if (automaticReadOnlySessions.get(sessionId) === ctx.cwd) automaticReadOnlySessions.delete(sessionId);
  }

  function settle(ctx) {
    clearAutomatic(ctx);
    clearActiveScan(ctx);
  }

  async function checkToolCall(event, ctx) {
    if (isAutomatic(ctx) && !["read", "grep", "find", "ls"].includes(event.toolName)) {
      return { allowed: false, reason: "Scheduled maintenance is advisory and read-only; this tool is blocked" };
    }
    workflowFor(ctx);
    if (activeScans.get(sessionIdFor(ctx))?.cwd !== ctx.cwd) return { allowed: true };
    try {
      return event.toolName === "bash"
        ? await runtime(ctx.cwd).gate.checkBash(event.input?.command)
        : await runtime(ctx.cwd).gate.checkPath(event.toolName, event.input?.path);
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
    if (ctx.mode !== "tui") return;
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
      beginAutomatic(ctx);
      try {
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

  return {
    authorizeWorkflow,
    beginAutomatic,
    checkToolCall,
    clearActiveScan,
    clearAutomatic,
    clearWorkflow,
    dispose,
    isAutomatic,
    maintenancePolicy,
    releasePreview,
    reservePreview,
    retainPreview,
    runtime,
    scanControl,
    settle,
    startup,
  };
}
