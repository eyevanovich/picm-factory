import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  access as accessFile,
  mkdir as mkdirDirectory,
  readFile as readFileAsync,
  writeFile as writeFileAsync,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import picmFactoryExtension from "../extensions/picm-factory.ts";
import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";
import { createPolicy } from "../extensions/runtime/maintenance-policy.mjs";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function write(path, content = "fixture\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "picm-gate-test-"));
  git(root, "init", "-q");
  write(
    join(root, ".gitignore"),
    [".env", ".env.*", "secrets/", "*.pem", ".pi/npm/", ""].join("\n"),
  );
  write(join(root, "safe.txt"), "safe\n");
  write(join(root, "docs", "guide.md"), "guide\n");
  write(join(root, "safe-dir", "file.txt"), "safe nested\n");
  write(join(root, ".env"), "SYNTHETIC_ONLY=ignored\n");
  write(join(root, ".env.tracked"), "SYNTHETIC_TRACKED=ignored\n");
  write(join(root, "secrets", "key.txt"), "synthetic ignored\n");
  git(root, "add", ".gitignore", "safe.txt", "docs/guide.md", "safe-dir/file.txt");
  git(root, "add", "-f", ".env.tracked");

  const packageRoot = join(
    root,
    ".pi",
    "npm",
    "node_modules",
    "@eyevanovich",
    "picm-factory",
  );
  write(join(packageRoot, "skills", "picm-factory", "SKILL.md"), "---\nname: picm-factory\n---\n");
  write(join(packageRoot, "skills", "picm-factory", "references", "guide.md"));
  write(join(dirname(packageRoot), "neighbor", "README.md"), "not trusted\n");

  if (process.platform !== "win32") {
    symlinkSync("safe.txt", join(root, "safe-link"));
    symlinkSync(".env", join(root, "ignored-target-link"));
    symlinkSync("safe-dir", join(root, "safe-dir-link"));
    symlinkSync(".env", join(root, "@safe.txt"));
  }

  return { root, packageRoot };
}

async function withFixture(run) {
  const fixture = createFixture();
  try {
    await run(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function extensionHarness({ entries = [], sendError, confirm = true } = {}) {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message) {
      if (sendError) throw sendError;
      sent.push(message);
    },
  };
  picmFactoryExtension(pi);
  const context = (cwd, sessionId = "session-1", mode = "tui") => ({
    cwd,
    mode,
    hasUI: false,
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
      getSessionId: () => sessionId,
    },
    ui: {
      notify() {},
      select: async (_title, items) => items[0],
      confirm: async (...args) => typeof confirm === "function" ? confirm(...args) : confirm,
    },
  });
  return { handlers, commands, tools, sent, context };
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function preflightParallelToolCalls(h, ctx, calls) {
  const prepared = [];
  for (const call of calls) {
    const lifecycle = {
      toolCallId: call.id,
      toolName: call.toolName,
      args: call.input,
    };
    await h.handlers.get("tool_execution_start")?.(lifecycle, ctx);
    const blocked = await h.handlers.get("tool_call")(
      {
        toolCallId: call.id,
        toolName: call.toolName,
        input: call.input,
      },
      ctx,
    );
    if (blocked?.block) {
      const result = {
        content: [{ type: "text", text: blocked.reason ?? "Tool execution was blocked" }],
        details: {},
      };
      await h.handlers.get("tool_execution_end")?.(
        { ...lifecycle, result, isError: true },
        ctx,
      );
      prepared.push({ ...call, blocked, result, isError: true });
    } else {
      prepared.push({ ...call, blocked: undefined });
    }
  }
  return prepared;
}

function executePreflightedToolCalls(h, ctx, calls, timeline = []) {
  return calls.map(async (call) => {
    if (call.blocked) return call;
    let result;
    let isError = false;
    try {
      result = await call.tool.execute(
        call.id,
        call.input,
        call.signal,
        undefined,
        ctx,
      );
    } catch (error) {
      isError = true;
      result = {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        details: {},
      };
    }
    timeline.push(`result:${call.id}`);
    await h.handlers.get("tool_execution_end")?.(
      {
        toolCallId: call.id,
        toolName: call.toolName,
        result,
        isError,
      },
      ctx,
    );
    return { ...call, result, isError };
  });
}

async function promiseSettled(promise) {
  return Promise.race([
    promise.then(() => true, () => true),
    new Promise((resolvePromise) => setImmediate(() => resolvePromise(false))),
  ]);
}

test("allows Git candidates and blocks ignored, tracked-ignored, internal, and outside reads", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });

    assert.equal((await gate.checkPath("read", "safe.txt")).allowed, true);
    assert.match((await gate.checkPath("read", ".env")).reason, /ignored by Git/);
    assert.match((await gate.checkPath("read", ".env.tracked")).reason, /ignored by Git/);
    assert.match((await gate.checkPath("read", ".git/config")).reason, /\.git internals/);
    assert.match((await gate.checkPath("read", "docs")).reason, /candidate inventory/);

    const outside = join(dirname(root), `outside-${Date.now()}.txt`);
    write(outside, "outside\n");
    try {
      assert.match((await gate.checkPath("read", outside)).reason, /outside the canonical Git worktree/);
    } finally {
      rmSync(outside, { force: true });
    }

    if (process.platform !== "win32") {
      assert.match((await gate.checkPath("read", "safe-link")).reason, /symlinks/);
      assert.match((await gate.checkPath("read", "ignored-target-link")).reason, /symlinks/);
      assert.match((await gate.checkPath("read", "safe-dir-link/file.txt")).reason, /symlink/);
    }
  });
});

test("honors repository-local info/exclude for tracked and untracked paths", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-info-exclude-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  write(join(root, "safe.txt"));
  write(join(root, "local-secret.txt"));
  write(join(root, "tracked-secret.txt"));
  git(root, "add", "tracked-secret.txt");
  write(join(root, ".git", "info", "exclude"), "local-secret.txt\ntracked-secret.txt\n");
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());

  const preflight = await gate.preflight();
  assert.equal(preflight.gitRepository, true);
  assert.equal(preflight.rootGitignore, "missing");
  assert.equal(preflight.gitInfoExclude, "file");
  const inventory = await gate.refreshInventory();
  assert.equal(inventory.candidates.has("safe.txt"), true);
  assert.equal(inventory.candidates.has("local-secret.txt"), false);
  assert.equal(inventory.candidates.has("tracked-secret.txt"), false);
  assert.match((await gate.checkPath("read", "local-secret.txt")).reason, /ignored by Git/);
  assert.match((await gate.checkPath("read", "tracked-secret.txt")).reason, /ignored by Git/);
});

test("filters and immediately blocks persisted or session privacy exclusions", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    write(join(root, "private", "nested", "secret.txt"));
    write(join(root, "private-note.txt"));
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const exclusions = ["private"];

    const inventory = await gate.refreshInventory(undefined, exclusions);
    assert.equal(inventory.candidates.has("private/nested/secret.txt"), false);
    assert.equal(inventory.candidates.has("private-note.txt"), true);
    assert.match(
      (await gate.checkPath("read", "private/nested/secret.txt", exclusions)).reason,
      /PiCM privacy policy/,
    );
    assert.equal((await gate.checkPath("read", "private-note.txt", exclusions)).allowed, true);
    assert.match(
      (await gate.checkPrivacyPath("read", "private/nested/secret.txt", exclusions)).reason,
      /PiCM privacy policy/,
    );
  });
});

test("preflight detects a non-Git workspace without creating isolated metadata", async () => {
  const root = resolve("/virtual/non-git-preflight");
  let createdTemporaryGit = false;
  const missing = () => {
    const error = new Error("missing");
    error.code = "ENOENT";
    throw error;
  };
  const gate = createGitReadGate({
    cwd: root,
    packageRoot: "/virtual/package",
    runGit: async (_cwd, args) => args[0] === "rev-parse"
      ? { code: 128, stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git" }
      : { code: 0, stdout: "", stderr: "" },
    fs: {
      lstat: async () => missing(),
      mkdtemp: async () => { createdTemporaryGit = true; return "/virtual/temp"; },
      realpath: async (path) => path,
      rm: async () => {},
    },
  });

  assert.deepEqual(await gate.preflight(), {
    root,
    gitRepository: false,
    rootGitignore: "missing",
    gitInfoExclude: "missing",
  });
  assert.equal(createdTemporaryGit, false);
  await gate.dispose();
});

test("allows safe prospective writes and blocks ignored prospective writes and traversal", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });

    assert.equal((await gate.checkPath("write", "output/new.md")).allowed, true);
    assert.match((await gate.checkPath("write", "secrets/new.md")).reason, /ignored by Git/);
    assert.match((await gate.checkPath("grep", ".")).reason, /directory traversal is blocked/);
    assert.match((await gate.checkPath("find", undefined)).reason, /guarded file path/);
  });
});

test("allows only canonical shipped PiCM skill resources from the package root", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const skill = join(packageRoot, "skills", "picm-factory", "SKILL.md");
    const reference = join(
      packageRoot,
      "skills",
      "picm-factory",
      "references",
      "guide.md",
    );
    const neighbor = join(dirname(packageRoot), "neighbor", "README.md");

    assert.equal((await gate.checkPath("read", skill)).allowed, true);
    assert.equal((await gate.checkPath("read", reference)).allowed, true);
    assert.match((await gate.checkPath("read", neighbor)).reason, /ignored by Git/);
    assert.match((await gate.checkPath("edit", skill)).reason, /ignored by Git|outside/);
  });
});

test("blocks every agent Bash command presented to an active gate", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });

    for (const command of [
      "git status --short",
      "cat safe.txt",
      "PATH=./tools cat safe.txt",
      "LESSOPEN='|cat ../outside.txt' less safe.txt",
      'part=env; cat ".${part}"',
    ]) {
      const decision = await gate.checkBash(command);
      assert.equal(decision.allowed, false);
      assert.match(decision.reason, /agent Bash is blocked/);
    }
    if (process.platform !== "win32") assert.equal((await gate.checkPath("read", "@safe.txt")).allowed, true);
  });
});

test("uses isolated Git metadata to honor gitignore without modifying a non-Git workspace", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-isolated-git-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(join(root, ".gitignore"), "ignored.txt\nnested/*.log\n");
  write(join(root, "safe.txt"));
  write(join(root, "ignored.txt"));
  write(join(root, "nested", ".gitignore"), "!keep.log\n");
  write(join(root, "nested", "drop.log"));
  write(join(root, "nested", "keep.log"));
  write(join(root, "config-private.txt"));
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());

  const inventory = await gate.refreshInventory(undefined, ["config-private.txt"]);
  assert.equal(inventory.isolated, true);
  assert.equal(inventory.candidates.has("safe.txt"), true);
  assert.equal(inventory.candidates.has("nested/keep.log"), true);
  assert.equal(inventory.candidates.has("config-private.txt"), false);
  assert.equal((await gate.checkPath("read", "safe.txt")).allowed, true);
  assert.equal((await gate.checkPath("read", "nested/keep.log")).allowed, true);
  assert.match((await gate.checkPath("read", "ignored.txt")).reason, /ignored by Git/);
  assert.match((await gate.checkPath("read", "nested/drop.log")).reason, /ignored by Git/);
  assert.equal(existsSync(join(root, ".git")), false);
});

test("treats present submodules as separate guarded worktrees", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-submodule-parent-"));
  const source = mkdtempSync(join(tmpdir(), "picm-submodule-source-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  t.after(() => rmSync(source, { recursive: true, force: true }));

  git(source, "init", "-q");
  write(join(source, ".gitignore"), "secret.txt\n");
  write(join(source, "safe.txt"), "safe\n");
  write(join(source, "secret.txt"), "synthetic ignored\n");
  git(source, "add", ".gitignore", "safe.txt");
  git(source, "add", "-f", "secret.txt");
  git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");

  git(root, "init", "-q");
  git(root, "-c", "protocol.file.allow=always", "submodule", "add", "-q", source, "vendor/lib");
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());

  assert.equal((await gate.checkPath("read", "vendor/lib/safe.txt")).allowed, true);
  assert.match((await gate.checkPath("read", "vendor/lib/secret.txt")).reason, /ignored by Git/);
  assert.match((await gate.checkPath("read", "vendor/lib/.git")).reason, /\.git internals/);
  const inventory = await gate.refreshInventory("vendor/lib");
  assert.equal(inventory.worktree.endsWith("/vendor/lib"), true);
  assert.equal(inventory.candidates.has("safe.txt"), true);
  assert.equal(inventory.candidates.has("secret.txt"), false);
  write(join(root, ".gitignore"), "vendor/lib/\n");
  assert.match((await gate.checkPath("read", "vendor/lib/safe.txt")).reason, /ignored by parent/);
});

test("isolated Git metadata is removed by gate disposal", async () => {
  const root = resolve("/virtual/non-git-workspace");
  const calls = [];
  const removals = [];
  const runGit = async (_cwd, args) => {
    calls.push(args);
    if (args[0] === "rev-parse") {
      return { code: 128, stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const fs = {
    lstat: async () => ({ isSymbolicLink: () => false, isDirectory: () => false }),
    mkdtemp: async () => "/virtual/tmp/picm-git-read-gate-fixture",
    realpath: async (path) => path,
    rm: async (path, options) => { removals.push({ path, options }); },
  };
  const gate = createGitReadGate({ cwd: root, packageRoot: "/virtual/package", runGit, fs });

  const inventory = await gate.refreshInventory();
  assert.equal(inventory.isolated, true);
  assert.equal(calls.some((args) => args[0] === "init" && args.includes("--bare")), true);
  assert.equal(calls.some((args) => args.includes("--work-tree") && args.includes(root)), true);
  await gate.dispose();
  assert.deepEqual(removals, [{
    path: "/virtual/tmp/picm-git-read-gate-fixture",
    options: { recursive: true, force: true },
  }]);
});

test("gate disposal waits for in-flight isolated Git operations", async () => {
  const root = resolve("/virtual/non-git-concurrent-disposal");
  const removals = [];
  let releaseInventory;
  const inventoryReleased = new Promise((resolveRelease) => {
    releaseInventory = resolveRelease;
  });
  let markInventoryStarted;
  const inventoryStarted = new Promise((resolveStarted) => {
    markInventoryStarted = resolveStarted;
  });
  let blockedInventory = false;
  const runGit = async (_cwd, args) => {
    if (args[0] === "rev-parse") {
      return { code: 128, stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git" };
    }
    if (args.includes("ls-files") && !blockedInventory) {
      blockedInventory = true;
      markInventoryStarted();
      await inventoryReleased;
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const fs = {
    lstat: async () => ({ isSymbolicLink: () => false, isDirectory: () => false }),
    mkdtemp: async () => "/virtual/tmp/picm-git-read-gate-concurrent",
    realpath: async (path) => path,
    rm: async (path, options) => { removals.push({ path, options }); },
  };
  const gate = createGitReadGate({ cwd: root, packageRoot: "/virtual/package", runGit, fs });

  const refresh = gate.refreshInventory();
  await inventoryStarted;
  const disposal = gate.dispose();
  await Promise.resolve();
  assert.equal(removals.length, 0);
  releaseInventory();
  await refresh;
  await disposal;
  assert.equal(removals.length, 1);
  await assert.rejects(gate.refreshInventory(), /disposed/);
});

test("isolated Git initialization failure cleans up and fails closed", async () => {
  const root = resolve("/virtual/non-git-init-failure");
  const removals = [];
  const runGit = async (_cwd, args) => {
    if (args[0] === "rev-parse") {
      return { code: 128, stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git" };
    }
    throw new Error("git executable unavailable");
  };
  const fs = {
    lstat: async () => ({ isSymbolicLink: () => false, isDirectory: () => false }),
    mkdtemp: async () => "/virtual/tmp/picm-git-read-gate-failed",
    realpath: async (path) => path,
    rm: async (path, options) => { removals.push({ path, options }); },
  };
  const gate = createGitReadGate({ cwd: root, packageRoot: "/virtual/package", runGit, fs });

  const decision = await gate.checkPath("read", "safe.txt");
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /git executable unavailable/);
  assert.deepEqual(removals, [{
    path: "/virtual/tmp/picm-git-read-gate-failed",
    options: { recursive: true, force: true },
  }]);
});

test("fails closed when Git worktree discovery fails generically or throws", async () => {
  const root = resolve("/virtual/repo");
  const fs = {
    lstat: async () => ({ isSymbolicLink: () => false, isDirectory: () => false }),
    realpath: async (path) => path,
  };
  const failedGate = createGitReadGate({
    cwd: root,
    packageRoot: "/virtual/package",
    runGit: async () => ({ code: 128, stdout: "", stderr: "fatal: permission denied" }),
    fs,
  });
  const thrownGate = createGitReadGate({
    cwd: root,
    packageRoot: "/virtual/package",
    runGit: async () => {
      throw new Error("git executable missing");
    },
    fs,
  });

  const failed = await failedGate.checkPath("read", "safe.txt");
  assert.equal(failed.allowed, false);
  assert.match(failed.reason, /permission denied/);

  const thrown = await thrownGate.checkPath("read", "safe.txt");
  assert.equal(thrown.allowed, false);
  assert.match(thrown.reason, /git executable missing/);
});

test("fails closed when an in-memory Git ignore adapter cannot resolve a check", async () => {
  const root = resolve("/virtual/repo");
  const calls = [];
  const runGit = async (_cwd, args) => {
    calls.push(args);
    if (args[0] === "rev-parse") return { code: 0, stdout: `${root}\n`, stderr: "" };
    if (args[0] === "check-ignore") return { code: 2, stdout: "", stderr: "synthetic failure" };
    return { code: 0, stdout: "safe.txt\0", stderr: "" };
  };
  const fs = {
    lstat: async () => ({ isSymbolicLink: () => false, isDirectory: () => false }),
    realpath: async (path) => path,
  };
  const gate = createGitReadGate({
    cwd: root,
    packageRoot: "/virtual/package",
    runGit,
    fs,
  });

  const decision = await gate.checkPath("read", "safe.txt");
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /synthetic failure/);
  assert.equal(calls.some((args) => args.includes("--no-index")), true);
  assert.equal(calls.at(-1)[0], "check-ignore");
});

test("extension gate is inactive outside explicit PiCM scan phases", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root);
    const outside = join(dirname(root), `outside-${Date.now()}.png`);
    write(outside, "synthetic screenshot\n");
    try {
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: ".env" } },
        ctx,
      ), undefined);
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: outside } },
        ctx,
      ), undefined);
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "bash", input: { command: "git diff --check" } },
        ctx,
      ), undefined);
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "bash", input: { command: "git config --get user.email" } },
        ctx,
      ), undefined);
      assert.equal(h.handlers.has("user_bash"), false);
      assert.equal(await h.handlers.get("tool_call")({ toolName: "read", input: null }, ctx), undefined);
    } finally {
      rmSync(outside, { force: true });
    }
  });
});

test("privacy refuses before preflight without reading config or initializing isolated Git", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-preflight-order-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(join(root, ".picm", "config.json"), "not valid json\n");
  write(join(root, "safe.txt"));
  const h = extensionHarness();
  const ctx = h.context(root, "preflight-order-session");
  const scanControl = h.tools.get("picm_scan_control");

  await h.commands.get("picm-adopt").handler("coding", ctx);
  await assert.rejects(
    scanControl.execute(
      "id",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    ),
    /PICM_PREFLIGHT_INCOMPLETE/,
  );
  assert.equal(readFileSync(join(root, ".picm", "config.json"), "utf8"), "not valid json\n");
  assert.equal(existsSync(join(root, ".git")), false);

  const preflight = await scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  assert.equal(preflight.details.preflightComplete, true);
  assert.equal(preflight.details.gitRepository, false);
  assert.equal(existsSync(join(root, ".git")), false);
  await assert.rejects(
    scanControl.execute("id", { action: "privacy", excludedPaths: [], persist: false }, undefined, undefined, ctx),
    /CONFIG_INVALID_JSON/,
  );
  assert.equal(existsSync(join(root, ".git")), false);
});

test("explicit PiCM scans require privacy review before honoring gitignore in non-Git workspaces", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-non-git-scan-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(join(root, ".gitignore"), "ignored.txt\n");
  write(join(root, "safe.txt"));
  write(join(root, "ignored.txt"));
  const h = extensionHarness();
  const ctx = h.context(root, "non-git-session");
  const scanControl = h.tools.get("picm_scan_control");

  await h.commands.get("picm-maintain").handler("", ctx);
  const pending = await h.handlers.get("tool_call")(
    { toolName: "read", input: { path: "safe.txt" } },
    ctx,
  );
  assert.equal(pending.block, true);
  assert.match(pending.reason, /privacy review/);

  const preflight = await scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  assert.equal(preflight.details.gitRepository, false);
  assert.equal(preflight.details.rootGitignore, "file");
  assert.equal(existsSync(join(root, ".git")), false);
  await scanControl.execute(
    "id",
    { action: "privacy", excludedPaths: [], persist: false },
    undefined,
    undefined,
    ctx,
  );
  await scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);

  assert.equal((await h.handlers.get("tool_call")(
    { toolName: "read", input: { path: "safe.txt" } },
    ctx,
  )), undefined);
  const blocked = await h.handlers.get("tool_call")(
    { toolName: "read", input: { path: "ignored.txt" } },
    ctx,
  );
  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /ignored by Git/);
  assert.equal(h.handlers.has("user_bash"), false);
  assert.equal(existsSync(join(root, ".git")), false);
  await h.handlers.get("session_shutdown")({}, ctx);
});

test("persistent privacy review writes config and protects later inventories", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, "private", "secret.txt"));
    const h = extensionHarness({ confirm: true });
    const ctx = h.context(root, "persistent-privacy-session");
    const scanControl = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);

    const privacy = await scanControl.execute(
      "id",
      { action: "privacy", excludedPaths: ["private"], persist: true },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(privacy.details.ok, true);
    assert.equal(privacy.details.configChanged, true);
    assert.deepEqual(JSON.parse(readFileSync(join(root, ".picm/config.json"), "utf8")), {
      version: 1,
      generatedBy: "picm-factory",
      privacy: { excludedPaths: ["private"] },
    });

    await scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    const inventory = await scanControl.execute("id", { action: "inventory" }, undefined, undefined, ctx);
    assert.equal(inventory.details.candidates.includes("private/secret.txt"), false);
    assert.equal((await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: "private/secret.txt" } },
      ctx,
    )).block, true);
  });
});

test("declining persistent privacy keeps review incomplete", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness({ confirm: false });
    const ctx = h.context(root, "declined-privacy-session");
    const scanControl = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
    const privacy = await scanControl.execute(
      "id",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: true },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(privacy.details.ok, false);
    assert.equal(privacy.details.code, "PRIVACY_APPLY_DECLINED");
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx),
      /PICM_PRIVACY_NOT_REVIEWED/,
    );
  });
});

test("aborted config confirmations do not mutate project policy", async () => {
  await withFixture(async ({ root }) => {
    const confirmationStarted = deferred();
    const releaseConfirmation = deferred();
    const abort = new AbortController();
    const h = extensionHarness({
      confirm: async (_title, _message, options) => {
        assert.equal(options.signal, abort.signal);
        confirmationStarted.resolve();
        await releaseConfirmation.promise;
        return true;
      },
    });
    const ctx = h.context(root, "aborted-maintenance-confirmation");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-maintain").handler("routing", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const apply = h.tools.get("picm_maintenance_policy").execute(
      "aborted-apply",
      { action: "apply", mode: "manual" },
      abort.signal,
      undefined,
      ctx,
    );
    await confirmationStarted.promise;
    abort.abort();
    releaseConfirmation.resolve();
    await assert.rejects(apply, /MAINTENANCE_APPLY_ABORTED/);
    assert.equal(existsSync(join(root, ".picm", "config.json")), false);
  });

  await withFixture(async ({ root }) => {
    const confirmationStarted = deferred();
    const releaseConfirmation = deferred();
    const abort = new AbortController();
    const h = extensionHarness({
      confirm: async (_title, _message, options) => {
        assert.equal(options.signal, abort.signal);
        confirmationStarted.resolve();
        await releaseConfirmation.promise;
        return true;
      },
    });
    const ctx = h.context(root, "aborted-privacy-confirmation");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);

    const privacy = control.execute(
      "aborted-privacy",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: true },
      abort.signal,
      undefined,
      ctx,
    );
    await confirmationStarted.promise;
    abort.abort();
    releaseConfirmation.resolve();
    await assert.rejects(privacy, /PICM_SCAN_ABORTED/);
    assert.equal(existsSync(join(root, ".picm", "config.json")), false);
    await assert.rejects(
      control.execute("begin", { action: "begin" }, undefined, undefined, ctx),
      /PICM_PRIVACY_NOT_REVIEWED/,
    );
  });
});

test("explicit PiCM commands enforce privacy review, session scope, and durable exclusions", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "authorized-session");
    const unrelated = h.context(root, "unrelated-session");
    const scanControl = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    assert.equal(h.sent.length, 1);

    const blockedRead = await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      ctx,
    );
    assert.equal(blockedRead.block, true);
    assert.match(blockedRead.reason, /privacy review/);
    await assert.rejects(
      scanControl.execute("id", { action: "inventory" }, undefined, undefined, ctx),
      /PICM_SCAN_NOT_ACTIVE/,
    );
    await assert.rejects(
      scanControl.execute(
        "id",
        { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
        undefined,
        undefined,
        ctx,
      ),
      /PICM_PREFLIGHT_INCOMPLETE/,
    );
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx),
      /PICM_PREFLIGHT_INCOMPLETE/,
    );

    const preflight = await scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx),
      /PICM_PRIVACY_NOT_REVIEWED/,
    );
    assert.equal(preflight.details.gitRepository, true);
    assert.equal(preflight.details.rootGitignore, "file");
    const privacy = await scanControl.execute(
      "id",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(privacy.details.privacyReviewed, true);
    assert.deepEqual(privacy.details.excludedPaths, ["safe-dir"]);
    assert.equal((await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      ctx,
    )).block, true);
    assert.match((await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      ctx,
    )).reason, /Begin the privacy-reviewed/);
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "picm_maintenance_policy", input: { action: "preview" } },
      ctx,
    ), undefined);

    const begun = await scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    assert.equal(begun.details.authorized, true);
    assert.equal(begun.details.active, true);
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "picm_maintenance_policy", input: { action: "preview" } },
      ctx,
    ), undefined);
    const inventory = await scanControl.execute(
      "id",
      { action: "inventory" },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(inventory.details.candidates.includes("safe.txt"), true);
    assert.equal(inventory.details.candidates.includes("safe-dir/file.txt"), false);
    assert.equal(inventory.details.candidates.includes(".env"), false);

    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: ".env" } },
      unrelated,
    ), undefined);
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, unrelated),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );
    assert.equal((await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe-dir/file.txt" } },
      ctx,
    )).block, true);
    assert.equal((await h.handlers.get("tool_call")(
      { toolName: "mystery_filesystem_tool", input: { path: "safe.txt" } },
      ctx,
    )).block, true);

    await h.handlers.get("agent_settled")({}, ctx);
    const stillPrivate = await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      ctx,
    );
    assert.equal(stillPrivate.block, true);
    assert.match(stillPrivate.reason, /Begin the privacy-reviewed/);
    const blockedBash = await h.handlers.get("tool_call")(
      { toolName: "bash", input: { command: "cat safe-dir/file.txt" } },
      ctx,
    );
    assert.equal(blockedBash.block, true);

    const restarted = await scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    assert.equal(restarted.details.active, true);
    assert.equal((await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: ".env.tracked" } },
      ctx,
    )).block, true);

    const ended = await scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
    assert.equal(ended.details.authorized, true);
    assert.equal(ended.details.active, false);
    const completed = await scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
    assert.equal(completed.details.authorized, false);
    assert.equal(completed.details.active, false);
    assert.equal(completed.details.completed, true);
    await h.handlers.get("session_tree")({}, ctx);
    const completedStatus = await scanControl.execute(
      "id",
      { action: "status" },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(completedStatus.details.authorized, false);
    assert.equal(completedStatus.details.completed, true);
    const blockedAfterCompletion = await h.handlers.get("tool_call")(
      { toolName: "bash", input: { command: "git diff --check" } },
      ctx,
    );
    assert.equal(blockedAfterCompletion.block, true);
    assert.match(blockedAfterCompletion.reason, /completed PiCM workflow must settle/);
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx),
      /PICM_SCAN_COMPLETE/,
    );
    await h.handlers.get("agent_settled")({}, ctx);
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "bash", input: { command: "git diff --check" } },
      ctx,
    ), undefined);

    await h.commands.get("picm-new").handler("", ctx);
    await h.handlers.get("session_shutdown")({}, ctx);
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: ".env" } },
      ctx,
    ), undefined);
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );
  });
});

test("privacy-reviewed scan authorization and exclusions survive resuming the same session", async () => {
  await withFixture(async ({ root }) => {
    const entries = [];
    const sessionId = "resumed-session";
    const first = extensionHarness({ entries });
    const firstCtx = first.context(root, sessionId);
    const firstControl = first.tools.get("picm_scan_control");

    await first.commands.get("picm-adopt").handler("coding", firstCtx);
    await firstControl.execute("id", { action: "preflight" }, undefined, undefined, firstCtx);
    await firstControl.execute(
      "id",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
      undefined,
      undefined,
      firstCtx,
    );
    await firstControl.execute("id", { action: "begin" }, undefined, undefined, firstCtx);
    await firstControl.execute("id", { action: "end" }, undefined, undefined, firstCtx);
    await first.handlers.get("session_shutdown")({ reason: "quit" }, firstCtx);

    const resumed = extensionHarness({ entries });
    const resumedCtx = resumed.context(root, sessionId);
    await resumed.handlers.get("session_start")(
      { reason: "resume", previousSessionFile: "/synthetic/previous.jsonl" },
      resumedCtx,
    );

    const restored = await resumed.tools.get("picm_scan_control").execute(
      "id",
      { action: "status" },
      undefined,
      undefined,
      resumedCtx,
    );
    assert.equal(restored.details.authorized, true);
    assert.equal(restored.details.active, false);
    assert.equal(restored.details.preflightComplete, true);
    assert.equal(restored.details.privacyReviewed, true);
    assert.equal(restored.details.scanStarted, true);
    assert.deepEqual(restored.details.excludedPaths, ["safe-dir"]);
    assert.equal((await resumed.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe-dir/file.txt" } },
      resumedCtx,
    )).block, true);

    const begun = await resumed.tools.get("picm_scan_control").execute(
      "id",
      { action: "begin" },
      undefined,
      undefined,
      resumedCtx,
    );
    assert.equal(begun.details.authorized, true);
    assert.equal(begun.details.active, true);
    await resumed.tools.get("picm_scan_control").execute(
      "id",
      { action: "complete" },
      undefined,
      undefined,
      resumedCtx,
    );
    await resumed.handlers.get("session_shutdown")({ reason: "quit" }, resumedCtx);

    const afterCompletion = extensionHarness({ entries });
    const afterCompletionCtx = afterCompletion.context(root, sessionId);
    await afterCompletion.handlers.get("session_start")(
      { reason: "resume", previousSessionFile: "/synthetic/previous.jsonl" },
      afterCompletionCtx,
    );
    await assert.rejects(
      afterCompletion.tools.get("picm_scan_control").execute(
        "id",
        { action: "begin" },
        undefined,
        undefined,
        afterCompletionCtx,
      ),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );
  });
});

test("incomplete resumed workflow state is never treated as preflight-complete", async () => {
  await withFixture(async ({ root }) => {
    for (const missingField of ["excludedPaths", "maintenanceResetAttempted"]) {
      const state = {
        status: "authorized",
        cwd: root,
        command: "picm-adopt",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        preflightComplete: true,
        privacyReviewed: true,
        scanStarted: true,
        maintenanceResetAttempted: true,
        excludedPaths: ["safe-dir"],
      };
      delete state[missingField];
      const entries = [{ type: "custom", customType: "picm-scan-workflow", data: state }];
      const h = extensionHarness({ entries });
      const ctx = h.context(root, `incomplete-${missingField}-session`);
      await h.handlers.get("session_start")({ reason: "resume" }, ctx);

      const status = await h.tools.get("picm_scan_control").execute(
        "id",
        { action: "status" },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(status.details.preflightComplete, false);
      assert.equal(status.details.privacyReviewed, false);
      assert.equal(status.details.scanStarted, false);
      await assert.rejects(
        h.tools.get("picm_scan_control").execute("id", { action: "begin" }, undefined, undefined, ctx),
        /PICM_PREFLIGHT_INCOMPLETE/,
      );
    }
  });
});

test("scan authorization rejects help, timeout, cwd mismatch, and dispatch failure", async (t) => {
  await withFixture(async ({ root }) => {
    const scanEvent = { toolName: "read", input: { path: ".env" } };

    const help = extensionHarness();
    const helpCtx = help.context(root, "help-session");
    await help.commands.get("picm-new").handler("", helpCtx);
    await help.handlers.get("agent_settled")({}, helpCtx);
    await help.commands.get("picm-help").handler("", helpCtx);
    await assert.rejects(
      help.tools.get("picm_scan_control").execute("id", { action: "begin" }, undefined, undefined, helpCtx),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );
    assert.equal(await help.handlers.get("tool_call")(scanEvent, helpCtx), undefined);

    const timedEntries = [];
    const timed = extensionHarness({ entries: timedEntries });
    const timedCtx = timed.context(root, "timed-session");
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    await timed.commands.get("picm-new").handler("", timedCtx);
    now += 2 * 60 * 60 * 1000 + 1;
    assert.equal(await timed.handlers.get("tool_call")(scanEvent, timedCtx), undefined);
    await assert.rejects(
      timed.tools.get("picm_scan_control").execute("id", { action: "begin" }, undefined, undefined, timedCtx),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );
    await timed.handlers.get("session_shutdown")({ reason: "quit" }, timedCtx);
    const resumedAfterExpiry = extensionHarness({ entries: timedEntries });
    const resumedAfterExpiryCtx = resumedAfterExpiry.context(root, "timed-session");
    await resumedAfterExpiry.handlers.get("session_start")(
      { reason: "resume", previousSessionFile: "/synthetic/previous.jsonl" },
      resumedAfterExpiryCtx,
    );
    await assert.rejects(
      resumedAfterExpiry.tools.get("picm_scan_control").execute(
        "id",
        { action: "begin" },
        undefined,
        undefined,
        resumedAfterExpiryCtx,
      ),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );

    const mismatched = extensionHarness();
    const original = mismatched.context(root, "shared-session");
    const otherRoot = mkdtempSync(join(tmpdir(), "picm-gate-other-cwd-"));
    try {
      await mismatched.commands.get("picm-maintain").handler("", original);
      const otherCwd = mismatched.context(otherRoot, "shared-session");
      await assert.rejects(
        mismatched.tools.get("picm_scan_control").execute("id", { action: "begin" }, undefined, undefined, otherCwd),
        /PICM_SCAN_NOT_AUTHORIZED/,
      );
      assert.equal(await mismatched.handlers.get("tool_call")(scanEvent, original), undefined);
      await assert.rejects(
        mismatched.tools.get("picm_scan_control").execute("id", { action: "begin" }, undefined, undefined, original),
        /PICM_SCAN_NOT_AUTHORIZED/,
      );
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }

    const failed = extensionHarness({ sendError: new Error("synthetic dispatch failure") });
    const failedCtx = failed.context(root, "failed-session");
    await assert.rejects(failed.commands.get("picm-adopt").handler("", failedCtx), /synthetic dispatch failure/);
    assert.equal(await failed.handlers.get("tool_call")(scanEvent, failedCtx), undefined);
    await assert.rejects(
      failed.tools.get("picm_scan_control").execute("id", { action: "begin" }, undefined, undefined, failedCtx),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );
  });
});

test("non-Git workspaces without ignore rules remain scannable without creating repository metadata", async () => {
  const root = mkdtempSync(join(tmpdir(), "picm-no-git-test-"));
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  try {
    write(join(root, "safe.txt"));
    if (process.platform !== "win32") {
      symlinkSync("safe.txt", join(root, "safe-link"));
    }
    const decision = await gate.checkPath("read", "safe.txt");
    assert.equal(decision.allowed, true);
    assert.equal(decision.protected, true);
    if (process.platform !== "win32") {
      assert.match((await gate.checkPath("read", "safe-link")).reason, /symlinks/);
    }
    assert.equal(existsSync(join(root, ".git")), false);
  } finally {
    await gate.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

test("complete waits for sequentially preflighted real project operations to finish", async () => {
  await withFixture(async ({ root }) => {
    const entries = [];
    const h = extensionHarness({ entries });
    const ctx = h.context(root, "execution-barrier-builtins");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const readStarted = deferred();
    const writeStarted = deferred();
    const editStarted = deferred();
    const releaseRead = deferred();
    const releaseWrite = deferred();
    const releaseEdit = deferred();
    const readTool = createReadTool(root, {
      operations: {
        access: accessFile,
        readFile: async (path) => {
          readStarted.resolve();
          await releaseRead.promise;
          return readFileAsync(path);
        },
      },
    });
    const writeTool = createWriteTool(root, {
      operations: {
        mkdir: (path) => mkdirDirectory(path, { recursive: true }),
        writeFile: async (path, content) => {
          writeStarted.resolve();
          await releaseWrite.promise;
          return writeFileAsync(path, content, "utf8");
        },
      },
    });
    const editTool = createEditTool(root, {
      operations: {
        access: accessFile,
        readFile: readFileAsync,
        writeFile: async (path, content) => {
          editStarted.resolve();
          await releaseEdit.promise;
          return writeFileAsync(path, content, "utf8");
        },
      },
    });
    const calls = await preflightParallelToolCalls(h, ctx, [
      { id: "delayed-read", toolName: "read", input: { path: "safe.txt" }, tool: readTool },
      {
        id: "delayed-write",
        toolName: "write",
        input: { path: "output/barrier.txt", content: "after barrier\n" },
        tool: writeTool,
      },
      {
        id: "delayed-edit",
        toolName: "edit",
        input: {
          path: "docs/guide.md",
          edits: [{ oldText: "guide\n", newText: "guide after\n" }],
        },
        tool: editTool,
      },
      {
        id: "complete",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      },
    ]);
    assert.equal(calls.every((call) => call.blocked === undefined), true);

    const timeline = [];
    const executions = executePreflightedToolCalls(h, ctx, calls, timeline);
    await Promise.all([readStarted.promise, writeStarted.promise, editStarted.promise]);
    const completedBeforeRelease = await promiseSettled(executions[3]);

    releaseRead.resolve();
    await executions[0];
    const completedAfterRead = await promiseSettled(executions[3]);
    releaseWrite.resolve();
    await executions[1];
    const completedAfterWrite = await promiseSettled(executions[3]);
    releaseEdit.resolve();
    const results = await Promise.all(executions);

    assert.equal(completedBeforeRelease, false);
    assert.equal(completedAfterRead, false);
    assert.equal(completedAfterWrite, false);
    assert.equal(results[3].result.details.completed, true);
    assert.equal(readFileSync(join(root, "output", "barrier.txt"), "utf8"), "after barrier\n");
    assert.equal(readFileSync(join(root, "docs", "guide.md"), "utf8"), "guide after\n");
    assert.equal(timeline.at(-1), "result:complete");
    assert.equal(entries.at(-1).data.status, "completed");
  });
});

test("complete waits for a confirmed maintenance apply to commit", async () => {
  await withFixture(async ({ root }) => {
    const confirmationStarted = deferred();
    const releaseConfirmation = deferred();
    const entries = [];
    const h = extensionHarness({
      entries,
      confirm: async () => {
        confirmationStarted.resolve();
        return releaseConfirmation.promise;
      },
    });
    const ctx = h.context(root, "execution-barrier-maintenance");
    const control = h.tools.get("picm_scan_control");
    const policy = h.tools.get("picm_maintenance_policy");
    await h.commands.get("picm-maintain").handler("routing", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "apply",
        toolName: "picm_maintenance_policy",
        input: { action: "apply", mode: "manual" },
        tool: policy,
      },
      {
        id: "complete",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      },
    ]);
    assert.equal(calls.every((call) => call.blocked === undefined), true);

    const timeline = [];
    const executions = executePreflightedToolCalls(h, ctx, calls, timeline);
    await confirmationStarted.promise;
    const completedBeforeConfirmation = await promiseSettled(executions[1]);
    releaseConfirmation.resolve(true);
    const results = await Promise.all(executions);

    assert.equal(completedBeforeConfirmation, false);
    assert.equal(results[0].result.details.changed, true);
    assert.equal(results[1].result.details.completed, true);
    assert.equal(timeline.at(-1), "result:complete");
    const config = JSON.parse(readFileSync(join(root, ".picm", "config.json"), "utf8"));
    assert.equal(config.maintenance.mode, "manual");
    assert.equal(entries.at(-1).data.status, "completed");
  });
});

test("completion fence rejects later siblings without waiting on itself or rejected calls", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-fence");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "complete-first",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      },
      {
        id: "later-write",
        toolName: "write",
        input: { path: "output/too-late.txt", content: "must not commit\n" },
        tool: createWriteTool(root),
      },
    ]);
    assert.equal(calls[0].blocked, undefined);
    assert.equal(calls[1].blocked.block, true);
    assert.match(calls[1].blocked.reason, /completion was already admitted/);

    const [completion, rejected] = await Promise.all(
      executePreflightedToolCalls(h, ctx, calls),
    );
    assert.equal(completion.result.details.completed, true);
    assert.equal(rejected.isError, true);
    assert.equal(existsSync(join(root, "output", "too-late.txt")), false);
    const repeated = await control.execute(
      "repeat-complete",
      { action: "complete" },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(repeated.details.completed, true);
  });

  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-rejected");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "rejected-write",
        toolName: "write",
        input: { path: ".env", content: "blocked\n" },
        tool: createWriteTool(root),
      },
      {
        id: "complete-after-rejection",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      },
    ]);
    assert.equal(calls[0].blocked.block, true);
    assert.equal(calls[1].blocked, undefined);
    const executions = executePreflightedToolCalls(h, ctx, calls);
    assert.equal(await promiseSettled(executions[1]), true);
    const results = await Promise.all(executions);
    assert.equal(results[1].result.details.completed, true);
    assert.equal(readFileSync(join(root, ".env"), "utf8"), "SYNTHETIC_ONLY=ignored\n");
  });
});

test("completion waits through failed and cancelled mutations and releases their leases", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-failure");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-maintain").handler("routing", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const failedWrite = createWriteTool(root, {
      operations: {
        mkdir: (path) => mkdirDirectory(path, { recursive: true }),
        writeFile: async () => {
          throw new Error("synthetic write failure");
        },
      },
    });
    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "failed-write",
        toolName: "write",
        input: { path: "output/failure.txt", content: "never written\n" },
        tool: failedWrite,
      },
      {
        id: "complete-after-failure",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      },
    ]);
    const timeline = [];
    const results = await Promise.all(executePreflightedToolCalls(h, ctx, calls, timeline));
    assert.equal(results[0].isError, true);
    assert.match(results[0].result.content[0].text, /synthetic write failure/);
    assert.equal(results[1].result.details.completed, true);
    assert.equal(timeline.at(-1), "result:complete-after-failure");
  });

  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-cancellation");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-maintain").handler("routing", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const mutationStarted = deferred();
    const releaseMutation = deferred();
    const abort = new AbortController();
    const cancelledWrite = createWriteTool(root, {
      operations: {
        mkdir: (path) => mkdirDirectory(path, { recursive: true }),
        writeFile: async (path, content) => {
          mutationStarted.resolve();
          await releaseMutation.promise;
          await writeFileAsync(path, content, "utf8");
        },
      },
    });
    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "cancelled-write",
        toolName: "write",
        input: { path: "output/cancelled.txt", content: "settled mutation\n" },
        tool: cancelledWrite,
        signal: abort.signal,
      },
      {
        id: "complete-after-cancellation",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      },
    ]);
    const timeline = [];
    const executions = executePreflightedToolCalls(h, ctx, calls, timeline);
    await mutationStarted.promise;
    abort.abort();
    const completedWhileMutationPending = await promiseSettled(executions[1]);
    releaseMutation.resolve();
    const results = await Promise.all(executions);

    assert.equal(completedWhileMutationPending, false);
    assert.equal(results[0].isError, true);
    assert.match(results[0].result.content[0].text, /Operation aborted/);
    assert.equal(results[1].result.details.completed, true);
    assert.equal(readFileSync(join(root, "output", "cancelled.txt"), "utf8"), "settled mutation\n");
    assert.equal(timeline.at(-1), "result:complete-after-cancellation");
  });
});

test("cancelled completion stays nonterminal and releases its own lease", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-cancelled-complete");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-maintain").handler("routing", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const mutationStarted = deferred();
    const releaseMutation = deferred();
    const completionAbort = new AbortController();
    const delayedWrite = createWriteTool(root, {
      operations: {
        mkdir: (path) => mkdirDirectory(path, { recursive: true }),
        writeFile: async (path, content) => {
          mutationStarted.resolve();
          await releaseMutation.promise;
          await writeFileAsync(path, content, "utf8");
        },
      },
    });
    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "write-before-cancelled-complete",
        toolName: "write",
        input: { path: "output/before-retry.txt", content: "settled\n" },
        tool: delayedWrite,
      },
      {
        id: "cancelled-complete",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
        signal: completionAbort.signal,
      },
    ]);
    const executions = executePreflightedToolCalls(h, ctx, calls);
    await mutationStarted.promise;
    completionAbort.abort();
    const cancelledCompletion = await executions[1];
    assert.equal(cancelledCompletion.isError, true);
    assert.match(cancelledCompletion.result.content[0].text, /PICM_SCAN_ABORTED/);

    const stillActive = await control.execute(
      "status-after-cancel",
      { action: "status" },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(stillActive.details.completed, false);
    releaseMutation.resolve();
    await executions[0];

    const [retry] = await preflightParallelToolCalls(h, ctx, [{
      id: "retry-complete",
      toolName: "picm_scan_control",
      input: { action: "complete" },
      tool: control,
    }]);
    const [completed] = await Promise.all(executePreflightedToolCalls(h, ctx, [retry]));
    assert.equal(completed.result.details.completed, true);
  });

  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-pre-aborted-complete");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    const completionAbort = new AbortController();
    completionAbort.abort();
    const [call] = await preflightParallelToolCalls(h, ctx, [{
      id: "pre-aborted-complete",
      toolName: "picm_scan_control",
      input: { action: "complete" },
      tool: control,
      signal: completionAbort.signal,
    }]);
    const [completion] = await Promise.all(executePreflightedToolCalls(h, ctx, [call]));
    assert.equal(completion.isError, true);
    assert.match(completion.result.content[0].text, /PICM_SCAN_ABORTED/);
    const status = await control.execute(
      "status-after-pre-abort",
      { action: "status" },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(status.details.completed, false);
  });
});

test("restore and settlement discard orphaned execution leases", async () => {
  for (const resetEvent of ["session_tree", "agent_settled"]) {
    await withFixture(async ({ root }) => {
      const entries = [];
      const h = extensionHarness({ entries });
      const ctx = h.context(root, `execution-barrier-${resetEvent}`);
      const control = h.tools.get("picm_scan_control");
      await h.commands.get("picm-adopt").handler("coding", ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute(
        "privacy",
        { action: "privacy", excludedPaths: [], persist: false },
        undefined,
        undefined,
        ctx,
      );
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

      await h.handlers.get("tool_execution_start")(
        { toolCallId: "orphaned-read", toolName: "read", args: { path: "safe.txt" } },
        ctx,
      );
      assert.equal(await h.handlers.get("tool_call")(
        { toolCallId: "orphaned-read", toolName: "read", input: { path: "safe.txt" } },
        ctx,
      ), undefined);
      await h.handlers.get(resetEvent)({}, ctx);

      const calls = await preflightParallelToolCalls(h, ctx, [{
        id: `complete-after-${resetEvent}`,
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      }]);
      const [completion] = await Promise.all(executePreflightedToolCalls(h, ctx, calls));
      assert.equal(completion.result.details.completed, true);
    });
  }
});

test("session shutdown clears orphaned execution leases", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-shutdown");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    await h.handlers.get("tool_execution_start")(
      { toolCallId: "shutdown-orphan", toolName: "write", args: { path: "output/orphan.txt" } },
      ctx,
    );
    assert.equal(await h.handlers.get("tool_call")(
      {
        toolCallId: "shutdown-orphan",
        toolName: "write",
        input: { path: "output/orphan.txt", content: "orphan\n" },
      },
      ctx,
    ), undefined);

    await h.handlers.get("session_shutdown")({ reason: "quit" }, ctx);
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("new-preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "new-privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    const [completion] = await preflightParallelToolCalls(h, ctx, [{
      id: "complete-after-shutdown",
      toolName: "picm_scan_control",
      input: { action: "complete" },
      tool: control,
    }]);
    const [result] = await Promise.all(executePreflightedToolCalls(h, ctx, [completion]));
    assert.equal(result.result.details.completed, true);
  });
});

test("execution leases stay isolated by session", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const control = h.tools.get("picm_scan_control");
    const firstCtx = h.context(root, "execution-barrier-session-a");
    const secondCtx = h.context(root, "execution-barrier-session-b");
    for (const [ctx, command] of [[firstCtx, "picm-adopt"], [secondCtx, "picm-maintain"]]) {
      await h.commands.get(command).handler("routing", ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute(
        "privacy",
        { action: "privacy", excludedPaths: [], persist: false },
        undefined,
        undefined,
        ctx,
      );
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    }

    await h.handlers.get("tool_execution_start")(
      { toolCallId: "shared-call-id", toolName: "read", args: { path: "safe.txt" } },
      firstCtx,
    );
    assert.equal(await h.handlers.get("tool_call")(
      { toolCallId: "shared-call-id", toolName: "read", input: { path: "safe.txt" } },
      firstCtx,
    ), undefined);

    const [secondCompletion] = await preflightParallelToolCalls(h, secondCtx, [{
      id: "shared-complete-id",
      toolName: "picm_scan_control",
      input: { action: "complete" },
      tool: control,
    }]);
    const secondExecutions = executePreflightedToolCalls(h, secondCtx, [secondCompletion]);
    assert.equal(await promiseSettled(secondExecutions[0]), true);
    assert.equal((await secondExecutions[0]).result.details.completed, true);

    await h.handlers.get("tool_execution_end")(
      {
        toolCallId: "shared-call-id",
        toolName: "read",
        result: { content: [{ type: "text", text: "safe" }] },
        isError: false,
      },
      firstCtx,
    );
    const [firstCompletion] = await preflightParallelToolCalls(h, firstCtx, [{
      id: "shared-complete-id",
      toolName: "picm_scan_control",
      input: { action: "complete" },
      tool: control,
    }]);
    const [firstResult] = await Promise.all(
      executePreflightedToolCalls(h, firstCtx, [firstCompletion]),
    );
    assert.equal(firstResult.result.details.completed, true);
  });
});

test("concurrent preflight and complete cannot restore stale authorization", async () => {
  await withFixture(async ({ root }) => {
    const entries = [];
    const h = extensionHarness({ entries });
    const ctx = h.context(root, "preflight-complete-race");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);

    await Promise.all([
      control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx),
      control.execute("complete", { action: "complete" }, undefined, undefined, ctx),
    ]);
    assert.equal(entries.at(-1).data.status, "completed");

    const restored = extensionHarness({ entries });
    const restoredCtx = restored.context(root, "preflight-complete-race");
    await restored.handlers.get("session_start")({ reason: "resume" }, restoredCtx);
    const blocked = await restored.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      restoredCtx,
    );
    assert.equal(blocked.block, true);
    assert.match(blocked.reason, /completed PiCM workflow/);
    await restored.handlers.get("agent_settled")({}, restoredCtx);
    assert.equal(await restored.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      restoredCtx,
    ), undefined);
  });
});

test("concurrent privacy and complete cannot restore stale authorization", async () => {
  await withFixture(async ({ root }) => {
    const entries = [];
    const h = extensionHarness({ entries });
    const ctx = h.context(root, "privacy-complete-race");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);

    await Promise.all([
      control.execute(
        "privacy",
        { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
        undefined,
        undefined,
        ctx,
      ),
      control.execute("complete", { action: "complete" }, undefined, undefined, ctx),
    ]);
    assert.equal(entries.at(-1).data.status, "completed");

    const restored = extensionHarness({ entries });
    const restoredCtx = restored.context(root, "privacy-complete-race");
    await restored.handlers.get("session_tree")({}, restoredCtx);
    const blocked = await restored.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      restoredCtx,
    );
    assert.equal(blocked.block, true);
    assert.match(blocked.reason, /completed PiCM workflow/);
    await restored.handlers.get("agent_settled")({}, restoredCtx);
    assert.equal(await restored.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      restoredCtx,
    ), undefined);
  });
});

test("guarded tool decisions fail closed when complete or settlement changes scan state", async () => {
  await withFixture(async ({ root }) => {
    const active = extensionHarness();
    const activeCtx = active.context(root, "active-tool-complete-race");
    const activeControl = active.tools.get("picm_scan_control");
    await active.commands.get("picm-adopt").handler("coding", activeCtx);
    await activeControl.execute("preflight", { action: "preflight" }, undefined, undefined, activeCtx);
    await activeControl.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
      undefined,
      undefined,
      activeCtx,
    );
    await activeControl.execute("begin", { action: "begin" }, undefined, undefined, activeCtx);
    const [activeDecision] = await Promise.all([
      active.handlers.get("tool_call")(
        { toolName: "read", input: { path: "safe.txt" } },
        activeCtx,
      ),
      activeControl.execute("complete", { action: "complete" }, undefined, undefined, activeCtx),
    ]);
    assert.equal(activeDecision.block, true);
    assert.match(activeDecision.reason, /scan state changed/);
    await active.handlers.get("agent_settled")({}, activeCtx);
    assert.equal(await active.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      activeCtx,
    ), undefined);

    const settled = extensionHarness();
    const settledCtx = settled.context(root, "active-tool-settle-race");
    const settledControl = settled.tools.get("picm_scan_control");
    await settled.commands.get("picm-maintain").handler("routing", settledCtx);
    await settledControl.execute("preflight", { action: "preflight" }, undefined, undefined, settledCtx);
    await settledControl.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      settledCtx,
    );
    await settledControl.execute("begin", { action: "begin" }, undefined, undefined, settledCtx);
    const [settledDecision] = await Promise.all([
      settled.handlers.get("tool_call")(
        { toolName: "read", input: { path: "safe.txt" } },
        settledCtx,
      ),
      settled.handlers.get("agent_settled")({}, settledCtx),
    ]);
    assert.equal(settledDecision.block, true);
    assert.match(settledDecision.reason, /scan state changed/);
  });
});

test("malformed completed state restores fail closed until settlement", async () => {
  await withFixture(async ({ root }) => {
    for (const malformed of [
      { expiresAt: "not-a-date", excludedPaths: [] },
      { expiresAt: new Date(Date.now() + 60_000).toISOString(), excludedPaths: "private" },
      { expiresAt: new Date(Date.now() + 60_000).toISOString(), excludedPaths: ["../outside"] },
    ]) {
      const entries = [{
        type: "custom",
        customType: "picm-scan-workflow",
        data: {
          status: "completed",
          cwd: root,
          command: "picm-adopt",
          preflightComplete: true,
          privacyReviewed: true,
          scanStarted: true,
          maintenanceResetAttempted: true,
          completed: true,
          ...malformed,
        },
      }];
      const h = extensionHarness({ entries });
      const ctx = h.context(root, `malformed-completed-${String(malformed.excludedPaths)}`);
      await h.handlers.get("session_start")({ reason: "resume" }, ctx);
      const status = await h.tools.get("picm_scan_control").execute(
        "status",
        { action: "status" },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(status.details.completed, true);
      assert.equal(status.details.authorized, false);
      assert.equal((await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: "safe.txt" } },
        ctx,
      )).block, true);
      await h.handlers.get("agent_settled")({}, ctx);
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: "safe.txt" } },
        ctx,
      ), undefined);
    }

    for (const identity of [
      { cwd: join(root, "other"), command: "picm-adopt" },
      { cwd: root, command: "unknown-command" },
    ]) {
      const entries = [{
        type: "custom",
        customType: "picm-scan-workflow",
        data: {
          status: "completed",
          expiresAt: "not-a-date",
          excludedPaths: ["../outside"],
          ...identity,
        },
      }];
      const h = extensionHarness({ entries });
      const ctx = h.context(root, `completed-identity-${identity.command}`);
      await h.handlers.get("session_start")({ reason: "resume" }, ctx);
      const status = await h.tools.get("picm_scan_control").execute(
        "status",
        { action: "status" },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(status.details.completed, undefined);
      await assert.rejects(
        h.tools.get("picm_scan_control").execute(
          "begin",
          { action: "begin" },
          undefined,
          undefined,
          ctx,
        ),
        /PICM_SCAN_NOT_AUTHORIZED/,
      );
    }

    for (const malformed of [
      { expiresAt: "not-a-date", excludedPaths: [] },
      { expiresAt: new Date(Date.now() + 60_000).toISOString(), excludedPaths: ["../outside"] },
    ]) {
      const entries = [{
        type: "custom",
        customType: "picm-scan-workflow",
        data: {
          status: "authorized",
          cwd: root,
          command: "picm-adopt",
          preflightComplete: true,
          privacyReviewed: true,
          scanStarted: true,
          maintenanceResetAttempted: true,
          ...malformed,
        },
      }];
      const h = extensionHarness({ entries });
      const ctx = h.context(root, `malformed-authorized-${String(malformed.excludedPaths)}`);
      await h.handlers.get("session_start")({ reason: "resume" }, ctx);
      await assert.rejects(
        h.tools.get("picm_scan_control").execute(
          "begin",
          { action: "begin" },
          undefined,
          undefined,
          ctx,
        ),
        /PICM_SCAN_NOT_AUTHORIZED/,
      );
    }
  });
});

test("interactive commands bootstrap privacy before trusted skill loading", async () => {
  await withFixture(async ({ root }) => {
    const packageRoot = resolve(".");
    for (const command of ["picm-new", "picm-adopt", "picm-maintain", "picm-optimize"]) {
      const h = extensionHarness();
      const ctx = h.context(root, `bootstrap-${command}`);
      await h.commands.get(command).handler(command === "picm-adopt" ? "coding" : "routing", ctx);
      const prompt = h.sent.at(-1);
      const preflightIndex = prompt.indexOf('action: "preflight"');
      const privacyIndex = prompt.indexOf('action: "privacy"');
      const skillIndex = prompt.indexOf("load the `picm-factory` skill");
      assert.ok(preflightIndex >= 0 && preflightIndex < privacyIndex && privacyIndex < skillIndex);
      assert.match(prompt, /Only name additional sensitive project-relative paths/);

      const control = h.tools.get("picm_scan_control");
      const skill = join(packageRoot, "skills", "picm-factory", "SKILL.md");
      assert.equal((await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: skill } },
        ctx,
      )).block, true);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute(
        "privacy",
        { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
        undefined,
        undefined,
        ctx,
      );
      for (const path of [
        skill,
        join(packageRoot, "skills", "picm-factory", "references", "adoption-guide.md"),
        join(packageRoot, "skills", "picm-factory", "templates", "context-map.md"),
      ]) {
        assert.equal(await h.handlers.get("tool_call")(
          { toolName: "read", input: { path } },
          ctx,
        ), undefined);
      }
      for (const event of [
        { toolName: "read", input: { path: "safe.txt" } },
        { toolName: "read", input: { path: ".env" } },
        { toolName: "read", input: { path: "safe-dir/file.txt" } },
        { toolName: "bash", input: { command: "cat safe.txt" } },
        { toolName: "unknown", input: { path: skill } },
      ]) {
        assert.equal((await h.handlers.get("tool_call")(event, ctx)).block, true);
      }

      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
      const inventory = await control.execute(
        "inventory",
        { action: "inventory" },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(inventory.details.candidates.includes("safe.txt"), true);
      assert.equal(inventory.details.candidates.includes(".env"), false);
      assert.equal(inventory.details.candidates.includes("safe-dir/file.txt"), false);
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: "safe.txt" } },
        ctx,
      ), undefined);
      for (const path of [".env", "safe-dir/file.txt"]) {
        assert.equal((await h.handlers.get("tool_call")(
          { toolName: "read", input: { path } },
          ctx,
        )).block, true);
      }
      await control.execute("end", { action: "end" }, undefined, undefined, ctx);
      const completed = await control.execute(
        "complete",
        { action: "complete" },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(completed.details.completed, true);
      assert.equal((await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: "safe.txt" } },
        ctx,
      )).block, true);
      await h.handlers.get("agent_settled")({}, ctx);
    }
  });
});

test("pre-begin admission allows only policy preview and canonical packaged reads", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "pre-begin-action-boundary");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
      undefined,
      undefined,
      ctx,
    );

    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "picm_maintenance_policy", input: { action: "preview", mode: "manual" } },
      ctx,
    ), undefined);
    for (const action of ["status", "apply"]) {
      const blocked = await h.handlers.get("tool_call")(
        { toolName: "picm_maintenance_policy", input: { action } },
        ctx,
      );
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /begin/i);
    }

    const packageRoot = resolve(".");
    for (const path of [
      join(packageRoot, "skills", "picm-factory", "SKILL.md"),
      join(packageRoot, "skills", "picm-factory", "references", "adoption-guide.md"),
      join(packageRoot, "skills", "picm-factory", "templates", "context-map.md"),
    ]) {
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "read", input: { path } },
        ctx,
      ), undefined);
    }

    const lookalike = join(root, "skills", "picm-factory", "SKILL.md");
    write(lookalike, "---\nname: lookalike\n---\n");
    for (const event of [
      { toolName: "read", input: { path: "safe.txt" } },
      { toolName: "read", input: { path: ".env" } },
      { toolName: "read", input: { path: "safe-dir/file.txt" } },
      { toolName: "read", input: { path: lookalike } },
      { toolName: "bash", input: { command: "cat safe.txt" } },
      { toolName: "unknown", input: { path: packageRoot } },
    ]) {
      assert.equal((await h.handlers.get("tool_call")(event, ctx)).block, true);
    }

    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    for (const action of ["preview", "status", "apply"]) {
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "picm_maintenance_policy", input: { action } },
        ctx,
      ), undefined);
    }
  });
});

test("noninteractive commands preserve generic skill and argument dispatch", async () => {
  await withFixture(async ({ root }) => {
    for (const command of ["picm-new", "picm-maintain"]) {
      const h = extensionHarness();
      await h.commands.get(command).handler("synthetic focus", h.context(root, `print-${command}`, "print"));
      assert.match(h.sent.at(-1), /Use the picm-factory skill/);
      assert.match(h.sent.at(-1), /User arguments:\nsynthetic focus/);
      assert.doesNotMatch(h.sent.at(-1), /Privacy-first startup/);
    }
  });
});

test("legacy opaque privacy survives session-only and persistent reviews", async () => {
  await withFixture(async ({ root }) => {
    const configPath = join(root, ".picm", "config.json");
    const legacy = {
      version: 1,
      custom: "keep",
      privacy: { owner: "security-team", legacyMode: "private" },
    };
    write(configPath, `${JSON.stringify(legacy, null, 2)}\n`);

    const sessionOnly = extensionHarness();
    const sessionCtx = sessionOnly.context(root, "legacy-session-only");
    await sessionOnly.commands.get("picm-adopt").handler("coding", sessionCtx);
    await sessionOnly.tools.get("picm_scan_control").execute(
      "preflight",
      { action: "preflight" },
      undefined,
      undefined,
      sessionCtx,
    );
    await sessionOnly.tools.get("picm_scan_control").execute(
      "privacy",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
      undefined,
      undefined,
      sessionCtx,
    );
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), legacy);

    const persistent = extensionHarness({ confirm: true });
    const persistentCtx = persistent.context(root, "legacy-persistent");
    await persistent.commands.get("picm-adopt").handler("coding", persistentCtx);
    await persistent.tools.get("picm_scan_control").execute(
      "preflight",
      { action: "preflight" },
      undefined,
      undefined,
      persistentCtx,
    );
    await persistent.tools.get("picm_scan_control").execute(
      "privacy",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: true },
      undefined,
      undefined,
      persistentCtx,
    );
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")).privacy, {
      owner: "security-team",
      legacyMode: "private",
      excludedPaths: ["safe-dir"],
    });
  });
});

test("public privacy review preserves non-object legacy config and skips maintenance reset", async () => {
  await withFixture(async ({ root }) => {
    const configPath = join(root, ".picm", "config.json");
    const maintenance = createPolicy({
      mode: "nudge",
      intervalValue: 1,
      intervalUnit: "days",
      now: "2020-01-01T00:00:00.000Z",
    });
    const original = `${JSON.stringify({
      version: 1,
      custom: "keep",
      maintenance,
      privacy: "security-owned",
    }, null, 2)}\n`;
    write(configPath, original);
    const h = extensionHarness();
    const ctx = h.context(root, "legacy-non-object-public");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-maintain").handler("routing", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await assert.rejects(
      control.execute(
        "privacy",
        { action: "privacy", excludedPaths: ["safe-dir"], persist: false },
        undefined,
        undefined,
        ctx,
      ),
      /PRIVACY_LEGACY_MIGRATION_REQUIRED.*migrate it explicitly/,
    );
    assert.equal(readFileSync(configPath, "utf8"), original);
    assert.equal(
      JSON.parse(readFileSync(configPath, "utf8")).maintenance.lastCycleAt,
      "2020-01-01T00:00:00.000Z",
    );
  });
});
