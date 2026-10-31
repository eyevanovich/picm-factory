import { execFile } from "node:child_process";
import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { createMaintenanceConfigStore } from "./maintenance-config-store.ts";
import { normalizePrivacyExcludedPaths, privacyPathMatches } from "./privacy-policy.ts";
import { codedError, errorCode } from "./errors.ts";

const DOCUMENT_LIMIT = 65536;
const POLICY_LIMIT = 262144;
const messages: Record<string, string> = {
  READ_INVALID_REQUEST: "Provide one project-relative Markdown path and optional additive excludedPaths.",
  READ_SETTINGS_FAILED: "Projected settings failed. Restore known-good configuration preserving intended exclusions outside the conversation before retrying.",
  READ_UNSUPPORTED_WORKSPACE: "This helper supports an ordinary Git worktree root with a .git directory and no linked or nested repository on the named path.",
  READ_UNSUPPORTED_CONFIGURATION: "Git configuration or additional ignore policies are outside this helper's supported subset.",
  READ_POLICY_FAILED: "An applicable policy source could not be safely read; no document was returned.",
  READ_EXCLUDED: "The named path is excluded; no document was returned.",
  READ_INVALID_PATH: "Use a regular Markdown file beneath the workspace without metadata paths, symlinks, or hard links.",
  READ_TOO_LARGE: "The named document exceeds the 64 KiB read limit.",
  READ_INVALID_UTF8: "The named document must contain valid UTF-8 text.",
  READ_CHANGED: "Document or policy metadata changed during the operation; no document was returned.",
  READ_FAILED: "The named document could not be read; no document was returned.",
  READ_CANCELLED: "The read was cancelled; no document was returned.",
};

export type NamedDocumentResult = { ok: true; path: string; content: string; bytes: number }
  | { ok: false; code: string; message: string };

function fail(code: string): never {
  throw codedError(code, messages[code]);
}

function request(input: unknown, root: string) {
  try {
    if (Buffer.byteLength(JSON.stringify(input) ?? "") > 65536) fail("READ_INVALID_REQUEST");
  } catch { fail("READ_INVALID_REQUEST"); }
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("READ_INVALID_REQUEST");
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some((key) => !["path", "excludedPaths"].includes(key))) fail("READ_INVALID_REQUEST");
  const name = row.path;
  if (typeof name !== "string" || !name || name.length > 1024 || /[\\\x00-\x1f\x7f]/.test(name)) fail("READ_INVALID_PATH");
  const parts = name.split("/");
  if (isAbsolute(name) || parts.length > 32 || parts.some((part) => !part || part === "." || part === "..")
    || !name.toLowerCase().endsWith(".md")) fail("READ_INVALID_PATH");
  if (parts.some((part) => [".git", ".picm", ".pi"].includes(part.toLowerCase()))) fail("READ_INVALID_PATH");
  let exclusions: string[];
  try {
    if (row.excludedPaths !== undefined && (!Array.isArray(row.excludedPaths) || row.excludedPaths.length > 100
      || row.excludedPaths.some((value) => typeof value !== "string" || value.length > 1024))) fail("READ_INVALID_REQUEST");
    exclusions = normalizePrivacyExcludedPaths(root, row.excludedPaths ?? []);
  } catch { fail("READ_INVALID_REQUEST"); }
  return { name, parts, exclusions };
}

function sensitive(parts: string[]) {
  return parts.some((part) => /^(?:\.env(?:\.|$)|\.ssh$|\.aws$|\.gnupg$|\.azure$|\.kube$|\.netrc(?:\.|$)|\.npmrc(?:\.|$)|secrets?(?:[._-]|$)|credentials?(?:[._-]|$)|private(?:[._-]|$)|confidential(?:[._-]|$)|sensitive(?:[._-]|$)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$))/i.test(part)
    || /(?:^|[._-])(?:private[._-]?key|token|password)(?:[._-]|$)|\.(?:pem|key|p12|pfx)(?:\.|$)/i.test(part));
}

function same(left: Stats | null, right: Stats | null) {
  return left === null || right === null ? left === right
    : left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
      && (left.isDirectory() || (left.nlink === right.nlink && left.size === right.size
        && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs));
}

async function optionalStat(path: string) {
  try { return await lstat(path); } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

export async function readNamedDocument(root: string, input: unknown, signal?: AbortSignal): Promise<NamedDocumentResult> {
  let stage = "READ_FAILED";
  try {
    signal?.throwIfAborted();
    if (typeof root !== "string" || !isAbsolute(root) || /[\x00-\x1f\x7f]/.test(root) || resolve(root) !== await realpath(root)) fail("READ_INVALID_PATH");
    root = resolve(root);
    const snapshots = new Map<string, Stats | null>();
    async function remember(path: string) {
      signal?.throwIfAborted();
      const info = await optionalStat(path);
      if (snapshots.has(path) && !same(snapshots.get(path)!, info)) fail("READ_CHANGED");
      snapshots.set(path, info);
      return info;
    }
    async function revalidate() {
      for (const [path, before] of snapshots) {
        signal?.throwIfAborted();
        if (!same(before, await optionalStat(path))) fail("READ_CHANGED");
      }
    }
    async function noLinks(path: string, code: string) {
      const parent = dirname(path);
      if (parent !== path) await noLinks(parent, code);
      const info = await remember(path);
      if (!info || info.isSymbolicLink() || (path !== parse(path).root && !info.isDirectory())) fail(code);
    }
    async function boundedFile(path: string, limit: number, code: string, optional = false) {
      const before = await remember(path);
      if (!before && optional) return null;
      if (!before?.isFile() || before.nlink !== 1) fail(code);
      await noLinks(dirname(path), code);
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        if (!same(before, await handle.stat())) fail("READ_CHANGED");
        if (before.size > limit) fail(code === "READ_FAILED" ? "READ_TOO_LARGE" : code);
        const buffer = Buffer.alloc(limit + 1);
        let length = 0;
        while (length < buffer.length) {
          signal?.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        if (length > limit) fail(code === "READ_FAILED" ? "READ_TOO_LARGE" : code);
        if (!same(before, await handle.stat())) fail("READ_CHANGED");
        return buffer.subarray(0, length);
      } finally { await handle.close(); }
    }

    stage = "READ_SETTINGS_FAILED";
    await remember(join(root, ".picm"));
    await remember(join(root, ".picm/config.json"));
    const settings = await createMaintenanceConfigStore({ cwd: root }).readSettings();
    if (!settings.ok) fail(stage);
    await revalidate();
    const { name, parts, exclusions } = request(input, root);
    const stored = settings.privacy?.excludedPaths ?? [];
    const candidate = join(root, name);
    // Case-fold exclusions conservatively so casing aliases can't bypass them.
    if (sensitive(parts) || [...stored, ...exclusions].some((excluded) => privacyPathMatches(excluded.normalize("NFC").toLowerCase(), name.normalize("NFC").toLowerCase()))) fail("READ_EXCLUDED");

    stage = "READ_UNSUPPORTED_WORKSPACE";
    if (process.platform === "win32") fail(stage);
    await noLinks(root, stage);
    const gitDirectory = await remember(join(root, ".git"));
    if (!gitDirectory?.isDirectory() || gitDirectory.isSymbolicLink()
      || await remember(join(root, ".git/commondir"))) fail(stage);
    const directories = [root];
    for (const part of parts.slice(0, -1)) {
      const directory = join(directories.at(-1)!, part);
      const info = await remember(directory);
      if (!info?.isDirectory() || info.isSymbolicLink()) fail("READ_INVALID_PATH");
      if (await remember(join(directory, ".git"))) fail(stage);
      directories.push(directory);
    }

    stage = "READ_UNSUPPORTED_CONFIGURATION";
    const overrides = /^(?:GIT_CONFIG(?:_.*)?|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_INDEX_FILE|GIT_CEILING_DIRECTORIES|GIT_DISCOVERY_ACROSS_FILESYSTEM|GIT_NAMESPACE|GIT_EXEC_PATH|RIPGREP_CONFIG_PATH)$/;
    if (Object.keys(process.env).some((key) => overrides.test(key))) fail(stage);
    // Only execution/location variables reach Git; tracing and credential environment don't.
    const env: NodeJS.ProcessEnv = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };
    for (const key of ["PATH", "HOME", "XDG_CONFIG_HOME", "SYSTEMROOT"]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    if (!env.HOME || !isAbsolute(env.HOME) || (env.XDG_CONFIG_HOME && !isAbsolute(env.XDG_CONFIG_HOME))) fail(stage);
    async function git(args: string[], absent = false, stdin?: string): Promise<{ output: string; status: number }> {
      signal?.throwIfAborted();
      return new Promise((done, reject) => {
        const child = execFile("git", ["--no-pager", "--no-optional-locks", ...args], {
          cwd: root, env, signal, timeout: 5000, killSignal: "SIGKILL", maxBuffer: 1048576, encoding: "buffer",
        }, (error, stdout) => {
          if (error && !(absent && error.code === 1)) { reject(codedError(stage, messages[stage])); return; }
          try {
            done({ output: new TextDecoder("utf-8", { fatal: true }).decode(stdout), status: error ? 1 : 0 });
          } catch { reject(codedError(stage, messages[stage])); }
        });
        child.stdin?.end(stdin);
      });
    }
    // Trusted bootstrap: native Git can parse includes/links before we reject them.
    const system = (await git(["var", "GIT_CONFIG_SYSTEM"])).output.replace(/\n$/, "").split("\n");
    const global = (await git(["var", "GIT_CONFIG_GLOBAL"])).output.replace(/\n$/, "").split("\n");
    if (system.length !== 1 || global.length !== 2) fail(stage);
    const configs = [...system, ...global, join(root, ".git/config")];
    stage = "READ_POLICY_FAILED";
    let policyBytes = 0;
    async function policy(path: string) {
      if (!isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path)) fail("READ_UNSUPPORTED_CONFIGURATION");
      if (resolve(path).normalize("NFC").toLowerCase() === candidate.normalize("NFC").toLowerCase()) fail("READ_UNSUPPORTED_CONFIGURATION");
      const bytes = await boundedFile(path, POLICY_LIMIT, "READ_POLICY_FAILED", true);
      policyBytes += bytes?.length ?? 0;
      if (policyBytes > 1048576) fail("READ_POLICY_FAILED");
    }
    for (const path of configs) await policy(path);
    stage = "READ_UNSUPPORTED_CONFIGURATION";
    const keys = (await git(["config", "--no-includes", "--null", "--name-only", "--list"])).output.split("\0");
    if (keys.some((key) => key === "include.path" || /^includeif\..*\.path$/.test(key)
      || ["core.worktree", "extensions.worktreeconfig"].includes(key.toLowerCase()))) fail(stage);
    if ((await git(["rev-parse", "--show-toplevel"])).output.replace(/\n$/, "") !== root
      || (await git(["rev-parse", "--absolute-git-dir"])).output.replace(/\n$/, "") !== join(root, ".git")
      || (await git(["rev-parse", "--is-bare-repository"])).output.trim() !== "false") fail("READ_UNSUPPORTED_WORKSPACE");
    const configured = await git(["config", "--no-includes", "--null", "--path", "--get", "core.excludesfile"], true);
    let globalExclude: string | undefined;
    if (configured.status === 0) {
      if (!configured.output.endsWith("\0")) fail(stage);
      const value = configured.output.slice(0, -1);
      if (value) globalExclude = resolve(root, value);
    } else {
      const home = env.XDG_CONFIG_HOME || (env.HOME ? join(env.HOME, ".config") : undefined);
      if (!home || !isAbsolute(home)) fail(stage);
      globalExclude = join(home, "git/ignore");
    }
    const additional = new Set(directories);
    for (let parent = dirname(root); ; parent = dirname(parent)) {
      additional.add(parent);
      if (parent === dirname(parent)) break;
    }
    for (const directory of additional) {
      for (const basename of [".ignore", ".rgignore"]) {
        if (await remember(join(directory, basename))) fail(stage);
      }
    }
    stage = "READ_POLICY_FAILED";
    for (const directory of directories) await policy(join(directory, ".gitignore"));
    await policy(join(root, ".git/info/exclude"));
    if (globalExclude) await policy(globalExclude);
    await revalidate();
    const ignored = await git(["check-ignore", "--no-index", "--stdin", "-z"], true, `${name}\0`);
    if (ignored.status === 0) fail("READ_EXCLUDED");
    if (ignored.output) fail("READ_POLICY_FAILED");
    await revalidate();

    stage = "READ_FAILED";
    const info = await remember(candidate);
    if (!info?.isFile() || info.nlink !== 1) fail("READ_INVALID_PATH");
    const bytes = (await boundedFile(candidate, DOCUMENT_LIMIT, stage))!;
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail("READ_INVALID_UTF8"); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) fail("READ_INVALID_UTF8");
    await revalidate();
    signal?.throwIfAborted();
    return { ok: true, path: name, content, bytes: bytes.length };
  } catch (error) {
    const code = signal?.aborted ? "READ_CANCELLED" : errorCode(error);
    const safe = code && Object.hasOwn(messages, code) ? code : stage;
    return { ok: false, code: safe, message: messages[safe] };
  }
}
