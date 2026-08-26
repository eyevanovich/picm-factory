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

  function register(sessionId, operations) {
    const previewId = `picm-scaffold-preview:${randomUUID()}`;
    proposals.set(sessionId, {
      operations: operations.map((operation) => ({
        tool: operation.tool,
        input: structuredClone(operation.input),
        consumed: false,
      })),
      approved: false,
      invalidated: false,
    });
    return previewId;
  }

  function observeInput(sessionId, text) {
    const proposal = proposals.get(sessionId);
    if (!proposal) return;
    const reply = text.trim().toLowerCase();
    if (DIRECT_APPROVALS.has(reply)) {
      proposal.approved = !proposal.invalidated;
      return;
    }
    proposal.approved = false;
    const navigation = NAVIGATION_REPLIES.has(reply) ||
      /^(?:show (?:the )?diff for|inspect (?:the )?file) [\w./-]+$/.test(reply);
    if (REVISION_REQUEST.test(reply) || (!VAGUE_REPLIES.has(reply) && !navigation)) proposal.invalidated = true;
  }

  function admission(sessionId, event) {
    const proposal = proposals.get(sessionId);
    if (!proposal) return { active: false };
    const operation = proposal.operations.find((candidate) =>
      !candidate.consumed && !candidate.reservedBy && candidate.tool === event.toolName &&
      isDeepStrictEqual(candidate.input, event.input)
    );
    return { active: true, allowed: proposal.approved && Boolean(operation), operation };
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
    else proposal.approved = false;
  }

  return {
    admission,
    clear: (sessionId) => proposals.delete(sessionId),
    complete,
    observeInput,
    register,
    reserve: (operation, toolCallId) => { operation.reservedBy = toolCallId; },
    settle,
  };
}
