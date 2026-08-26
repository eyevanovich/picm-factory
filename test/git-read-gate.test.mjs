import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  access as accessFile,
  mkdir as mkdirDirectory,
  readFile as readFileAsync,
  realpath as realpathFile,
  writeFile as writeFileAsync,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import picmFactoryExtension from "../extensions/picm-factory.ts";
import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";
import { executeBoundGrep } from "../extensions/runtime/path-execution-binding.mjs";
import { createPolicy } from "../extensions/runtime/maintenance-policy.mjs";
import { createRuntimeCoordinator } from "../extensions/runtime/runtime-coordinator.mjs";

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

function extensionHarness({
  entries = [],
  sendError,
  appendError,
  confirm = true,
  createCoordinator,
  grepExecutionOptions,
} = {}) {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry(customType, data) {
      const error = appendError?.(customType, data);
      if (error) throw error;
      entries.push({ type: "custom", customType, data });
    },
    sendUserMessage(message) {
      if (sendError) throw sendError;
      sent.push(message);
    },
  };
  picmFactoryExtension(pi, { createCoordinator, grepExecutionOptions });
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

async function assertRejectsWithin(promise, expected, timeoutMs = 250) {
  let timer;
  const outcome = await Promise.race([
    promise.then(
      () => ({ resolved: true }),
      (error) => ({ error }),
    ),
    new Promise((resolvePromise) => {
      timer = setTimeout(
        () => resolvePromise({ error: new Error(`operation did not settle within ${timeoutMs}ms`) }),
        timeoutMs,
      );
    }),
  ]);
  clearTimeout(timer);
  assert.equal(outcome.resolved, undefined, "operation unexpectedly resolved");
  assert.match(outcome.error.message, expected);
}

function fakeRipgrepSpawn({
  stdout = [],
  stderr = [],
  code = 0,
  hold = false,
  killResult = true,
  killError,
  closeOnKill = true,
  errorAfterKill,
  onChild,
} = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.killed = false;
    let closed = false;
    const close = (exitCode) => {
      if (closed) return;
      closed = true;
      child.stdout.end();
      child.stderr.end();
      child.emit("close", exitCode);
    };
    child.kill = () => {
      if (killError) throw killError;
      child.killed = killResult;
      if (errorAfterKill) process.nextTick(() => child.emit("error", errorAfterKill));
      if (killResult && closeOnKill) queueMicrotask(() => close(null));
      return killResult;
    };
    onChild?.(child);
    setImmediate(() => {
      if (closed) return;
      for (const chunk of stdout) child.stdout.write(chunk);
      for (const chunk of stderr) child.stderr.write(chunk);
      if (!hold) close(code);
    });
    return child;
  };
}

function assertRipgrepListenersSettledSafely(child) {
  assert.equal(child.listenerCount("error"), 1);
  assert.equal(child.listenerCount("close"), 0);
  assert.equal(child.stdin.listenerCount("error"), 1);
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stdout.listenerCount("error"), 1);
  assert.equal(child.stderr.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("error"), 1);
}

async function assertLateRipgrepErrorsAreInert(child) {
  await new Promise((resolvePromise, reject) => {
    setImmediate(() => {
      try {
        child.emit("error", new Error("late child error"));
        child.stdin.emit("error", new Error("late stdin error"));
        child.stdout.emit("error", new Error("late stdout error"));
        child.stderr.emit("error", new Error("late stderr error"));
        resolvePromise();
      } catch (error) {
        reject(error);
      }
    });
  });
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
    const lifecycle = {
      toolCallId: call.id,
      toolName: call.toolName,
      args: call.input,
    };
    if (call.blocked?.block) {
      timeline.push(`blocked:${call.id}`);
      return { id: call.id, isError: true, result: call.result };
    }
    const tool = call.tool ?? h.tools.get(call.toolName);
    try {
      const result = await tool.execute(
        call.id,
        call.input,
        call.signal,
        undefined,
        ctx,
      );
      const isError = Boolean(result?.isError);
      await h.handlers.get("tool_execution_end")?.(
        { ...lifecycle, result, isError },
        ctx,
      );
      timeline.push(`result:${call.id}`);
      return { id: call.id, isError, result };
    } catch (error) {
      const result = {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        details: {},
      };
      await h.handlers.get("tool_execution_end")?.(
        { ...lifecycle, result, isError: true },
        ctx,
      );
      timeline.push(`error:${call.id}`);
      return { id: call.id, isError: true, result };
    }
  });
}

async function promiseSettled(promise) {
  const sentinel = Symbol("not-settled");
  const result = await Promise.race([
    Promise.resolve(promise).then(() => true, () => true),
    Promise.resolve(sentinel),
  ]);
  return result !== sentinel;
}

test("allows file candidates and rejects non-traversal directories", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });

    assert.equal((await gate.checkPath("read", "safe.txt")).allowed, true);
    assert.match((await gate.checkPath("read", ".env")).reason, /ignored by Git/);
    assert.match((await gate.checkPath("read", ".env.tracked")).reason, /ignored by Git/);
    assert.match((await gate.checkPath("read", ".git/config")).reason, /\.git internals/);
    for (const toolName of ["grep", "rg", "find", "ls"]) {
      const scanDecision = await gate.checkPath(toolName, "docs");
      assert.equal(scanDecision.allowed, true);
      assert.equal(scanDecision.protected, true);

      const privacyDecision = await gate.checkPrivacyPath(toolName, "docs", ["private"]);
      assert.equal(privacyDecision.allowed, true);
      assert.equal(privacyDecision.protected, true);
    }
    for (const toolName of ["read", "edit", "write"]) {
      assert.match((await gate.checkPath(toolName, "docs")).reason, /candidate inventory/);
    }

    const outside = join(dirname(root), "outside.txt");
    write(outside, "outside\n");
    assert.match((await gate.checkPath("read", outside)).reason, /outside the canonical Git worktree/);

    if (process.platform !== "win32") {
      assert.match((await gate.checkPath("read", "safe-link")).reason, /symlinks/);
      assert.match((await gate.checkPath("read", "ignored-target-link")).reason, /symlinks/);
      assert.match((await gate.checkPath("read", "safe-dir-link/file.txt")).reason, /symlink/);
    }
    await gate.dispose();
  });
});

test("rejects multiply-linked regular files for direct operations and traversal snapshots", async () => {
  if (process.platform === "win32") return;
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const exclusions = ["private-links"];
    const eligible = "hardlink-eligible.txt";
    write(join(root, eligible), "safe\n");
    git(root, "add", eligible);
    const linked = "hardlink-target.txt";
    write(join(root, linked), "safe\n");
    linkSync(join(root, linked), join(root, "hardlink-alias.txt"));
    git(root, "add", linked, "hardlink-alias.txt");

    for (const toolName of ["read", "edit", "write", "grep", "rg"]) {
      assert.match(
        (await gate.checkPath(toolName, linked, exclusions)).reason,
        /multiple hard links/,
      );
      assert.match(
        (await gate.checkPrivacyPath(toolName, linked, exclusions)).reason,
        /multiple hard links/,
      );
      const decision = await gate.checkPath(toolName, eligible, exclusions);
      assert.equal(decision.allowed, true);
      assert.ok(decision.executionBinding);
    }

    for (const toolName of ["grep", "rg", "find", "ls"]) {
      const decision = await gate.checkPath(toolName, ".", exclusions);
      assert.equal(decision.allowed, true);
      assert.ok(decision.executionBinding);
      const binding = gate.bindPath(decision.executionBinding);
      if (["grep", "rg"].includes(toolName)) {
        assert.equal(binding.files.some((file) => file.path === linked), false);
        assert.equal(binding.files.some((file) => file.path === eligible), true);
      } else if (toolName === "ls") {
        const entries = await binding.operations.readdir(".");
        assert.equal(entries.includes(linked), false);
        assert.equal(entries.includes(eligible), true);
      } else {
        const entries = await binding.operations.glob("*", ".", { limit: 100 });
        assert.equal(entries.includes(linked), false);
        assert.equal(entries.includes(eligible), true);
      }
      binding.release();
    }
    await gate.dispose();
  });
});

test("rechecks hard-link count immediately before guarded reads and mutations", async () => {
  if (process.platform === "win32") return;
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    for (const toolName of ["read", "edit", "write", "grep", "rg"]) {
      const path = `runtime-${toolName}.txt`;
      write(join(root, path), "approved before\n");
      git(root, "add", path);
      const decision = await gate.checkPath(toolName, path, ["private-hardlinks"]);
      assert.equal(decision.allowed, true);
      const binding = gate.bindPath(decision.executionBinding);
      mkdirSync(join(root, "private-hardlinks"), { recursive: true });
      const alias = join(root, "private-hardlinks", `${toolName}.txt`);
      if (toolName === "edit") {
        assert.equal((await binding.operations.readFile(join(root, path))).toString("utf8"), "approved before\n");
      }
      linkSync(join(root, path), alias);
      if (["read", "grep", "rg"].includes(toolName)) {
        await assert.rejects(binding.operations.readFile(join(root, path)), /multiple hard links/);
      } else {
        await assert.rejects(
          binding.operations.writeFile(join(root, path), "must not be written\n"),
          /multiple hard links/,
        );
      }
      assert.equal(readFileSync(alias, "utf8"), "approved before\n");
      binding.release();
    }
    await gate.dispose();
  });
});

test("honors repository-local info/exclude for tracked and untracked paths", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-info-exclude-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  git(root, "init", "-q");
  write(join(root, ".git", "info", "exclude"), "local-secret.txt\ntracked-secret.txt\n");
  write(join(root, "safe.txt"));
  write(join(root, "local-secret.txt"), "SYNTHETIC_LOCAL=ignored\n");
  write(join(root, "tracked-secret.txt"), "SYNTHETIC_TRACKED=ignored\n");
  git(root, "add", "safe.txt");
  git(root, "add", "-f", "tracked-secret.txt");

  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());

  const preflight = await gate.preflight();
  assert.equal(preflight.gitRepository, true);
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
    write(join(root, "private", "nested", "secret.txt"), "SYNTHETIC_PRIVATE=one\n");
    write(join(root, "private-note.txt"), "SYNTHETIC_PRIVATE=two\n");
    git(root, "add", "private/nested/secret.txt", "private-note.txt");
    const gate = createGitReadGate({ cwd: root, packageRoot });

    const exclusions = ["private/nested", "private-note.md"];
    const inventory = await gate.refreshInventory(undefined, exclusions);
    assert.equal(inventory.candidates.has("safe.txt"), true);
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
    assert.equal((await gate.checkPrivacyPath("read", "private-note.txt", exclusions)).allowed, true);
    await gate.dispose();
  });
});

test("preflight detects a non-Git workspace without creating isolated metadata", async () => {
  const root = mkdtempSync(join(tmpdir(), "picm-non-git-preflight-"));
  write(join(root, ".gitignore"), "node_modules/\n");
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  assert.deepEqual(await gate.preflight(), {
    root: await realpathFile(root),
    gitRepository: false,
    rootGitignore: "file",
    gitInfoExclude: "missing",
  });
  assert.equal(existsSync(join(root, ".git")), false);
  await gate.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("allows safe prospective writes and blocks ignored prospective writes and traversal", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    write(join(root, "not-a-directory.txt"), "file\n");
    const gate = createGitReadGate({ cwd: root, packageRoot });
    assert.equal((await gate.checkPath("write", "docs/new.md")).allowed, true);
    assert.equal((await gate.checkPath("write", "output/new.md")).allowed, true);
    assert.equal((await gate.checkPath("write", "new-parent/nested/new.md")).allowed, true);
    assert.match(
      (await gate.checkPath("write", "not-a-directory.txt/child.md")).reason,
      /failed/,
    );
    assert.match((await gate.checkPath("write", "secrets/new.md")).reason, /ignored by Git/);
    assert.equal((await gate.checkPath("grep", ".")).allowed, true);
    assert.match((await gate.checkPath("find", undefined)).reason, /guarded file path/);
  });
});

test("prospective writes allow safe creation and block ignored paths across platforms", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    mkdirSync(join(root, "output"));
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const decision = await gate.checkPath("write", "output/new-file.txt");
    assert.equal(decision.allowed, true);
    const binding = gate.bindPath(decision.executionBinding);
    await binding.operations.writeFile(join(root, "output", "new-file.txt"), "safe content\n");
    assert.equal(readFileSync(join(root, "output", "new-file.txt"), "utf8"), "safe content\n");
    await gate.dispose();
  });
});

test("guarded directory grep rg find and ls filter protected descendants", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, "docs", "public.md"), "VISIBLE_MARKER\n");
    write(join(root, "docs", "root.ts"), "export const visible = true;\n");
    write(join(root, "docs", "a.js"), `marker ${"x".repeat(2100)}\n`);
    write(join(root, "docs", "large.md"), `${Array.from({ length: 120 }, () => `HIT ${"y".repeat(1900)}`).join("\n")}\n`);
    write(join(root, "docs", "context.md"), "before\nHIT one\nHIT two\nafter\n");
    mkdirSync(join(root, "docs", "empty"));
    mkdirSync(join(root, "docs", "nested", "empty"), { recursive: true });
    mkdirSync(join(root, "docs", "ignored-empty"));
    writeFileSync(join(root, ".gitignore"), `${readFileSync(join(root, ".gitignore"), "utf8")}docs/ignored-empty/\n`);
    write(join(root, "docs", "private-note.md"), "VISIBLE_MARKER\n");
    write(join(root, "docs", ".env"), "SYNTHETIC_NESTED=ignored\n");
    git(root, "add", ".gitignore", "docs/public.md", "docs/root.ts", "docs/a.js", "docs/large.md", "docs/context.md", "docs/private-note.md");

    const h = extensionHarness();
    const ctx = h.context(root, "traversal-filter");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["docs/private-note.md"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "grep-dir",
        toolName: "grep",
        input: { path: "docs", pattern: "VISIBLE_MARKER" },
        tool: h.tools.get("grep"),
      },
      {
        id: "rg-dir",
        toolName: "rg",
        input: { path: "docs", pattern: "VISIBLE_MARKER" },
        tool: h.tools.get("rg"),
      },
      {
        id: "find-dir",
        toolName: "find",
        input: { path: "docs", pattern: "*" },
        tool: h.tools.get("find"),
      },
      {
        id: "ls-dir",
        toolName: "ls",
        input: { path: "docs" },
        tool: h.tools.get("ls"),
      },
    ]);
    assert.equal(calls.every((call) => call.blocked === undefined), true);

    const [grepResult, rgResult, findResult, lsResult] = await Promise.all(
      executePreflightedToolCalls(h, ctx, calls),
    );
    for (const result of [grepResult, rgResult]) {
      assert.equal(result.isError, false);
      const text = result.result.content[0].text;
      assert.match(text, /public\.md:1: VISIBLE_MARKER/);
      assert.doesNotMatch(text, /private-note\.md/);
      assert.doesNotMatch(text, /\.env/);
    }

    const findLines = findResult.result.content[0].text.trim().split("\n");
    assert.equal(findLines.includes("public.md"), true);
    assert.equal(findLines.includes("empty/"), true);
    assert.equal(findLines.includes("nested/empty/"), true);
    assert.equal(findLines.includes("ignored-empty/"), false);
    assert.equal(findLines.includes("private-note.md"), false);
    assert.equal(findLines.includes(".env"), false);

    const lsLines = lsResult.result.content[0].text.trim().split("\n");
    assert.equal(lsLines.includes("public.md"), true);
    assert.equal(lsLines.includes("empty/"), true);
    assert.equal(lsLines.includes("nested/"), true);
    assert.equal(lsLines.includes("ignored-empty/"), false);
    assert.equal(lsLines.includes("private-note.md"), false);
    assert.equal(lsLines.includes(".env"), false);
  });
});

test("guarded find and ls stop at unregistered nested Git descendants", async () => {
  const root = mkdtempSync(join(tmpdir(), "picm-nested-git-descendant-"));
  git(root, "init", "-q");
  write(join(root, "vendor", "lib", "safe.txt"), "safe\n");
  write(join(root, "nested-repo", "file.txt"), "nested safe\n");
  git(root, "add", "vendor/lib/safe.txt");
  git(join(root, "nested-repo"), "init", "-q");
  write(join(root, "nested-repo", ".gitignore"), "ignored.txt\n");
  write(join(root, "nested-repo", "ignored.txt"), "synthetic\n");
  git(join(root, "nested-repo"), "add", ".gitignore", "file.txt");

  const packageRoot = join(root, "pkg");
  write(join(packageRoot, "skills", "picm-factory", "SKILL.md"), "---\nname: picm-factory\n---\n");

  const h = extensionHarness();
  const ctx = h.context(root, "nested-descendant-gate");
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
      id: "find-root",
      toolName: "find",
      input: { path: ".", pattern: "*" },
      tool: h.tools.get("find"),
    },
    {
      id: "ls-root",
      toolName: "ls",
      input: { path: "." },
      tool: h.tools.get("ls"),
    },
    {
      id: "find-nested",
      toolName: "find",
      input: { path: "nested-repo", pattern: "*" },
      tool: h.tools.get("find"),
    },
  ]);
  assert.equal(calls[0].blocked, undefined);
  assert.equal(calls[1].blocked, undefined);
  assert.equal(calls[2].blocked.block, true);
  assert.match(calls[2].blocked.reason, /Git-derived candidate inventory|not registered as a parent gitlink/);

  const [findResult, lsResult] = await Promise.all(
    executePreflightedToolCalls(h, ctx, calls.slice(0, 2)),
  );
  const findText = findResult.result.content[0].text;
  assert.match(findText, /vendor\/lib\/safe\.txt/);
  assert.doesNotMatch(findText, /nested-repo\/file\.txt/);

  const lsText = lsResult.result.content[0].text;
  assert.match(lsText, /vendor\//);
  assert.doesNotMatch(lsText, /nested-repo/);

  rmSync(root, { recursive: true, force: true });
});

test("guarded grep and rg enforce per-file and aggregate snapshot ceilings", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    write(join(root, "resource", "large.txt"), `${"x".repeat(700)}\n`);
    write(join(root, "resource", "second.txt"), `${"y".repeat(700)}\n`);
    git(root, "add", "resource/large.txt", "resource/second.txt");

    for (const toolName of ["grep", "rg"]) {
      const perFileGate = createGitReadGate({
        cwd: root,
        packageRoot,
        pathBindingLimits: {
          maxRetainedFileBytes: 32,
          maxTraversalSnapshotBytes: 1024,
        },
      });
      const directoryDecision = await perFileGate.checkPath(toolName, "resource");
      assert.equal(directoryDecision.allowed, true);
      assert.throws(
        () => perFileGate.bindPath(directoryDecision.executionBinding),
        /retained file exceeds 32 bytes/,
      );
      const fileDecision = await perFileGate.checkPath(toolName, "resource/large.txt");
      assert.equal(fileDecision.allowed, true);
      const fileBinding = perFileGate.bindPath(fileDecision.executionBinding);
      await assert.rejects(fileBinding.operations.readFile(join(root, "resource/large.txt")), /exceeds 32 bytes/);
      fileBinding.release();
      await perFileGate.dispose();

      const aggregateGate = createGitReadGate({
        cwd: root,
        packageRoot,
        pathBindingLimits: {
          maxRetainedFileBytes: 1024,
          maxTraversalSnapshotBytes: 1024,
        },
      });
      const aggregateDecision = await aggregateGate.checkPath(toolName, "resource");
      assert.equal(aggregateDecision.allowed, true);
      assert.throws(
        () => aggregateGate.bindPath(aggregateDecision.executionBinding),
        /traversal snapshot exceeds 1024 bytes/,
      );
      await aggregateGate.dispose();
    }
  });
});

test("guarded traversal bounds directory discovery before retaining entries", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    for (let index = 0; index < 25; index += 1) {
      write(join(root, "resource-discovery", `dir-${index}`, "file.txt"), "ok\n");
      git(root, "add", `resource-discovery/dir-${index}/file.txt`);
    }

    for (const toolName of ["grep", "rg", "find", "ls"]) {
      const gate = createGitReadGate({
        cwd: root,
        packageRoot,
        pathBindingLimits: {
          maxTraversalEntries: 10,
        },
      });
      assert.match(
        (await gate.checkPath(toolName, "resource-discovery")).reason,
        /traversal (admission|discovery) exceeds 10 entries/,
      );
      await gate.dispose();
    }
  });
});

test("guarded directory bindings reject retained child symlink replacement", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }
  await withFixture(async ({ root, packageRoot }) => {
    mkdirSync(join(root, "docs", "empty"));
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const decision = await gate.checkPath("ls", "docs", ["private"]);
    assert.equal(decision.allowed, true);
    renameSync(join(root, "docs", "empty"), join(root, "docs", "approved-empty"));
    symlinkSync("../secrets", join(root, "docs", "empty"), "dir");
    assert.throws(() => gate.bindPath(decision.executionBinding), /changed|symlink|ENOTDIR/);
    await gate.dispose();
  });
});

test("guarded bindings reject FIFO replacement without blocking", async (t) => {
  if (process.platform === "win32") {
    t.skip("FIFO behavior is POSIX-specific");
    return;
  }
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    for (const toolName of ["read", "edit", "write"]) {
      const path = `fifo-${toolName}.txt`;
      write(join(root, path), "approved\n");
      git(root, "add", path);
      const decision = await gate.checkPath(toolName, path);
      assert.equal(decision.allowed, true);
      renameSync(join(root, path), join(root, `approved-${path}`));
      execFileSync("mkfifo", [join(root, path)]);
      const startedAt = Date.now();
      assert.throws(() => gate.bindPath(decision.executionBinding));
      assert.ok(Date.now() - startedAt < 1000, `${toolName} FIFO rejection blocked`);
    }
    await gate.dispose();
  });
});

test("guarded grep aborts while ripgrep resolution never settles", async () => {
  const abort = new AbortController();
  const binding = {
    absolutePath: "file.txt",
    files: [{ path: "file.txt", readFile: async () => Buffer.from("content") }],
    operations: { readFile: async () => Buffer.from("content") },
  };
  const resolveMatcher = () => new Promise(() => {});
  const grepPromise = executeBoundGrep(binding, { pattern: "match" }, abort.signal, { resolveMatcher });
  abort.abort();
  await assertRejectsWithin(grepPromise, /Operation aborted/);
});

test("guarded grep reports deterministic subprocess termination failures", async () => {
  const binding = {
    absolutePath: "file.txt",
    files: [{ path: "file.txt", readFile: async () => Buffer.from("first\nsecond\n") }],
    operations: { readFile: async () => Buffer.from("first\nsecond\n") },
  };
  const spawnFailure = fakeRipgrepSpawn({
    killError: new Error("kill failed"),
    stdout: [JSON.stringify({ type: "match", data: { line_number: 1 } }) + "\n"],
  });
  await assert.rejects(
    executeBoundGrep(binding, { pattern: "first", limit: 1 }, undefined, { spawnMatcher: spawnFailure }),
    /PICM_GREP_TERMINATION_FAILED: ripgrep termination request failed: kill failed/,
  );

  const spawnFalse = fakeRipgrepSpawn({
    killResult: false,
    stdout: [JSON.stringify({ type: "match", data: { line_number: 1 } }) + "\n"],
  });
  await assert.rejects(
    executeBoundGrep(binding, { pattern: "first", limit: 1 }, undefined, { spawnMatcher: spawnFalse }),
    /PICM_GREP_TERMINATION_FAILED: ripgrep termination request returned false/,
  );
});

test("guarded grep keeps late child and stream errors inert after bounded termination", async () => {
  const binding = {
    absolutePath: "file.txt",
    files: [{ path: "file.txt", readFile: async () => Buffer.from("first\nsecond\n") }],
    operations: { readFile: async () => Buffer.from("first\nsecond\n") },
  };
  let capturedChild;
  const spawnMatcher = fakeRipgrepSpawn({
    onChild(child) { capturedChild = child; },
    stdout: [
      JSON.stringify({ type: "match", data: { line_number: 1 } }) + "\n",
      JSON.stringify({ type: "match", data: { line_number: 2 } }) + "\n",
    ],
  });
  const result = await executeBoundGrep(binding, { pattern: "first", limit: 1 }, undefined, { spawnMatcher });
  assert.equal(result.details.matchLimitReached, 1);
  assertRipgrepListenersSettledSafely(capturedChild);
  await assertLateRipgrepErrorsAreInert(capturedChild);
});

test("guarded grep rejects malformed subprocess output failures and resource overruns", async () => {
  const binding = {
    absolutePath: "file.txt",
    files: [{ path: "file.txt", readFile: async () => Buffer.from("content\n") }],
    operations: { readFile: async () => Buffer.from("content\n") },
  };
  const malformed = fakeRipgrepSpawn({ stdout: ["not-json\n"] });
  await assert.rejects(
    executeBoundGrep(binding, { pattern: "c" }, undefined, { spawnMatcher: malformed }),
    /PICM_GREP_SUBPROCESS_INVALID: malformed ripgrep JSON record/,
  );
});

test("guarded grep preserves ripgrep line semantics and reports reached resource caps", async () => {
  const binding = {
    absolutePath: "file.txt",
    files: [{ path: "file.txt", readFile: async () => Buffer.from("line1\nline2\n") }],
    operations: { readFile: async () => Buffer.from("line1\nline2\n") },
  };
  const spawnMatcher = fakeRipgrepSpawn({
    stdout: [
      JSON.stringify({ type: "match", data: { line_number: 1 } }) + "\n",
      JSON.stringify({ type: "match", data: { line_number: 2 } }) + "\n",
    ],
  });
  const result = await executeBoundGrep(binding, { pattern: "line", limit: 10 }, undefined, { spawnMatcher });
  assert.equal(result.content[0].text.includes("file.txt:1: line1"), true);
  assert.equal(result.content[0].text.includes("file.txt:2: line2"), true);
});

test("registered grep and rg handle malformed output cancellation spawn and exit failures", async () => {
  const binding = {
    absolutePath: "file.txt",
    files: [{ path: "file.txt", readFile: async () => Buffer.from("ok\n") }],
    operations: { readFile: async () => Buffer.from("ok\n") },
  };
  const spawnError = () => { throw new Error("spawn failed"); };
  await assert.rejects(
    executeBoundGrep(binding, { pattern: "ok" }, undefined, { spawnMatcher: spawnError }),
    /Failed to run ripgrep: spawn failed/,
  );
});

test("registered grep and rg bound match context and rendered-output work", async () => {
  const binding = {
    absolutePath: "file.txt",
    files: [{ path: "file.txt", readFile: async () => Buffer.from("one\ntwo\nthree\n") }],
    operations: { readFile: async () => Buffer.from("one\ntwo\nthree\n") },
  };
  const spawnMatcher = fakeRipgrepSpawn({
    stdout: [JSON.stringify({ type: "match", data: { line_number: 2 } }) + "\n"],
  });
  const result = await executeBoundGrep(
    binding,
    { pattern: "two", context: 1 },
    undefined,
    { spawnMatcher },
  );
  assert.match(result.content[0].text, /file\.txt-1- one\nfile\.txt:2: two\nfile\.txt-3- three/);
});

test("execution bindings initialize and release cleanly", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const decision = await gate.checkPath("read", "safe.txt");
    assert.equal(decision.allowed, true);
    assert.ok(decision.executionBinding);

    const binding = gate.bindPath(decision.executionBinding);
    assert.equal(typeof binding.operations.readFile, "function");
    binding.release();
    await gate.dispose();
  });
});

test("bound built-in wrappers preserve ordinary read and write behavior on the host platform", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, "output", "host.txt"), "before\n");
    const h = extensionHarness();
    const ctx = h.context(root, "ordinary-binding-host-platform");
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
        id: "bound-host-read",
        toolName: "read",
        input: { path: "safe.txt", offset: 1, limit: 1 },
        tool: h.tools.get("read"),
      },
      {
        id: "bound-host-write",
        toolName: "write",
        input: { path: "output/host.txt", content: "host write\n" },
        tool: h.tools.get("write"),
      },
    ]);
    const [readResult, writeResult] = await Promise.all(
      executePreflightedToolCalls(h, ctx, calls),
    );
    assert.equal(readResult.isError, false);
    assert.match(readResult.result.content[0].text, /^safe/);
    assert.equal(writeResult.isError, false);
    assert.equal(readFileSync(join(root, "output", "host.txt"), "utf8"), "host write\n");

    const [missingCall] = await preflightParallelToolCalls(h, ctx, [{
      id: "bound-host-missing-write",
      toolName: "write",
      input: { path: "output/missing.txt", content: "new file\n" },
      tool: h.tools.get("write"),
    }]);
    assert.equal(missingCall.blocked, undefined);
    const [missingResult] = await Promise.all(executePreflightedToolCalls(h, ctx, [missingCall]));
    assert.equal(missingResult.isError, false);
    assert.equal(readFileSync(join(root, "output", "missing.txt"), "utf8"), "new file\n");
  });
});

test("new scaffold config writes resolve createdAt at write time", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "new-scaffold-created-at");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-new").handler("", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const approvedContent = `{\n  "version": 1,\n  "description": "{{createdAt}}",\n  "largeInteger": 9007199254740993,\n  "profile": "specialist-folder",\n  "generatedBy": "picm-factory",\n  "createdAt": "{{createdAt}}",\n  "paths": { "rootInstructions": "AGENTS.md" }\n}`;
    const [call] = await preflightParallelToolCalls(h, ctx, [{
      id: "new-scaffold-config",
      toolName: "write",
      input: {
        path: ".picm/config.json",
        content: approvedContent,
      },
      tool: h.tools.get("write"),
    }]);
    const [result] = await Promise.all(executePreflightedToolCalls(h, ctx, [call]));
    assert.equal(result.isError, false);

    const writtenContent = readFileSync(join(root, ".picm", "config.json"), "utf8");
    const config = JSON.parse(writtenContent);
    assert.equal(config.createdAt.includes("{{createdAt}}"), false);
    assert.equal(new Date(config.createdAt).toISOString(), config.createdAt);
    assert.equal(
      writtenContent,
      approvedContent.replace('"createdAt": "{{createdAt}}"', `"createdAt": "${config.createdAt}"`),
    );

    const [legacyCall] = await preflightParallelToolCalls(h, ctx, [{
      id: "new-scaffold-legacy-config",
      toolName: "write",
      input: {
        path: ".picm/config.json",
        content: JSON.stringify({ createdAt: "2026-08-24", migration: "preserve" }),
      },
      tool: h.tools.get("write"),
    }]);
    const [legacyResult] = await Promise.all(executePreflightedToolCalls(h, ctx, [legacyCall]));
    assert.equal(legacyResult.isError, false);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, ".picm", "config.json"), "utf8")),
      { createdAt: "2026-08-24", migration: "preserve" },
    );
  });
});

test("allows only canonical shipped PiCM skill resources from the package root", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const skill = join(packageRoot, "skills", "picm-factory", "SKILL.md");
    const reference = join(packageRoot, "skills", "picm-factory", "references", "guide.md");
    const neighbor = join(dirname(packageRoot), "neighbor", "README.md");

    assert.equal((await gate.checkPath("read", skill)).allowed, true);
    assert.equal((await gate.checkPath("read", reference)).allowed, true);
    assert.match((await gate.checkPath("read", neighbor)).reason, /ignored by Git/);
    assert.match((await gate.checkPath("edit", skill)).reason, /ignored by Git|outside/);
    await gate.dispose();
  });
});

test("supports a declared symlinked package root without trusting nested aliases", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }
  await withFixture(async ({ root, packageRoot }) => {
    const symlinkedRoot = join(root, "symlinked-package");
    symlinkSync(packageRoot, symlinkedRoot);
    const gate = createGitReadGate({ cwd: root, packageRoot: symlinkedRoot });
    const declaredSkill = join(symlinkedRoot, "skills", "picm-factory", "SKILL.md");
    const skillDecision = await gate.checkTrustedPackageRead("read", declaredSkill);
    assert.equal(skillDecision.allowed, true);
    await gate.dispose();
  });
});

test("pins a declared symlinked package root before its first trusted read", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }
  await withFixture(async ({ root, packageRoot }) => {
    const canonicalPackageRoot = await realpathFile(packageRoot);
    const symlinkTarget = join(root, "initial-target");
    symlinkSync(packageRoot, symlinkTarget);
    const gate = createGitReadGate({
      cwd: root,
      packageRoot: symlinkTarget,
      canonicalPackageRoot,
    });
    const declaredSkill = join(symlinkTarget, "skills", "picm-factory", "SKILL.md");
    assert.equal((await gate.checkTrustedPackageRead("read", declaredSkill)).allowed, true);
    await gate.dispose();
  });
});

test("blocks every agent Bash command presented to an active gate", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    for (const command of ["ls", "git status", "pwd"]) {
      const decision = await gate.checkBash(command);
      assert.equal(decision.allowed, false);
      assert.match(decision.reason, /agent Bash is blocked/);
    }
    await gate.dispose();
  });
});

test("uses isolated Git metadata to honor gitignore without modifying a non-Git workspace", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-non-git-isolated-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  write(join(root, ".gitignore"), "ignored.txt\n*.log\n");
  write(join(root, "safe.txt"), "safe\n");
  write(join(root, "ignored.txt"), "ignored\n");
  write(join(root, "nested", "keep.log.txt"), "keep\n");
  write(join(root, "nested", "drop.log"), "drop\n");

  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());

  const inventory = await gate.refreshInventory(undefined, ["config-private.txt"]);
  assert.equal(inventory.isolated, true);
  assert.equal(inventory.candidates.has("safe.txt"), true);
  assert.equal(inventory.candidates.has("ignored.txt"), false);

  assert.equal((await gate.checkPath("read", "safe.txt")).allowed, true);
  assert.equal((await gate.checkPath("read", "nested/keep.log.txt")).allowed, true);
  assert.match((await gate.checkPath("read", "ignored.txt")).reason, /ignored by Git/);
  assert.match((await gate.checkPath("read", "nested/drop.log")).reason, /ignored by Git/);
});

test("treats present submodules as separate guarded worktrees", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-submodule-parent-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");

  const subRoot = join(root, "vendor", "lib");
  mkdirSync(subRoot, { recursive: true });
  git(subRoot, "init", "-q");
  write(join(subRoot, ".gitignore"), "secret.txt\n");
  write(join(subRoot, "safe.txt"), "safe submodule\n");
  write(join(subRoot, "secret.txt"), "secret\n");
  git(subRoot, "add", ".gitignore", "safe.txt");
  git(subRoot, "-c", "user.name=T", "-c", "user.email=t@e.invalid", "commit", "-qm", "sub");

  git(root, "add", "vendor/lib");
  git(root, "-c", "user.name=T", "-c", "user.email=t@e.invalid", "commit", "-qm", "parent");

  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());

  assert.equal((await gate.checkPath("read", "vendor/lib/safe.txt")).allowed, true);
  assert.match((await gate.checkPath("read", "vendor/lib/secret.txt")).reason, /ignored by Git/);
  assert.match((await gate.checkPath("read", "vendor/lib/.git")).reason, /\.git internals/);
});

test("isolated Git metadata is removed by gate disposal", async () => {
  const root = mkdtempSync(join(tmpdir(), "picm-non-git-disposal-"));
  write(join(root, ".gitignore"), "ignored.txt\n");
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  await gate.refreshInventory();
  await gate.dispose();
  assert.equal(existsSync(join(root, ".git")), false);
  rmSync(root, { recursive: true, force: true });
});

test("gate disposal waits for in-flight isolated Git operations", async () => {
  const root = mkdtempSync(join(tmpdir(), "picm-disposal-wait-"));
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  await gate.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("isolated Git initialization failure cleans up and fails closed", async () => {
  const root = mkdtempSync(join(tmpdir(), "picm-init-failure-"));
  const gate = createGitReadGate({
    cwd: root,
    packageRoot: root,
    runGit: async (_cwd, args) => {
      if (args[0] === "rev-parse") return { code: 128, stdout: "", stderr: "fatal: not a git repository" };
      if (args[0] === "init") return { code: 1, stdout: "", stderr: "fatal: mock init failure" };
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  await assert.rejects(gate.refreshInventory(), /Isolated Git initialization failed/);
  await gate.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("fails closed when Git worktree discovery fails generically or throws", async () => {
  const gate = createGitReadGate({
    cwd: "/some/path",
    packageRoot: "/some/path",
    runGit: async () => ({ code: 128, stdout: "", stderr: "fatal: corrupted git repo" }),
  });
  assert.match((await gate.checkPath("read", "file.txt")).reason, /corrupted git repo/);
  await gate.dispose();
});

test("fails closed when an in-memory Git ignore adapter cannot resolve a check", async () => {
  const root = mkdtempSync(join(tmpdir(), "picm-ignore-adapter-fail-"));
  git(root, "init", "-q");
  write(join(root, "file.txt"), "content\n");
  git(root, "add", "file.txt");

  const gate = createGitReadGate({
    cwd: root,
    packageRoot: root,
    runGit: async (cwd, args) => {
      if (args.includes("check-ignore")) return { code: 2, stdout: "", stderr: "fatal: check-ignore error" };
      return defaultRunGit(cwd, args);
    },
  });
  assert.match((await gate.checkPath("read", "file.txt")).reason, /unresolved/);
  await gate.dispose();
  rmSync(root, { recursive: true, force: true });
});

async function defaultRunGit(cwd, args) {
  try {
    const result = execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    return { code: 0, stdout: result, stderr: "" };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("extension gate is inactive outside explicit PiCM scan phases", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "inactive-gate");
    assert.equal(await h.handlers.get("tool_call")({ toolName: "read", input: { path: "safe.txt" } }, ctx), undefined);
    assert.equal(await h.handlers.get("tool_call")({ toolName: "bash", input: { command: "ls" } }, ctx), undefined);
  });
});

test("privacy refuses before preflight without reading config or initializing isolated Git", async (t) => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "privacy-before-preflight");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await assert.rejects(
      control.execute("id", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx),
      /PICM_PREFLIGHT_INCOMPLETE/,
    );
  });
});

test("explicit PiCM scans require privacy review before honoring gitignore in non-Git workspaces", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-non-git-privacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(join(root, ".gitignore"), "ignored.txt\n");
  write(join(root, "safe.txt"), "safe\n");

  const h = extensionHarness();
  const ctx = h.context(root, "non-git-privacy");
  const control = h.tools.get("picm_scan_control");
  await h.commands.get("picm-adopt").handler("coding", ctx);
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);

  assert.equal((await h.handlers.get("tool_call")({ toolName: "read", input: { path: "safe.txt" } }, ctx)).block, true);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  assert.equal(await h.handlers.get("tool_call")({ toolName: "read", input: { path: "safe.txt" } }, ctx), undefined);
});

test("persistent privacy review writes config and protects later inventories", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness({ confirm: true });
    const ctx = h.context(root, "persistent-privacy");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    const result = await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: true },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(result.details.ok, true);
    assert.equal(result.details.persisted, true);
    const config = JSON.parse(readFileSync(join(root, ".picm", "config.json"), "utf8"));
    assert.deepEqual(config.privacy.excludedPaths, ["safe-dir"]);
  });
});

test("declining persistent privacy keeps review incomplete", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness({ confirm: false });
    const ctx = h.context(root, "declined-privacy");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    const result = await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["safe-dir"], persist: true },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(result.details.ok, false);
    assert.equal(result.details.code, "PRIVACY_APPLY_DECLINED");
    assert.equal(existsSync(join(root, ".picm", "config.json")), false);
  });
});

test("aborted config confirmations do not mutate project policy", async () => {
  await withFixture(async ({ root }) => {
    const abort = new AbortController();
    abort.abort();
    const h = extensionHarness();
    const ctx = h.context(root, "aborted-privacy");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await assert.rejects(
      control.execute("privacy", { action: "privacy", excludedPaths: ["safe-dir"], persist: true }, abort.signal, undefined, ctx),
      /PICM_SCAN_ABORTED/,
    );
  });
});

test("explicit PiCM commands enforce privacy review, session scope, and durable exclusions", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "command-privacy");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);

    assert.equal((await h.handlers.get("tool_call")({ toolName: "read", input: { path: "safe.txt" } }, ctx)).block, true);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: ["safe-dir"] }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    assert.equal(await h.handlers.get("tool_call")({ toolName: "read", input: { path: "safe.txt" } }, ctx), undefined);
    assert.equal((await h.handlers.get("tool_call")({ toolName: "read", input: { path: "safe-dir/file.txt" } }, ctx)).block, true);

    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
    assert.equal(await h.handlers.get("tool_call")({ toolName: "bash", input: { command: "git diff" } }, ctx), undefined);
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
    assert.deepEqual(restored.details.excludedPaths, ["safe-dir"]);
  });
});

test("resumed scan authorization does not expire by elapsed time", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness({ entries: [{
      type: "custom",
      customType: "picm-scan-workflow",
      data: {
        status: "authorized",
        cwd: root,
        command: "picm-adopt",
        expiresAt: "2000-01-01T00:00:00.000Z",
        preflightComplete: true,
        privacyReviewed: true,
        scanStarted: true,
        scanSettled: true,
        maintenanceResetAttempted: false,
        excludedPaths: ["safe-dir"],
      },
    }] });
    const ctx = h.context(root, "long-lived-session");
    await h.handlers.get("session_start")({ reason: "resume" }, ctx);
    const status = await h.tools.get("picm_scan_control").execute(
      "id",
      { action: "status" },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(status.details.authorized, true);
    assert.equal(status.details.privacyReviewed, true);
  });
});

test("incomplete resumed workflow state is never treated as preflight-complete", async () => {
  await withFixture(async ({ root }) => {
    const entries = [{
      type: "custom",
      customType: "picm-scan-workflow",
      data: {
        status: "authorized",
        cwd: root,
        command: "picm-adopt",
        preflightComplete: false,
        privacyReviewed: false,
        scanStarted: false,
        maintenanceResetAttempted: false,
        excludedPaths: [],
      },
    }];
    const h = extensionHarness({ entries });
    const ctx = h.context(root, "incomplete-resumed");
    await h.handlers.get("session_start")({ reason: "resume" }, ctx);
    const status = await h.tools.get("picm_scan_control").execute("id", { action: "status" }, undefined, undefined, ctx);
    assert.equal(status.details.preflightComplete, false);
  });
});

test("scan authorization rejects help, cwd mismatch, and dispatch failure", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "auth-checks");
    await h.commands.get("picm-help").handler("", ctx);
    await assert.rejects(
      h.tools.get("picm_scan_control").execute("id", { action: "preflight" }, undefined, undefined, ctx),
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

test("complete finishes workflow and allows subsequent agent tools without lockout", async () => {
  await withFixture(async ({ root }) => {
    const entries = [];
    const h = extensionHarness({ entries });
    const ctx = h.context(root, "complete-lifecycle");
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
    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    const completeResult = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
    assert.equal(completeResult.details.completed, true);
    assert.equal(completeResult.details.authorized, false);

    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: "safe.txt" } },
      ctx,
    ), undefined);
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "bash", input: { command: "git status" } },
      ctx,
    ), undefined);
  });
});

test("session shutdown preserves cleanup and persistence errors", async () => {
  await withFixture(async ({ root }) => {
    const cleanupError = new Error("synthetic shutdown cleanup failure");
    const persistenceError = new Error("synthetic terminal persistence failure");
    const h = extensionHarness({
      createCoordinator(options) {
        const coordinator = createRuntimeCoordinator(options);
        return {
          ...coordinator,
          async dispose(ctx) {
            await coordinator.dispose(ctx);
            throw cleanupError;
          },
        };
      },
      appendError(_customType, data) {
        return data?.status === "cleared" ? persistenceError : undefined;
      },
    });
    const ctx = h.context(root, "shutdown-dual-failure");
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
    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);

    await assert.rejects(
      h.handlers.get("session_shutdown")({ reason: "quit" }, ctx),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [cleanupError, persistenceError]);
        return true;
      },
    );
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
      if (command === "picm-maintain" || command === "picm-optimize") {
        assert.ok(preflightIndex >= 0 && preflightIndex < skillIndex);
        assert.match(prompt, /privacyQuestionIsConcise/);
        assert.match(prompt, /files or directory that should be excluded from reads/);
      } else {
        assert.ok(preflightIndex >= 0 && preflightIndex < privacyIndex && privacyIndex < skillIndex);
      }
      assert.match(prompt, /PiCM automatically protects:/);
      assert.match(prompt, /Git internals/);
      assert.match(prompt, /symlinks and nested repository\/submodule boundaries/);
      assert.match(prompt, /secrets, regulated data, client data, or personal\/private material/);
      assert.match(prompt, /exact project-relative file or directory to exclude/);
      assert.match(prompt, /reply `none` if there are none/);

      const control = h.tools.get("picm_scan_control");
      const skill = join(packageRoot, "skills", "picm-factory", "SKILL.md");
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: skill } },
        ctx,
      ), undefined);

      assert.equal((await h.handlers.get("tool_call")(
        { toolName: "read", input: { path: "safe.txt" } },
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
    }
  });
});

test("trusted package parent alias stays canonical after successful pre-begin and active admission", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "trusted-canonical");
    const packageRoot = resolve(".");
    const skill = join(packageRoot, "skills", "picm-factory", "SKILL.md");
    const canonicalSkill = await realpathFile(skill);
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

    const input = { path: `@${canonicalSkill}` };
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "read", input },
      ctx,
    ), undefined);
    assert.equal(input.path, canonicalSkill);

    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    const activeInput = {
      path: join(packageRoot, "skills", "picm-factory", "references", "..", "SKILL.md"),
    };
    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "read", input: activeInput },
      ctx,
    ), undefined);
    assert.equal(activeInput.path, canonicalSkill);
  });
});

test("ordinary built-in reads and writes fail closed if swapped with symlinks", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }

  await withFixture(async ({ root }) => {
    write(join(root, ".gitignore"), `${readFileSync(join(root, ".gitignore"), "utf8")}private/\nprivate-write/\n`);
    write(join(root, "private", "secret.txt"), "SYNTHETIC_PRIVACY_SECRET\n");
    write(join(root, "private-write", "file.txt"), "PRIVATE_WRITE_UNCHANGED\n");
    write(join(root, "output", "file.txt"), "approved original content\n");

    const h = extensionHarness();
    const ctx = h.context(root, "ordinary-binding-parent-swap");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["private", "private-write"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const [readCall] = await preflightParallelToolCalls(h, ctx, [{
      id: "ordinary-bound-read",
      toolName: "read",
      input: { path: "safe.txt" },
      tool: h.tools.get("read") ?? createReadTool(root),
    }]);
    assert.equal(readCall.blocked, undefined);
    renameSync(join(root, "safe.txt"), join(root, "safe-approved.txt"));
    symlinkSync("private/secret.txt", join(root, "safe.txt"));
    const [readResult] = await Promise.all(executePreflightedToolCalls(h, ctx, [readCall]));
    const readText = readResult.result.content.map((part) => part.text ?? "").join("\n");
    assert.doesNotMatch(readText, /SYNTHETIC_PRIVACY_SECRET/);
  });
});

test("ordinary edits fail closed if target swapped with symlink", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }

  await withFixture(async ({ root }) => {
    write(join(root, ".gitignore"), `${readFileSync(join(root, ".gitignore"), "utf8")}private-edit/\n`);
    write(join(root, "edit-dir", "file.txt"), "approved before\n");
    write(join(root, "private-edit", "file.txt"), "PRIVATE_EDIT_UNCHANGED\n");
    git(root, "add", "edit-dir/file.txt");
    const h = extensionHarness();
    const ctx = h.context(root, "ordinary-binding-edit");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["private-edit"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const [editCall] = await preflightParallelToolCalls(h, ctx, [{
      id: "ordinary-bound-edit",
      toolName: "edit",
      input: {
        path: "edit-dir/file.txt",
        edits: [{ oldText: "approved before", newText: "approved after" }],
      },
      tool: h.tools.get("edit") ?? createEditTool(root),
    }]);
    assert.equal(editCall.blocked, undefined);
    renameSync(join(root, "edit-dir"), join(root, "approved-edit-dir"));
    symlinkSync("private-edit", join(root, "edit-dir"), "dir");
    const [edited] = await Promise.all(executePreflightedToolCalls(h, ctx, [editCall]));
    assert.equal(readFileSync(join(root, "private-edit", "file.txt"), "utf8"), "PRIVATE_EDIT_UNCHANGED\n");
  });
});

test("ordinary grep, find, and ls cannot traverse a swapped parent", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }

  await withFixture(async ({ root }) => {
    write(join(root, ".gitignore"), `${readFileSync(join(root, ".gitignore"), "utf8")}private-search/\n`);
    write(join(root, "private-search", "guide.md"), "SYNTHETIC_PRIVATE_SEARCH\n");
    write(join(root, "private-search", "nested-secret.txt"), "private\n");
    const h = extensionHarness();
    const ctx = h.context(root, "ordinary-binding-read-like-tools");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["private-search"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "ordinary-bound-find",
        toolName: "find",
        input: { path: "docs" },
        tool: h.tools.get("find"),
      },
      {
        id: "ordinary-bound-ls",
        toolName: "ls",
        input: { path: "docs" },
        tool: h.tools.get("ls"),
      },
    ]);
    assert.equal(calls.every((call) => call.blocked === undefined), true);
    renameSync(join(root, "docs"), join(root, "approved-docs"));
    symlinkSync("private-search", join(root, "docs"), "dir");

    const [findResult, lsResult] = await Promise.all(
      executePreflightedToolCalls(h, ctx, calls),
    );
    for (const result of [findResult, lsResult]) {
      const text = result.result.content.map((part) => part.text ?? "").join("\n");
      assert.doesNotMatch(text, /nested-secret|SYNTHETIC_PRIVATE_SEARCH/);
    }
  });
});

test("bound writes preserve create semantics across platforms", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, ".gitignore"), `${readFileSync(join(root, ".gitignore"), "utf8")}private-write/\n`);
    write(join(root, "output", ".keep"), "keep\n");
    write(join(root, "private-write", ".keep"), "private\n");
    const h = extensionHarness();
    const ctx = h.context(root, "ordinary-binding-create");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["private-write"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const [createCall] = await preflightParallelToolCalls(h, ctx, [{
      id: "ordinary-bound-create",
      toolName: "write",
      input: { path: "output/new.txt", content: "created safely\n" },
      tool: h.tools.get("write") ?? createWriteTool(root),
    }]);
    assert.equal(createCall.blocked, undefined);
    const [created] = await Promise.all(executePreflightedToolCalls(h, ctx, [createCall]));
    assert.equal(created.isError, false);
    assert.equal(readFileSync(join(root, "output", "new.txt"), "utf8"), "created safely\n");
  });
});

test("active scans reject trusted parent aliases before they can cross project boundaries", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "trusted-alias-boundary");
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
    const outside = join(root, "..", "outside.txt");
    const blocked = await h.handlers.get("tool_call")(
      { toolName: "read", input: { path: outside } },
      ctx,
    );
    assert.equal(blocked.block, true);
  });
});

test("pre-begin admission allows only policy preview and canonical packaged reads", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "pre-begin-admission");
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

    assert.equal(await h.handlers.get("tool_call")(
      { toolName: "picm_maintenance_policy", input: { action: "preview", mode: "manual" } },
      ctx,
    ), undefined);
    assert.equal((await h.handlers.get("tool_call")(
      { toolName: "picm_maintenance_policy", input: { action: "status" } },
      ctx,
    )).block, true);
  });
});

test("noninteractive commands preserve generic skill and argument dispatch", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "noninteractive", "json");
    await h.commands.get("picm-new").handler("some workflow description", ctx);
    assert.match(h.sent.at(-1), /some workflow description/);
  });
});

test("legacy opaque privacy survives session-only and persistent reviews", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, ".picm", "config.json"), JSON.stringify({
      version: 1,
      privacy: { legacyField: true, excludedPaths: ["legacy-path"] },
    }));
    const h = extensionHarness();
    const ctx = h.context(root, "legacy-privacy");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    const privacyResult = await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["new-path"] },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(privacyResult.details.ok, true);
    assert.deepEqual(privacyResult.details.excludedPaths, ["legacy-path", "new-path"]);
  });
});

test("public privacy review preserves non-object legacy config and skips maintenance reset", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, ".picm", "config.json"), JSON.stringify({
      version: 1,
      privacy: { excludedPaths: ["initial"] },
    }));
    const h = extensionHarness();
    const ctx = h.context(root, "optimize-privacy");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-optimize").handler("", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    const result = await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: [] },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(result.details.ok, true);
    assert.equal(result.details.maintenanceReset, undefined);
  });
});
