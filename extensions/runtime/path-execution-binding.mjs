import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import * as fsPromises from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, dirname, isAbsolute, join, matchesGlob, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const IMAGE_TYPE_SNIFF_BYTES = 4100;
const GREP_OUTPUT_LIMIT_BYTES = 50 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const DEFAULT_PATH_BINDING_LIMITS = Object.freeze({
  maxRetainedFileBytes: 8 * 1024 * 1024,
  maxTraversalSnapshotBytes: 64 * 1024 * 1024,
  maxTraversalEntries: 10_000,
  maxRipgrepRecordBytes: 1024 * 1024,
  maxRipgrepStdoutBytes: 8 * 1024 * 1024,
  maxRipgrepStderrBytes: 256 * 1024,
  maxRipgrepTerminationWaitMs: 2_000,
  maxGrepMatches: 1_000,
  maxGrepContextLines: 100,
  maxGrepRenderedBytes: GREP_OUTPUT_LIMIT_BYTES,
});

export function resolvePathBindingLimits(overrides = {}) {
  const limits = { ...DEFAULT_PATH_BINDING_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) fail(`invalid ${name} resource limit`);
  }
  return Object.freeze(limits);
}

function fail(message) {
  throw new Error(`PICM_PATH_BINDING_FAILED: ${message}`);
}

function ignoreLateSubprocessError() {}

function retainLateErrorSink(emitter) {
  emitter?.on?.("error", ignoreLateSubprocessError);
}

export function fileIdentity(stat) {
  return { dev: stat?.dev, ino: stat?.ino };
}

function startsWith(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

function startsWithAscii(buffer, offset, text) {
  if (buffer.length < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (buffer[index + offset] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function readUint16LE(buffer, offset) {
  return (buffer[offset] ?? 0) + ((buffer[offset + 1] ?? 0) << 8);
}

function readUint32BE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) * 0x1000000 +
    ((buffer[offset + 1] ?? 0) << 16) +
    ((buffer[offset + 2] ?? 0) << 8) +
    (buffer[offset + 3] ?? 0)
  );
}

function readUint32LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) +
    ((buffer[offset + 1] ?? 0) << 8) +
    ((buffer[offset + 2] ?? 0) << 16) +
    (buffer[offset + 3] ?? 0) * 0x1000000
  );
}

function isPng(buffer) {
  return buffer.length >= 16 &&
    readUint32BE(buffer, PNG_SIGNATURE.length) === 13 &&
    startsWithAscii(buffer, 12, "IHDR");
}

function isAnimatedPng(buffer) {
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const chunkLength = readUint32BE(buffer, offset);
    const chunkTypeOffset = offset + 4;
    if (startsWithAscii(buffer, chunkTypeOffset, "acTL")) return true;
    if (startsWithAscii(buffer, chunkTypeOffset, "IDAT")) return false;
    const nextOffset = offset + 8 + chunkLength + 4;
    if (nextOffset <= offset || nextOffset > buffer.length) return false;
    offset = nextOffset;
  }
  return false;
}

function isBmp(buffer) {
  if (buffer.length < 26) return false;
  const declaredFileSize = readUint32LE(buffer, 2);
  const pixelDataOffset = readUint32LE(buffer, 10);
  const dibHeaderSize = readUint32LE(buffer, 14);
  if (declaredFileSize !== 0 && declaredFileSize < 26) return false;
  if (pixelDataOffset < 14 + dibHeaderSize) return false;
  if (declaredFileSize !== 0 && pixelDataOffset >= declaredFileSize) return false;
  let colorPlanes;
  let bitsPerPixel;
  if (dibHeaderSize === 12) {
    colorPlanes = readUint16LE(buffer, 22);
    bitsPerPixel = readUint16LE(buffer, 24);
  } else if (dibHeaderSize >= 40 && dibHeaderSize <= 124) {
    if (buffer.length < 30) return false;
    colorPlanes = readUint16LE(buffer, 26);
    bitsPerPixel = readUint16LE(buffer, 28);
  } else {
    return false;
  }
  return colorPlanes === 1 && [1, 4, 8, 16, 24, 32].includes(bitsPerPixel);
}

export function detectImageMimeType(buffer) {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return buffer[3] === 0xf7 ? null : "image/jpeg";
  if (startsWith(buffer, PNG_SIGNATURE)) return isPng(buffer) && !isAnimatedPng(buffer) ? "image/png" : null;
  if (startsWithAscii(buffer, 0, "GIF")) return "image/gif";
  if (startsWithAscii(buffer, 0, "RIFF") && startsWithAscii(buffer, 8, "WEBP")) return "image/webp";
  if (startsWithAscii(buffer, 0, "BM") && isBmp(buffer)) return "image/bmp";
  return null;
}

async function readPrefixAsync(filePath, length) {
  try {
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return Buffer.alloc(0);
  }
}

function globMatches(fileName, pattern) {
  return matchesGlob(fileName, pattern) || (
    pattern.startsWith("**/") && matchesGlob(fileName, pattern.slice(3))
  );
}

function truncateLine(line, maxLength = 500) {
  return line.length <= maxLength ? line : `${line.slice(0, maxLength)}... [truncated]`;
}

let ripgrepPathPromise;

export async function resolveRipgrep(packageRoot) {
  ripgrepPathPromise ??= (async () => {
    let entry;
    if (packageRoot) {
      try {
        const pkgJsonUrl = pathToFileURL(join(packageRoot, "package.json"));
        entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent", pkgJsonUrl));
      } catch {}
    }
    if (!entry) {
      entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent", import.meta.url));
    }
    const managerUrl = pathToFileURL(resolve(dirname(entry), "utils", "tools-manager.js"));
    const manager = await import(managerUrl);
    const path = await manager.ensureTool("rg");
    if (!path) throw new Error("ripgrep is not available and could not be downloaded");
    return path;
  })();
  return ripgrepPathPromise;
}

function runAbortable(operation, signal) {
  if (!signal) return Promise.resolve().then(operation);
  if (signal.aborted) return Promise.reject(new Error("Operation aborted"));
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const settle = (finish) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      finish();
    };
    const abort = () => settle(() => reject(new Error("Operation aborted")));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw new Error("Operation aborted");
        return operation();
      })
      .then(
        (value) => settle(() => resolvePromise(value)),
        (error) => settle(() => reject(error)),
      );
  });
}

async function ripgrepMatches(
  path,
  args,
  content,
  lineCount,
  signal,
  remaining,
  { spawnMatcher, resourceLimits },
) {
  if (signal?.aborted) throw new Error("Operation aborted");
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawnMatcher(path, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      reject(new Error(`Failed to run ripgrep: ${error instanceof Error ? error.message : error}`));
      return;
    }
    const matches = [];
    let stdout = "";
    let stdoutBytes = 0;
    let stderr = "";
    let stderrBytes = 0;
    let limited = false;
    let settled = false;
    let termination;
    let terminationTimer;

    function cleanup() {
      if (terminationTimer) clearTimeout(terminationTimer);
      terminationTimer = undefined;
      signal?.removeEventListener("abort", abort);
      child.stdout?.off("data", onStdout);
      child.stderr?.off("data", onStderr);
      child.off("close", onClose);
      if (termination) {
        retainLateErrorSink(child);
        retainLateErrorSink(child.stdin);
        retainLateErrorSink(child.stdout);
        retainLateErrorSink(child.stderr);
        try { child.stdin?.destroy(); } catch {}
        try { child.stdout?.destroy(); } catch {}
        try { child.stderr?.destroy(); } catch {}
      }
      queueMicrotask(() => {
        child.stdin?.off("error", onStdinError);
        child.stdout?.off("error", onStreamError);
        child.stderr?.off("error", onStreamError);
        child.off("error", onChildError);
      });
    }

    function settle(operation) {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    }

    function terminationFailure(reason) {
      return new Error(`PICM_GREP_TERMINATION_FAILED: ${reason}`);
    }

    function requestTermination(outcome) {
      if (settled || termination) return;
      termination = outcome;
      try { child.stdin?.destroy(); } catch {}
      let requested;
      try {
        requested = child.killed || child.kill();
      } catch (error) {
        settle(() => reject(terminationFailure(
          `ripgrep termination request failed: ${error instanceof Error ? error.message : error}`,
        )));
        return;
      }
      if (!requested) {
        settle(() => reject(terminationFailure("ripgrep termination request returned false")));
        return;
      }
      if (settled) return;
      terminationTimer = setTimeout(() => {
        if (settled) return;
        try { child.kill("SIGKILL"); } catch {}
        settle(() => reject(new Error(
          `PICM_GREP_TERMINATION_TIMEOUT: ripgrep did not close within ${resourceLimits.maxRipgrepTerminationWaitMs}ms`,
        )));
      }, resourceLimits.maxRipgrepTerminationWaitMs);
    }

    function rejectAfterTermination(error) {
      requestTermination({ type: "reject", error });
    }

    function abort() {
      rejectAfterTermination(new Error("Operation aborted"));
    }

    function onStdout(chunk) {
      if (termination || settled) return;
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > resourceLimits.maxRipgrepStdoutBytes) {
        rejectAfterTermination(new Error(
          `PICM_GREP_RESOURCE_LIMIT: stdout exceeds ${resourceLimits.maxRipgrepStdoutBytes} bytes`,
        ));
        return;
      }
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout, "utf8") > resourceLimits.maxRipgrepRecordBytes) {
        rejectAfterTermination(new Error(
          `PICM_GREP_RESOURCE_LIMIT: JSON record exceeds ${resourceLimits.maxRipgrepRecordBytes} bytes`,
        ));
        return;
      }
      const records = stdout.split("\n");
      stdout = records.pop() ?? "";
      for (const record of records) {
        if (!record) continue;
        if (Buffer.byteLength(record, "utf8") > resourceLimits.maxRipgrepRecordBytes) {
          rejectAfterTermination(new Error(
            `PICM_GREP_RESOURCE_LIMIT: JSON record exceeds ${resourceLimits.maxRipgrepRecordBytes} bytes`,
          ));
          return;
        }
        let event;
        try {
          event = JSON.parse(record);
        } catch {
          rejectAfterTermination(new Error(
            "PICM_GREP_SUBPROCESS_INVALID: malformed ripgrep JSON record",
          ));
          return;
        }
        if (event?.type === "match") {
          const lineNumber = event.data?.line_number;
          if (!Number.isSafeInteger(lineNumber) || lineNumber < 1 || lineNumber > lineCount) {
            rejectAfterTermination(new Error(
              "PICM_GREP_SUBPROCESS_INVALID: malformed ripgrep match record",
            ));
            return;
          }
          matches.push(lineNumber);
          if (matches.length >= remaining) {
            limited = true;
            requestTermination({ type: "resolve" });
            return;
          }
        }
      }
    }

    function onStderr(chunk) {
      if (termination || settled) return;
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > resourceLimits.maxRipgrepStderrBytes) {
        rejectAfterTermination(new Error(
          `PICM_GREP_RESOURCE_LIMIT: stderr exceeds ${resourceLimits.maxRipgrepStderrBytes} bytes`,
        ));
        return;
      }
      stderr += chunk.toString();
    }

    function onStdinError(error) {
      if (termination || settled) return;
      rejectAfterTermination(error);
    }

    function onStreamError(error) {
      if (termination || settled) return;
      rejectAfterTermination(error);
    }

    function onChildError(error) {
      if (termination) {
        settle(() => reject(terminationFailure(
          `ripgrep emitted an error during termination: ${error instanceof Error ? error.message : error}`,
        )));
        return;
      }
      settle(() => reject(new Error(
        `Failed to run ripgrep: ${error instanceof Error ? error.message : error}`,
      )));
    }

    function onClose(code) {
      if (settled) return;
      if (termination?.type === "reject") {
        settle(() => reject(termination.error));
        return;
      }
      if (termination?.type === "resolve") {
        settle(() => resolvePromise({ matches, limited }));
        return;
      }
      if (signal?.aborted) {
        settle(() => reject(new Error("Operation aborted")));
        return;
      }
      if (stdout.trim() !== "") {
        settle(() => reject(new Error(
          "PICM_GREP_SUBPROCESS_INVALID: incomplete ripgrep JSON record",
        )));
        return;
      }
      if (code !== 0 && code !== 1) {
        settle(() => reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`)));
        return;
      }
      settle(() => resolvePromise({ matches, limited }));
    }

    signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.stdin?.on("error", onStdinError);
    child.stdout?.on("error", onStreamError);
    child.stderr?.on("error", onStreamError);
    child.on("error", onChildError);
    child.on("close", onClose);
    try {
      child.stdin?.end(content);
    } catch (error) {
      rejectAfterTermination(error);
    }
  });
}

export async function executeBoundGrep(binding, params, signal, matcherOptions) {
  if (signal?.aborted) throw new Error("Operation aborted");
  const {
    pattern,
    glob,
    ignoreCase = false,
    literal = false,
    context = 0,
    limit = 100,
  } = params;
  const options = typeof matcherOptions === "function"
    ? { resolveMatcher: matcherOptions }
    : matcherOptions ?? {};
  const resolveMatcher = options.resolveMatcher ?? (() => resolveRipgrep(binding.packageRoot));
  const spawnMatcher = options.spawnMatcher ?? spawn;
  const resourceLimits = resolvePathBindingLimits({
    ...(binding.resourceLimits ?? {}),
    ...(options.resourceLimits ?? {}),
  });

  const files = binding.files ?? [{ path: binding.absolutePath, readFile: binding.operations.readFile }];
  const matches = [];
  const requestedLimit = limit === Infinity
    ? Number.MAX_SAFE_INTEGER
    : Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 100;
  const effectiveLimit = Math.min(requestedLimit, resourceLimits.maxGrepMatches);
  const matchResourceLimited = requestedLimit > resourceLimits.maxGrepMatches;
  const requestedContext = context === Infinity
    ? Number.MAX_SAFE_INTEGER
    : Number.isFinite(context) ? Math.max(0, Math.floor(context)) : 0;
  const contextSize = Math.min(requestedContext, resourceLimits.maxGrepContextLines);
  const contextResourceLimited = requestedContext > resourceLimits.maxGrepContextLines;
  const ripgrepPath = await runAbortable(resolveMatcher, signal);
  if (signal?.aborted) throw new Error("Operation aborted");
  for (const file of files) {
    if (signal?.aborted) throw new Error("Operation aborted");
    const fileName = relative(binding.absolutePath, file.path) || basename(file.path);
    if (glob && !globMatches(fileName, glob) && !globMatches(basename(file.path), glob)) continue;
    const fileBuffer = await file.readFile();
    const byteLength = Buffer.isBuffer(fileBuffer) ? fileBuffer.length : Buffer.byteLength(String(fileBuffer), "utf8");
    if (byteLength > resourceLimits.maxRetainedFileBytes) {
      fail(`guarded grep file exceeds ${resourceLimits.maxRetainedFileBytes} bytes`);
    }
    const content = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString("utf8") : String(fileBuffer);
    const args = ["--json", "--line-number", "--color=never"];
    if (ignoreCase) args.push("--ignore-case");
    if (literal) args.push("--fixed-strings");
    args.push("--", pattern, "-");
    const normalizedContent = content.replace(/\r\n/g, "\n");
    const splitLines = normalizedContent.split("\n");
    const lineCount = normalizedContent.length === 0
      ? 0
      : splitLines.length - (normalizedContent.endsWith("\n") ? 1 : 0);
    const lines = splitLines.slice(0, lineCount).map((line) => line.replace(/\r/g, ""));
    const result = await ripgrepMatches(
      ripgrepPath,
      args,
      content,
      lineCount,
      signal,
      effectiveLimit - matches.length,
      { spawnMatcher, resourceLimits },
    );
    for (const lineNumber of result.matches.slice(0, effectiveLimit - matches.length)) {
      matches.push({ fileName, index: lineNumber - 1, lines });
    }
    if (matches.length >= effectiveLimit) break;
  }
  if (signal?.aborted) throw new Error("Operation aborted");
  if (matches.length === 0) {
    return { content: [{ type: "text", text: "No matches found" }], details: undefined };
  }
  const output = [];
  const renderedByteLimit = Math.min(
    resourceLimits.maxGrepRenderedBytes,
    GREP_OUTPUT_LIMIT_BYTES,
  );
  let outputBytes = 0;
  let totalOutputBytes = 0;
  let totalOutputLines = 0;
  let retainingOutput = true;
  let linesTruncated = false;
  for (const { fileName, index, lines } of matches) {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(lines.length - 1, index + contextSize);
    for (let current = start; current <= end; current += 1) {
      const separator = current === index ? ":" : "-";
      const shortened = truncateLine(lines[current]);
      if (shortened !== lines[current]) linesTruncated = true;
      const rendered = `${fileName}${separator}${current + 1}${separator} ${shortened}`;
      const renderedBytes = Buffer.byteLength(rendered, "utf8");
      totalOutputBytes += renderedBytes + (totalOutputLines > 0 ? 1 : 0);
      totalOutputLines += 1;
      if (retainingOutput) {
        const retainedBytes = renderedBytes + (output.length > 0 ? 1 : 0);
        if (outputBytes + retainedBytes <= renderedByteLimit) {
          output.push(rendered);
          outputBytes += retainedBytes;
        } else {
          retainingOutput = false;
        }
      }
    }
  }
  const content = output.join("\n");
  const truncated = totalOutputBytes > renderedByteLimit;
  const truncation = {
    content,
    truncated,
    truncatedBy: truncated ? "bytes" : null,
    totalLines: totalOutputLines,
    totalBytes: totalOutputBytes,
    outputLines: output.length,
    outputBytes,
    lastLinePartial: false,
    firstLineExceedsLimit: truncated && output.length === 0,
    maxLines: Number.MAX_SAFE_INTEGER,
    maxBytes: renderedByteLimit,
  };
  const details = {};
  const notices = [];
  if (matches.length >= effectiveLimit) {
    details.matchLimitReached = effectiveLimit;
    if (!matchResourceLimited) {
      notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`);
    }
  }
  if (matchResourceLimited && matches.length >= effectiveLimit) {
    details.matchResourceLimitReached = resourceLimits.maxGrepMatches;
    notices.push(`${resourceLimits.maxGrepMatches} matches resource limit reached. Refine pattern`);
  }
  if (contextResourceLimited) {
    details.contextLimitReached = resourceLimits.maxGrepContextLines;
    notices.push(`Context limited to ${resourceLimits.maxGrepContextLines} lines`);
  }
  if (truncation.truncated) {
    details.truncation = truncation;
    notices.push(
      renderedByteLimit === GREP_OUTPUT_LIMIT_BYTES
        ? "50KB limit reached"
        : `${renderedByteLimit}-byte rendered output limit reached`,
    );
  }
  if (linesTruncated) {
    details.linesTruncated = true;
    notices.push("Some lines truncated to 500 chars. Use read tool to see full lines");
  }
  const textWithNotices = notices.length ? `${content}\n\n[${notices.join(". ")}]` : content;
  return {
    content: [{ type: "text", text: textWithNotices }],
    details: Object.keys(details).length ? details : undefined,
  };
}

function canonical(filePath) {
  try {
    return realpathSync.native ? realpathSync.native(filePath) : realpathSync(filePath);
  } catch {
    return resolve(filePath);
  }
}

function resolveSearchRoot(searchPath, plan) {
  const planAbs = resolve(plan.absolutePath);
  const planCanon = resolve(plan.canonicalPath ?? plan.absolutePath);
  if (!searchPath || searchPath === "." || searchPath === planAbs || searchPath === planCanon) {
    return planCanon;
  }
  if (isAbsolute(searchPath)) {
    const relFromAbs = relative(planAbs, searchPath);
    if (!relFromAbs.startsWith("..") && relFromAbs !== "..") {
      return resolve(planCanon, relFromAbs);
    }
    const relFromCanon = relative(planCanon, searchPath);
    if (!relFromCanon.startsWith("..") && relFromCanon !== "..") {
      return resolve(planCanon, relFromCanon);
    }
    return resolve(searchPath);
  }
  return resolve(planCanon, searchPath);
}

export function createPathExecutionBinding(plan, limitOverrides) {
  if (!plan || !["read", "edit", "write", "grep", "rg", "find", "ls"].includes(plan.toolName)) {
    fail("invalid execution binding plan");
  }
  const resourceLimits = resolvePathBindingLimits(limitOverrides);
  const traversalDirectory = ["grep", "rg", "find", "ls"].includes(plan.toolName) && Boolean(plan.traversalEntries);
  const targetPath = plan.canonicalPath ?? plan.absolutePath;
  const retainedEntries = plan.traversalEntries ?? [];

  if (existsSync(plan.absolutePath)) {
    const st = lstatSync(plan.absolutePath);
    if (st.isSymbolicLink()) fail("validated target is a symlink");
    if (!st.isFile() && !st.isDirectory()) fail("validated target has an unsupported type");
    if (st.isFile() && st.nlink > 1) fail("validated target has multiple hard links");
  }

  if (traversalDirectory) {
    let totalBytes = 0;
    for (const entry of retainedEntries) {
      if (existsSync(entry.absolutePath)) {
        const st = lstatSync(entry.absolutePath);
        if (st.isSymbolicLink()) fail("validated traversal target is a symlink");
        if (entry.isDirectory ? !st.isDirectory() : !st.isFile()) fail("validated traversal target has an unsupported type");
        if (!entry.isDirectory && st.nlink > 1) fail("validated traversal target has multiple hard links");
        if (!entry.isDirectory && st.size > resourceLimits.maxRetainedFileBytes) {
          fail(`retained file exceeds ${resourceLimits.maxRetainedFileBytes} bytes`);
        }
        totalBytes += (st.size ?? 0) + 64;
      }
      totalBytes += Buffer.byteLength(entry.displayPath ?? entry.absolutePath, "utf8") + 64;
      if (totalBytes > resourceLimits.maxTraversalSnapshotBytes) {
        fail(`traversal snapshot exceeds ${resourceLimits.maxTraversalSnapshotBytes} bytes`);
      }
    }
  }

  function resolveOperationTarget(filePath) {
    if (!filePath) return targetPath;
    if (isAbsolute(filePath)) return filePath;
    const resolvedFromCwd = resolve(filePath);
    if (existsSync(resolvedFromCwd)) return resolvedFromCwd;
    if (plan.canonicalPath) {
      const baseDir = existsSync(plan.canonicalPath) && lstatSync(plan.canonicalPath).isDirectory()
        ? plan.canonicalPath
        : dirname(plan.canonicalPath);
      const resolvedFromBase = resolve(baseDir, filePath);
      if (existsSync(resolvedFromBase)) return resolvedFromBase;
    }
    return resolvedFromCwd;
  }

  async function canonicalProspectivePath(filePath) {
    let existing = resolve(filePath);
    while (true) {
      try {
        const st = await fsPromises.lstat(existing);
        if (st.isSymbolicLink()) fail("target traverses a symlink after validation");
        const canonicalExisting = await fsPromises.realpath(existing);
        return resolve(canonicalExisting, relative(existing, filePath));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        const parent = dirname(existing);
        if (parent === existing) throw error;
        existing = parent;
      }
    }
  }

  async function assertBoundTarget(filePath, { allowAncestor = false } = {}) {
    const target = resolveOperationTarget(filePath);
    const currentCanonical = await canonicalProspectivePath(target);
    const approvedCanonical = resolve(plan.canonicalPath ?? plan.absolutePath);
    if (
      currentCanonical !== approvedCanonical &&
      !(allowAncestor && relative(currentCanonical, approvedCanonical) !== ".." && !relative(currentCanonical, approvedCanonical).startsWith(`..${sep}`))
    ) {
      fail("target canonical path changed after validation");
    }
    return target;
  }

  async function assertRetainedFile(entry) {
    const target = entry.canonicalPath ?? entry.absolutePath;
    const currentCanonical = await canonicalProspectivePath(target);
    if (currentCanonical !== resolve(entry.canonicalPath ?? entry.absolutePath)) {
      fail("retained file canonical path changed after validation");
    }
    const st = await fsPromises.lstat(target);
    if (st.isSymbolicLink()) fail("file became a symlink");
    if (st.isFile() && st.nlink > 1) fail("validated target has multiple hard links");
    return { target, st };
  }

  async function assertSafeFile(filePath) {
    const target = await assertBoundTarget(filePath);
    const st = await fsPromises.lstat(target);
    if (st.isSymbolicLink()) fail("target became a symlink after validation");
    if (st.isFile() && st.nlink > 1) fail("validated target has multiple hard links");
    return { target, st };
  }

  const binding = {
    toolName: plan.toolName,
    absolutePath: plan.absolutePath,
    canonicalPath: plan.canonicalPath,
    packageRoot: plan.packageRoot,
    resourceLimits,
    files: traversalDirectory
      ? retainedEntries.filter((file) => !file.isDirectory).map((file) => ({
          path: relative(canonical(plan.canonicalPath ?? plan.absolutePath), canonical(file.canonicalPath ?? file.absolutePath)) || basename(file.absolutePath),
          readFile: async () => {
            const { target, st } = await assertRetainedFile(file);
            if (st.size > resourceLimits.maxRetainedFileBytes) {
              fail(`guarded grep file exceeds ${resourceLimits.maxRetainedFileBytes} bytes`);
            }
            return fsPromises.readFile(target);
          },
        }))
      : undefined,
    operations: plan.toolName === "read"
      ? {
          access: async (path) => {
            const target = await assertBoundTarget(path);
            return fsPromises.access(target);
          },
          readFile: async (path) => {
            const { target } = await assertSafeFile(path);
            return fsPromises.readFile(target);
          },
          detectImageMimeType: async (path) => {
            const { target } = await assertSafeFile(path);
            return detectImageMimeType(await readPrefixAsync(target, IMAGE_TYPE_SNIFF_BYTES));
          },
        }
      : plan.toolName === "edit"
        ? {
            access: async (path) => {
              const target = await assertBoundTarget(path);
              return fsPromises.access(target);
            },
            readFile: async (path) => {
              const { target } = await assertSafeFile(path);
              return fsPromises.readFile(target);
            },
            writeFile: async (path, content) => {
              const target = await assertBoundTarget(path);
              try {
                const st = await fsPromises.lstat(target);
                if (st.isSymbolicLink()) fail("target became a symlink");
                if (st.isFile() && st.nlink > 1) fail("validated target has multiple hard links");
              } catch (e) {
                if (e.code !== "ENOENT") throw e;
              }
              return fsPromises.writeFile(target, content, "utf8");
            },
          }
        : plan.toolName === "write"
          ? {
              mkdir: async (dir, options) => {
                const target = await assertBoundTarget(dir, { allowAncestor: true });
                return fsPromises.mkdir(target, { recursive: true, ...options });
              },
              writeFile: async (path, content) => {
                const target = await assertBoundTarget(path);
                try {
                  const st = await fsPromises.lstat(target);
                  if (st.isSymbolicLink()) fail("target became a symlink");
                  if (st.isFile() && st.nlink > 1) fail("validated target has multiple hard links");
                } catch (e) {
                  if (e.code !== "ENOENT") throw e;
                }
                return fsPromises.writeFile(target, content, "utf8");
              },
            }
          : plan.toolName === "grep" || plan.toolName === "rg"
            ? {
                isDirectory: async () => traversalDirectory,
                readFile: async (path) => {
                  if (!traversalDirectory) {
                    const { target, st } = await assertSafeFile(path);
                    if (st.size > resourceLimits.maxRetainedFileBytes) {
                      fail(`guarded grep file exceeds ${resourceLimits.maxRetainedFileBytes} bytes`);
                    }
                    return fsPromises.readFile(target, "utf8");
                  }
                  const entry = retainedEntries.find((cand) => (cand.displayPath === path || cand.absolutePath === path) && !cand.isDirectory);
                  if (!entry) fail("path is outside the validated traversal snapshot");
                  const { target: entryPath, st } = await assertRetainedFile(entry);
                  if (st.size > resourceLimits.maxRetainedFileBytes) {
                    fail(`guarded grep file exceeds ${resourceLimits.maxRetainedFileBytes} bytes`);
                  }
                  return fsPromises.readFile(entryPath, "utf8");
                },
              }
            : plan.toolName === "ls"
              ? {
                  exists: async () => true,
                  stat: async (path) => {
                    const searchTarget = resolveSearchRoot(path, plan);
                    if (searchTarget === resolve(plan.canonicalPath ?? plan.absolutePath)) {
                      return { isDirectory: () => true, isFile: () => false };
                    }
                    const entry = retainedEntries.find((c) => resolve(c.canonicalPath ?? c.absolutePath) === searchTarget || c.displayPath === path || c.absolutePath === path);
                    if (entry) {
                      return { isDirectory: () => entry.isDirectory, isFile: () => !entry.isDirectory };
                    }
                    try {
                      const st = await fsPromises.stat(searchTarget);
                      return { isDirectory: () => st.isDirectory(), isFile: () => st.isFile() };
                    } catch {
                      fail("path is outside the validated traversal snapshot");
                    }
                  },
                  readdir: async (dirPath) => {
                    const searchRoot = resolveSearchRoot(dirPath, plan);
                    return [...new Set(retainedEntries.map((entry) => {
                      const entryPath = resolve(entry.canonicalPath ?? entry.absolutePath);
                      const rel = relative(searchRoot, entryPath);
                      if (rel === "" || rel.startsWith("..")) return undefined;
                      const [name] = rel.split(sep);
                      return name;
                    }))].filter(Boolean);
                  },
                }
              : {
                  exists: async () => true,
                  glob: async (pattern, searchPath, options) => {
                    if (!traversalDirectory) fail("validated find target is not a directory");
                    const searchRoot = resolveSearchRoot(searchPath, plan);
                    return retainedEntries
                      .filter((entry) => {
                        const entryPath = resolve(entry.canonicalPath ?? entry.absolutePath);
                        const rel = relative(searchRoot, entryPath).split(sep).join("/");
                        if (rel === "" || rel.startsWith("..")) return false;
                        const candidate = pattern.includes("/") ? rel : basename(rel);
                        return rel && globMatches(candidate, pattern);
                      })
                      .slice(0, options?.limit ?? 1000)
                      .map((entry) => {
                        const target = entry.displayPath ?? entry.absolutePath;
                        if (isAbsolute(searchPath)) {
                          return entry.isDirectory ? `${target}${sep}` : target;
                        }
                        const entryPath = resolve(entry.canonicalPath ?? entry.absolutePath);
                        const rel = relative(searchRoot, entryPath).split(sep).join("/");
                        return entry.isDirectory ? `${rel}/` : rel;
                      });
                  },
                },
    release() {},
  };

  return binding;
}
