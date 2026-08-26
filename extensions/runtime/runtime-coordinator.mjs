import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { createGitReadGate } from "./git-read-gate.mjs";
import { createMaintenanceConfigStore } from "./maintenance-config-store.mjs";
import { createMaintenanceController } from "./maintenance-controller.mjs";
import { mergePrivacyExcludedPaths } from "./privacy-policy.mjs";
import { identifyLayoutProfile } from "./layout-profile.mjs";
import {
  applyProposalBatch,
  prepareProposalBatch,
  proposalAudit,
  proposalSummary,
} from "./proposal-batch.mjs";
import {
  generatedSpecialistInputRoutes,
  parseSpecialistFirstRunRecipe,
} from "./specialist-first-run-guidance.mjs";

const EXPLICIT_SCAN_COMMANDS = new Set(["picm-new", "picm-adopt", "picm-maintain", "picm-optimize"]);
const GUARDED_PATH_TOOLS = new Set(["read", "edit", "write", "grep", "rg", "find", "ls"]);
const NEW_WORKFLOW_ARCHITECTURE_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",
  "REFERENCES.md",
  "identity.md",
  "rules.md",
  "examples.md",
]);
const NEW_WORKFLOW_ARCHITECTURE_DIRECTORIES = ["workflows", "reference", "stages"];
const NEW_WORKFLOW_INTENTS = new Set(["add-replace", "adopt-existing", "cancelled"]);

function directNewWorkflowIntent(text) {
  const reply = typeof text === "string"
    ? text.trim().toLowerCase().replace(/[.!]+$/g, "")
    : "";
  if (reply === "adopt existing" || reply === "adopt-existing") return "adopt-existing";
  if (reply === "add/replace scaffold" || reply === "add-replace") return "add-replace";
  if (reply === "cancel") return "cancel";
  return undefined;
}

function candidatesRelativeToWorkspace(candidates, worktree, cwd) {
  let canonicalWorktree = worktree;
  let canonicalCwd = cwd;
  try {
    canonicalWorktree = realpathSync(worktree);
    canonicalCwd = realpathSync(cwd);
  } catch {}
  const prefix = relative(canonicalWorktree, canonicalCwd).split(sep).filter(Boolean).join("/");
  if (!prefix) return candidates;
  const rootedPrefix = `${prefix}/`;
  return candidates
    .filter((candidate) => candidate.startsWith(rootedPrefix))
    .map((candidate) => candidate.slice(rootedPrefix.length));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExistingNewWorkflowArchitecture(candidates) {
  return candidates.some((candidate) => {
    const topLevel = candidate.split("/", 1)[0];
    return NEW_WORKFLOW_ARCHITECTURE_FILES.has(topLevel) ||
      NEW_WORKFLOW_ARCHITECTURE_DIRECTORIES.some((directory) =>
        candidate.startsWith(`${directory}/`),
      ) ||
      candidate.includes("/") && /^\d+(?:[_-]|$)/.test(topLevel);
  });
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
  const proposalBatches = new Map();

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
      proposalBatches.delete(sessionId);
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
    proposalBatches.delete(sessionId);
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
      adoptionBaselineCaptured: workflow.adoptionBaselineCaptured,
      adoptionWasAlreadyAdopted: workflow.adoptionWasAlreadyAdopted,
      initialMaintenanceOffered: workflow.initialMaintenanceOffered,
      initialIntent: workflow.initialIntent,
      newWorkflowIntentRequired: workflow.newWorkflowIntentRequired,
      newWorkflowIntent: workflow.newWorkflowIntent,
      pendingNewWorkflowIntent: workflow.pendingNewWorkflowIntent,
      pendingNewWorkflowIntentSource: workflow.pendingNewWorkflowIntentSource,
      completed: workflow.completed,
      excludedPaths: [...workflow.excludedPaths],
    };
  }

  function authorizeWorkflow(ctx, command, { initialIntent } = {}) {
    const sessionId = sessionIdFor(ctx);
    clearActiveScan(ctx);
    proposalBatches.delete(sessionId);
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
      adoptionBaselineCaptured: false,
      adoptionWasAlreadyAdopted: true,
      initialMaintenanceOffered: false,
      initialIntent: command === "picm-new" && typeof initialIntent === "string" && initialIntent.trim()
        ? initialIntent.trim()
        : undefined,
      newWorkflowIntentRequired: false,
      newWorkflowIntent: undefined,
      pendingNewWorkflowIntent: undefined,
      pendingNewWorkflowIntentSource: undefined,
      completed: false,
      excludedPaths: [],
      approvedWrites: new Map(),
      specialistConfigWritten: false,
      specialistRouteSemantics: undefined,
      specialistScaffoldApproved: false,
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
      adoptionBaselineCaptured:
        state.command === "picm-adopt" &&
        (state.adoptionBaselineCaptured === true ||
          (state.adoptionBaselineCaptured === undefined &&
            typeof state.adoptionWasAlreadyAdopted === "boolean")),
      adoptionWasAlreadyAdopted:
        state.command === "picm-adopt" ? state.adoptionWasAlreadyAdopted !== false : true,
      initialMaintenanceOffered:
        state.command === "picm-adopt" && state.initialMaintenanceOffered === true,
      initialIntent: typeof state.initialIntent === "string" && state.initialIntent.trim()
        ? state.initialIntent.trim()
        : undefined,
      newWorkflowIntentRequired:
        state.command === "picm-new" && state.newWorkflowIntentRequired === true,
      newWorkflowIntent:
        typeof state.newWorkflowIntent === "string" && NEW_WORKFLOW_INTENTS.has(state.newWorkflowIntent)
          ? state.newWorkflowIntent
          : undefined,
      pendingNewWorkflowIntent:
        state.command === "picm-new" &&
        state.newWorkflowIntentRequired === true &&
        state.pendingNewWorkflowIntentSource === "direct-user-reply" &&
        directNewWorkflowIntent(state.pendingNewWorkflowIntent) === state.pendingNewWorkflowIntent
          ? state.pendingNewWorkflowIntent
          : undefined,
      pendingNewWorkflowIntentSource:
        state.command === "picm-new" &&
        state.newWorkflowIntentRequired === true &&
        state.pendingNewWorkflowIntentSource === "direct-user-reply" &&
        directNewWorkflowIntent(state.pendingNewWorkflowIntent) === state.pendingNewWorkflowIntent
          ? "direct-user-reply"
          : undefined,
      completed,
      excludedPaths,
      approvedWrites: new Map(),
      specialistConfigWritten: false,
      specialistRouteSemantics: undefined,
      specialistScaffoldApproved: false,
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
    if (workflow?.scanSettled && !workflow.completed && action !== "begin" && action !== "complete" && action !== "new-intent") {
      throw new Error("PICM_SCAN_SETTLED: after ending a scan, only begin for the next phase, record a pending new-workflow intent, or complete is allowed");
    }
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
      if (workflow.command === "picm-adopt" && !workflow.adoptionBaselineCaptured) {
        workflow.adoptionWasAlreadyAdopted = current.config?.adoption?.status === "adopted";
        workflow.adoptionBaselineCaptured = true;
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
    if (action === "new-intent") {
      if (!workflow || workflow.command !== "picm-new") {
        throw new Error("PICM_NEW_INTENT_UNAVAILABLE: detect existing architecture through /picm-new before recording its intent");
      }
      if (!workflow.preflightComplete || !workflow.privacyReviewed) {
        throw new Error("PICM_PRIVACY_NOT_REVIEWED: complete picm-new privacy review before recording an architecture intent");
      }
      if (!workflow.newWorkflowIntentRequired || workflow.newWorkflowIntent) {
        throw new Error("PICM_NEW_INTENT_UNAVAILABLE: an existing-architecture intent choice is not pending");
      }
      if (workflow.pendingNewWorkflowIntent !== params.intent) {
        throw new Error("PICM_NEW_INTENT_NOT_CONFIRMED: record only the directly observed user choice for this existing architecture");
      }
      if (!workflow.scanStarted || !workflow.scanSettled || activeScans.get(sessionId)?.cwd === ctx.cwd) {
        throw new Error("PICM_SCAN_NOT_SETTLED: end the existing-architecture discovery scan before recording its intent");
      }
      if (params.intent !== "add-replace" && params.intent !== "adopt-existing" && params.intent !== "cancel") {
        throw new Error("PICM_NEW_INTENT_INVALID: choose add-replace, adopt-existing, or cancel");
      }

      const selectedIntent = params.intent === "cancel" ? "cancelled" : params.intent;
      let adoptionWasAlreadyAdopted = false;
      if (selectedIntent === "adopt-existing") {
        const current = await runtimeFor(ctx).store.read();
        requireCurrentWorkflow(sessionId, workflow);
        if (!current.ok) throw new Error(`${current.code}: ${current.message}`);
        adoptionWasAlreadyAdopted = current.config?.adoption?.status === "adopted";
      }

      workflow.newWorkflowIntentRequired = false;
      workflow.newWorkflowIntent = selectedIntent;
      workflow.pendingNewWorkflowIntent = undefined;
      workflow.pendingNewWorkflowIntentSource = undefined;

      if (selectedIntent === "adopt-existing") {
        workflow.command = "picm-adopt";
        workflow.adoptionBaselineCaptured = true;
        workflow.adoptionWasAlreadyAdopted = adoptionWasAlreadyAdopted;
      }

      return {
        ok: true,
        action,
        authorized: true,
        active: false,
        continuation: selectedIntent === "add-replace"
          ? "The user selected add/replace scaffold. Privacy review remains active; begin a new protected scan phase before project inspection or scaffold drafting. This selection does not approve writes."
          : selectedIntent === "adopt-existing"
            ? "The user selected adopt existing. The authorized workflow now continues as /picm-adopt; begin a new protected scan phase before project inspection and load the adoption guide. This selection does not approve writes."
            : "The user cancelled the existing-architecture choice. Privacy review remains active only until this workflow completes; no files were changed.",
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
      const candidates = [...inventory.candidates].sort();
      const workspaceCandidates = candidatesRelativeToWorkspace(candidates, inventory.worktree, ctx.cwd);
      let completedPicmSetup = false;
      if (
        workflow.command === "picm-new" &&
        !workflow.newWorkflowIntent &&
        workspaceCandidates.includes(".picm/config.json")
      ) {
        const current = await runtimeFor(ctx).store.read();
        requireCurrentWorkflow(sessionId, workflow);
        if (!current.ok) throw new Error(`${current.code}: ${current.message}`);
        completedPicmSetup = hasCompletedPicmSetup(current.config);
      }
      if (
        workflow.command === "picm-new" &&
        !workflow.newWorkflowIntent &&
        (completedPicmSetup || hasExistingNewWorkflowArchitecture(workspaceCandidates))
      ) {
        workflow.newWorkflowIntentRequired = true;
      }
      return {
        ok: true,
        action,
        authorized: true,
        active: true,
        command: workflow.command,
        worktree: inventory.worktree,
        isolated: inventory.isolated,
        candidates,
        layoutProfile: identifyLayoutProfile(workspaceCandidates),
        ...workflowState(workflow),
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
      if (workflow.command === "picm-new" && workflow.newWorkflowIntentRequired) {
        throw new Error("PICM_NEW_INTENT_PENDING: record the user's existing-architecture intent before starting another scan");
      }
      if (workflow.command === "picm-new" && workflow.newWorkflowIntent === "cancelled") {
        throw new Error("PICM_NEW_INTENT_CANCELLED: complete the cancelled /picm-new workflow without starting another scan");
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
      if (workflow.command === "picm-new" && workflow.newWorkflowIntentRequired) {
        if (workflow.pendingNewWorkflowIntent === "cancel") {
          workflow.newWorkflowIntentRequired = false;
          workflow.newWorkflowIntent = "cancelled";
          workflow.pendingNewWorkflowIntent = undefined;
          workflow.pendingNewWorkflowIntentSource = undefined;
        } else {
          throw new Error("PICM_NEW_INTENT_PENDING: record the user's existing-architecture intent before completing /picm-new");
        }
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

  async function queueScanOperation(ctx, operation) {
    const sessionId = sessionIdFor(ctx);
    const prior = scanControlQueues.get(sessionId) ?? Promise.resolve();
    let release;
    const turn = new Promise((resolveTurn) => { release = resolveTurn; });
    const queued = prior.then(() => turn);
    scanControlQueues.set(sessionId, queued);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (scanControlQueues.get(sessionId) === queued) scanControlQueues.delete(sessionId);
    }
  }

  async function scanControl(ctx, params, execution) {
    return queueScanOperation(ctx, () => runScanControl(ctx, params, execution));
  }

  function proposalResponseStatus(prompt) {
    const text = typeof prompt === "string"
      ? prompt.trim().toLowerCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ")
      : "";
    if (/^(?:i )?(?:accept|approve|proceed)(?: (?:this|the|current|exact|proposal|batch|changes|it))*?(?: (?:and|to) (?:write|apply))?$/.test(text)) {
      return "approved";
    }
    if (/\b(?:cancel|stop|decline|withdraw|never mind|do not apply|don't apply)\b/.test(text)) return "cancelled";
    if (/\b(?:change|adjust|revise|rewrite|replace|instead|remove|add|move|delete)\b/.test(text)) return "revision-required";
    return "pending";
  }

  function observeProposalResponse(ctx, prompt) {
    const sessionId = sessionIdFor(ctx);
    const current = proposalBatches.get(sessionId);
    if (!current || current.cwd !== ctx.cwd || current.status === "applied") return undefined;
    const status = proposalResponseStatus(prompt);
    if (!current.presentation && status === "approved") {
      return proposalAudit(current.batch, "approval-observed", { approval: "pending" });
    }
    if (status === "approved" && current.status === "pending") current.status = "approved";
    else if (status !== "pending") current.status = status;
    else if (current.status !== "revision-required" && current.status !== "cancelled") current.status = "pending";
    return proposalAudit(current.batch, "approval-observed", { approval: current.status });
  }

  function activeProposalWorkflow(ctx) {
    const workflow = workflowFor(ctx);
    const scan = activeScans.get(sessionIdFor(ctx));
    if (
      !workflow ||
      scan?.cwd !== ctx.cwd ||
      (workflow.command !== "picm-adopt" && workflow.command !== "picm-maintain")
    ) {
      return undefined;
    }
    return { workflow, scan };
  }

  async function runProposalBatch(ctx, params, execution = {}) {
    const active = activeProposalWorkflow(ctx);
    if (!active) {
      return {
        ok: false,
        code: "PICM_PROPOSAL_SCAN_NOT_ACTIVE",
        message: "Begin an active /picm-adopt or /picm-maintain scan before preparing or applying a proposal batch",
      };
    }
    const { workflow, scan } = active;
    const sessionId = sessionIdFor(ctx);
    if (params.action === "prepare") {
      const batch = await prepareProposalBatch({
        gate: runtimeFor(ctx).gate,
        excludedPaths: scan.excludedPaths,
        operations: params.operations,
      });
      requireCurrentWorkflow(sessionId, workflow);
      proposalBatches.set(sessionId, {
        cwd: ctx.cwd,
        command: workflow.command,
        batch,
        status: "pending",
        presentation: undefined,
      });
      return {
        ok: true,
        action: "prepare",
        proposalId: batch.id,
        digest: batch.digest,
        operations: batch.auditOperations,
        audit: proposalAudit(batch, "prepared", { command: workflow.command }),
      };
    }

    const current = proposalBatches.get(sessionId);
    if (!current || current.cwd !== ctx.cwd || current.command !== workflow.command) {
      return {
        ok: false,
        code: "PICM_PROPOSAL_NOT_PREPARED",
        message: "Prepare the current exact proposal batch before applying or cancelling it",
      };
    }
    if (params.proposalId !== current.batch.id) {
      return {
        ok: false,
        code: "PICM_PROPOSAL_STALE",
        message: "proposalId does not match the current exact proposal batch",
      };
    }
    if (params.action === "present") {
      if (current.status !== "pending") {
        return {
          ok: false,
          code: "PICM_PROPOSAL_REPLACEMENT_REQUIRED",
          message: "Prepare a replacement batch after cancellation or a requested revision",
        };
      }
      if (params.digest !== current.batch.digest) {
        return {
          ok: false,
          code: "PICM_PROPOSAL_STALE",
          message: "digest does not match the current exact proposal batch",
        };
      }
      const summary = proposalSummary(current.batch);
      const approvalPrompt = "Reply accept, approve, accept and write, or proceed to apply this exact proposal; otherwise request changes or cancel.";
      current.presentation = {
        proposalId: current.batch.id,
        digest: current.batch.digest,
        summary,
        approvalPrompt,
      };
      return {
        ok: true,
        action: "present",
        proposalId: current.batch.id,
        digest: current.batch.digest,
        summary,
        approvalPrompt,
        audit: proposalAudit(current.batch, "presented", { command: workflow.command }),
      };
    }
    if (params.action === "cancel") {
      current.status = "cancelled";
      return {
        ok: true,
        action: "cancel",
        proposalId: current.batch.id,
        audit: proposalAudit(current.batch, "cancelled", { command: workflow.command }),
      };
    }
    if (params.action !== "apply") {
      throw new Error("PICM_PROPOSAL_INVALID: action must be prepare, present, apply, or cancel");
    }
    if (current.status !== "approved") {
      return {
        ok: false,
        code: "PICM_PROPOSAL_NOT_APPROVED",
        message: "An unambiguous direct approval of the current exact proposal is required before applying it",
      };
    }

    current.status = "applying";
    try {
      throwIfAborted(execution.signal, "PICM_PROPOSAL_ABORTED");
      const result = await applyProposalBatch(current.batch, { signal: execution.signal });
      requireCurrentWorkflow(sessionId, workflow);
      current.status = "applied";
      return {
        ...result,
        action: "apply",
        audit: proposalAudit(current.batch, "applied", { command: workflow.command }),
      };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      const aborted = failure.code === "PICM_PROPOSAL_ABORTED";
      current.status = aborted ? "aborted" : "failed";
      failure.picmProposalAudit = proposalAudit(current.batch, current.status, {
        command: workflow.command,
        ...(typeof failure.code === "string" ? { code: failure.code } : {}),
      });
      throw failure;
    }
  }

  async function proposalBatch(params, ctx, execution) {
    return queueScanOperation(ctx, () => runProposalBatch(ctx, params, execution));
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

  async function hasNewlyAdoptedStatus(ctx) {
    const workflow = workflowFor(ctx);
    if (
      !workflow ||
      workflow.command !== "picm-adopt" ||
      !workflow.adoptionBaselineCaptured ||
      workflow.adoptionWasAlreadyAdopted
    ) {
      return false;
    }
    const config = await runtimeFor(ctx).store.read();
    return config.ok && isRecord(config.config) && isRecord(config.config.adoption) && config.config.adoption.status === "adopted";
  }

  async function claimInitialMaintenanceOffer(ctx) {
    const workflow = workflowFor(ctx);
    if (!workflow || workflow.initialMaintenanceOffered || !await hasNewlyAdoptedStatus(ctx)) {
      return undefined;
    }
    if (workflowFor(ctx) !== workflow || workflow.initialMaintenanceOffered) return undefined;
    workflow.initialMaintenanceOffered = true;
    return workflowState(workflow);
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
    if (!workflow.initialMaintenanceOffered || !await hasNewlyAdoptedStatus(ctx)) {
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

  function workflowCommand(ctx) {
    return workflowFor(ctx)?.command;
  }

  function observeNewWorkflowIntentResponse(ctx, text) {
    const workflow = workflowFor(ctx);
    if (!workflow || workflow.command !== "picm-new" || !workflow.newWorkflowIntentRequired) return;
    const observedIntent = directNewWorkflowIntent(text);
    if (!observedIntent) return;
    workflow.pendingNewWorkflowIntent = observedIntent;
    workflow.pendingNewWorkflowIntentSource = "direct-user-reply";
    return workflowState(workflow);
  }

  function newWorkflowContinuity(ctx) {
    const workflow = workflowFor(ctx);
    if (!workflow?.initialIntent) return undefined;
    return {
      initialIntent: workflow.initialIntent,
      newWorkflowIntent: workflow.newWorkflowIntent,
      newWorkflowIntentRequired: workflow.newWorkflowIntentRequired,
      pendingNewWorkflowIntent: workflow.pendingNewWorkflowIntent,
    };
  }

  const currentWorkflowCommand = workflowCommand;

  function specialistRouteSemantics(ctx) {
    const workflow = workflowFor(ctx);
    if (!workflow?.specialistScaffoldApproved) {
      throw new Error("SPECIALIST_GUIDANCE_NOT_APPROVED: complete approved Specialist scaffold writes first");
    }
    return structuredClone(workflow.specialistRouteSemantics);
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
    const workflow = workflowFor(ctx);
    if (
      workflow?.command === "picm-new" &&
      event.toolName === "write" &&
      event.isError !== true &&
      typeof event.args?.path === "string" &&
      typeof event.args?.content === "string"
    ) {
      const path = resolve(ctx.cwd, event.args.path);
      workflow.specialistScaffoldApproved = false;
      workflow.specialistRouteSemantics = undefined;
      workflow.approvedWrites.set(path, event.args.content);
      if (path === resolve(ctx.cwd, ".picm/config.json")) {
        try {
          const config = JSON.parse(event.args.content);
          workflow.specialistConfigWritten = config?.generatedBy === "picm-factory" && config?.profile === "specialist-folder";
          const recipePath = config?.paths?.firstRecipe;
          const recipe = typeof recipePath === "string"
            ? workflow.approvedWrites.get(resolve(ctx.cwd, recipePath))
            : undefined;
          if (workflow.specialistConfigWritten && typeof recipe === "string") {
            const semantics = parseSpecialistFirstRunRecipe(recipePath, recipe);
            const generatedInputPaths = generatedSpecialistInputRoutes(semantics.inputs);
            const requiredPaths = [
              config.paths?.rootInstructions,
              config.paths?.rootContext,
              "identity.md",
              "rules.md",
              recipePath,
              ...generatedInputPaths,
            ];
            const completeInventory = requiredPaths.every((requiredPath) => {
              if (typeof requiredPath !== "string" || !requiredPath.trim()) return false;
              const content = workflow.approvedWrites.get(resolve(ctx.cwd, requiredPath));
              return typeof content === "string" && content.trim() &&
                !/\{\{|\}\}|\[[A-Z][^\]]*\]|\b(?:TODO|TBD)\b/i.test(content);
            });
            if (completeInventory) {
              workflow.specialistRouteSemantics = semantics;
              workflow.specialistScaffoldApproved = true;
            }
          }
        } catch {
          workflow.specialistConfigWritten = false;
          workflow.specialistRouteSemantics = undefined;
          workflow.specialistScaffoldApproved = false;
        }
      }
    }
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

    if (workflow?.command === "picm-new" && event.toolName === "picm_scaffold_proposal" && !scan) {
      return { allowed: true };
    }

    if (workflow && event.toolName === "picm_specialist_first_run_guidance") {
      if (
        workflow.command === "picm-new" &&
        workflow.privacyReviewed &&
        workflow.scanStarted &&
        workflow.specialistScaffoldApproved
      ) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "Render Specialist guidance only after approved Specialist scaffold config and recipe writes from this picm-new run",
      };
    }

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
        if (
          (workflow.command === "picm-adopt" || workflow.command === "picm-maintain") &&
          (event.toolName === "edit" || event.toolName === "write")
        ) {
          return {
            allowed: false,
            reason: "Use picm_proposal_batch for approved /picm-adopt or /picm-maintain file mutations",
          };
        }
        if (event.toolName === "picm_proposal_batch") {
          return workflow.command === "picm-adopt" || workflow.command === "picm-maintain"
            ? { allowed: true }
            : { allowed: false, reason: "Proposal batches are available only during active /picm-adopt or /picm-maintain scans" };
        }
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
    claimInitialMaintenanceOffer,
    continueAdoptionAsMaintenance,
    currentWorkflowCommand,
    dispose,
    endToolExecution,
    isWorkflowCompleted,
    maintenancePolicy,
    newWorkflowContinuity,
    observeNewWorkflowIntentResponse,
    observeProposalResponse,
    proposalBatch,
    workflowCommand,
    rejectToolExecution,
    resetCycle,
    restoreWorkflow,
    scanControl,
    settle,
    specialistRouteSemantics,
    startToolExecution,
    startup,
  };
}
