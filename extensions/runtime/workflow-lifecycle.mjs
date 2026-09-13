import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

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
      maintenance: { resetAttempted: false },
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
      specialist: {
        approvedWrites: new Map(),
        configWritten: false,
        config: undefined,
        configEdited: false,
        routeSemantics: undefined,
        scaffoldApproved: false,
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
      specialistConfigWritten: alias(() => record.specialist.configWritten),
      specialistConfig: alias(() => record.specialist.config),
      specialistConfigEdited: alias(() => record.specialist.configEdited),
      specialistRouteSemantics: alias(() => record.specialist.routeSemantics),
      specialistScaffoldApproved: alias(() => record.specialist.scaffoldApproved),
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
      return record;
    }
    if (event === "end-scan") {
      if (!phase.active || terminal.completed) throw transitionError(event);
      phase.active = false;
      phase.scanSettled = true;
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
    if (event === "maintenance-reset-committed") {
      if (record.command !== "picm-maintain" || terminal.completed) throw transitionError(event);
      maintenance.resetAttempted = true;
      return record;
    }
    if (event === "complete") {
      if (terminal.completed) return record;
      if (!phase.preflightComplete || !privacy.reviewed || !phase.scanStarted || !phase.scanSettled || phase.active) {
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
    record.maintenance.resetAttempted = privacyReviewed && state.maintenanceResetAttempted === true;
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
    remove,
    removeForSession,
    restore,
    scopeFor,
    serialize,
    transition,
  };
}
