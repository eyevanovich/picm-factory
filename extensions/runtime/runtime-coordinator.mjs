import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createGitReadGate } from "./git-read-gate.mjs";
import { createMaintenanceConfigStore } from "./maintenance-config-store.mjs";
import { createMaintenanceController } from "./maintenance-controller.mjs";
import { mergePrivacyExcludedPaths } from "./privacy-policy.mjs";
import {
  createScaffoldApprovalRuntime,
  isUnverifiedCheckpointAcknowledgement,
} from "./scaffold-approval.mjs";
import { createWorkflowLifecycle } from "./workflow-lifecycle.mjs";
import { identifyLayoutProfile } from "./layout-profile.mjs";
import {
  applyProposalBatch,
  prepareProposalBatch,
  proposalAudit,
  proposalHasExistingContentRisk,
  proposalSummary,
} from "./proposal-batch.mjs";
import {
  hasUnresolvedSpecialistPlaceholder,
  parseSpecialistFirstRunRecipe,
} from "./specialist-first-run-guidance.mjs";

const GUARDED_PATH_TOOLS = new Set(["read", "edit", "write", "grep", "rg", "find", "ls"]);
const TERMINAL_PROPOSAL_STATUSES = new Set(["applied", "failed", "aborted", "cancelled", "revision-required"]);
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

function isLocalSpecialistRoute(value) {
  return typeof value === "string" && value.trim() === value && value !== "" &&
    !isAbsolute(value) && !value.split(/[\\/]/).includes("..");
}

export function createRuntimeCoordinator({
  packageRoot,
  canonicalPackageRoot,
  pathBindingLimits,
  createConfigStore = createMaintenanceConfigStore,
  createGitGate = createGitReadGate,
  policyPreviewTtlMs = 10 * 60 * 1000,
  maxPolicyPreviews = 32,
} = {}) {
  const runtimes = new Map();
  const scanControlQueues = new Map();
  const policyPreviews = new Map();
  const issuedPathBindings = new Map();
  const proposalBatches = new Map();
  const scaffoldApproval = createScaffoldApprovalRuntime();
  const canonicalWorkspace = (cwd) => {
    try { return realpathSync(cwd); } catch { return resolve(cwd); }
  };
  const lifecycle = createWorkflowLifecycle({ canonicalizeWorkspace: canonicalWorkspace });

  const sessionIdFor = (ctx) =>
    ctx.sessionManager?.getSessionId?.() ??
    ctx.sessionManager?.getSessionFile?.() ??
    ctx.sessionManager ??
    ctx;
  const workflowScopeFor = (ctx) => ({
    sessionId: sessionIdFor(ctx),
    workspace: canonicalWorkspace(ctx.cwd),
    cwd: ctx.cwd,
  });

  function issuedBindingFor(sessionId, toolCallId) {
    return issuedPathBindings.get(sessionId)?.get(toolCallId);
  }

  function revokeIssuedBinding(issued, { afterExecution = false } = {}) {
    if (!issued || issued.state === "revoked" || (issued.state === "executing" && !afterExecution)) return;
    issued.state = "revoked";
    try { issued.binding.release(); } catch {}
    issued.binding = undefined;
  }

  function clearIssuedBinding(issued) {
    const bindings = issuedPathBindings.get(issued.sessionId);
    if (!bindings || bindings.get(issued.toolCallId) !== issued) return;
    bindings.delete(issued.toolCallId);
    if (bindings.size === 0) issuedPathBindings.delete(issued.sessionId);
  }

  function releaseBinding(scope, toolCallId) {
    if (typeof toolCallId !== "string") return;
    const issued = issuedBindingFor(scope.sessionId, toolCallId);
    if (issued?.scope === scope) revokeIssuedBinding(issued);
  }

  function releaseBindings(scope) {
    const bindings = issuedPathBindings.get(scope.sessionId);
    if (!bindings) return;
    for (const issued of bindings.values()) {
      if (issued.scope === scope) revokeIssuedBinding(issued);
    }
  }

  function revokeScaffoldMutationBindings(scope) {
    const bindings = issuedPathBindings.get(scope.sessionId);
    if (!bindings) return;
    for (const issued of bindings.values()) {
      if (issued.scope !== scope || !issued.scaffoldMutation || issued.state !== "active") continue;
      revokeIssuedBinding(issued);
      scaffoldApproval.complete(scope, issued.toolCallId, false);
    }
  }

  function revokeAuthority(scope) {
    if (!scope) return;
    proposalBatches.delete(scope);
    scaffoldApproval.clear(scope);
    releaseBindings(scope);
    for (const [previewId, preview] of policyPreviews) {
      if (preview.scope === scope) policyPreviews.delete(previewId);
    }
  }

  function workflowFor(ctx) {
    const scope = workflowScopeFor(ctx);
    const workflow = lifecycle.current(scope);
    if (workflow) return workflow;
    const stale = lifecycle.currentForSession(scope.sessionId);
    if (stale && stale.scope.workspace !== scope.workspace) {
      lifecycle.removeForSession(scope.sessionId);
      revokeAuthority(stale.scope);
    }
    return undefined;
  }

  function authorityScopeFor(ctx) {
    const workflow = workflowFor(ctx);
    return workflow?.scope ?? lifecycle.scopeFor(workflowScopeFor(ctx));
  }

  function clearWorkflow(ctx) {
    const scope = workflowScopeFor(ctx);
    const workflow = lifecycle.removeForSession(scope.sessionId);
    if (workflow) revokeAuthority(workflow.scope);
    else revokeAuthority(lifecycle.scopeFor(scope));
    return Boolean(workflow);
  }

  function workflowState(workflow) {
    return lifecycle.serialize(workflow);
  }

  function serializeWorkflow(ctx, status) {
    const workflow = workflowFor(ctx);
    return workflow ? { status, ...workflowState(workflow) } : undefined;
  }

  function authorizeWorkflow(ctx, command, { initialIntent } = {}) {
    const scope = workflowScopeFor(ctx);
    const previous = lifecycle.removeForSession(scope.sessionId);
    if (previous) revokeAuthority(previous.scope);
    revokeAuthority(lifecycle.scopeFor(scope));
    const workflow = lifecycle.authorize(scope, command, { initialIntent });
    return workflowState(workflow);
  }

  function restoreWorkflow(ctx, state) {
    const scope = workflowScopeFor(ctx);
    const current = lifecycle.current(scope);
    const retainScaffoldSentinel =
      current?.command === "picm-new" &&
      state?.status === "authorized" &&
      state?.command === "picm-new" &&
      scaffoldApproval.has(current.scope);
    clearWorkflow(ctx);
    const completed = state?.status === "completed";
    let excludedPaths;
    try {
      excludedPaths = mergePrivacyExcludedPaths(ctx.cwd, state?.excludedPaths ?? []);
    } catch {
      if (!completed) return false;
      excludedPaths = [];
    }
    const workflow = lifecycle.restore(scope, { ...state, normalizedExcludedPaths: excludedPaths });
    if (workflow && retainScaffoldSentinel && workflow.command === "picm-new") {
      scaffoldApproval.replaceWithInvalidatedSentinel(workflow.scope);
    }
    return Boolean(workflow);
  }

  function requireCurrentWorkflow(_sessionId, workflow) {
    if (!lifecycle.isCurrent(workflow) || workflow.terminal.completed) {
      throw new Error("PICM_SCAN_STALE: workflow changed or completed while the scan action was running");
    }
  }

  function throwIfAborted(signal, code) {
    if (signal?.aborted) {
      const error = new Error(`${code}: operation was cancelled before mutation`);
      error.code = code;
      throw error;
    }
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
      lifecycle.transition(workflow, "preflight-complete");
      if (workflow.command === "picm-maintain" || workflow.command === "picm-optimize") {
        const current = await runtimeFor(ctx).store.readPrivacyForReview();
        requireCurrentWorkflow(sessionId, workflow);
        if (!current.ok) throw new Error(`${current.code}: ${current.message}`);
        const persistedExcludedPaths = Array.isArray(current.privacy?.excludedPaths)
          ? mergePrivacyExcludedPaths(ctx.cwd, workflow.privacy.excludedPaths, current.privacy.excludedPaths)
          : workflow.privacy.excludedPaths;
        lifecycle.transition(workflow, "preflight-complete", {
          excludedPaths: persistedExcludedPaths,
          privacyFollowupPending: Array.isArray(current.privacy?.excludedPaths),
          privacyQuestionIsConcise:
            Array.isArray(current.privacy?.excludedPaths) || hasCompletedPicmSetup(current.config),
        });
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
      lifecycle.transition(workflow, "privacy-reviewed", {
        excludedPaths: mergePrivacyExcludedPaths(
          ctx.cwd,
          workflow.privacy.excludedPaths,
          persistedPrivacy?.excludedPaths ?? [],
          additions,
        ),
        captureAdoptionBaseline: workflow.command === "picm-adopt" && !workflow.adoption.baselineCaptured,
        wasAlreadyAdopted: current.config?.adoption?.status === "adopted",
      });
      clearCheckpointAcknowledgements(workflow.scope);
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
      if (!workflow.phase.scanStarted || !workflow.phase.scanSettled || workflow.phase.active) {
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

      lifecycle.transition(workflow, "select-new-intent", {
        intent: params.intent,
        wasAlreadyAdopted: adoptionWasAlreadyAdopted,
      });
      clearCheckpointAcknowledgements(workflow.scope);

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
      if (!workflow || !workflow.phase.active) {
        throw new Error("PICM_SCAN_NOT_ACTIVE: begin an explicitly authorized scan before requesting inventory");
      }
      const inventory = await runtimeFor(ctx).gate.refreshInventory(path, workflow.privacy.excludedPaths);
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
        lifecycle.transition(workflow, "require-new-intent");
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
        excludedPaths: [...workflow.privacy.excludedPaths],
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
      lifecycle.transition(workflow, "begin-scan", {
        excludedPaths: mergePrivacyExcludedPaths(
          ctx.cwd,
          workflow.privacy.excludedPaths,
          config.privacy?.excludedPaths ?? [],
        ),
      });
    } else if (action === "end") {
      if (!workflow || !workflow.phase.active) {
        throw new Error("PICM_SCAN_NOT_ACTIVE: begin an explicitly authorized scan before ending it");
      }
      lifecycle.transition(workflow, "end-scan");
      clearCheckpointAcknowledgements(workflow.scope);
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
      if (!workflow.scanSettled || workflow.phase.active) {
        throw new Error("PICM_SCAN_NOT_SETTLED: end the active privacy-reviewed scan before completion");
      }
      if (workflow.command === "picm-new" && workflow.newWorkflowIntentRequired) {
        if (workflow.pendingNewWorkflowIntent === "cancel") {
          lifecycle.transition(workflow, "complete-pending-cancel");
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
          lifecycle.transition(workflow, "maintenance-reset-committed");
          maintenanceResetCommitted = true;
        }
        if (!maintenanceResetCommitted) throwIfAborted(execution.signal, "PICM_SCAN_ABORTED");
        lifecycle.transition(workflow, "complete");
        revokeAuthority(workflow.scope);
      }

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
    return {
      ok: true,
      action,
      authorized: Boolean(current) && !current.completed,
      active: current?.phase.active === true,
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

  function hasProposalAcknowledgement(current) {
    return current.acknowledgement?.proposalId === current.batch.id &&
      current.acknowledgement.digest === current.batch.digest;
  }

  function clearProposalAcknowledgement(scope) {
    const current = proposalBatches.get(scope);
    if (current) current.acknowledgement = undefined;
  }

  function clearCheckpointAcknowledgements(scope) {
    scaffoldApproval.clearAcknowledgement(scope);
    revokeScaffoldMutationBindings(scope);
    clearProposalAcknowledgement(scope);
  }

  function finaliseProposal(current, status) {
    current.status = status;
    current.acknowledgement = undefined;
  }

  function hasCurrentPresentation(current) {
    return current.presentation?.proposalId === current.batch.id &&
      current.presentation.digest === current.batch.digest;
  }

  function observeProposalResponse(ctx, prompt) {
    const workflow = workflowFor(ctx);
    const current = workflow ? proposalBatches.get(workflow.scope) : undefined;
    if (!current || TERMINAL_PROPOSAL_STATUSES.has(current.status)) return undefined;
    const status = proposalResponseStatus(prompt);
    if (status === "cancelled" || status === "revision-required") {
      finaliseProposal(current, status);
      return proposalAudit(current.batch, "approval-observed", { approval: current.status });
    }
    if (isUnverifiedCheckpointAcknowledgement(prompt)) {
      if (hasCurrentPresentation(current)) {
        current.status = "pending";
        current.acknowledgement = {
          proposalId: current.batch.id,
          digest: current.batch.digest,
        };
      }
      return proposalAudit(current.batch, "approval-observed", { approval: current.status });
    }
    if (!hasCurrentPresentation(current) && status === "approved") {
      return proposalAudit(current.batch, "approval-observed", { approval: "pending" });
    }
    if (status === "approved" && current.status === "pending") current.status = "approved";
    else if (current.status !== "revision-required" && current.status !== "cancelled") current.status = "pending";
    return proposalAudit(current.batch, "approval-observed", { approval: current.status });
  }

  function activeProposalWorkflow(ctx) {
    const workflow = workflowFor(ctx);
    if (
      !workflow ||
      !workflow.phase.active ||
      (workflow.command !== "picm-adopt" && workflow.command !== "picm-maintain")
    ) {
      return undefined;
    }
    return workflow;
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
    const workflow = active;
    const sessionId = sessionIdFor(ctx);
    if (params.action === "prepare") {
      const batch = await prepareProposalBatch({
        gate: runtimeFor(ctx).gate,
        excludedPaths: workflow.privacy.excludedPaths,
        operations: params.operations,
      });
      requireCurrentWorkflow(sessionId, workflow);
      proposalBatches.set(workflow.scope, {
        acknowledgement: undefined,
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

    const current = proposalBatches.get(workflow.scope);
    if (!current || current.command !== workflow.command) {
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
      const approvalPrompt = proposalHasExistingContentRisk(current.batch)
        ? "A user-reported Git checkpoint or risk opt-out is not approval. For existing content, record one before direct approval. Reply accept, approve, accept and write, or proceed to apply this exact proposal; otherwise request changes or cancel."
        : "Reply accept, approve, accept and write, or proceed to apply this exact proposal; otherwise request changes or cancel.";
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
      if (current.status === "cancelled") {
        return {
          ok: true,
          action: "cancel",
          proposalId: current.batch.id,
          audit: proposalAudit(current.batch, "cancelled", { command: workflow.command }),
        };
      }
      if (TERMINAL_PROPOSAL_STATUSES.has(current.status)) {
        return {
          ok: false,
          code: "PICM_PROPOSAL_REPLACEMENT_REQUIRED",
          message: "Prepare a replacement batch after the current proposal was resolved",
        };
      }
      finaliseProposal(current, "cancelled");
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
    if (proposalHasExistingContentRisk(current.batch) && !hasProposalAcknowledgement(current)) {
      return {
        ok: false,
        code: "PICM_PROPOSAL_CHECKPOINT_ACKNOWLEDGEMENT_REQUIRED",
        message: "A user-reported Git checkpoint or the documented risk opt-out is required before applying this exact proposal to existing content",
      };
    }

    current.status = "applying";
    let result;
    try {
      throwIfAborted(execution.signal, "PICM_PROPOSAL_ABORTED");
      const persisted = await runtimeFor(ctx).store.readPrivacyForReview();
      requireCurrentWorkflow(sessionId, workflow);
      throwIfAborted(execution.signal, "PICM_PROPOSAL_ABORTED");
      if (!persisted.ok) throw new Error(`${persisted.code}: ${persisted.message}`);
      const applyExcludedPaths = mergePrivacyExcludedPaths(
        ctx.cwd,
        workflow.privacy.excludedPaths,
        persisted.privacy?.excludedPaths ?? [],
      );
      result = await applyProposalBatch(current.batch, {
        gate: runtimeFor(ctx).gate,
        excludedPaths: applyExcludedPaths,
        signal: execution.signal,
      });
      if (!result.ok) {
        const status = result.code === "PICM_PROPOSAL_ABORTED" ? "aborted" : "failed";
        if (!lifecycle.isCurrent(workflow)) {
          return {
            ...result,
            action: "apply",
            code: "PICM_SCAN_STALE",
            message: "PICM_SCAN_STALE: workflow changed or completed while the scan action was running",
            audit: proposalAudit(current.batch, status, {
              command: workflow.command,
              code: "PICM_SCAN_STALE",
              results: result.results,
            }),
          };
        }
        finaliseProposal(current, status);
        return {
          ...result,
          action: "apply",
          audit: proposalAudit(current.batch, current.status, {
            command: workflow.command,
            code: result.code,
            results: result.results,
          }),
        };
      }
      if (!lifecycle.isCurrent(workflow)) {
        return {
          ...result,
          ok: false,
          code: "PICM_SCAN_STALE",
          message: "PICM_SCAN_STALE: workflow changed or completed while the scan action was running",
          action: "apply",
          audit: proposalAudit(current.batch, "failed", {
            command: workflow.command,
            code: "PICM_SCAN_STALE",
            results: result.results,
          }),
        };
      }
      finaliseProposal(current, "applied");
      return {
        ...result,
        action: "apply",
        audit: proposalAudit(current.batch, "applied", {
          command: workflow.command,
          results: result.results,
        }),
      };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      const aborted = failure.code === "PICM_PROPOSAL_ABORTED";
      if (!lifecycle.isCurrent(workflow)) {
        failure.picmProposalAudit = proposalAudit(current.batch, aborted ? "aborted" : "failed", {
          command: workflow.command,
          ...(typeof failure.code === "string" ? { code: failure.code } : {}),
        });
        throw failure;
      }
      finaliseProposal(current, aborted ? "aborted" : "failed");
      if (result?.ok) {
        return {
          ...result,
          ok: false,
          code: typeof failure.code === "string" ? failure.code : "PICM_PROPOSAL_APPLY_FAILED",
          message: failure.message,
          action: "apply",
          audit: proposalAudit(current.batch, current.status, {
            command: workflow.command,
            ...(typeof failure.code === "string" ? { code: failure.code } : {}),
            results: result.results,
          }),
        };
      }
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
      const gate = createGitGate({
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
    revokeAuthority(authorityScopeFor(ctx));
    const sessionId = sessionIdFor(ctx);
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
    requireCurrentWorkflow(sessionIdFor(ctx), workflow);
    return config.ok && isRecord(config.config) && isRecord(config.config.adoption) && config.config.adoption.status === "adopted";
  }

  async function claimInitialMaintenanceOffer(ctx) {
    const workflow = workflowFor(ctx);
    if (!workflow || workflow.initialMaintenanceOffered || !await hasNewlyAdoptedStatus(ctx)) {
      return undefined;
    }
    if (!lifecycle.isCurrent(workflow) || workflow.initialMaintenanceOffered) return undefined;
    lifecycle.transition(workflow, "claim-initial-maintenance");
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
    if (!workflow.scanStarted || !workflow.scanSettled || workflow.phase.active) {
      throw new Error("PICM_SCAN_NOT_SETTLED: end the adoption scan before starting initial maintenance");
    }
    if (!workflow.initialMaintenanceOffered || !await hasNewlyAdoptedStatus(ctx)) {
      throw new Error("PICM_ADOPTION_CONTINUATION_UNAVAILABLE: finish an adopted workspace before starting initial maintenance");
    }
    requireCurrentWorkflow(sessionIdFor(ctx), workflow);
    lifecycle.transition(workflow, "continue-as-maintenance");
    clearCheckpointAcknowledgements(workflow.scope);
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
    try {
      lifecycle.transition(workflow, "observe-new-intent", { intent: text });
    } catch (error) {
      if (!String(error?.message).includes("WORKFLOW_TRANSITION_INVALID")) throw error;
      return undefined;
    }
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

  async function scaffoldProposal(ctx, operations) {
    const workflow = workflowFor(ctx);
    if (!workflow || workflow.command !== "picm-new") {
      throw new Error("SCAFFOLD_PROPOSAL_UNAVAILABLE: invoke /picm-new first");
    }
    const sessionId = sessionIdFor(ctx);
    const gate = runtimeFor(ctx).gate;
    let existingContentAtRisk = false;
    for (const operation of operations) {
      if (typeof operation?.input?.path !== "string") continue;
      const decision = await gate.checkPath(
        operation.tool,
        operation.input.path,
        workflow.privacy.excludedPaths,
      );
      requireCurrentWorkflow(sessionId, workflow);
      if (!decision.allowed || !decision.executionBinding) continue;
      const binding = gate.bindPath(decision.executionBinding);
      try {
        if (decision.executionBinding.existingPath === decision.executionBinding.absolutePath) {
          existingContentAtRisk = true;
        }
      } finally {
        binding.release();
      }
    }
    return scaffoldApproval.register(workflow.scope, operations, { existingContentAtRisk });
  }

  function observeInput(ctx, text) {
    const observedIntent = observeNewWorkflowIntentResponse(ctx, text);
    const workflow = workflowFor(ctx);
    if (workflow && scaffoldApproval.observeInput(workflow.scope, text)) {
      revokeScaffoldMutationBindings(workflow.scope);
    }
    return observedIntent;
  }

  async function readApprovedSpecialistFile(workflow, ctx, route) {
    if (!isLocalSpecialistRoute(route)) {
      throw new Error("SPECIALIST_GUIDANCE_NOT_APPROVED: scaffold routes must be local");
    }
    const approvedPath = resolve(ctx.cwd, route);
    if (!workflow.specialist.approvedWrites.has(approvedPath)) {
      throw new Error("SPECIALIST_GUIDANCE_NOT_APPROVED: scaffold file must be an approved write");
    }
    const decision = await runtimeFor(ctx).gate.checkPath("read", route, workflow.privacy.excludedPaths);
    if (!decision.allowed || decision.executionBinding?.canonicalPath !== approvedPath) {
      throw new Error("SPECIALIST_GUIDANCE_NOT_APPROVED: scaffold file must pass the canonical privacy boundary");
    }
    const binding = runtimeFor(ctx).gate.bindPath(decision.executionBinding);
    try {
      return (await binding.operations.readFile(approvedPath)).toString("utf8");
    } finally {
      binding.release();
    }
  }

  function requiredSpecialistPaths(config) {
    const generatedInputPaths = Array.isArray(config?.paths?.generatedInputs)
      ? config.paths.generatedInputs
      : [];
    return [
      config?.paths?.rootInstructions,
      config?.paths?.rootContext,
      "identity.md",
      "rules.md",
      config?.paths?.firstRecipe,
      ...generatedInputPaths,
    ];
  }

  async function specialistRouteSemantics(ctx) {
    const workflow = workflowFor(ctx);
    let config = workflow?.specialistConfig;
    if (workflow?.specialistConfigEdited) {
      config = JSON.parse(await readApprovedSpecialistFile(workflow, ctx, ".picm/config.json"));
    }
    const recipePath = config?.paths?.firstRecipe;
    if (!workflow || !isLocalSpecialistRoute(recipePath)) {
      throw new Error("SPECIALIST_GUIDANCE_NOT_APPROVED: complete approved Specialist scaffold writes first");
    }
    const finalContents = new Map();
    for (const requiredPath of requiredSpecialistPaths(config)) {
      const content = await readApprovedSpecialistFile(workflow, ctx, requiredPath);
      finalContents.set(resolve(ctx.cwd, requiredPath), content);
    }
    const recipe = finalContents.get(resolve(ctx.cwd, recipePath));
    const semantics = validateSpecialistScaffold(workflow, ctx, config, recipe, finalContents);
    if (!semantics) {
      throw new Error("SPECIALIST_GUIDANCE_NOT_APPROVED: final Specialist routes are incomplete");
    }
    return semantics;
  }

  function settle(ctx) {
    const workflow = workflowFor(ctx);
    if (workflow?.completed) {
      clearWorkflow(ctx);
      return true;
    }
    if (workflow) {
      lifecycle.transition(workflow, "deactivate-scan");
      scaffoldApproval.settle(workflow.scope, false);
      releaseBindings(workflow.scope);
    }
    return false;
  }

  function validateSpecialistScaffold(workflow, ctx, config, recipe, scaffoldContents = workflow.specialist.approvedWrites) {
    const recipePath = config?.paths?.firstRecipe;
    const specialistConfig = config?.generatedBy === "picm-factory" && config?.profile === "specialist-folder";
    if (!specialistConfig || !isLocalSpecialistRoute(recipePath) || typeof recipe !== "string") return undefined;
    const semantics = parseSpecialistFirstRunRecipe(recipePath, recipe);
    const generatedInputPaths = Array.isArray(config.paths?.generatedInputs)
      ? config.paths.generatedInputs
      : [];
    const runtimeInputPaths = Array.isArray(config.paths?.runtimeInputs)
      ? config.paths.runtimeInputs
      : [];
    const declaredInputPaths = [...generatedInputPaths, ...runtimeInputPaths];
    const uniqueDeclarations = new Set(declaredInputPaths);
    const exhaustiveInputInventory =
      declaredInputPaths.every(isLocalSpecialistRoute) &&
      uniqueDeclarations.size === declaredInputPaths.length &&
      uniqueDeclarations.size === semantics.inputPaths.length &&
      semantics.inputPaths.every((inputPath) => isLocalSpecialistRoute(inputPath) && uniqueDeclarations.has(inputPath));
    const localOutputRoutes =
      isLocalSpecialistRoute(semantics.expectedArtifact) &&
      isLocalSpecialistRoute(semantics.nextActionSource);
    const runtimeInputsAreNotScaffolded = runtimeInputPaths.every(
      (inputPath) => !workflow.specialist.approvedWrites.has(resolve(ctx.cwd, inputPath)),
    );
    const requiredPaths = requiredSpecialistPaths(config);
    const completeInventory = requiredPaths.every((requiredPath) => {
      if (!isLocalSpecialistRoute(requiredPath)) return false;
      const content = scaffoldContents.get(resolve(ctx.cwd, requiredPath));
      return typeof content === "string" && content.trim() &&
        !hasUnresolvedSpecialistPlaceholder(content);
    });
    return exhaustiveInputInventory && localOutputRoutes && runtimeInputsAreNotScaffolded && completeInventory
      ? semantics
      : undefined;
  }

  function endToolExecution(event, ctx) {
    if (typeof event.toolCallId !== "string") return;
    const issued = issuedBindingFor(sessionIdFor(ctx), event.toolCallId);
    if (!issued) return;

    const workflow = issued.workflow;
    const current =
      (issued.state === "active" || issued.state === "executing") &&
      lifecycle.isCurrent(workflow) &&
      lifecycle.current(workflowScopeFor(ctx)) === workflow;
    try {
      if (!current) return;
      scaffoldApproval.complete(workflow.scope, event.toolCallId, !event.isError);
      if (
        workflow.command === "picm-new" &&
        event.toolName === "edit" &&
        event.isError !== true &&
        typeof event.args?.path === "string" &&
        resolve(ctx.cwd, event.args.path) === resolve(ctx.cwd, ".picm/config.json")
      ) {
        workflow.specialist.configEdited = true;
        workflow.specialist.routeSemantics = undefined;
      }
      if (
        workflow.command === "picm-new" &&
        event.toolName === "write" &&
        event.isError !== true &&
        typeof event.args?.path === "string" &&
        typeof event.args?.content === "string"
      ) {
        const path = resolve(ctx.cwd, event.args.path);
        workflow.specialist.scaffoldApproved = false;
        workflow.specialist.routeSemantics = undefined;
        workflow.specialist.approvedWrites.set(path, event.args.content);
        if (path === resolve(ctx.cwd, ".picm/config.json")) {
          try {
            const config = JSON.parse(event.args.content);
            workflow.specialist.configWritten = config?.generatedBy === "picm-factory" && config?.profile === "specialist-folder";
            workflow.specialist.config = workflow.specialist.configWritten ? config : undefined;
            workflow.specialist.configEdited = false;
            const recipePath = config?.paths?.firstRecipe;
            const recipe = typeof recipePath === "string"
              ? workflow.specialist.approvedWrites.get(resolve(ctx.cwd, recipePath))
              : undefined;
            const semantics = validateSpecialistScaffold(workflow, ctx, config, recipe);
            if (semantics) {
              workflow.specialist.routeSemantics = semantics;
              workflow.specialist.scaffoldApproved = true;
            }
          } catch {
            workflow.specialist.configWritten = false;
            workflow.specialist.config = undefined;
            workflow.specialist.configEdited = false;
            workflow.specialist.routeSemantics = undefined;
            workflow.specialist.scaffoldApproved = false;
          }
        }
      }
    } finally {
      revokeIssuedBinding(issued, { afterExecution: true });
      clearIssuedBinding(issued);
    }
  }

  function retainBinding(workflow, toolCallId, binding) {
    if (!workflow || typeof toolCallId !== "string") return false;
    const existing = issuedBindingFor(workflow.scope.sessionId, toolCallId);
    if (existing) {
      revokeIssuedBinding(existing);
      try { binding.release(); } catch {}
      return false;
    }
    let bindings = issuedPathBindings.get(workflow.scope.sessionId);
    if (!bindings) {
      bindings = new Map();
      issuedPathBindings.set(workflow.scope.sessionId, bindings);
    }
    bindings.set(toolCallId, {
      sessionId: workflow.scope.sessionId,
      toolCallId,
      scope: workflow.scope,
      workflow,
      binding,
      scaffoldMutation: false,
      state: "active",
    });
    return true;
  }

  function markScaffoldMutationBinding(scope, toolCallId) {
    const issued = issuedBindingFor(scope.sessionId, toolCallId);
    if (!issued || issued.scope !== scope || issued.state !== "active") return false;
    issued.scaffoldMutation = true;
    return true;
  }

  function beginBoundPathExecution(toolCallId, ctx, toolName) {
    if (typeof toolCallId !== "string") return undefined;
    const workflow = workflowFor(ctx);
    const issued = issuedBindingFor(sessionIdFor(ctx), toolCallId);
    if (issued) {
      if (issued.state !== "active" || workflow !== issued.workflow) {
        revokeIssuedBinding(issued);
        throw new Error("PICM_PATH_BINDING_STALE: guarded path execution no longer belongs to the current workflow");
      }
      if (issued.binding.toolName !== toolName) {
        throw new Error("PICM_PATH_BINDING_MISMATCH: guarded path execution changed tool identity");
      }
      issued.state = "executing";
      return issued.binding;
    }
    if (!workflow?.completed && (workflow?.phase.active || workflow?.privacy.excludedPaths.length)) {
      throw new Error("PICM_PATH_BINDING_STALE: guarded path execution no longer belongs to the current workflow");
    }
    return undefined;
  }

  async function checkToolCallCore(event, ctx) {
    const workflow = workflowFor(ctx);
    const scanActive = workflow?.phase.active === true;
    const bindDecision = (decision) => {
      if (!decision.allowed || !decision.executionBinding || typeof event.toolCallId !== "string") return decision;
      requireCurrentWorkflow(sessionIdFor(ctx), workflow);
      const binding = runtimeFor(ctx).gate.bindPath(decision.executionBinding);
      if (retainBinding(workflow, event.toolCallId, binding)) return decision;
      return {
        allowed: false,
        reason: "PICM_PATH_BINDING_STALE: guarded path execution no longer belongs to the current workflow",
      };
    };

    if (workflow?.completed) return { allowed: true };

    if (workflow && !workflow.privacyReviewed) {
      if (event.toolName === "picm_scan_control") return { allowed: true };
      if (event.toolName === "read") {
        const trusted = await runtimeFor(ctx).gate.checkTrustedPackageRead(event.toolName, event.input?.path);
        if (trusted.allowed) {
          if (typeof trusted.canonicalPath === "string") event.input.path = trusted.canonicalPath;
          return bindDecision(trusted);
        }
      }
      return {
        allowed: false,
        reason: "PiCM privacy review must complete before any agent tool can inspect or change the project",
      };
    }

    if (workflow && event.toolName === "picm_scan_control") return { allowed: true };
    if (workflow?.command === "picm-new" && event.toolName === "picm_scaffold_proposal" && !scanActive) return { allowed: true };

    if (workflow && event.toolName === "picm_specialist_first_run_guidance") {
      if (workflow.command === "picm-new" && workflow.privacyReviewed && workflow.scanStarted) {
        try {
          await specialistRouteSemantics(ctx);
          return { allowed: true };
        } catch (error) {
          return {
            allowed: false,
            reason: error instanceof Error ? error.message : "Final Specialist scaffold state is incomplete",
          };
        }
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

    if (workflow && !scanActive) {
      if (event.toolName === "read") {
        const trusted = await runtimeFor(ctx).gate.checkTrustedPackageRead(event.toolName, event.input?.path);
        if (trusted.allowed) {
          if (typeof trusted.canonicalPath === "string") event.input.path = trusted.canonicalPath;
          return bindDecision(trusted);
        }
      }
      return { allowed: false, reason: "Begin the privacy-reviewed PiCM scan before using agent tools" };
    }

    try {
      if (scanActive) {
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
          workflow.privacy.excludedPaths,
        );
        if (decision.allowed && event.toolName === "read" && typeof decision.canonicalPath === "string") {
          event.input.path = decision.canonicalPath;
        }
        return bindDecision(decision);
      }

      if (workflow?.privacy.excludedPaths.length > 0) {
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
          workflow.privacy.excludedPaths,
        );
        if (decision.allowed && event.toolName === "read" && typeof decision.canonicalPath === "string") {
          event.input.path = decision.canonicalPath;
        }
        return bindDecision(decision);
      }
      return { allowed: true };
    } catch (error) {
      return { allowed: false, reason: `gate exception: ${error instanceof Error ? error.message : error}` };
    }
  }

  function blockedScaffoldMutation() {
    return {
      allowed: false,
      reason: "Blocked scaffold mutation: directly approve and apply only the current exact proposal",
    };
  }

  async function checkToolCall(event, ctx) {
    const workflow = workflowFor(ctx);
    const admission = workflow ? scaffoldApproval.admission(workflow.scope, event) : { active: false };
    if (admission.active) {
      const maintenancePreview = event.toolName === "picm_maintenance_policy" && event.input?.action === "preview";
      const allowedControl = new Set(["read", "grep", "rg", "find", "ls", "picm_scan_control"]);
      if (!allowedControl.has(event.toolName) && event.toolName !== "picm_scaffold_proposal" && !maintenancePreview && !admission.allowed) {
        return blockedScaffoldMutation();
      }
    }
    const decision = await checkToolCallCore(event, ctx);
    const matchedScaffoldMutation =
      decision.allowed &&
      workflow &&
      admission.operationIdentity &&
      (event.toolName === "write" || event.toolName === "edit");
    if (!matchedScaffoldMutation) return decision;

    const currentWorkflow = workflowFor(ctx);
    const currentAdmission = currentWorkflow
      ? scaffoldApproval.admission(currentWorkflow.scope, event, {
        existingContentAtRisk:
          decision.executionBinding?.existingPath === decision.executionBinding?.absolutePath,
      })
      : { active: false };
    if (currentAdmission.riskEscalated) revokeScaffoldMutationBindings(workflow.scope);
    const currentApproval =
      currentWorkflow === workflow &&
      lifecycle.isCurrent(workflow) &&
      currentAdmission.active &&
      currentAdmission.proposalIdentity === admission.proposalIdentity &&
      currentAdmission.proposalDigest === admission.proposalDigest &&
      currentAdmission.directApproved === admission.directApproved &&
      currentAdmission.approvalIdentity === admission.approvalIdentity &&
      currentAdmission.acknowledgementIdentity === admission.acknowledgementIdentity &&
      currentAdmission.acknowledged === admission.acknowledged &&
      currentAdmission.operationIdentity === admission.operationIdentity &&
      currentAdmission.allowed;
    if (
      !currentApproval ||
      !scaffoldApproval.reserve(workflow.scope, currentAdmission, event.toolCallId) ||
      !markScaffoldMutationBinding(workflow.scope, event.toolCallId)
    ) {
      releaseBinding(workflow.scope, event.toolCallId);
      return blockedScaffoldMutation();
    }
    return decision;
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

  function retainPreview(ctx, maintenance) {
    prunePreviews(true);
    const previewId = `picm-maintenance-preview:${randomUUID()}`;
    const expiresAt = Date.now() + policyPreviewTtlMs;
    policyPreviews.set(previewId, {
      cwd: ctx.cwd,
      scope: authorityScopeFor(ctx),
      maintenance: structuredClone(maintenance),
      expiresAt,
      inUse: false,
    });
    return { previewId, expiresAt };
  }

  function reservePreview(ctx, previewId) {
    prunePreviews();
    const preview = policyPreviews.get(previewId);
    if (!preview) throw new Error("MAINTENANCE_PREVIEW_EXPIRED: previewId is unknown or expired; create a new preview");
    if (preview.cwd !== ctx.cwd) throw new Error("MAINTENANCE_PREVIEW_CWD_MISMATCH: previewId belongs to a different working directory");
    if (preview.scope !== authorityScopeFor(ctx)) {
      throw new Error("MAINTENANCE_PREVIEW_SCOPE_MISMATCH: previewId belongs to a different session or workflow");
    }
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
      const { previewId, expiresAt } = retainPreview(ctx, preview.maintenance);
      return { ...preview, previewId, expiresAt: new Date(expiresAt).toISOString() };
    }
    if (ctx.mode !== "tui") throw new Error("MAINTENANCE_APPLY_TUI_ONLY: apply is available only in interactive TUI mode");

    const scope = authorityScopeFor(ctx);
    let previewId;
    let reservedPreview;
    let maintenance;
    if (params.previewId) {
      if (params.mode || params.intervalValue !== undefined || params.intervalUnit) {
        throw new Error("MAINTENANCE_PREVIEW_AMBIGUOUS: apply with previewId must not include policy fields");
      }
      previewId = params.previewId;
      const reserved = reservePreview(ctx, previewId);
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
      if (authorityScopeFor(ctx) !== scope) {
        throw new Error("MAINTENANCE_PREVIEW_SCOPE_MISMATCH: workflow changed before policy application");
      }
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
      if (authorityScopeFor(ctx) !== scope) {
        throw new Error("MAINTENANCE_PREVIEW_SCOPE_MISMATCH: workflow changed during policy application");
      }
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
    observeInput,
    observeNewWorkflowIntentResponse,
    observeProposalResponse,
    proposalBatch,
    workflowCommand,
    resetCycle,
    restoreWorkflow,
    scanControl,
    serializeWorkflow,
    scaffoldProposal,
    settle,
    specialistRouteSemantics,
    startup,
  };
}
