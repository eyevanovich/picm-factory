import {
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, join, matchesGlob, relative, resolve, sep } from "node:path";
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
  return { dev: stat.dev, ino: stat.ino };
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function assertIdentity(stat, expected, label) {
  if (!sameIdentity(fileIdentity(stat), expected)) fail(`${label} changed after validation`);
}

function canonical(path) {
  return realpathSync.native ? realpathSync.native(path) : realpathSync(path);
}

function assertCurrentPath(path, expectedCanonicalPath, expectedIdentity, kind) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail(`${kind} became a symlink after validation`);
  assertIdentity(stat, expectedIdentity, kind);
  if (canonical(path) !== expectedCanonicalPath) fail(`${kind} changed canonical location after validation`);
  return stat;
}

function openFlags(toolName) {
  const access = toolName === "edit"
    ? constants.O_RDWR
    : toolName === "write"
      ? constants.O_WRONLY
      : constants.O_RDONLY;
  return access | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0) |
    (constants.O_BINARY ?? 0);
}

function assertBoundRegularFile(fd, expectedIdentity, label) {
  const stat = fstatSync(fd);
  if (!stat.isFile()) fail(`${label} is not a regular file`);
  assertIdentity(stat, expectedIdentity, label);
  if (stat.nlink > 1) fail(`${label} has multiple hard links`);
  return stat;
}

function readAll(fd, maxBytes = Number.MAX_SAFE_INTEGER, label = "file") {
  const initial = fstatSync(fd);
  if (initial.size > maxBytes) fail(`${label} exceeds ${maxBytes} bytes`);
  const chunks = [];
  let position = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - position + 1));
    const bytesRead = readSync(fd, chunk, 0, chunk.length, position);
    if (bytesRead === 0) break;
    if (position + bytesRead > maxBytes) fail(`${label} exceeds ${maxBytes} bytes`);
    chunks.push(chunk.subarray(0, bytesRead));
    position += bytesRead;
  }
  return Buffer.concat(chunks);
}

function readPrefix(fd, length) {
  const buffer = Buffer.alloc(length);
  const bytesRead = readSync(fd, buffer, 0, length, 0);
  return buffer.subarray(0, bytesRead);
}

function writeAll(fd, content) {
  const buffer = Buffer.from(content, "utf8");
  ftruncateSync(fd, 0);
  let offset = 0;
  while (offset < buffer.length) {
    offset += writeSync(fd, buffer, offset, buffer.length - offset, offset);
  }
  ftruncateSync(fd, buffer.length);
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

function detectImageMimeType(buffer) {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return buffer[3] === 0xf7 ? null : "image/jpeg";
  if (startsWith(buffer, PNG_SIGNATURE)) return isPng(buffer) && !isAnimatedPng(buffer) ? "image/png" : null;
  if (startsWithAscii(buffer, 0, "GIF")) return "image/gif";
  if (startsWithAscii(buffer, 0, "RIFF") && startsWithAscii(buffer, 8, "WEBP")) return "image/webp";
  if (startsWithAscii(buffer, 0, "BM") && isBmp(buffer)) return "image/bmp";
  return null;
}

function removeCreatedFile(path, identity) {
  try {
    const stat = lstatSync(path);
    if (!stat.isSymbolicLink() && sameIdentity(fileIdentity(stat), identity)) unlinkSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function descriptorPath(fd, child = "") {
  const path = join("/proc/self/fd", String(fd));
  return child ? join(path, child) : path;
}

function retainedChildPath(parentFd, parentPath, child) {
  if (process.platform !== "linux") {
    fail("descriptor-relative prospective writes are unavailable on this platform");
  }
  return descriptorPath(parentFd, child);
}

function removeCreatedDirectories(createdDirectories) {
  for (const directory of [...createdDirectories].reverse()) {
    try {
      const path = retainedChildPath(directory.parentFd, directory.parentPath, directory.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !sameIdentity(fileIdentity(stat), directory.identity)) continue;
      rmdirSync(path);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTEMPTY") throw error;
    }
  }
}

function prepareParent(plan) {
  assertCurrentPath(
    plan.existingPath,
    plan.canonicalExistingPath,
    plan.existingIdentity,
    "validated write ancestor",
  );
  const targetParent = dirname(plan.absolutePath);
  const suffix = relative(plan.existingPath, targetParent);
  const directoryFds = [];
  let parentFd;
  let parentPath = plan.existingPath;
  const createdDirectories = [];
  try {
    parentFd = openSync(
      plan.existingPath,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    directoryFds.push(parentFd);
    assertIdentity(fstatSync(parentFd), plan.existingIdentity, "validated write ancestor");
    if (suffix === "") return { createdDirectories, directoryFds, parentFd, parentPath };
    if (suffix === ".." || suffix.startsWith(`..${sep}`)) {
      fail("write parent escaped its validated ancestor");
    }

    for (const component of suffix.split(sep).filter(Boolean)) {
      const current = retainedChildPath(parentFd, parentPath, component);
      let created = false;
      try {
        mkdirSync(current);
        created = true;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail("write parent is not a real directory");
      if (created) {
        createdDirectories.push({ parentFd, parentPath, name: component, identity: fileIdentity(stat) });
      }
      const nextFd = openSync(
        current,
        constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
      );
      directoryFds.push(nextFd);
      assertIdentity(fstatSync(nextFd), fileIdentity(stat), "write parent");
      parentFd = nextFd;
      parentPath = current;
    }
    return { createdDirectories, directoryFds, parentFd, parentPath };
  } catch (error) {
    try { removeCreatedDirectories(createdDirectories); } catch {}
    for (const fd of [...directoryFds].reverse()) {
      try { closeSync(fd); } catch {}
    }
    throw error;
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

async function resolveRipgrep() {
  ripgrepPathPromise ??= (async () => {
    const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
    const manager = await import(pathToFileURL(resolve(dirname(entry), "utils", "tools-manager.js")));
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

export async function executeBoundGrep(binding, params, signal, matcherOptions = resolveRipgrep) {
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
  const resolveMatcher = options.resolveMatcher ?? resolveRipgrep;
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
    if (fileBuffer.length > resourceLimits.maxRetainedFileBytes) {
      fail(`guarded grep file exceeds ${resourceLimits.maxRetainedFileBytes} bytes`);
    }
    const content = fileBuffer.toString("utf8");
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

export function createPathExecutionBinding(plan, limitOverrides) {
  if (!plan || !["read", "edit", "write", "grep", "rg", "find", "ls"].includes(plan.toolName)) {
    fail("invalid execution binding plan");
  }
  const resourceLimits = resolvePathBindingLimits(limitOverrides);

  let fd;
  let created = false;
  let createdDirectories = [];
  let directoryFds = [];
  let boundPath = plan.absolutePath;
  const retainedFiles = [];
  let traversalSnapshotBytes = 0;
  let traversalDirectory = false;
  try {
    if (plan.targetIdentity) {
      fd = openSync(plan.absolutePath, openFlags(plan.toolName));
      const descriptorStat = fstatSync(fd);
      traversalDirectory = ["grep", "rg", "find", "ls"].includes(plan.toolName) && descriptorStat.isDirectory();
      if (!descriptorStat.isFile() && !traversalDirectory) fail("validated target has an unsupported type");
      assertIdentity(descriptorStat, plan.targetIdentity, "validated target");
      if (descriptorStat.isFile() && descriptorStat.nlink > 1) {
        fail("validated target has multiple hard links");
      }
      assertCurrentPath(
        plan.absolutePath,
        plan.canonicalPath,
        plan.targetIdentity,
        "validated target",
      );
      if (traversalDirectory) {
        for (const entry of plan.traversalEntries ?? []) {
          if (retainedFiles.length >= resourceLimits.maxTraversalEntries) {
            fail(`traversal snapshot exceeds ${resourceLimits.maxTraversalEntries} entries`);
          }
          const entryFd = openSync(
            entry.absolutePath,
            constants.O_RDONLY | (entry.isDirectory ? (constants.O_DIRECTORY ?? 0) : 0) |
              (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0) |
              (constants.O_BINARY ?? 0),
          );
          try {
            const stat = fstatSync(entryFd);
            if (entry.isDirectory ? !stat.isDirectory() : !stat.isFile()) {
              fail("validated traversal target has an unsupported type");
            }
            assertIdentity(stat, entry.identity, "validated traversal target");
            if (!entry.isDirectory && stat.nlink > 1) {
              fail("validated traversal target has multiple hard links");
            }
            assertCurrentPath(entry.absolutePath, entry.canonicalPath, entry.identity, "validated traversal target");
            let content;
            if (!entry.isDirectory && ["grep", "rg"].includes(plan.toolName)) {
              assertBoundRegularFile(entryFd, entry.identity, "validated traversal target");
              content = readAll(
                entryFd,
                resourceLimits.maxRetainedFileBytes,
                "retained file",
              );
            }
            const displayPath = entry.displayPath ?? entry.absolutePath;
            traversalSnapshotBytes += Buffer.byteLength(displayPath, "utf8") + 64 +
              (content?.length ?? 0);
            if (traversalSnapshotBytes > resourceLimits.maxTraversalSnapshotBytes) {
              fail(`traversal snapshot exceeds ${resourceLimits.maxTraversalSnapshotBytes} bytes`);
            }
            retainedFiles.push({
              path: displayPath,
              isDirectory: entry.isDirectory,
              content,
            });
            closeSync(entryFd);
          } catch (error) {
            try { closeSync(entryFd); } catch {}
            throw error;
          }
        }
      }
    } else {
      if (plan.toolName !== "write") fail("only writes may bind a missing target");
      const prepared = prepareParent(plan);
      createdDirectories = prepared.createdDirectories;
      directoryFds = prepared.directoryFds;
      boundPath = retainedChildPath(
        prepared.parentFd,
        prepared.parentPath,
        basename(plan.absolutePath),
      );
      try {
        fd = openSync(
          boundPath,
          openFlags("write") | constants.O_CREAT | constants.O_EXCL,
          0o666,
        );
        created = true;
      } catch (error) {
        if (error?.code === "EEXIST") fail("prospective write target appeared after validation");
        throw error;
      }
      const descriptorStat = fstatSync(fd);
      if (!descriptorStat.isFile()) fail("prospective write target is not a regular file");
      if (descriptorStat.nlink > 1) fail("prospective write target has multiple hard links");
      const identity = fileIdentity(descriptorStat);
      const stat = lstatSync(boundPath);
      if (stat.isSymbolicLink()) fail("prospective write target became a symlink after validation");
      assertIdentity(stat, identity, "prospective write target");
    }
  } catch (error) {
    let descriptorIdentity;
    if (fd !== undefined) {
      try {
        descriptorIdentity = fileIdentity(fstatSync(fd));
      } catch {}
      try {
        closeSync(fd);
      } catch {}
    }
    if (created && descriptorIdentity) {
      try {
        removeCreatedFile(boundPath, descriptorIdentity);
      } catch {}
    }
    try {
      removeCreatedDirectories(createdDirectories);
    } catch {}
    for (const directoryFd of [...directoryFds].reverse()) {
      try { closeSync(directoryFd); } catch {}
    }
    throw error;
  }

  const boundStat = fstatSync(fd);
  const descriptorIdentity = fileIdentity(boundStat);
  let released = false;
  let mutated = false;

  const binding = {
    fd,
    toolName: plan.toolName,
    absolutePath: plan.absolutePath,
    resourceLimits,
    files: traversalDirectory
      ? retainedFiles.filter((file) => !file.isDirectory).map((file) => ({
          path: file.path,
          readFile: async () => file.content,
        }))
      : undefined,
    operations: plan.toolName === "read"
      ? {
          access: async () => {},
          readFile: async () => {
            assertBoundRegularFile(fd, descriptorIdentity, "validated read target");
            return readAll(fd);
          },
          detectImageMimeType: async () => {
            assertBoundRegularFile(fd, descriptorIdentity, "validated read target");
            return detectImageMimeType(readPrefix(fd, IMAGE_TYPE_SNIFF_BYTES));
          },
        }
      : plan.toolName === "edit"
        ? {
            access: async () => {},
            readFile: async () => {
              assertBoundRegularFile(fd, descriptorIdentity, "validated edit target");
              return readAll(fd);
            },
            writeFile: async (_path, content) => {
              assertBoundRegularFile(fd, descriptorIdentity, "validated edit target");
              mutated = true;
              writeAll(fd, content);
            },
          }
        : plan.toolName === "write"
          ? {
              mkdir: async () => {},
              writeFile: async (_path, content) => {
                assertBoundRegularFile(fd, descriptorIdentity, "validated write target");
                mutated = true;
                writeAll(fd, content);
              },
            }
          : plan.toolName === "grep" || plan.toolName === "rg"
            ? {
                isDirectory: async () => traversalDirectory,
                readFile: async (path) => {
                  if (!traversalDirectory) {
                    assertBoundRegularFile(fd, descriptorIdentity, "validated grep target");
                    return readAll(
                      fd,
                      resourceLimits.maxRetainedFileBytes,
                      "guarded grep file",
                    ).toString("utf8");
                  }
                  const file = retainedFiles.find((entry) => entry.path === path && !entry.isDirectory);
                  if (!file) fail("path is outside the validated traversal snapshot");
                  return file.content.toString("utf8");
                },
              }
            : plan.toolName === "ls"
              ? {
                  exists: async () => true,
                  stat: async (path) => {
                    if (path === plan.absolutePath) return fstatSync(fd);
                    const entry = retainedFiles.find((candidate) => candidate.path === path);
                    if (!entry) fail("path is outside the validated traversal snapshot");
                    return { isDirectory: () => entry.isDirectory, isFile: () => !entry.isDirectory };
                  },
                  readdir: async () => [...new Set(retainedFiles.map((entry) => {
                    const [name] = relative(plan.absolutePath, entry.path).split(sep);
                    return name;
                  }))],
                }
              : {
                  exists: async () => true,
                  glob: async (pattern, searchPath, options) => {
                    if (!traversalDirectory) fail("validated find target is not a directory");
                    return retainedFiles
                      .filter((entry) => {
                        const path = relative(searchPath, entry.path).split(sep).join("/");
                        const candidate = pattern.includes("/") ? path : basename(path);
                        return path && globMatches(candidate, pattern);
                      })
                      .slice(0, options.limit)
                      .map((entry) => entry.isDirectory ? `${entry.path}${sep}` : entry.path);
                  },
                },
    release() {
      if (released) return;
      released = true;
      const errors = [];
      if (created && !mutated) {
        try {
          const current = fstatSync(fd);
          mutated = current.size !== boundStat.size || current.mtimeMs !== boundStat.mtimeMs;
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        closeSync(fd);
      } catch (error) {
        errors.push(error);
      }
      if (created && !mutated) {
        try {
          removeCreatedFile(boundPath, descriptorIdentity);
          removeCreatedDirectories(createdDirectories);
        } catch (error) {
          errors.push(error);
        }
      }
      for (const directoryFd of [...directoryFds].reverse()) {
        try {
          closeSync(directoryFd);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 1) throw new AggregateError(errors, "PiCM path binding cleanup failed");
      if (errors.length === 1) throw errors[0];
    },
  };

  return binding;
}
