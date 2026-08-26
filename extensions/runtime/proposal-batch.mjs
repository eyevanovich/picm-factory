import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, normalize } from "node:path";

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
  const touched = new Set();
  for (const operation of normalized) {
    const paths = operation.type === "move" ? [operation.from, operation.path] : [operation.path];
    for (const path of paths) {
      if (touched.has(path)) {
        throw proposalError("PICM_PROPOSAL_INVALID", `multiple operations affect ${path}`);
      }
      touched.add(path);
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

async function removeIfPresent(binding) {
  try {
    await binding.operations.unlink(binding.absolutePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function rollback(attempted) {
  const failures = [];
  for (const operation of [...attempted].reverse()) {
    if (!operation.mutationStarted) continue;
    try {
      if (operation.type === "create") {
        await removeIfPresent(operation.destination);
      } else if (operation.type === "modify") {
        await operation.source.operations.writeFile(operation.source.absolutePath, operation.originalContent);
      } else if (operation.type === "delete") {
        if (operation.sourceRemoved) {
          await operation.source.operations.writeFile(operation.source.absolutePath, operation.originalContent);
        }
      } else {
        if (operation.destinationWritten) await removeIfPresent(operation.destination);
        if (operation.sourceRemoved) {
          await operation.source.operations.writeFile(operation.source.absolutePath, operation.originalContent);
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return failures;
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

export async function applyProposalBatch(batch, { signal } = {}) {
  const attempted = [];
  try {
    for (const operation of batch.operations) {
      throwIfAborted(signal);
      attempted.push(operation);
      if (operation.type === "create") {
        await requireMissing(operation.destination, operation.path);
        throwIfAborted(signal);
        operation.mutationStarted = true;
        await operation.destination.operations.writeFile(operation.destination.absolutePath, operation.content);
        continue;
      }

      const sourcePath = operation.type === "move" ? operation.from : operation.path;
      operation.originalContent = await requireExpectedContent(
        operation.source,
        sourcePath,
        operation.expectedContent,
      );
      if (operation.type === "modify") {
        throwIfAborted(signal);
        operation.mutationStarted = true;
        await operation.source.operations.writeFile(operation.source.absolutePath, operation.content);
      } else if (operation.type === "delete") {
        throwIfAborted(signal);
        operation.mutationStarted = true;
        await operation.source.operations.unlink(operation.source.absolutePath);
        operation.sourceRemoved = true;
      } else {
        await requireMissing(operation.destination, operation.path);
        throwIfAborted(signal);
        operation.mutationStarted = true;
        operation.destinationWritten = true;
        await operation.destination.operations.writeFile(operation.destination.absolutePath, operation.content);
        await requireExpectedContent(operation.source, sourcePath, operation.expectedContent);
        throwIfAborted(signal);
        await operation.source.operations.unlink(operation.source.absolutePath);
        operation.sourceRemoved = true;
      }
    }
    throwIfAborted(signal);
  } catch (error) {
    const failures = await rollback(attempted);
    if (failures.length > 0) {
      throw proposalError(
        "PICM_PROPOSAL_ROLLBACK_FAILED",
        `${error instanceof Error ? error.message : error}; rollback failed: ${failures.join("; ")}`,
      );
    }
    throw error;
  }

  return {
    ok: true,
    proposalId: batch.id,
    digest: batch.digest,
    operations: batch.auditOperations,
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
