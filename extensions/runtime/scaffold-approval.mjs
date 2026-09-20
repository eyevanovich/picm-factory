import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  COMPLETED,
  UNATTEMPTED,
  activateContinuation,
  clearContinuation,
  hasActiveContinuation,
  retainEligibleContinuation,
} from "./approval-runtime.mjs";

const DIRECT_APPROVALS = new Set([
  "approve this exact scaffold",
  "accept the current proposal and write it",
  "write exactly this proposal",
  "i approve the current exact proposal; write it now",
]);
const RISK_OPT_OUT = "i understand the risk and want to proceed without a git checkpoint.";
const CHECKPOINT_REPORTS = [
  /^(?:(?:i|we) )?(?:created|made|have created|have made) (?:a |the )?git (?:checkpoint|commit)(?: (?:covering|for)\b.*)?[.!]?$/,
  /^(?:a |the )?git (?:checkpoint|commit) (?:was )?(?:created|made)[.!]?$/,
  /^(?:(?:i|we) )?(?:have )?committed\b.*\b(?:in|to) git[.!]?$/,
  /^(?:a |the )?(?:(?:git|fixture) )?checkpoint(?: commit)? covers the current contents of all affected existing files(?: (?:in|for) (?:this|the) (?:replacement |current )?proposal)?[.!]?(?: continue[.!]?)?$/,
];
const CHECKPOINT_REPORT_LANGUAGE = /\b(?:checkpoint|commit(?:ted)?)\b/;
const COMPLETED_CHECKPOINT_ACTION = /\b(?:created|made|committed|saved|recorded|finished|completed|done)\b/;
const GIT_SNAPSHOT_REPORT = /\b(?:saved|recorded|backed up)\b.*\b(?:files?|changes?|work)\b.*\bgit\b/;
const VAGUE_REPLIES = new Set(["preview only", "continue", "looks good", "yes", "go ahead", "."]);
const NAVIGATION_REPLIES = new Set(["view all", "review files", "show the diff", "show diff", "inspect the diff"]);
const CANCELLATION_REQUEST = /\b(?:cancel|stop|decline|withdraw|never mind|do not apply|don't apply)\b/;
const REVISION_REQUEST = /\b(?:add|adjust|change|delete|edit|modify|remove|rename|replace|revise|rewrite|update|instead)\b/;

function digest(operations) {
  return createHash("sha256").update(JSON.stringify(operations)).digest("hex");
}

export function isUnverifiedCheckpointAcknowledgement(text) {
  const reply = typeof text === "string" ? text.trim().toLowerCase() : "";
  return reply === RISK_OPT_OUT || CHECKPOINT_REPORTS.some((report) => report.test(reply));
}

function isPlausibleCheckpointReport(reply) {
  return (
    CHECKPOINT_REPORT_LANGUAGE.test(reply) && COMPLETED_CHECKPOINT_ACTION.test(reply)
  ) || GIT_SNAPSHOT_REPORT.test(reply);
}

export function createScaffoldApprovalRuntime() {
  const proposals = new Map();

  function scopeIdentity(scope) {
    return scope?.identity;
  }

  function continuationOptions(scope, current) {
    return {
      proposalIdentity: current.identity,
      proposalDigest: current.digest,
      scopeIdentity: scopeIdentity(scope),
    };
  }

  function clearApproval(current) {
    current.approved = false;
    current.approvalIdentity = undefined;
  }

  function clearAcknowledgement(current) {
    current.acknowledgement = undefined;
  }

  function invalidate(current) {
    clearApproval(current);
    clearAcknowledgement(current);
    clearContinuation(current);
    current.invalidated = true;
  }

  function hasAcknowledgement(current) {
    return current.acknowledgement?.proposalIdentity === current.identity &&
      current.acknowledgement.digest === current.digest;
  }

  function proposal(operations, { invalidated = false } = {}) {
    const proposalOperations = operations.map((operation) => ({
      tool: operation.tool,
      input: structuredClone(operation.input),
    }));
    return {
      identity: `picm-scaffold-proposal:${randomUUID()}`,
      digest: digest(proposalOperations),
      operations: proposalOperations.map((operation) => ({
        identity: `picm-scaffold-operation:${randomUUID()}`,
        ...operation,
        status: UNATTEMPTED,
      })),
      acknowledgement: undefined,
      approved: false,
      approvalIdentity: undefined,
      continuation: undefined,
      existingContentAtRisk: false,
      invalidated,
    };
  }

  function currentResults(current) {
    return current.operations.map((operation) => ({ status: operation.status }));
  }

  function register(scope, operations, { existingContentAtRisk = false } = {}) {
    const previewId = `picm-scaffold-preview:${randomUUID()}`;
    const current = proposal(operations);
    current.existingContentAtRisk = existingContentAtRisk;
    proposals.set(scope, current);
    return previewId;
  }

  function observeInput(scope, text) {
    const current = proposals.get(scope);
    if (!current) return false;
    const authorityBefore = {
      acknowledgementIdentity: current.acknowledgement?.identity,
      approvalIdentity: current.approvalIdentity,
      approved: current.approved,
      continuationIdentity: current.continuation?.identity,
      continuationState: current.continuation?.state,
      invalidated: current.invalidated,
    };
    const authorityChanged = () => !isDeepStrictEqual(authorityBefore, {
      acknowledgementIdentity: current.acknowledgement?.identity,
      approvalIdentity: current.approvalIdentity,
      approved: current.approved,
      continuationIdentity: current.continuation?.identity,
      continuationState: current.continuation?.state,
      invalidated: current.invalidated,
    });
    const reply = text.trim().toLowerCase();
    if (reply === "continue") {
      clearApproval(current);
      const continuation = activateContinuation(
        current,
        currentResults(current),
        continuationOptions(scope, current),
      );
      if (!continuation && current.continuation?.state === "active") invalidate(current);
      return authorityChanged();
    }
    if (DIRECT_APPROVALS.has(reply)) {
      if (!current.invalidated && current.continuation?.state === undefined) {
        current.approved = true;
        current.approvalIdentity = `picm-scaffold-approval:${randomUUID()}`;
      }
      return authorityChanged();
    }
    clearApproval(current);
    if (CANCELLATION_REQUEST.test(reply) || REVISION_REQUEST.test(reply)) {
      invalidate(current);
      return authorityChanged();
    }
    if (isUnverifiedCheckpointAcknowledgement(reply)) {
      if (!current.invalidated) {
        current.acknowledgement = {
          identity: `picm-scaffold-checkpoint-acknowledgement:${randomUUID()}`,
          proposalIdentity: current.identity,
          digest: current.digest,
        };
      }
      return authorityChanged();
    }
    if (isPlausibleCheckpointReport(reply)) return authorityChanged();
    const navigation = NAVIGATION_REPLIES.has(reply) ||
      /^preview only[.!]\s+show\b[^?!]*[.!]?$/.test(reply) ||
      /^(?:show (?:the )?diff for|inspect (?:the )?file) [\w./-]+$/.test(reply);
    if (!VAGUE_REPLIES.has(reply) && !navigation) invalidate(current);
    return authorityChanged();
  }

  function admission(scope, event, { existingContentAtRisk = false } = {}) {
    const current = proposals.get(scope);
    if (!current) return { active: false };
    const operation = current.operations.find((candidate) =>
      candidate.status === UNATTEMPTED && candidate.tool === event.toolName &&
      isDeepStrictEqual(candidate.input, event.input)
    );
    const riskEscalated = Boolean(operation && existingContentAtRisk && !current.existingContentAtRisk);
    if (riskEscalated) current.existingContentAtRisk = true;
    const directApproved = current.approved && !current.invalidated;
    const continuing = !current.invalidated && hasActiveContinuation(
      current,
      continuationOptions(scope, current),
    );
    const acknowledged = !current.existingContentAtRisk || hasAcknowledgement(current);
    return {
      active: true,
      proposalIdentity: current.identity,
      proposalDigest: current.digest,
      riskEscalated,
      directApproved,
      continuationIdentity: continuing ? current.continuation.identity : undefined,
      approvalIdentity: current.approvalIdentity,
      acknowledgementIdentity: current.acknowledgement?.identity,
      acknowledged,
      operationIdentity: operation?.identity,
      allowed: (directApproved || continuing) && acknowledged && Boolean(operation),
    };
  }

  function complete(scope, toolCallId, succeeded) {
    const current = proposals.get(scope);
    const operation = current?.operations.find((candidate) => candidate.reservedBy === toolCallId);
    if (!operation) return false;
    operation.reservedBy = undefined;
    if (succeeded) {
      operation.status = COMPLETED;
      return true;
    }
    operation.status = "failed";
    invalidate(current);
    return false;
  }

  function release(scope, toolCallId) {
    const current = proposals.get(scope);
    const operation = current?.operations.find((candidate) => candidate.reservedBy === toolCallId);
    if (!operation) return;
    operation.reservedBy = undefined;
    operation.status = UNATTEMPTED;
  }

  function isFullyCompleted(scope) {
    const current = proposals.get(scope);
    return Boolean(
      current &&
      !current.invalidated &&
      current.operations.length > 0 &&
      current.operations.every((operation) => operation.status === COMPLETED),
    );
  }

  function settle(scope, workflowCompleted) {
    const current = proposals.get(scope);
    if (!current) return;
    if (workflowCompleted || (!current.invalidated && current.operations.every((operation) => operation.status === COMPLETED))) {
      proposals.delete(scope);
      return;
    }
    clearApproval(current);
    if (current.invalidated) return;
    if (current.continuation?.state === "active") {
      invalidate(current);
      return;
    }
    if (!current.invalidated) {
      retainEligibleContinuation(current, currentResults(current), continuationOptions(scope, current));
    }
  }

  return {
    admission,
    clear: (scope) => proposals.delete(scope),
    clearAcknowledgement: (scope) => {
      const current = proposals.get(scope);
      if (current) clearAcknowledgement(current);
    },
    complete,
    has: (scope) => proposals.has(scope),
    isFullyCompleted,
    replaceWithInvalidatedSentinel: (scope) => {
      proposals.set(scope, proposal([], { invalidated: true }));
    },
    invalidate: (scope) => {
      const current = proposals.get(scope);
      if (current) invalidate(current);
    },
    observeInput,
    register,
    release,
    reserve: (scope, admission, toolCallId) => {
      const current = proposals.get(scope);
      const continuing = hasActiveContinuation(current ?? {}, continuationOptions(scope, current ?? {}));
      const matchingContinuation = continuing &&
        admission?.continuationIdentity === current.continuation.identity;
      const matchingApproval = admission?.directApproved &&
        typeof admission.approvalIdentity === "string" &&
        current?.approvalIdentity === admission.approvalIdentity;
      if (
        typeof toolCallId !== "string" ||
        (!matchingApproval && !matchingContinuation) ||
        current?.identity !== admission.proposalIdentity ||
        current.digest !== admission.proposalDigest ||
        current.invalidated ||
        (current.existingContentAtRisk && (
          !admission.acknowledged ||
          current.acknowledgement?.identity !== admission.acknowledgementIdentity ||
          !hasAcknowledgement(current)
        ))
      ) return false;
      const operation = current.operations.find((candidate) =>
        candidate.identity === admission.operationIdentity && candidate.status === UNATTEMPTED,
      );
      if (!operation) return false;
      operation.reservedBy = toolCallId;
      operation.status = "reserved";
      return true;
    },
    settle,
  };
}
