import { execFile } from "node:child_process";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PATH_TOOLS = new Set(["read", "edit", "write", "grep", "find", "ls"]);
const READ_LIKE_TOOLS = new Set(["read", "edit", "grep", "find", "ls"]);
const TRAVERSAL_TOOLS = new Set(["grep", "find", "ls"]);
const STATIC_READ_COMMANDS = new Set(["cat", "head", "tail", "wc", "file", "strings", "less", "more"]);
const READ_LIKE_BASH_COMMANDS = new Set([
  ...STATIC_READ_COMMANDS,
  "awk",
  "grep",
  "rg",
  "ripgrep",
  "sed",
]);
const KNOWN_BASH_BYPASSES = [
  { pattern: /\b(?:rg|ripgrep)\b[^\n;&|]*(?:^|\s)--no-ignore(?:-[a-z-]+)?(?:\s|$)/i, reason: "ignore-disabling search flag" },
  { pattern: /\b(?:rg|ripgrep)\b[^\n;&|]*(?:^|\s)-u{1,3}(?:\s|$)/, reason: "unrestricted search flag" },
  { pattern: /(?:^|[\s;&|/])git(?:\s|$)[^\n;&|]*\b(?:show|cat-file|archive|grep|diff|blame|config)\b/i, reason: "Git object/content or config command" },
  { pattern: /(?:^|[\s;&|/])git(?:\s|$)[^\n;&|]*\blog\b[^\n;&|]*(?:^|\s)(?:-p|--patch)(?:\s|$)/i, reason: "Git patch-content command" },
  { pattern: /(?:^|[\s;&|/])git\s+(?:[^\n;&|]*\s)?-C(?:\s|=|[^\s])/i, reason: "Git worktree switching" },
  { pattern: /(?:^|\s)--(?:git-dir|work-tree)(?:=|\s)/i, reason: "Git worktree override" },
  { pattern: /(?:^|[;|&\s])GIT_(?:DIR|WORK_TREE)\s*=/i, reason: "Git worktree environment override" },
  { pattern: /(?:^|[;&|]\s*|\s)(?:cd|pushd)\s+/i, reason: "shell worktree switching" },
  { pattern: /(?:^|[\s=;|&:(])(?:[^\s;|&]*\/)?\.git(?:\/|:|\s|$)/i, reason: ".git access" },
  { pattern: /\bfind\s+/i, reason: "broad find traversal" },
  { pattern: /\bgrep\b[^\n;&|]*(?:\s-[^\s]*[Rr][^\s]*|\s--recursive)(?:\s|$)/i, reason: "recursive grep traversal" },
];

function normalizeShellLiteralConcatenation(command) {
  let normalized = command.replace(/''|""/g, "");
  for (let previous; normalized !== previous;) {
    previous = normalized;
    normalized = normalized
      .replace(/(['"])(?=[\w./-])/g, "")
      .replace(/(?<=[\w./-])(['"])/g, "");
  }
  return normalized;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
}

function toGitPath(root, path) {
  return relative(root, path).split(sep).join("/") || ".";
}

function parseNullList(output) {
  return new Set(output.split("\0").filter(Boolean));
}

function stripAtPrefix(path) {
  return path.startsWith("@") ? path.slice(1) : path;
}

function parseStaticShellWords(command) {
  const words = [];
  let word = "";
  let quote;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === "\\" && quote !== "'") {
      index += 1;
      if (index >= command.length) return undefined;
      word += command[index];
    } else if (quote) {
      if (character === quote) quote = undefined;
      else if (character === "$" || character === "`") return undefined;
      else word += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "$" || character === "`" || character === "(" || character === ")") {
      return undefined;
    } else if (/\s/.test(character)) {
      if (word) words.push(word);
      word = "";
    } else if (";&|<>".includes(character)) {
      if (word) words.push(word);
      word = "";
      const next = command[index + 1];
      const operator = (character === "&" && next === "&") || (character === "|" && next === "|")
        ? `${character}${next}`
        : character;
      if (operator.length === 2) index += 1;
      words.push(operator);
    } else {
      word += character;
    }
  }
  if (quote) return undefined;
  if (word) words.push(word);
  return words;
}

function staticReadPaths(command) {
  const words = parseStaticShellWords(command);
  if (!words) {
    const readLike = /\b(?:awk|cat|file|grep|head|less|more|rg|ripgrep|sed|strings|tail|wc)\b/.test(command);
    return { readLike, unresolved: readLike };
  }

  const paths = [];
  let readLike = false;
  for (let index = 0; index < words.length;) {
    while ([";", "&&", "||", "|"].includes(words[index])) index += 1;
    const executable = words[index]?.split("/").at(-1);
    if (!executable) break;
    index += 1;
    const argumentsForCommand = [];
    while (index < words.length && ![";", "&&", "||", "|"].includes(words[index])) {
      argumentsForCommand.push(words[index]);
      index += 1;
    }
    if (!READ_LIKE_BASH_COMMANDS.has(executable)) continue;
    readLike = true;
    if (!STATIC_READ_COMMANDS.has(executable)) return { readLike, unresolved: true };
    let acceptsOptionValue = false;
    for (const argument of argumentsForCommand) {
      if (argument === "<" || argument === ">" || argument === ">>") return { readLike, unresolved: true };
      if (acceptsOptionValue) {
        acceptsOptionValue = false;
        continue;
      }
      if (argument === "--") continue;
      if (argument.startsWith("-")) {
        acceptsOptionValue = ["-n", "-c", "--lines", "--bytes"].includes(argument);
        continue;
      }
      paths.push(argument);
    }
  }
  return { readLike, paths, unresolved: readLike && paths.length === 0 };
}

async function defaultRunGit(cwd, args) {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (typeof error?.code === "number") {
      return {
        code: error.code,
        stdout: typeof error.stdout === "string" ? error.stdout : "",
        stderr: typeof error.stderr === "string" ? error.stderr : "",
      };
    }
    throw error;
  }
}

export function packageRootFromImportMeta(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

export function createGitReadGate({
  cwd,
  packageRoot,
  runGit = defaultRunGit,
  fs = { lstat, realpath, mkdtemp, rm },
} = {}) {
  if (!cwd) throw new Error("Git read gate requires cwd");
  if (!packageRoot) throw new Error("Git read gate requires packageRoot");

  let worktree;
  let canonicalWorktree;
  let canonicalCwd;
  let canonicalPackageRoot;
  let isolatedGitRoot;
  let isolatedGitDir;
  let isolatedGitInit;
  let usingIsolatedGit = false;
  let disposed = false;
  let activeOperations = 0;
  let operationIdle;
  let resolveOperationIdle;
  let candidates = new Set();
  let ignored = new Set();

  async function withOperation(operation) {
    if (disposed) throw new Error("Git read gate is disposed");
    activeOperations += 1;
    try {
      return await operation();
    } finally {
      activeOperations -= 1;
      if (activeOperations === 0 && resolveOperationIdle) {
        resolveOperationIdle();
        operationIdle = undefined;
        resolveOperationIdle = undefined;
      }
    }
  }

  async function ensureIsolatedGit() {
    if (isolatedGitDir) return isolatedGitDir;
    isolatedGitInit ??= (async () => {
      const root = await fs.mkdtemp(join(tmpdir(), "picm-git-read-gate-"));
      const gitDir = join(root, "repo.git");
      try {
        const result = await runGit(cwd, ["init", "--bare", "--quiet", gitDir]);
        if (result.code !== 0) {
          throw new Error(`Isolated Git initialization failed: ${result.stderr.trim() || `exit ${result.code}`}`);
        }
        isolatedGitRoot = root;
        isolatedGitDir = gitDir;
        return gitDir;
      } catch (error) {
        await fs.rm(root, { recursive: true, force: true });
        throw error;
      }
    })();
    try {
      return await isolatedGitInit;
    } finally {
      isolatedGitInit = undefined;
    }
  }

  async function runWorkspaceGit(args) {
    if (!usingIsolatedGit) return runGit(worktree, args);
    const gitDir = await ensureIsolatedGit();
    return runGit(worktree, ["--git-dir", gitDir, "--work-tree", worktree, ...args]);
  }

  async function discoverWorktree() {
    const result = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
    if (result.code !== 0) {
      if (/fatal:\s+not a git repository\b/i.test(result.stderr)) {
        worktree = resolve(cwd);
        canonicalWorktree = await fs.realpath(worktree);
        usingIsolatedGit = true;
        await ensureIsolatedGit();
        return true;
      }
      throw new Error(`Git worktree discovery failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    }

    const discoveredRoot = result.stdout.trim();
    if (!discoveredRoot) {
      throw new Error("Git worktree discovery returned an empty root");
    }
    worktree = resolve(discoveredRoot);
    canonicalWorktree = await fs.realpath(worktree);
    usingIsolatedGit = false;
    return true;
  }

  async function refreshInventoryUnchecked() {
    await discoverWorktree();

    const [candidateResult, ignoredOtherResult, ignoredCachedResult] = await Promise.all([
      runWorkspaceGit(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]),
      runWorkspaceGit([
        "ls-files",
        "-z",
        "--others",
        "--ignored",
        "--exclude-standard",
        "--directory",
        "--no-empty-directory",
      ]),
      runWorkspaceGit(["ls-files", "-z", "--cached", "--ignored", "--exclude-standard"]),
    ]);
    for (const result of [candidateResult, ignoredOtherResult, ignoredCachedResult]) {
      if (result.code !== 0) {
        throw new Error(`Git inventory failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      }
    }

    candidates = parseNullList(candidateResult.stdout);
    ignored = new Set([
      ...parseNullList(ignoredOtherResult.stdout),
      ...parseNullList(ignoredCachedResult.stdout),
    ]);
    return {
      worktree,
      candidates: new Set(candidates),
      ignored: new Set(ignored),
      isolated: usingIsolatedGit,
    };
  }

  async function isTrustedPackageRead(path, toolName) {
    if (toolName !== "read") return false;
    canonicalPackageRoot ??= await fs.realpath(packageRoot);

    let canonicalPath;
    try {
      canonicalPath = await fs.realpath(path);
    } catch {
      return false;
    }
    if (!isInside(canonicalPackageRoot, canonicalPath)) return false;

    const packagePath = toGitPath(canonicalPackageRoot, canonicalPath);
    return (
      packagePath === "skills/picm-factory/SKILL.md" ||
      packagePath.startsWith("skills/picm-factory/references/") ||
      packagePath.startsWith("skills/picm-factory/templates/")
    );
  }

  async function resolveExistingPath(inputPath) {
    const absolutePath = resolve(cwd, stripAtPrefix(inputPath));
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      return { blocked: true, reason: "symlinks are not readable during guarded scans" };
    }
    const canonicalPath = await fs.realpath(absolutePath);
    return { absolutePath, canonicalPath, stat };
  }

  async function resolveProspectivePath(inputPath) {
    const absolutePath = resolve(cwd, stripAtPrefix(inputPath));
    let existing = absolutePath;
    while (true) {
      try {
        const stat = await fs.lstat(existing);
        if (stat.isSymbolicLink()) {
          return { blocked: true, reason: "symlink targets are not writable during guarded scans" };
        }
        const canonicalExisting = await fs.realpath(existing);
        const suffix = relative(existing, absolutePath);
        return {
          absolutePath,
          canonicalPath: resolve(canonicalExisting, suffix),
          stat: existing === absolutePath ? stat : undefined,
        };
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        const parent = dirname(existing);
        if (parent === existing) throw error;
        existing = parent;
      }
    }
  }

  async function checkPathUnchecked(toolName, inputPath) {
    if (!PATH_TOOLS.has(toolName)) return { allowed: true, protected: false };
    await discoverWorktree();
    if (typeof inputPath !== "string" || inputPath.trim() === "") {
      if (TRAVERSAL_TOOLS.has(toolName)) {
        return { allowed: false, protected: true, reason: `${toolName} requires a guarded file path` };
      }
      return { allowed: false, protected: true, reason: `${toolName} requires a path` };
    }

    const prospectiveWrite = toolName === "write";
    let resolvedPath;
    try {
      resolvedPath = prospectiveWrite
        ? await resolveProspectivePath(inputPath)
        : await resolveExistingPath(inputPath);
    } catch (error) {
      return {
        allowed: false,
        protected: true,
        reason: `path resolution failed: ${error instanceof Error ? error.message : error}`,
      };
    }
    if (resolvedPath.blocked) {
      return { allowed: false, protected: true, reason: resolvedPath.reason };
    }

    if (await isTrustedPackageRead(resolvedPath.canonicalPath, toolName)) {
      return { allowed: true, protected: true, reason: "trusted packaged PiCM resource" };
    }

    if (!isInside(canonicalWorktree, resolvedPath.canonicalPath)) {
      return { allowed: false, protected: true, reason: "path is outside the canonical Git worktree" };
    }

    canonicalCwd ??= await fs.realpath(cwd);
    const expectedCanonicalPath = resolve(
      canonicalCwd,
      relative(resolve(cwd), resolvedPath.absolutePath),
    );
    if (resolvedPath.canonicalPath !== expectedCanonicalPath) {
      return { allowed: false, protected: true, reason: "path traverses a symlink" };
    }

    const gitPath = toGitPath(canonicalWorktree, resolvedPath.canonicalPath);
    if (gitPath === ".git" || gitPath.startsWith(".git/")) {
      return { allowed: false, protected: true, reason: ".git internals are not readable" };
    }

    const inventory = await refreshInventoryUnchecked();
    const ignoreResult = await runWorkspaceGit([
      "check-ignore",
      "--no-index",
      "-q",
      "--",
      gitPath,
    ]);
    if (ignoreResult.code === 0) {
      return { allowed: false, protected: true, reason: "path is ignored by Git" };
    }
    if (ignoreResult.code !== 1) {
      return {
        allowed: false,
        protected: true,
        reason: `Git ignore check was unresolved: ${ignoreResult.stderr.trim() || `exit ${ignoreResult.code}`}`,
      };
    }

    if (TRAVERSAL_TOOLS.has(toolName) && resolvedPath.stat?.isDirectory()) {
      return {
        allowed: false,
        protected: true,
        reason: `${toolName} directory traversal is blocked; inspect Git-derived candidate files instead`,
      };
    }
    if (READ_LIKE_TOOLS.has(toolName) && !candidates.has(gitPath)) {
      return { allowed: false, protected: true, reason: "path is not in the Git-derived candidate inventory" };
    }

    return {
      allowed: true,
      protected: true,
      reason: prospectiveWrite ? "prospective non-ignored write" : "Git candidate",
      inventory,
    };
  }

  async function checkPath(toolName, inputPath) {
    try {
      return await withOperation(() => checkPathUnchecked(toolName, inputPath));
    } catch (error) {
      return {
        allowed: false,
        protected: true,
        reason: `Git read gate failed closed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  function commandReferencesIgnoredPath(command) {
    if (!worktree) return undefined;
    for (const gitPath of ignored) {
      const trimmedPath = gitPath.endsWith("/") ? gitPath.slice(0, -1) : gitPath;
      const forms = [gitPath, trimmedPath, `./${gitPath}`, `./${trimmedPath}`];
      if (canonicalWorktree) {
        forms.push(resolve(canonicalWorktree, trimmedPath));
      }
      const match = forms.find((form) => form && command.includes(form));
      if (match) return gitPath;
    }
    return undefined;
  }

  async function checkBash(command) {
    if (typeof command !== "string") {
      return { allowed: false, protected: true, reason: "bash command is missing" };
    }
    try {
      return await withOperation(async () => {
        await refreshInventoryUnchecked();

        const normalizedCommand = normalizeShellLiteralConcatenation(command);
        const bypass = KNOWN_BASH_BYPASSES.find(({ pattern }) => pattern.test(normalizedCommand));
        if (bypass) {
          return { allowed: false, protected: true, reason: `blocked ${bypass.reason}` };
        }
        const ignoredPath = commandReferencesIgnoredPath(normalizedCommand);
        if (ignoredPath) {
          return {
            allowed: false,
            protected: true,
            reason: `command references Git-ignored inventory path: ${ignoredPath}`,
          };
        }
        const staticReads = staticReadPaths(normalizedCommand);
        if (staticReads.readLike) {
          if (staticReads.unresolved) {
            return {
              allowed: false,
              protected: true,
              reason: "read-like Bash command could not be deterministically validated",
            };
          }
          for (const path of staticReads.paths) {
            const decision = await checkPathUnchecked("read", path);
            if (!decision.allowed) {
              return {
                allowed: false,
                protected: true,
                reason: `read-like Bash path ${path} is blocked: ${decision.reason}`,
              };
            }
          }
          return { allowed: true, protected: true, reason: "static Bash read paths are Git candidates" };
        }
        return { allowed: true, protected: true, reason: "no static read-like path requires validation" };
      });
    } catch (error) {
      return {
        allowed: false,
        protected: true,
        reason: `Git read gate failed closed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  async function refreshInventory() {
    return withOperation(refreshInventoryUnchecked);
  }

  async function dispose() {
    disposed = true;
    if (activeOperations > 0) {
      operationIdle ??= new Promise((resolveIdle) => {
        resolveOperationIdle = resolveIdle;
      });
      await operationIdle;
    }
    const root = isolatedGitRoot;
    isolatedGitRoot = undefined;
    isolatedGitDir = undefined;
    isolatedGitInit = undefined;
    if (root) await fs.rm(root, { recursive: true, force: true });
  }

  return { checkBash, checkPath, dispose, refreshInventory };
}
