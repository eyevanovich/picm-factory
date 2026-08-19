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
import { basename, dirname, join, relative, resolve, sep } from "node:path";

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
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\0")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]")
    .replaceAll("\0", ".*");
  return new RegExp(`^(?:${source})$`).test(fileName);
}

function truncateLine(line, maxLength = 2000) {
  return line.length <= maxLength ? line : `${line.slice(0, maxLength)}…`;
}

export async function executeBoundGrep(binding, params, signal) {
  if (signal?.aborted) throw new Error("Operation aborted");
  const {
    pattern,
    glob,
    ignoreCase = false,
    literal = false,
    context = 0,
    limit = 100,
  } = params;
  const fileName = binding.absolutePath.split(sep).at(-1) ?? binding.absolutePath;
  if (glob && !globMatches(fileName, glob)) {
    return { content: [{ type: "text", text: "No matches found" }], details: undefined };
  }
  let matcher;
  try {
    const expression = literal ? undefined : new RegExp(pattern, ignoreCase ? "i" : "");
    matcher = literal
      ? (line) => ignoreCase
        ? line.toLocaleLowerCase().includes(pattern.toLocaleLowerCase())
        : line.includes(pattern)
      : (line) => expression.test(line);
  } catch (error) {
    throw new Error(`Invalid search pattern: ${error instanceof Error ? error.message : error}`);
  }
  const lines = (await binding.operations.readFile()).toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (signal?.aborted) throw new Error("Operation aborted");
  const matchingLines = [];
  const effectiveLimit = Math.max(1, limit);
  for (let index = 0; index < lines.length; index += 1) {
    if (!matcher(lines[index])) continue;
    matchingLines.push(index);
    if (matchingLines.length >= effectiveLimit) break;
  }
  if (matchingLines.length === 0) {
    return { content: [{ type: "text", text: "No matches found" }], details: undefined };
  }
  const output = [];
  const emitted = new Set();
  const contextSize = Math.max(0, context);
  for (const index of matchingLines) {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(lines.length - 1, index + contextSize);
    for (let current = start; current <= end; current += 1) {
      if (emitted.has(current)) continue;
      emitted.add(current);
      const separator = current === index ? ":" : "-";
      output.push(`${fileName}${separator}${current + 1}${separator} ${truncateLine(lines[current])}`);
    }
  }
  const text = output.join("\n");
  const truncated = Buffer.byteLength(text, "utf8") > 50 * 1024;
  const content = truncated ? Buffer.from(text).subarray(0, 50 * 1024).toString("utf8") : text;
  return {
    content: [{ type: "text", text: truncated ? `${content}\n\n[50KB limit reached]` : content }],
    details: matchingLines.length >= effectiveLimit ? { matchLimitReached: effectiveLimit } : undefined,
  };
}

export function createPathExecutionBinding(plan) {
  if (!plan || !["read", "edit", "write", "grep", "find", "ls"].includes(plan.toolName)) {
    fail("invalid execution binding plan");
  }

  let fd;
  let created = false;
  let createdDirectories = [];
  let directoryFds = [];
  let boundPath = plan.absolutePath;
  try {
    if (plan.targetIdentity) {
      fd = openSync(plan.absolutePath, openFlags(plan.toolName));
      const descriptorStat = fstatSync(fd);
      if (!descriptorStat.isFile()) fail("validated target is not a regular file");
      assertIdentity(descriptorStat, plan.targetIdentity, "validated target");
      assertCurrentPath(
        plan.absolutePath,
        plan.canonicalPath,
        plan.targetIdentity,
        "validated target",
      );
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
        if (error?.code !== "EEXIST") throw error;
        fd = openSync(boundPath, openFlags("write"));
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
          : plan.toolName === "grep"
            ? {
                isDirectory: async () => false,
                readFile: async () => readAll(fd),
              }
            : plan.toolName === "ls"
              ? {
                  exists: async () => true,
                  stat: async () => fstatSync(fd),
                  readdir: async () => fail("validated ls target is not a directory"),
                }
              : {
                  exists: async () => true,
                  glob: async () => fail("validated find target is not a directory"),
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
