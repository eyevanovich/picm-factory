import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import picmFactoryExtension from "../extensions/picm-factory.ts";
import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";

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

function extensionHarness({ sendError } = {}) {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    sendUserMessage(message) {
      if (sendError) throw sendError;
      sent.push(message);
    },
  };
  picmFactoryExtension(pi);
  const context = (cwd, sessionId = "session-1") => ({
    cwd,
    mode: "tui",
    hasUI: false,
    waitForIdle: async () => {},
    sessionManager: {
      getEntries: () => [],
      getSessionId: () => sessionId,
    },
    ui: { notify() {} },
  });
  return { handlers, commands, tools, sent, context };
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

test("refreshes ignored inventory and blocks literal paths and known bash bypasses", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });

    assert.equal((await gate.checkBash("git status --short")).allowed, true);
    assert.equal((await gate.checkBash("cat safe.txt")).allowed, true);
    assert.match((await gate.checkBash("cat ../outside.txt")).reason, /outside the canonical Git worktree|path resolution failed/);
    assert.match((await gate.checkBash("cat missing.txt")).reason, /path resolution failed/);
    assert.match((await gate.checkBash('cat "$TARGET"')).reason, /could not be deterministically validated/);
    assert.match((await gate.checkBash("cat .env")).reason, /ignored inventory path/);
    assert.match((await gate.checkBash("git show HEAD:.env.tracked")).reason, /Git object\/content/);
    assert.match((await gate.checkBash("git diff HEAD~1")).reason, /Git object\/content/);
    assert.match((await gate.checkBash("git log -p -1")).reason, /Git patch-content/);
    assert.match((await gate.checkBash("git config --local --get user.email")).reason, /config command/);
    assert.match((await gate.checkBash("git -C ../other status")).reason, /worktree switching/);
    assert.match((await gate.checkBash("git --git-dir=../other/.git status")).reason, /worktree override|\.git access/);
    assert.match((await gate.checkBash("git --work-tree ../other status")).reason, /worktree override/);
    assert.match((await gate.checkBash("GIT_DIR=../other/.git git status")).reason, /environment override|\.git access/);
    assert.match((await gate.checkBash("GIT_WORK_TREE=../other git status")).reason, /environment override/);
    assert.match((await gate.checkBash("cd ../other && git status")).reason, /shell worktree switching/);
    assert.match((await gate.checkBash("pushd ../other; git status")).reason, /shell worktree switching/);
    assert.match((await gate.checkBash("cat .git/config")).reason, /\.git access/);
    assert.match((await gate.checkBash(`cat ${join(root, ".git", "config")}`)).reason, /\.git access/);
    assert.match((await gate.checkBash("rg --no-ignore token .")).reason, /ignore-disabling/);
    assert.match((await gate.checkBash("find . -type f -exec cat {} +")).reason, /broad find/);

    write(join(root, "late.pem"), "synthetic ignored\n");
    assert.match((await gate.checkBash("cat late.pem")).reason, /late\.pem/);
    assert.match((await gate.checkBash("cat .e''nv")).reason, /ignored inventory path/);
    assert.match((await gate.checkBash("g''it diff HEAD~1")).reason, /Git object\/content/);
    assert.match((await gate.checkBash("g'i't show HEAD:safe.txt")).reason, /Git object\/content/);

    const dynamic = await gate.checkBash('part=env; cat ".${part}"');
    assert.equal(dynamic.allowed, false);
    assert.match(dynamic.reason, /could not be deterministically validated/);
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
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());

  const inventory = await gate.refreshInventory();
  assert.equal(inventory.isolated, true);
  assert.equal(inventory.candidates.has("safe.txt"), true);
  assert.equal(inventory.candidates.has("nested/keep.log"), true);
  assert.equal((await gate.checkPath("read", "safe.txt")).allowed, true);
  assert.equal((await gate.checkPath("read", "nested/keep.log")).allowed, true);
  assert.match((await gate.checkPath("read", "ignored.txt")).reason, /ignored by Git/);
  assert.match((await gate.checkPath("read", "nested/drop.log")).reason, /ignored by Git/);
  assert.equal(existsSync(join(root, ".git")), false);
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

test("explicit PiCM scans honor gitignore in non-Git workspaces", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-non-git-scan-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(join(root, ".gitignore"), "ignored.txt\n");
  write(join(root, "safe.txt"));
  write(join(root, "ignored.txt"));
  const h = extensionHarness();
  const ctx = h.context(root, "non-git-session");

  await h.commands.get("picm-maintain").handler("", ctx);
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

test("explicit PiCM commands scope the gate to the active session and scan phase", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "authorized-session");
    const unrelated = h.context(root, "unrelated-session");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    assert.equal(h.sent.length, 1);

    const blockedRead = await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: ".env" } },
      ctx,
    );
    assert.equal(blockedRead.block, true);
    assert.match(blockedRead.reason, /ignored by Git/);
    const blockedBash = await h.handlers.get("tool_call")(
      { toolName: "bash", input: { command: "git diff HEAD~1" } },
      ctx,
    );
    assert.equal(blockedBash.block, true);
    assert.equal(h.handlers.has("user_bash"), false);

    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: ".env" } },
      unrelated,
    ), undefined);
    const scanControl = h.tools.get("picm_scan_control");
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, unrelated),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );

    await h.handlers.get("agent_settled")({}, ctx);
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: ".env" } },
      ctx,
    ), undefined);

    const begun = await scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    assert.equal(begun.details.authorized, true);
    assert.equal(begun.details.active, true);
    assert.equal((await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: ".env.tracked" } },
      ctx,
    )).block, true);

    const ended = await scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
    assert.equal(ended.details.authorized, true);
    assert.equal(ended.details.active, false);
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "bash", input: { command: "git diff --check" } },
      ctx,
    ), undefined);

    await scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    const completed = await scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
    assert.equal(completed.details.authorized, false);
    assert.equal(completed.details.active, false);
    await assert.rejects(
      scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx),
      /PICM_SCAN_NOT_AUTHORIZED/,
    );

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

    const timed = extensionHarness();
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
