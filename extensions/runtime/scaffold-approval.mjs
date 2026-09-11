import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const DIRECT_APPROVALS = new Set([
  "approve this exact scaffold",
  "accept the current proposal and write it",
  "write exactly this proposal",
  "i approve the current exact proposal; write it now",
]);
const VAGUE_REPLIES = new Set(["preview only", "continue", "looks good", "yes", "go ahead", "."]);
const NAVIGATION_REPLIES = new Set(["view all", "review files", "show the diff", "show diff", "inspect the diff"]);
const REVISION_REQUEST = /\b(?:add|change|delete|edit|modify|remove|rename|replace|revise|update)\b/;

export function createScaffoldApprovalRuntime() {
  const proposals = new Map();

  function proposal(operations, { invalidated = false } = {}) {
    return {
      identity: `picm-scaffold-proposal:${randomUUID()}`,
      operations: operations.map((operation) => ({
        identity: `picm-scaffold-operation:${randomUUID()}`,
        tool: operation.tool,
        input: structuredClone(operation.input),
        consumed: false,
      })),
      approved: false,
      approvalIdentity: undefined,
      invalidated,
    };
  }

  function register(sessionId, operations) {
    const previewId = `picm-scaffold-preview:${randomUUID()}`;
    proposals.set(sessionId, proposal(operations));
    return previewId;
  }

  function observeInput(sessionId, text) {
    const proposal = proposals.get(sessionId);
    if (!proposal) return;
    const reply = text.trim().toLowerCase();
    if (DIRECT_APPROVALS.has(reply)) {
      proposal.approved = !proposal.invalidated;
      proposal.approvalIdentity = proposal.approved
        ? `picm-scaffold-approval:${randomUUID()}`
        : undefined;
      return;
    }
    proposal.approved = false;
    proposal.approvalIdentity = undefined;
    const navigation = NAVIGATION_REPLIES.has(reply) ||
      /^(?:show (?:the )?diff for|inspect (?:the )?file) [\w./-]+$/.test(reply);
    if (REVISION_REQUEST.test(reply) || (!VAGUE_REPLIES.has(reply) && !navigation)) proposal.invalidated = true;
  }

  function admission(sessionId, event) {
    const current = proposals.get(sessionId);
    if (!current) return { active: false };
    const operation = current.operations.find((candidate) =>
      !candidate.consumed && !candidate.reservedBy && candidate.tool === event.toolName &&
      isDeepStrictEqual(candidate.input, event.input)
    );
    const directApproved = current.approved && !current.invalidated;
    return {
      active: true,
      proposalIdentity: current.identity,
      directApproved,
      approvalIdentity: current.approvalIdentity,
      operationIdentity: operation?.identity,
      allowed: directApproved && Boolean(operation),
    };
  }

  function complete(sessionId, toolCallId, succeeded) {
    const proposal = proposals.get(sessionId);
    const operation = proposal?.operations.find((candidate) => candidate.reservedBy === toolCallId);
    if (!operation) return;
    operation.reservedBy = undefined;
    if (succeeded) operation.consumed = true;
  }

  function settle(sessionId, workflowCompleted) {
    const proposal = proposals.get(sessionId);
    if (!proposal) return;
    if (workflowCompleted || proposal.operations.every((operation) => operation.consumed)) proposals.delete(sessionId);
    else {
      proposal.approved = false;
      proposal.approvalIdentity = undefined;
    }
  }

  return {
    admission,
    clear: (sessionId) => proposals.delete(sessionId),
    complete,
    has: (sessionId) => proposals.has(sessionId),
    replaceWithInvalidatedSentinel: (sessionId) => {
      proposals.set(sessionId, proposal([], { invalidated: true }));
    },
    invalidate: (sessionId) => {
      const proposal = proposals.get(sessionId);
      if (!proposal) return;
      proposal.approved = false;
      proposal.approvalIdentity = undefined;
      proposal.invalidated = true;
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
        current.approvalIdentity !== admission.approvalIdentity ||
        !current.approved ||
        current.invalidated
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
