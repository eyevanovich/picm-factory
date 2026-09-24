import { randomUUID } from "node:crypto";

export const COMPLETED = "completed";
export const UNATTEMPTED = "unattempted";

export function hasEligibleContinuationResults(results) {
  return Array.isArray(results) && results.length > 0 &&
    results.some((result) => result?.status === COMPLETED) &&
    results.some((result) => result?.status === UNATTEMPTED) &&
    results.every((result) => result?.status === COMPLETED || result?.status === UNATTEMPTED);
}

export function unattemptedOperationIndexes(results) {
  return results.reduce((indexes, result, index) => {
    if (result?.status === UNATTEMPTED) indexes.push(index);
    return indexes;
  }, []);
}

export function retainEligibleContinuation(record, results, {
  proposalIdentity,
  proposalDigest,
  scopeIdentity,
} = {}) {
  if (
    record.continuation ||
    !hasEligibleContinuationResults(results) ||
    typeof proposalIdentity !== "string" ||
    typeof proposalDigest !== "string"
  ) return false;
  record.continuation = {
    identity: `picm-continuation:${randomUUID()}`,
    proposalIdentity,
    proposalDigest,
    scopeIdentity,
    state: "eligible",
  };
  return true;
}

export function activateContinuation(record, results, {
  proposalIdentity,
  proposalDigest,
  scopeIdentity,
} = {}) {
  const continuation = record.continuation;
  if (
    continuation?.state !== "eligible" ||
    continuation.proposalIdentity !== proposalIdentity ||
    continuation.proposalDigest !== proposalDigest ||
    continuation.scopeIdentity !== scopeIdentity ||
    !hasEligibleContinuationResults(results)
  ) return undefined;
  continuation.state = "active";
  return continuation.identity;
}

export function hasActiveContinuation(record, {
  proposalIdentity,
  proposalDigest,
  scopeIdentity,
} = {}) {
  const continuation = record.continuation;
  return continuation?.state === "active" &&
    continuation.proposalIdentity === proposalIdentity &&
    continuation.proposalDigest === proposalDigest &&
    continuation.scopeIdentity === scopeIdentity;
}

export function clearContinuation(record) {
  record.continuation = undefined;
}
