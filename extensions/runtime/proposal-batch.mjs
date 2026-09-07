import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, normalize, sep } from "node:path";

const OPERATION_TYPES = new Set(["create", "modify", "delete", "move"]);

function proposalError(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

function requireText(value, field, operation) {
  if (typeof value !== "string") {
    throw proposalError("PICM_PROPOSAL_INVALID", `${operation} requires ${field}`);
  }
  return value;
}

function requireRelativePath(value, field, operation) {
  const path = requireText(value, field, operation);
  if (
    path.trim() === "" ||
    path.includes("\0") ||
    isAbsolute(path) ||
    normalize(path) !== path ||
    path === "." ||
    path === ".." ||
    path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw proposalError("PICM_PROPOSAL_INVALID", `${operation} has an invalid project-relative ${field}`);
  }
  return path;
}

function validateOperation(operation, index) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw proposalError("PICM_PROPOSAL_INVALID", `operation ${index + 1} must be an object`);
  }
  const type = requireText(operation.type, "type", `operation ${index + 1}`);
  if (!OPERATION_TYPES.has(type)) {
    throw proposalError("PICM_PROPOSAL_INVALID", `operation ${index + 1} has an unsupported type`);
  }

  const path = requireRelativePath(operation.path, "path", type);
  if (type === "create") {
    return { type, path, content: requireText(operation.content, "content", type) };
  }
  if (type === "modify") {
    return {
      type,
      path,
      expectedContent: requireText(operation.expectedContent, "expectedContent", type),
      content: requireText(operation.content, "content", type),
    };
  }
  if (type === "delete") {
    return { type, path, expectedContent: requireText(operation.expectedContent, "expectedContent", type) };
  }

  const from = requireRelativePath(operation.from, "from", type);
  if (from === path) throw proposalError("PICM_PROPOSAL_INVALID", "move source and destination must differ");
  return {
    type,
    path,
    from,
    expectedContent: requireText(operation.expectedContent, "expectedContent", type),
    content: requireText(operation.content, "content", type),
  };
}

function validateOperations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw proposalError("PICM_PROPOSAL_INVALID", "operations must be a non-empty array");
  }
  const normalized = operations.map(validateOperation);
  const touched = [];
  for (const operation of normalized) {
    const paths = operation.type === "move" ? [operation.from, operation.path] : [operation.path];
    for (const path of paths) {
      for (const existing of touched) {
        if (path === existing) {
          throw proposalError("PICM_PROPOSAL_INVALID", `multiple operations affect ${path}`);
        }
        if (path.startsWith(`${existing}${sep}`) || existing.startsWith(`${path}${sep}`)) {
          throw proposalError(
            "PICM_PROPOSAL_INVALID",
            `operations affect conflicting ancestor paths ${existing} and ${path}`,
          );
        }
      }
      touched.push(path);
    }
  }
  return normalized;
}

function digest(operations) {
  return createHash("sha256").update(JSON.stringify(operations)).digest("hex");
}

function auditOperations(operations) {
  return operations.map(({ type, path, from }) => ({ type, path, ...(from ? { from } : {}) }));
}

export function proposalSummary(batch) {
  const operations = batch.operations.map(({ type, path, from, expectedContent, content }) => ({
    type,
    ...(from === undefined ? {} : { from }),
    path,
    ...(expectedContent === undefined ? {} : { expectedContent }),
    ...(content === undefined ? {} : { content }),
  }));
  return [
    `Exact proposal: ${batch.id}`,
    `Digest: ${batch.digest}`,
    `Operations (${operations.length}):`,
    JSON.stringify(operations, null, 2),
  ].join("\n");
}

function matchesExpected(buffer, expectedContent) {
  return Buffer.compare(buffer, Buffer.from(expectedContent, "utf8")) === 0;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw proposalError("PICM_PROPOSAL_ABORTED", "operation was cancelled before mutation");
}

async function requireAllowedBinding(gate, toolName, path, excludedPaths) {
  const decision = await gate.checkPath(toolName, path, excludedPaths);
  if (!decision.allowed || !decision.executionBinding) {
    throw proposalError(
      "PICM_PROPOSAL_PATH_BLOCKED",
      `${path}: ${decision.reason ?? "the protected path gate did not authorize this operation"}`,
    );
  }
  return gate.bindPath(decision.executionBinding);
}

async function requireExpectedContent(binding, path, expectedContent) {
  const content = await binding.operations.readFile(binding.absolutePath);
  if (!matchesExpected(content, expectedContent)) {
    throw proposalError("PICM_PROPOSAL_STALE", `${path} changed after the proposal was prepared`);
  }
  return content;
}

async function requireMissing(binding, path) {
  try {
    await binding.operations.lstat(binding.absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw proposalError("PICM_PROPOSAL_STALE", `${path} already exists`);
}

function destinationParents(operation) {
  const parents = [];
  let relativeParent = dirname(operation.path);
  let absoluteParent = dirname(operation.destination.absolutePath);
  while (relativeParent !== ".") {
    parents.push({ path: relativeParent, absolutePath: absoluteParent });
    relativeParent = dirname(relativeParent);
    absoluteParent = dirname(absoluteParent);
  }
  return parents.reverse();
}

async function createDestinationParents(operation, signal) {
  for (const parent of destinationParents(operation)) {
    throwIfAborted(signal);
    try {
      await operation.destination.operations.mkdir(parent.absolutePath, { recursive: false });
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      operation.result.status = "uncertain";
      throw error;
    }
    operation.result.createdParents ??= [];
    operation.result.createdParents.push(parent.path);
    operation.result.status = "failed";
    throwIfAborted(signal);
  }
}

function initialResults(batch) {
  return batch.auditOperations.map((operation) => ({ ...operation, status: "unattempted" }));
}

function markFailedWithoutMutation(operation, error) {
  if (error?.code !== "PICM_PROPOSAL_ABORTED" && operation.result.status === "unattempted") {
    operation.result.status = "failed";
  }
}

function failureDetails(error) {
  if (typeof error?.code === "string" && error.code.startsWith("PICM_PROPOSAL_")) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "PICM_PROPOSAL_IO_FAILED",
    message: "A filesystem operation failed; inspect the affected approved paths before proposing a repair.",
  };
}

function failedProposalResult(batch, error, results) {
  const { code, message } = failureDetails(error);
  return {
    ok: false,
    code,
    message,
    proposalId: batch.id,
    digest: batch.digest,
    operations: batch.auditOperations,
    results,
  };
}

export async function prepareProposalBatch({ gate, excludedPaths = [], operations }) {
  const normalizedOperations = validateOperations(operations);
  const boundOperations = [];

  for (const operation of normalizedOperations) {
    if (operation.type === "create") {
      const destination = await requireAllowedBinding(gate, "write", operation.path, excludedPaths);
      await requireMissing(destination, operation.path);
      boundOperations.push({ ...operation, destination });
      continue;
    }

    const sourcePath = operation.type === "move" ? operation.from : operation.path;
    const source = await requireAllowedBinding(gate, "edit", sourcePath, excludedPaths);
    await requireExpectedContent(source, sourcePath, operation.expectedContent);

    if (operation.type === "move") {
      const destination = await requireAllowedBinding(gate, "write", operation.path, excludedPaths);
      await requireMissing(destination, operation.path);
      boundOperations.push({ ...operation, source, destination });
    } else {
      boundOperations.push({ ...operation, source });
    }
  }

  return {
    id: `picm-proposal:${randomUUID()}`,
    digest: digest(normalizedOperations),
    operations: boundOperations,
    auditOperations: auditOperations(normalizedOperations),
  };
}

async function rebindProposalOperations(batch, gate, excludedPaths, signal, results) {
  const reboundOperations = [];
  for (const [index, operation] of batch.operations.entries()) {
    const rebound = { ...operation, result: results[index] };
    try {
      throwIfAborted(signal);
      if (operation.type === "create") {
        rebound.destination = await requireAllowedBinding(gate, "write", operation.path, excludedPaths);
        throwIfAborted(signal);
        reboundOperations.push(rebound);
        continue;
      }

      const sourcePath = operation.type === "move" ? operation.from : operation.path;
      rebound.source = await requireAllowedBinding(gate, "edit", sourcePath, excludedPaths);
      throwIfAborted(signal);
      if (operation.type === "move") {
        rebound.destination = await requireAllowedBinding(gate, "write", operation.path, excludedPaths);
        throwIfAborted(signal);
      }
      reboundOperations.push(rebound);
    } catch (error) {
      if (signal?.aborted) error = proposalError("PICM_PROPOSAL_ABORTED", "operation was cancelled before mutation");
      markFailedWithoutMutation(rebound, error);
      throw error;
    }
  }

  for (const operation of reboundOperations) {
    try {
      throwIfAborted(signal);
      if (operation.type === "create") {
        await requireMissing(operation.destination, operation.path);
        throwIfAborted(signal);
        continue;
      }

      const sourcePath = operation.type === "move" ? operation.from : operation.path;
      await requireExpectedContent(operation.source, sourcePath, operation.expectedContent);
      throwIfAborted(signal);
      if (operation.type === "move") {
        await requireMissing(operation.destination, operation.path);
        throwIfAborted(signal);
      }
    } catch (error) {
      if (signal?.aborted) error = proposalError("PICM_PROPOSAL_ABORTED", "operation was cancelled before mutation");
      markFailedWithoutMutation(operation, error);
      throw error;
    }
  }
  return reboundOperations;
}

export async function applyProposalBatch(batch, { gate, excludedPaths = [], signal } = {}) {
  const results = initialResults(batch);
  try {
    const operations = await rebindProposalOperations(batch, gate, excludedPaths, signal, results);
    for (const operation of operations) {
      try {
        throwIfAborted(signal);
        if (operation.type === "create") {
          await requireMissing(operation.destination, operation.path);
          throwIfAborted(signal);
          await createDestinationParents(operation, signal);
          throwIfAborted(signal);
          await requireMissing(operation.destination, operation.path);
          throwIfAborted(signal);
          operation.result.status = "uncertain";
          await operation.destination.operations.writeFile(operation.destination.absolutePath, operation.content);
          operation.result.status = "completed";
          continue;
        }

        const sourcePath = operation.type === "move" ? operation.from : operation.path;
        await requireExpectedContent(operation.source, sourcePath, operation.expectedContent);
        if (operation.type === "modify") {
          throwIfAborted(signal);
          operation.result.status = "uncertain";
          await operation.source.operations.writeFile(operation.source.absolutePath, operation.content);
          operation.result.status = "completed";
        } else if (operation.type === "delete") {
          throwIfAborted(signal);
          operation.result.status = "uncertain";
          await operation.source.operations.unlink(operation.source.absolutePath);
          operation.result.status = "completed";
        } else {
          await requireMissing(operation.destination, operation.path);
          throwIfAborted(signal);
          await createDestinationParents(operation, signal);
          throwIfAborted(signal);
          await requireMissing(operation.destination, operation.path);
          throwIfAborted(signal);
          operation.result.status = "uncertain";
          await operation.destination.operations.writeFile(operation.destination.absolutePath, operation.content);
          operation.result.destinationPublished = true;
          operation.result.status = "failed";
          throwIfAborted(signal);
          await requireExpectedContent(operation.source, sourcePath, operation.expectedContent);
          throwIfAborted(signal);
          operation.result.status = "uncertain";
          await operation.source.operations.unlink(operation.source.absolutePath);
          delete operation.result.destinationPublished;
          operation.result.status = "completed";
        }
      } catch (error) {
        markFailedWithoutMutation(operation, error);
        throw error;
      }
    }
    throwIfAborted(signal);
  } catch (error) {
    return failedProposalResult(batch, error, results);
  }

  return {
    ok: true,
    proposalId: batch.id,
    digest: batch.digest,
    operations: batch.auditOperations,
    results,
  };
}

export function proposalAudit(batch, status, details = {}) {
  return {
    status,
    proposalId: batch.id,
    digest: batch.digest,
    operations: batch.auditOperations,
    ...details,
  };
}
