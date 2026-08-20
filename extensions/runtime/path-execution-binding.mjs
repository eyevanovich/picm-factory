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
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function fail(message) {
  throw new Error(`PICM_PATH_BINDING_FAILED: ${message}`);
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
  return access | (constants.O_NOFOLLOW ?? 0) | (constants.O_BINARY ?? 0);
}

function readAll(fd) {
  const chunks = [];
  let position = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(64 * 1024);
    const bytesRead = readSync(fd, chunk, 0, chunk.length, position);
    if (bytesRead === 0) break;
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

function truncateHead(content, maxBytes = 50 * 1024) {
  const lines = content === "" ? [] : content.split("\n");
  const totalBytes = Buffer.byteLength(content, "utf8");
  if (totalBytes <= maxBytes) {
    return { content, truncated: false, truncatedBy: null, totalLines: lines.length, totalBytes, outputLines: lines.length, outputBytes: totalBytes, lastLinePartial: false, firstLineExceedsLimit: false, maxLines: Number.MAX_SAFE_INTEGER, maxBytes };
  }
  const output = [];
  let bytes = 0;
  for (const line of lines) {
    const next = Buffer.byteLength(line, "utf8") + (output.length ? 1 : 0);
    if (bytes + next > maxBytes) break;
    output.push(line);
    bytes += next;
  }
  const result = output.join("\n");
  return { content: result, truncated: true, truncatedBy: "bytes", totalLines: lines.length, totalBytes, outputLines: output.length, outputBytes: Buffer.byteLength(result, "utf8"), lastLinePartial: false, firstLineExceedsLimit: output.length === 0, maxLines: Number.MAX_SAFE_INTEGER, maxBytes };
}

async function ripgrepMatches(path, args, content, signal, remaining) {
  if (signal?.aborted) throw new Error("Operation aborted");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(path, args, { stdio: ["pipe", "pipe", "pipe"] });
    const matches = [];
    let stdout = "";
    let stderr = "";
    let limited = false;
    let aborted = false;
    let settled = false;
    const settle = (operation) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      operation();
    };
    const stop = () => {
      child.stdin.destroy();
      if (!child.killed) child.kill();
    };
    const abort = () => {
      aborted = true;
      stop();
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      if (limited || settled) return;
      stdout += chunk.toString();
      const records = stdout.split("\n");
      stdout = records.pop() ?? "";
      for (const record of records) {
        if (!record) continue;
        const event = JSON.parse(record);
        if (event.type === "match" && typeof event.data?.line_number === "number") {
          if (matches.length >= remaining) {
            limited = true;
            stop();
            break;
          }
          matches.push(event.data.line_number);
          if (matches.length >= remaining) {
            limited = true;
            stop();
            break;
          }
        }
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdin.on("error", (error) => {
      if (limited || aborted) return;
      settle(() => reject(error));
    });
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (code) => {
      if (aborted || signal?.aborted) return settle(() => reject(new Error("Operation aborted")));
      if (!limited && code !== 0 && code !== 1) {
        return settle(() => reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`)));
      }
      settle(() => resolvePromise({ matches, limited }));
    });
    child.stdin.end(content);
  });
}

export async function executeBoundGrep(binding, params, signal, resolveMatcher = resolveRipgrep) {
  if (signal?.aborted) throw new Error("Operation aborted");
  const {
    pattern,
    glob,
    ignoreCase = false,
    literal = false,
    context = 0,
    limit = 100,
  } = params;
  const files = binding.files ?? [{ path: binding.absolutePath, readFile: binding.operations.readFile }];
  const matches = [];
  const effectiveLimit = Math.max(1, limit);
  const ripgrepPath = await resolveMatcher();
  if (signal?.aborted) throw new Error("Operation aborted");
  for (const file of files) {
    if (signal?.aborted) throw new Error("Operation aborted");
    const fileName = relative(binding.absolutePath, file.path) || basename(file.path);
    if (glob && !globMatches(fileName, glob) && !globMatches(basename(file.path), glob)) continue;
    const content = (await file.readFile()).toString("utf8");
    const args = ["--json", "--line-number", "--color=never"];
    if (ignoreCase) args.push("--ignore-case");
    if (literal) args.push("--fixed-strings");
    args.push("--", pattern, "-");
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const result = await ripgrepMatches(ripgrepPath, args, content, signal, effectiveLimit - matches.length);
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
  let linesTruncated = false;
  const contextSize = Math.max(0, context);
  for (const { fileName, index, lines } of matches) {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(lines.length - 1, index + contextSize);
    for (let current = start; current <= end; current += 1) {
      const separator = current === index ? ":" : "-";
      const shortened = truncateLine(lines[current]);
      if (shortened !== lines[current]) linesTruncated = true;
      output.push(`${fileName}${separator}${current + 1}${separator} ${shortened}`);
    }
  }
  const text = output.join("\n");
  const truncation = truncateHead(text);
  const content = truncation.content;
  const details = {};
  const notices = [];
  if (matches.length >= effectiveLimit) {
    details.matchLimitReached = effectiveLimit;
    notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`);
  }
  if (truncation.truncated) {
    details.truncation = truncation;
    notices.push("50KB limit reached");
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

export function createPathExecutionBinding(plan) {
  if (!plan || !["read", "edit", "write", "grep", "rg", "find", "ls"].includes(plan.toolName)) {
    fail("invalid execution binding plan");
  }

  let fd;
  let created = false;
  let createdDirectories = [];
  let directoryFds = [];
  let boundPath = plan.absolutePath;
  const retainedFiles = [];
  let traversalDirectory = false;
  try {
    if (plan.targetIdentity) {
      fd = openSync(plan.absolutePath, openFlags(plan.toolName));
      const descriptorStat = fstatSync(fd);
      traversalDirectory = ["grep", "rg", "find", "ls"].includes(plan.toolName) && descriptorStat.isDirectory();
      if (!descriptorStat.isFile() && !traversalDirectory) fail("validated target has an unsupported type");
      assertIdentity(descriptorStat, plan.targetIdentity, "validated target");
      assertCurrentPath(
        plan.absolutePath,
        plan.canonicalPath,
        plan.targetIdentity,
        "validated target",
      );
      if (traversalDirectory) {
        for (const entry of plan.traversalEntries ?? []) {
          const entryFd = openSync(
            entry.absolutePath,
            constants.O_RDONLY | (entry.isDirectory ? (constants.O_DIRECTORY ?? 0) : 0) |
              (constants.O_NOFOLLOW ?? 0) | (constants.O_BINARY ?? 0),
          );
          try {
            const stat = fstatSync(entryFd);
            if (entry.isDirectory ? !stat.isDirectory() : !stat.isFile()) {
              fail("validated traversal target has an unsupported type");
            }
            assertIdentity(stat, entry.identity, "validated traversal target");
            assertCurrentPath(entry.absolutePath, entry.canonicalPath, entry.identity, "validated traversal target");
            retainedFiles.push({
              path: entry.displayPath ?? entry.absolutePath,
              isDirectory: entry.isDirectory,
              content: entry.isDirectory || !["grep", "rg"].includes(plan.toolName)
                ? undefined
                : readAll(entryFd),
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
    files: traversalDirectory
      ? retainedFiles.filter((file) => !file.isDirectory).map((file) => ({
          path: file.path,
          readFile: async () => file.content,
        }))
      : undefined,
    operations: plan.toolName === "read"
      ? {
          access: async () => {},
          readFile: async () => readAll(fd),
          detectImageMimeType: async () => detectImageMimeType(readPrefix(fd, IMAGE_TYPE_SNIFF_BYTES)),
        }
      : plan.toolName === "edit"
        ? {
            access: async () => {},
            readFile: async () => readAll(fd),
            writeFile: async (_path, content) => {
              mutated = true;
              writeAll(fd, content);
            },
          }
        : plan.toolName === "write"
          ? {
              mkdir: async () => {},
              writeFile: async (_path, content) => {
                mutated = true;
                writeAll(fd, content);
              },
            }
          : plan.toolName === "grep" || plan.toolName === "rg"
            ? {
                isDirectory: async () => traversalDirectory,
                readFile: async (path) => {
                  if (!traversalDirectory) return readAll(fd).toString("utf8");
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
