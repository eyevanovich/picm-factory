import { randomUUID } from "node:crypto";
import { relative, resolve, sep } from "node:path";

const EXPLICIT_SCAN_COMMANDS = new Set(["picm-new", "picm-adopt", "picm-maintain", "picm-optimize"]);
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

function transitionError(event) {
  return new Error(`WORKFLOW_TRANSITION_INVALID: ${event} is not valid for the current workflow state`);
}

function directSubmoduleInclusion(text, workspace) {
  if (typeof text !== "string") return undefined;
  const match = /^Include submodule: ([^\r\n]+)$/.exec(text);
  if (!match || match[0] !== text) return undefined;
  const root = match[1];
  if (!/^(?:[A-Za-z0-9._-]*[A-Za-z0-9_-])(?:\/(?:[A-Za-z0-9._-]*[A-Za-z0-9_-]))*$/.test(root)) return undefined;
  const resolved = resolve(workspace, root);
  const projectRelativeRoot = relative(workspace, resolved).split(sep).join("/");
  return (
    projectRelativeRoot &&
    projectRelativeRoot !== "." &&
    !projectRelativeRoot.startsWith("../") &&
    projectRelativeRoot !== ".." &&
    root === projectRelativeRoot
  ) ? projectRelativeRoot : undefined;
}

export function createWorkflowLifecycle({ canonicalizeWorkspace = resolve } = {}) {
  const records = new Map();
  const idleScopes = new Map();

  function workspaceFor(scope) {
    return canonicalizeWorkspace(scope.workspace ?? scope.cwd);
  }

  function scopeFor(scope) {
    const workspace = workspaceFor(scope);
    const current = records.get(scope.sessionId);
    if (current?.scope.workspace === workspace) return current.scope;
    let byWorkspace = idleScopes.get(scope.sessionId);
    if (!byWorkspace) {
      byWorkspace = new Map();
      idleScopes.set(scope.sessionId, byWorkspace);
    }
    let idle = byWorkspace.get(workspace);
    if (!idle) {
      idle = { sessionId: scope.sessionId, workspace, cwd: scope.cwd ?? workspace, identity: undefined };
      byWorkspace.set(workspace, idle);
    }
    return idle;
  }

  function makeRecord(scope, command, { initialIntent } = {}) {
    const workspace = workspaceFor(scope);
    const identity = `picm-workflow:${randomUUID()}`;
    const record = {
      scope: { sessionId: scope.sessionId, workspace, cwd: scope.cwd ?? workspace, identity },
      identity,
      cwd: scope.cwd ?? workspace,
      command,
      phase: {
        preflightComplete: false,
        scanStarted: false,
        scanSettled: false,
        active: false,
      },
      privacy: {
        reviewed: false,
        followupPending: false,
        questionIsConcise: false,
        excludedPaths: [],
      },
      maintenance: { resetAttempted: false, repairStatus: "none", reportOnlyRequested: false, partialEffects: undefined, optimization: undefined, discoveryChoice: "none" },
      adoption: {
        baselineCaptured: false,
        wasAlreadyAdopted: true,
        initialMaintenanceOffered: false,
      },
      intent: {
        initial: command === "picm-new" && typeof initialIntent === "string" && initialIntent.trim()
          ? initialIntent.trim()
          : undefined,
        required: false,
        selected: undefined,
        pending: undefined,
        pendingSource: undefined,
      },
      terminal: { completed: false },
      submodule: {
        phaseIdentity: 0,
        pendingInclusion: undefined,
        requestedInclusion: undefined,
        admittedRoot: undefined,
      },
      specialist: {
        approvedWrites: new Map(),
        approvedEdits: new Set(),
      },
    };
    const alias = (get) => ({ enumerable: false, get });
    Object.defineProperties(record, {
      preflightComplete: alias(() => record.phase.preflightComplete),
      privacyReviewed: alias(() => record.privacy.reviewed),
      privacyFollowupPending: alias(() => record.privacy.followupPending),
      privacyQuestionIsConcise: alias(() => record.privacy.questionIsConcise),
      scanStarted: alias(() => record.phase.scanStarted),
      scanSettled: alias(() => record.phase.scanSettled),
      maintenanceResetAttempted: alias(() => record.maintenance.resetAttempted),
      maintenanceRepairStatus: alias(() => record.maintenance.repairStatus),
      maintenancePartialEffects: alias(() => record.maintenance.partialEffects),
      maintenanceOptimization: alias(() => record.maintenance.optimization),
      maintenanceDiscoveryChoice: alias(() => record.maintenance.discoveryChoice),
      adoptionBaselineCaptured: alias(() => record.adoption.baselineCaptured),
      adoptionWasAlreadyAdopted: alias(() => record.adoption.wasAlreadyAdopted),
      initialMaintenanceOffered: alias(() => record.adoption.initialMaintenanceOffered),
      initialIntent: alias(() => record.intent.initial),
      newWorkflowIntentRequired: alias(() => record.intent.required),
      newWorkflowIntent: alias(() => record.intent.selected),
      pendingNewWorkflowIntent: alias(() => record.intent.pending),
      pendingNewWorkflowIntentSource: alias(() => record.intent.pendingSource),
      completed: alias(() => record.terminal.completed),
      excludedPaths: alias(() => record.privacy.excludedPaths),
      approvedWrites: alias(() => record.specialist.approvedWrites),
      approvedEdits: alias(() => record.specialist.approvedEdits),
    });
    return record;
  }

  function isCurrent(record) {
    return Boolean(record) && records.get(record.scope.sessionId) === record &&
      record.scope.identity === record.identity;
  }

  function current(scope) {
    const record = records.get(scope.sessionId);
    return record?.scope.workspace === workspaceFor(scope) ? record : undefined;
  }

  function currentForSession(sessionId) {
    return records.get(sessionId);
  }

  function remove(scope) {
    const record = current(scope);
    if (record) records.delete(scope.sessionId);
    return record;
  }

  function removeForSession(sessionId) {
    const record = records.get(sessionId);
    if (record) records.delete(sessionId);
    return record;
  }

  function authorize(scope, command, options) {
    if (!EXPLICIT_SCAN_COMMANDS.has(command)) throw new Error("WORKFLOW_COMMAND_INVALID: unsupported PiCM workflow command");
    const record = makeRecord(scope, command, options);
    records.set(scope.sessionId, record);
    return record;
  }

  function transition(record, event, details = {}) {
    if (!isCurrent(record)) throw new Error("WORKFLOW_TRANSITION_STALE: workflow changed while its transition was pending");
    const { phase, privacy, maintenance, adoption, intent, terminal } = record;
    if (event === "preflight-complete") {
      if (terminal.completed) throw transitionError(event);
      phase.preflightComplete = true;
      phase.scanStarted = false;
      phase.scanSettled = false;
      phase.active = false;
      privacy.reviewed = false;
      privacy.followupPending = details.privacyFollowupPending === true;
      privacy.questionIsConcise = details.privacyQuestionIsConcise === true;
      if (details.excludedPaths) privacy.excludedPaths = [...details.excludedPaths];
      return record;
    }
    if (event === "privacy-reviewed") {
      if (!phase.preflightComplete || terminal.completed) throw transitionError(event);
      privacy.reviewed = true;
      privacy.followupPending = false;
      privacy.questionIsConcise = false;
      privacy.excludedPaths = [...(details.excludedPaths ?? privacy.excludedPaths)];
      phase.scanStarted = false;
      phase.scanSettled = false;
      phase.active = false;
      if (details.captureAdoptionBaseline && record.command === "picm-adopt" && !adoption.baselineCaptured) {
        adoption.wasAlreadyAdopted = details.wasAlreadyAdopted === true;
        adoption.baselineCaptured = true;
      }
      return record;
    }
    if (event === "begin-scan") {
      if (!phase.preflightComplete || !privacy.reviewed || terminal.completed || phase.active) throw transitionError(event);
      phase.scanStarted = true;
      phase.scanSettled = false;
      phase.active = true;
      privacy.excludedPaths = [...(details.excludedPaths ?? privacy.excludedPaths)];
      maintenance.reportOnlyRequested = false;
      record.submodule.phaseIdentity += 1;
      record.submodule.requestedInclusion = record.submodule.pendingInclusion;
      record.submodule.pendingInclusion = undefined;
      record.submodule.admittedRoot = undefined;
      return record;
    }
    if (event === "end-scan") {
      if (!phase.active || terminal.completed) throw transitionError(event);
      phase.active = false;
      phase.scanSettled = true;
      maintenance.reportOnlyRequested = false;
      record.submodule.requestedInclusion = undefined;
      record.submodule.admittedRoot = undefined;
      return record;
    }
    if (event === "observe-submodule-inclusion") {
      if (!phase.preflightComplete || !privacy.reviewed || terminal.completed) throw transitionError(event);
      const root = directSubmoduleInclusion(details.text, record.scope.workspace);
      if (!root) throw transitionError(event);
      if (phase.scanSettled && !phase.active) {
        record.submodule.pendingInclusion = root;
      } else {
        throw transitionError(event);
      }
      return record;
    }
    if (event === "admit-submodule") {
      if (!phase.active || terminal.completed ||
        details.projectRelativeRoot !== record.submodule.requestedInclusion ||
        typeof details.canonicalRoot !== "string") throw transitionError(event);
      record.submodule.admittedRoot = details.canonicalRoot;
      return record;
    }
    if (event === "deactivate-scan") {
      phase.active = false;
      return record;
    }
    if (event === "require-new-intent") {
      if (record.command !== "picm-new" || terminal.completed) throw transitionError(event);
      intent.required = true;
      return record;
    }
    if (event === "observe-new-intent") {
      if (record.command !== "picm-new" || !intent.required || terminal.completed) throw transitionError(event);
      const observedIntent = directNewWorkflowIntent(details.intent);
      if (!observedIntent) throw transitionError(event);
      intent.pending = observedIntent;
      intent.pendingSource = "direct-user-reply";
      return record;
    }
    if (event === "select-new-intent") {
      if (record.command !== "picm-new" || !intent.required || intent.selected || terminal.completed) throw transitionError(event);
      const selected = details.intent === "cancel" ? "cancelled" : details.intent;
      if (!NEW_WORKFLOW_INTENTS.has(selected)) throw transitionError(event);
      intent.required = false;
      intent.selected = selected;
      intent.pending = undefined;
      intent.pendingSource = undefined;
      if (selected === "adopt-existing") {
        record.command = "picm-adopt";
        adoption.baselineCaptured = true;
        adoption.wasAlreadyAdopted = details.wasAlreadyAdopted === true;
      }
      return record;
    }
    if (event === "complete-pending-cancel") {
      if (record.command !== "picm-new" || intent.pending !== "cancel" || terminal.completed) throw transitionError(event);
      intent.required = false;
      intent.selected = "cancelled";
      intent.pending = undefined;
      intent.pendingSource = undefined;
      return record;
    }
    if (event === "maintenance-optimization") {
      if (record.command !== "picm-maintain" || !privacy.reviewed || phase.scanStarted ||
        terminal.completed || !["include", "standard"].includes(details.choice)) throw transitionError(event);
      maintenance.optimization = details.choice;
      return record;
    }
    if (event === "maintenance-offer-discovery") {
      if (record.command !== "picm-maintain" || !phase.scanSettled || phase.active || terminal.completed ||
        maintenance.repairStatus !== "none") throw transitionError(event);
      maintenance.discoveryChoice = "unresolved";
      return record;
    }
    if (event === "maintenance-discovery-choice") {
      if (record.command !== "picm-maintain" || !phase.scanSettled || phase.active || terminal.completed ||
        maintenance.discoveryChoice !== "unresolved" || !["draft", "inspection"].includes(details.choice)) {
        throw transitionError(event);
      }
      maintenance.discoveryChoice = details.choice;
      if (details.choice === "draft") maintenance.repairStatus = "pending";
      return record;
    }
    if (event === "maintenance-selection-reply") {
      if (record.command !== "picm-maintain" || !phase.scanSettled || phase.active || terminal.completed) {
        throw transitionError(event);
      }
      maintenance.repairStatus = "pending";
      maintenance.discoveryChoice = "draft";
      maintenance.reportOnlyRequested = false;
      return record;
    }
    if (event === "maintenance-report-only-request") {
      if (record.command !== "picm-maintain" || terminal.completed) throw transitionError(event);
      maintenance.reportOnlyRequested = details.text === "Report only";
      return record;
    }
    if (event === "maintenance-repair-state") {
      if (
        record.command !== "picm-maintain" ||
        terminal.completed ||
        !["pending", "applied", "report-only"].includes(details.status) ||
        (details.status === "report-only" && (!phase.active || !maintenance.reportOnlyRequested))
      ) throw transitionError(event);
      maintenance.repairStatus = details.status;
      maintenance.discoveryChoice = details.status === "report-only" ? "inspection" : "draft";
      maintenance.reportOnlyRequested = false;
      return record;
    }
    if (event === "maintenance-partial-effects") {
      if (record.command !== "picm-maintain" || terminal.completed) throw transitionError(event);
      const prior = maintenance.partialEffects ?? { completed: 0, failed: 0, uncertain: 0, publishedDestinations: 0, createdParents: 0 };
      maintenance.partialEffects = Object.fromEntries(Object.keys(prior).map((key) => [key, prior[key] + (details[key] ?? 0)]));
      return record;
    }
    if (event === "maintenance-reset-committed") {
      if (record.command !== "picm-maintain" || terminal.completed) throw transitionError(event);
      maintenance.resetAttempted = true;
      return record;
    }
    if (event === "complete") {
      if (terminal.completed) return record;
      if (
        !phase.preflightComplete ||
        !privacy.reviewed ||
        !phase.scanStarted ||
        !phase.scanSettled ||
        phase.active ||
        (record.command === "picm-maintain" && (maintenance.repairStatus === "pending" || maintenance.discoveryChoice === "unresolved"))
      ) {
        throw transitionError(event);
      }
      terminal.completed = true;
      phase.active = false;
      return record;
    }
    if (event === "claim-initial-maintenance") {
      if (record.command !== "picm-adopt" || terminal.completed || adoption.initialMaintenanceOffered) throw transitionError(event);
      adoption.initialMaintenanceOffered = true;
      return record;
    }
    if (event === "continue-as-maintenance") {
      if (
        record.command !== "picm-adopt" || terminal.completed || !privacy.reviewed || !phase.scanStarted ||
        !phase.scanSettled || phase.active || !adoption.initialMaintenanceOffered
      ) throw transitionError(event);
      record.command = "picm-maintain";
      phase.scanStarted = false;
      phase.scanSettled = false;
      maintenance.resetAttempted = false;
      maintenance.repairStatus = "none";
      maintenance.reportOnlyRequested = false;
      maintenance.partialEffects = undefined;
      maintenance.optimization = undefined;
      maintenance.discoveryChoice = "none";
      return record;
    }
    throw transitionError(event);
  }

  function restore(scope, state) {
    if (
      (state?.status !== "authorized" && state?.status !== "completed") ||
      typeof state.cwd !== "string" ||
      !EXPLICIT_SCAN_COMMANDS.has(state.command) ||
      canonicalizeWorkspace(state.cwd) !== workspaceFor(scope)
    ) return undefined;

    const record = makeRecord(scope, state.command, { initialIntent: state.initialIntent });
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
    record.phase.preflightComplete = preflightComplete;
    record.privacy.reviewed = privacyReviewed;
    record.privacy.followupPending = privacyFollowupPending;
    record.privacy.questionIsConcise = preflightComplete && !privacyReviewed && state.privacyQuestionIsConcise === true;
    record.phase.scanStarted = privacyReviewed && state.scanStarted === true;
    record.phase.scanSettled = record.phase.scanStarted && state.scanSettled === true;
    record.phase.active = false;
    record.submodule.pendingInclusion = undefined;
    record.submodule.requestedInclusion = undefined;
    record.submodule.admittedRoot = undefined;
    record.maintenance.resetAttempted = privacyReviewed && state.maintenanceResetAttempted === true;
    record.maintenance.optimization = privacyReviewed && ["include", "standard"].includes(state.maintenanceOptimization)
      ? state.maintenanceOptimization : undefined;
    record.maintenance.discoveryChoice = privacyReviewed && ["none", "unresolved", "draft", "inspection"].includes(state.maintenanceDiscoveryChoice)
      ? state.maintenanceDiscoveryChoice : "none";
    record.maintenance.repairStatus = privacyReviewed &&
      ["pending", "applied", "report-only"].includes(state.maintenanceRepairStatus)
      ? state.maintenanceRepairStatus
      : "none";
    if (privacyReviewed && state.maintenancePartialEffects &&
      ["completed", "failed", "uncertain", "publishedDestinations", "createdParents"].every((key) =>
        Number.isSafeInteger(state.maintenancePartialEffects[key]) && state.maintenancePartialEffects[key] >= 0
      )) {
      record.maintenance.partialEffects = Object.fromEntries(
        ["completed", "failed", "uncertain", "publishedDestinations", "createdParents"].map((key) =>
          [key, state.maintenancePartialEffects[key]]
        ),
      );
    }
    const restoredExcludedPaths = Array.isArray(state.normalizedExcludedPaths)
      ? state.normalizedExcludedPaths
      : Array.isArray(state.excludedPaths) ? state.excludedPaths : [];
    record.privacy.excludedPaths = [...restoredExcludedPaths];
    record.adoption.baselineCaptured =
      state.command === "picm-adopt" &&
      (state.adoptionBaselineCaptured === true ||
        (state.adoptionBaselineCaptured === undefined && typeof state.adoptionWasAlreadyAdopted === "boolean"));
    record.adoption.wasAlreadyAdopted = state.command === "picm-adopt" ? state.adoptionWasAlreadyAdopted !== false : true;
    record.adoption.initialMaintenanceOffered = state.command === "picm-adopt" && state.initialMaintenanceOffered === true;
    record.intent.required = state.command === "picm-new" && state.newWorkflowIntentRequired === true;
    record.intent.selected = typeof state.newWorkflowIntent === "string" && NEW_WORKFLOW_INTENTS.has(state.newWorkflowIntent)
      ? state.newWorkflowIntent
      : undefined;
    const pendingIsDirect =
      record.intent.required && state.pendingNewWorkflowIntentSource === "direct-user-reply" &&
      directNewWorkflowIntent(state.pendingNewWorkflowIntent) === state.pendingNewWorkflowIntent;
    record.intent.pending = pendingIsDirect ? state.pendingNewWorkflowIntent : undefined;
    record.intent.pendingSource = pendingIsDirect ? "direct-user-reply" : undefined;
    record.terminal.completed = state.status === "completed";
    records.set(scope.sessionId, record);
    return record;
  }

  function observeSubmoduleInclusion(record, text) {
    try {
      transition(record, "observe-submodule-inclusion", { text });
      return true;
    } catch (error) {
      if (String(error?.message).startsWith("WORKFLOW_TRANSITION_INVALID")) return false;
      throw error;
    }
  }

  function submoduleInventoryAdmission(record, projectRelativeRoot) {
    if (
      !isCurrent(record) ||
      !record.phase.active ||
      record.submodule.requestedInclusion !== projectRelativeRoot
    ) return undefined;
    return {
      workflowIdentity: record.identity,
      phaseIdentity: record.submodule.phaseIdentity,
      projectRelativeRoot,
    };
  }

  function submoduleAccessAdmission(record) {
    if (!isCurrent(record) || !record.phase.active || !record.submodule.admittedRoot) return undefined;
    return {
      workflowIdentity: record.identity,
      phaseIdentity: record.submodule.phaseIdentity,
      canonicalRoot: record.submodule.admittedRoot,
    };
  }

  function activePhaseIdentity(record) {
    return isCurrent(record) && record.phase.active ? record.submodule.phaseIdentity : undefined;
  }

  function hasActivePhaseIdentity(record, phaseIdentity) {
    return activePhaseIdentity(record) === phaseIdentity;
  }

  function admitSubmodule(record, admission, canonicalRoot) {
    if (!hasActivePhaseIdentity(record, admission?.phaseIdentity)) {
      throw new Error("WORKFLOW_TRANSITION_STALE: workflow phase changed while nested inventory was running");
    }
    transition(record, "admit-submodule", {
      projectRelativeRoot: admission.projectRelativeRoot,
      canonicalRoot,
    });
  }

  function serialize(record) {
    if (!record) return undefined;
    return {
      cwd: record.cwd,
      command: record.command,
      preflightComplete: record.phase.preflightComplete,
      privacyReviewed: record.privacy.reviewed,
      privacyFollowupPending: record.privacy.followupPending,
      privacyQuestionIsConcise: record.privacy.questionIsConcise,
      scanStarted: record.phase.scanStarted,
      scanSettled: record.phase.scanSettled,
      maintenanceResetAttempted: record.maintenance.resetAttempted,
      maintenanceRepairStatus: record.maintenance.repairStatus,
      maintenancePartialEffects: record.maintenance.partialEffects && { ...record.maintenance.partialEffects },
      maintenanceOptimization: record.maintenance.optimization,
      maintenanceDiscoveryChoice: record.maintenance.discoveryChoice,
      adoptionBaselineCaptured: record.adoption.baselineCaptured,
      adoptionWasAlreadyAdopted: record.adoption.wasAlreadyAdopted,
      initialMaintenanceOffered: record.adoption.initialMaintenanceOffered,
      initialIntent: record.intent.initial,
      newWorkflowIntentRequired: record.intent.required,
      newWorkflowIntent: record.intent.selected,
      pendingNewWorkflowIntent: record.intent.pending,
      pendingNewWorkflowIntentSource: record.intent.pendingSource,
      completed: record.terminal.completed,
      excludedPaths: [...record.privacy.excludedPaths],
    };
  }

  return {
    authorize,
    current,
    currentForSession,
    isCurrent,
    observeSubmoduleInclusion,
    submoduleInventoryAdmission,
    submoduleAccessAdmission,
    admitSubmodule,
    activePhaseIdentity,
    hasActivePhaseIdentity,
    remove,
    removeForSession,
    restore,
    scopeFor,
    serialize,
    transition,
  };
}
