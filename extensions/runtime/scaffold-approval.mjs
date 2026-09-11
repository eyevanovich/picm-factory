import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

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
        consumed: false,
      })),
      acknowledgement: undefined,
      approved: false,
      approvalIdentity: undefined,
      existingContentAtRisk: false,
      invalidated,
    };
  }

  function register(sessionId, operations, { existingContentAtRisk = false } = {}) {
    const previewId = `picm-scaffold-preview:${randomUUID()}`;
    const current = proposal(operations);
    current.existingContentAtRisk = existingContentAtRisk;
    proposals.set(sessionId, current);
    return previewId;
  }

  function observeInput(sessionId, text) {
    const current = proposals.get(sessionId);
    if (!current) return false;
    const authorityBefore = {
      acknowledgementIdentity: current.acknowledgement?.identity,
      approvalIdentity: current.approvalIdentity,
      approved: current.approved,
      invalidated: current.invalidated,
    };
    const authorityChanged = () => !isDeepStrictEqual(authorityBefore, {
      acknowledgementIdentity: current.acknowledgement?.identity,
      approvalIdentity: current.approvalIdentity,
      approved: current.approved,
      invalidated: current.invalidated,
    });
    const reply = text.trim().toLowerCase();
    if (DIRECT_APPROVALS.has(reply)) {
      current.approved = !current.invalidated;
      current.approvalIdentity = current.approved
        ? `picm-scaffold-approval:${randomUUID()}`
        : undefined;
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
      /^(?:show (?:the )?diff for|inspect (?:the )?file) [\w./-]+$/.test(reply);
    if (!VAGUE_REPLIES.has(reply) && !navigation) invalidate(current);
    return authorityChanged();
  }

  function admission(sessionId, event, { existingContentAtRisk = false } = {}) {
    const current = proposals.get(sessionId);
    if (!current) return { active: false };
    const operation = current.operations.find((candidate) =>
      !candidate.consumed && !candidate.reservedBy && candidate.tool === event.toolName &&
      isDeepStrictEqual(candidate.input, event.input)
    );
    const riskEscalated = Boolean(operation && existingContentAtRisk && !current.existingContentAtRisk);
    if (riskEscalated) current.existingContentAtRisk = true;
    const directApproved = current.approved && !current.invalidated;
    const acknowledged = !current.existingContentAtRisk || hasAcknowledgement(current);
    return {
      active: true,
      proposalIdentity: current.identity,
      proposalDigest: current.digest,
      riskEscalated,
      directApproved,
      approvalIdentity: current.approvalIdentity,
      acknowledgementIdentity: current.acknowledgement?.identity,
      acknowledged,
      operationIdentity: operation?.identity,
      allowed: directApproved && acknowledged && Boolean(operation),
    };
  }

  function complete(sessionId, toolCallId, succeeded) {
    const current = proposals.get(sessionId);
    const operation = current?.operations.find((candidate) => candidate.reservedBy === toolCallId);
    if (!operation) return;
    operation.reservedBy = undefined;
    if (succeeded) operation.consumed = true;
  }

  function settle(sessionId, workflowCompleted) {
    const current = proposals.get(sessionId);
    if (!current) return;
    if (workflowCompleted || current.operations.every((operation) => operation.consumed)) proposals.delete(sessionId);
    else clearApproval(current);
  }

  return {
    admission,
    clear: (sessionId) => proposals.delete(sessionId),
    clearAcknowledgement: (sessionId) => {
      const current = proposals.get(sessionId);
      if (current) clearAcknowledgement(current);
    },
    complete,
    has: (sessionId) => proposals.has(sessionId),
    replaceWithInvalidatedSentinel: (sessionId) => {
      proposals.set(sessionId, proposal([], { invalidated: true }));
    },
    invalidate: (sessionId) => {
      const current = proposals.get(sessionId);
      if (current) invalidate(current);
    },
    observeInput,
    register,
    reserve: (sessionId, admission, toolCallId) => {
      const current = proposals.get(sessionId);
      if (
        typeof toolCallId !== "string" ||
        !admission?.directApproved ||
        typeof admission.approvalIdentity !== "string" ||
        current?.identity !== admission.proposalIdentity ||
        current.digest !== admission.proposalDigest ||
        current.approvalIdentity !== admission.approvalIdentity ||
        current.invalidated ||
        (current.existingContentAtRisk && (
          !admission.acknowledged ||
          current.acknowledgement?.identity !== admission.acknowledgementIdentity ||
          !hasAcknowledgement(current)
        ))
      ) return false;
      const operation = current.operations.find((candidate) =>
        candidate.identity === admission.operationIdentity &&
        !candidate.consumed && !candidate.reservedBy,
      );
      if (!operation) return false;
      operation.reservedBy = toolCallId;
      return true;
    },
    settle,
  };
}
