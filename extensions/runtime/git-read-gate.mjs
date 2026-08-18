import { execFile } from "node:child_process";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  normalizePrivacyExcludedPaths,
  privacyPathMatches,
} from "./privacy-policy.mjs";

const execFileAsync = promisify(execFile);
const PATH_TOOLS = new Set(["read", "edit", "write", "grep", "find", "ls"]);
const READ_LIKE_TOOLS = new Set(["read", "edit", "grep", "find", "ls"]);
const TRAVERSAL_TOOLS = new Set(["grep", "find", "ls"]);

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

  async function pathKind(path) {
    try {
      const stat = await fs.lstat(path);
      if (stat.isSymbolicLink()) return "symlink";
      if (stat.isFile()) return "file";
      return "other";
    } catch (error) {
      if (error?.code === "ENOENT") return "missing";
      throw error;
    }
  }

  async function preflight() {
    return withOperation(async () => {
      const result = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
      let root;
      let gitRepository;
      let gitInfoExclude = "missing";
      if (result.code === 0) {
        root = await fs.realpath(resolve(result.stdout.trim()));
        gitRepository = true;
        const gitPath = await runGit(cwd, ["rev-parse", "--git-path", "info/exclude"]);
        if (gitPath.code !== 0) {
          throw new Error(`Git exclude discovery failed: ${gitPath.stderr.trim() || `exit ${gitPath.code}`}`);
        }
        gitInfoExclude = await pathKind(resolve(cwd, gitPath.stdout.trim()));
      } else if (/fatal:\s+not a git repository\b/i.test(result.stderr)) {
        root = await fs.realpath(resolve(cwd));
        gitRepository = false;
      } else {
        throw new Error(`Git worktree discovery failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      }
      const rootGitignore = await pathKind(join(root, ".gitignore"));
      return {
        root,
        gitRepository,
        rootGitignore,
        gitInfoExclude,
      };
    });
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

    ignored = new Set([
      ...parseNullList(ignoredOtherResult.stdout),
      ...parseNullList(ignoredCachedResult.stdout),
    ]);
    candidates = new Set(
      [...parseNullList(candidateResult.stdout)].filter((path) => !ignored.has(path)),
    );
    return {
      worktree,
      candidates: new Set(candidates),
      ignored: new Set(ignored),
      isolated: usingIsolatedGit,
    };
  }

  async function inventoryForBoundary(boundaryRoot) {
    const [candidateResult, ignoredOtherResult, ignoredCachedResult] = await Promise.all([
      runGit(boundaryRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]),
      runGit(boundaryRoot, [
        "ls-files",
        "-z",
        "--others",
        "--ignored",
        "--exclude-standard",
        "--directory",
        "--no-empty-directory",
      ]),
      runGit(boundaryRoot, ["ls-files", "-z", "--cached", "--ignored", "--exclude-standard"]),
    ]);
    for (const result of [candidateResult, ignoredOtherResult, ignoredCachedResult]) {
      if (result.code !== 0) {
        throw new Error(`Git inventory failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      }
    }
    const boundaryIgnored = new Set([
      ...parseNullList(ignoredOtherResult.stdout),
      ...parseNullList(ignoredCachedResult.stdout),
    ]);
    return {
      worktree: boundaryRoot,
      candidates: new Set(
        [...parseNullList(candidateResult.stdout)].filter((path) => !boundaryIgnored.has(path)),
      ),
      ignored: boundaryIgnored,
      isolated: false,
    };
  }

  async function boundaryForPath(canonicalPath) {
    if (usingIsolatedGit) return undefined;
    let discoveryCwd = dirname(canonicalPath);
    try {
      const stat = await fs.lstat(canonicalPath);
      if (stat.isDirectory()) discoveryCwd = canonicalPath;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const result = await runGit(discoveryCwd, ["rev-parse", "--show-toplevel"]);
    if (result.code !== 0) return undefined;
    const nestedRoot = await fs.realpath(resolve(result.stdout.trim()));
    if (nestedRoot === canonicalWorktree || !isInside(canonicalWorktree, nestedRoot)) return undefined;
    const parentPath = toGitPath(canonicalWorktree, nestedRoot);
    const gitlink = await runGit(canonicalWorktree, ["ls-files", "--stage", "--", parentPath]);
    if (gitlink.code !== 0 || !/^160000\s/m.test(gitlink.stdout)) return undefined;
    return nestedRoot;
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

  async function resolveExistingPath(inputPath, stripToolPrefix) {
    const path = stripToolPrefix ? stripAtPrefix(inputPath) : inputPath;
    const absolutePath = resolve(cwd, path);
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      return { blocked: true, reason: "symlinks are not readable during guarded scans" };
    }
    const canonicalPath = await fs.realpath(absolutePath);
    return { absolutePath, canonicalPath, stat };
  }

  async function resolveProspectivePath(inputPath, stripToolPrefix) {
    const path = stripToolPrefix ? stripAtPrefix(inputPath) : inputPath;
    const absolutePath = resolve(cwd, path);
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

  async function privacyPathFor(canonicalPath) {
    canonicalCwd ??= await fs.realpath(cwd);
    if (!isInside(canonicalCwd, canonicalPath)) return undefined;
    return toGitPath(canonicalCwd, canonicalPath);
  }

  async function privacyDecision(canonicalPath, exclusions) {
    const privacyPath = await privacyPathFor(canonicalPath);
    if (
      privacyPath !== undefined &&
      exclusions.some((exclusion) => privacyPathMatches(exclusion, privacyPath))
    ) {
      return {
        allowed: false,
        protected: true,
        reason: "path is excluded by PiCM privacy policy",
      };
    }
    return undefined;
  }

  async function filterPrivacyInventory(inventory, exclusions) {
    if (exclusions.length === 0) return inventory;
    canonicalCwd ??= await fs.realpath(cwd);
    const canonicalInventoryRoot = await fs.realpath(inventory.worktree);
    return {
      ...inventory,
      candidates: new Set([...inventory.candidates].filter((candidate) => {
        const absolute = resolve(canonicalInventoryRoot, candidate);
        if (!isInside(canonicalCwd, absolute)) return true;
        const privacyPath = toGitPath(canonicalCwd, absolute);
        return !exclusions.some((exclusion) => privacyPathMatches(exclusion, privacyPath));
      })),
    };
  }

  async function checkPrivacyPath(toolName, inputPath, privacyExcludedPaths = []) {
    if (!PATH_TOOLS.has(toolName) || privacyExcludedPaths.length === 0) {
      return { allowed: true, protected: false };
    }
    const exclusions = normalizePrivacyExcludedPaths(cwd, privacyExcludedPaths);
    if (typeof inputPath !== "string" || inputPath.trim() === "") {
      return { allowed: false, protected: true, reason: `${toolName} requires a path` };
    }
    try {
      const resolvedPath = toolName === "write"
        ? await resolveProspectivePath(inputPath, true)
        : await resolveExistingPath(inputPath, true);
      if (resolvedPath.blocked) {
        return { allowed: false, protected: true, reason: resolvedPath.reason };
      }
      return await privacyDecision(resolvedPath.canonicalPath, exclusions) ?? {
        allowed: true,
        protected: true,
        reason: "path is outside configured PiCM privacy exclusions",
      };
    } catch (error) {
      return {
        allowed: false,
        protected: true,
        reason: `privacy path resolution failed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  async function checkPathUnchecked(
    toolName,
    inputPath,
    { stripToolPrefix = true, privacyExcludedPaths = [] } = {},
  ) {
    if (!PATH_TOOLS.has(toolName)) return { allowed: true, protected: false };
    const exclusions = normalizePrivacyExcludedPaths(cwd, privacyExcludedPaths);
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
        ? await resolveProspectivePath(inputPath, stripToolPrefix)
        : await resolveExistingPath(inputPath, stripToolPrefix);
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

    const privatePath = await privacyDecision(resolvedPath.canonicalPath, exclusions);
    if (privatePath) return privatePath;

    const nestedBoundary = await boundaryForPath(resolvedPath.canonicalPath);
    const boundaryRoot = nestedBoundary ?? canonicalWorktree;
    const gitPath = toGitPath(boundaryRoot, resolvedPath.canonicalPath);
    if (gitPath === ".git" || gitPath.startsWith(".git/")) {
      return { allowed: false, protected: true, reason: ".git internals are not readable" };
    }

    if (nestedBoundary) {
      const parentBoundaryPath = toGitPath(canonicalWorktree, nestedBoundary);
      const parentIgnore = await runWorkspaceGit([
        "check-ignore",
        "--no-index",
        "-q",
        "--",
        parentBoundaryPath,
      ]);
      if (parentIgnore.code === 0) {
        return { allowed: false, protected: true, reason: "submodule boundary is ignored by parent Git worktree" };
      }
      if (parentIgnore.code !== 1) {
        return {
          allowed: false,
          protected: true,
          reason: `Parent Git ignore check was unresolved: ${parentIgnore.stderr.trim() || `exit ${parentIgnore.code}`}`,
        };
      }
    }

    const inventory = await filterPrivacyInventory(
      nestedBoundary
        ? await inventoryForBoundary(nestedBoundary)
        : await refreshInventoryUnchecked(),
      exclusions,
    );
    const ignoreResult = nestedBoundary
      ? await runGit(nestedBoundary, [
        "check-ignore",
        "--no-index",
        "-q",
        "--",
        gitPath,
      ])
      : await runWorkspaceGit([
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
    if (READ_LIKE_TOOLS.has(toolName) && !inventory.candidates.has(gitPath)) {
      return { allowed: false, protected: true, reason: "path is not in the Git-derived candidate inventory" };
    }

    return {
      allowed: true,
      protected: true,
      reason: prospectiveWrite ? "prospective non-ignored write" : "Git candidate",
      inventory,
    };
  }

  async function checkPath(toolName, inputPath, privacyExcludedPaths = []) {
    try {
      return await withOperation(() => checkPathUnchecked(
        toolName,
        inputPath,
        { privacyExcludedPaths },
      ));
    } catch (error) {
      return {
        allowed: false,
        protected: true,
        reason: `Git read gate failed closed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  async function checkBash() {
    return {
      allowed: false,
      protected: true,
      reason: "agent Bash is blocked during active PiCM scan phases",
    };
  }

  async function refreshInventory(inputPath, privacyExcludedPaths = []) {
    return withOperation(async () => {
      const exclusions = normalizePrivacyExcludedPaths(cwd, privacyExcludedPaths);
      const primary = await filterPrivacyInventory(await refreshInventoryUnchecked(), exclusions);
      if (inputPath === undefined) return primary;
      const resolved = await resolveExistingPath(inputPath, true);
      if (resolved.blocked) throw new Error(resolved.reason);
      if (!resolved.stat.isDirectory()) throw new Error("inventory path must be a worktree directory");
      if (!isInside(canonicalWorktree, resolved.canonicalPath)) {
        throw new Error("inventory path is outside the canonical Git worktree");
      }
      canonicalCwd ??= await fs.realpath(cwd);
      const expected = resolve(canonicalCwd, relative(resolve(cwd), resolved.absolutePath));
      if (resolved.canonicalPath !== expected) throw new Error("inventory path traverses a symlink");
      if (resolved.canonicalPath === canonicalWorktree) return primary;
      const nestedBoundary = await boundaryForPath(resolved.canonicalPath);
      if (nestedBoundary !== resolved.canonicalPath) {
        throw new Error("inventory path is not an initialized submodule worktree root");
      }
      const parentBoundaryPath = toGitPath(canonicalWorktree, nestedBoundary);
      const parentIgnore = await runWorkspaceGit([
        "check-ignore",
        "--no-index",
        "-q",
        "--",
        parentBoundaryPath,
      ]);
      if (parentIgnore.code === 0) throw new Error("submodule boundary is ignored by parent Git worktree");
      if (parentIgnore.code !== 1) {
        throw new Error(`Parent Git ignore check was unresolved: ${parentIgnore.stderr.trim() || `exit ${parentIgnore.code}`}`);
      }
      return filterPrivacyInventory(await inventoryForBoundary(nestedBoundary), exclusions);
    });
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

  return {
    checkBash,
    checkPath,
    checkPrivacyPath,
    dispose,
    preflight,
    refreshInventory,
  };
}
