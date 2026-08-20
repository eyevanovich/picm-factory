import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  fstatSync,
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
import { dirname, join, resolve } from "node:path";
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

function fakeRipgrepSpawn({ stdout = [], stderr = [], code = 0, hold = false } = {}) {
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
      child.killed = true;
      queueMicrotask(() => close(null));
      return true;
    };
    setImmediate(() => {
      if (closed) return;
      for (const chunk of stdout) child.stdout.write(chunk);
      for (const chunk of stderr) child.stderr.write(chunk);
      if (!hold) close(code);
    });
    return child;
  };
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

test("allows file candidates and rejects non-traversal directories", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });

    assert.equal((await gate.checkPath("read", "safe.txt")).allowed, true);
    assert.match((await gate.checkPath("read", ".env")).reason, /ignored by Git/);
    assert.match((await gate.checkPath("read", ".env.tracked")).reason, /ignored by Git/);
    assert.match((await gate.checkPath("read", ".git/config")).reason, /\.git internals/);
    for (const toolName of ["read", "edit", "write"]) {
      const scanDecision = await gate.checkPath(toolName, "docs");
      assert.equal(scanDecision.allowed, false);
      assert.match(scanDecision.reason, /candidate inventory/);

      const privacyDecision = await gate.checkPrivacyPath(toolName, "docs", ["private"]);
      assert.equal(privacyDecision.allowed, false);
      assert.match(privacyDecision.reason, /candidate inventory/);
    }

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

test("rejects multiply-linked regular files for direct operations and traversal snapshots", async () => {
  if (process.platform === "win32") return;
  await withFixture(async ({ root, packageRoot }) => {
    writeFileSync(
      join(root, ".gitignore"),
      `${readFileSync(join(root, ".gitignore"), "utf8")}ignored-hardlinks/\ntracked-hidden.txt\n`,
    );
    const aliases = [
      ["ignored-alias.txt", "ignored-hardlinks/secret.txt", "IGNORED_HARDLINK"],
      ["tracked-alias.txt", "tracked-hidden.txt", "TRACKED_IGNORED_HARDLINK"],
      ["private-alias.txt", "private-hardlinks/secret.txt", "PRIVATE_HARDLINK"],
    ];
    for (const [eligible, protectedPath, marker] of aliases) {
      write(join(root, eligible), `${marker}\n`);
      mkdirSync(dirname(join(root, protectedPath)), { recursive: true });
      linkSync(join(root, eligible), join(root, protectedPath));
      git(root, "add", eligible);
    }
    git(root, "add", ".gitignore");
    git(root, "add", "-f", "tracked-hidden.txt");

    const gate = createGitReadGate({ cwd: root, packageRoot });
    const exclusions = ["private-hardlinks"];
    for (const [eligible] of aliases) {
      for (const toolName of ["read", "edit", "write", "grep", "rg", "find", "ls"]) {
        const decision = await gate.checkPath(toolName, eligible, exclusions);
        assert.equal(decision.allowed, false, `${toolName} unexpectedly admitted ${eligible}`);
        assert.match(decision.reason, /multiple hard links/);
      }
    }

    for (const toolName of ["grep", "rg", "find", "ls"]) {
      const decision = await gate.checkPath(toolName, ".", exclusions);
      assert.equal(decision.allowed, true);
      const binding = gate.bindPath(decision.executionBinding);
      try {
        let visible;
        if (toolName === "grep" || toolName === "rg") {
          visible = binding.files.map((file) => file.path);
        } else if (toolName === "find") {
          visible = await binding.operations.glob("**", root, { limit: 1000 });
        } else {
          visible = await binding.operations.readdir(root);
        }
        assert.doesNotMatch(visible.join("\n"), /(?:ignored|tracked|private)-alias\.txt/);
      } finally {
        binding.release();
      }
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
        assert.equal((await binding.operations.readFile()).toString("utf8"), "approved before\n");
      }
      linkSync(join(root, path), alias);
      if (["read", "grep", "rg"].includes(toolName)) {
        await assert.rejects(binding.operations.readFile(path), /multiple hard links/);
      } else {
        await assert.rejects(
          binding.operations.writeFile(path, "must not be written\n"),
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

    assert.equal((await gate.checkPath("write", "docs/new.md")).allowed, true);
    assert.equal((await gate.checkPath("write", "output/new.md")).allowed, true);
    assert.equal((await gate.checkPath("write", "new-parent/nested/new.md")).allowed, true);
    write(join(root, "not-a-directory.txt"), "file\n");
    assert.match(
      (await gate.checkPath("write", "not-a-directory.txt/child.md")).reason,
      /not a directory/,
    );
    assert.match((await gate.checkPath("write", "secrets/new.md")).reason, /ignored by Git/);
    assert.equal((await gate.checkPath("grep", ".")).allowed, true);
    assert.match((await gate.checkPath("find", undefined)).reason, /guarded file path/);
  });
});

test("prospective writes fail closed when the leaf appears after admission", async (t) => {
  if (process.platform !== "linux") {
    t.skip("descriptor-relative prospective writes are Linux-specific");
    return;
  }
  await withFixture(async ({ root, packageRoot }) => {
    mkdirSync(join(root, "output"));
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const decision = await gate.checkPath("write", "output/raced.txt");
    assert.equal(decision.allowed, true);
    linkSync(join(root, ".env"), join(root, "output", "raced.txt"));
    assert.throws(() => gate.bindPath(decision.executionBinding), /appeared after validation/);
    assert.equal(readFileSync(join(root, ".env"), "utf8"), "SYNTHETIC_ONLY=ignored\n");
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
    write(join(root, "docs", "private", "secret.md"), "PRIVATE_MARKER\n");
    git(root, "add", "docs/public.md", "docs/root.ts", "docs/a.js", "docs/large.md", "docs/context.md", "docs/private/secret.md");
    git(root, "add", ".gitignore");
    const h = extensionHarness();
    const ctx = h.context(root, "guarded-directory-filtering");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: ["docs/private"], persist: false }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const specs = [
      { id: "directory-grep", toolName: "grep", input: { path: "docs", pattern: "MARKER" } },
      { id: "directory-rg", toolName: "rg", input: { path: "docs", pattern: "MARKER" } },
      { id: "directory-find", toolName: "find", input: { path: "docs", pattern: "**" } },
      { id: "directory-ls", toolName: "ls", input: { path: "docs" } },
    ].map((spec) => ({ ...spec, tool: h.tools.get(spec.toolName) }));
    const calls = await preflightParallelToolCalls(h, ctx, specs);
    assert.equal(calls.every((call) => call.blocked === undefined), true);
    const results = await Promise.all(executePreflightedToolCalls(h, ctx, calls));
    for (const result of results) {
      const text = result.result.content.map((part) => part.text ?? "").join("\n");
      assert.match(text, /public\.md|VISIBLE_MARKER/);
      assert.doesNotMatch(text, /secret\.md|PRIVATE_MARKER|private\//);
      assert.doesNotMatch(text, /ignored-empty/);
    }

    const grepContractCases = [
      { id: "ripgrep-regex", input: { path: "docs", pattern: "(?i)marker", glob: "[ab].{js,ts}" } },
      { id: "literal-ignore-case", input: { path: "docs", pattern: "visible_marker", glob: "public.md", literal: true, ignoreCase: true } },
      { id: "byte-limit", input: { path: "docs", pattern: "HIT", glob: "large.md" } },
      { id: "overlap", input: { path: "docs", pattern: "HIT", glob: "context.md", context: 1 } },
      { id: "match-limit", input: { path: "docs", pattern: "HIT", glob: "large.md", limit: 1 } },
      { id: "no-match", input: { path: "docs", pattern: "NO_SUCH_MARKER" } },
    ];
    const contractSpecs = [
      { id: "directory-find-root-glob", toolName: "find", input: { path: "docs", pattern: "**/*.ts" } },
      { id: "directory-find-brace-glob", toolName: "find", input: { path: "docs", pattern: "*.{js,ts}" } },
      { id: "directory-find-nested-empty", toolName: "find", input: { path: "docs", pattern: "**" } },
      { id: "directory-find-limit", toolName: "find", input: { path: "docs", pattern: "**", limit: 1 } },
      { id: "directory-ls-limit", toolName: "ls", input: { path: "docs", limit: 1 } },
      { id: "directory-ls-empty", toolName: "ls", input: { path: "docs/empty" } },
      { id: "directory-find-root-internals", toolName: "find", input: { path: ".", pattern: "**" } },
      ...["grep", "rg"].flatMap((toolName) => grepContractCases.map(({ id, input }) => ({
        id: `directory-${toolName}-${id}`,
        toolName,
        input,
      }))),
    ].map((spec) => ({ ...spec, tool: h.tools.get(spec.toolName) }));
    const contractCalls = await preflightParallelToolCalls(h, ctx, contractSpecs);
    const contractResults = await Promise.all(executePreflightedToolCalls(h, ctx, contractCalls));
    const contractById = new Map(contractCalls.map((call, index) => [call.id, contractResults[index]]));
    const resultFor = (id) => contractById.get(id).result;
    assert.match(resultFor("directory-find-root-glob").content[0].text, /^root\.ts$/m);
    assert.match(resultFor("directory-find-brace-glob").content[0].text, /a\.js|root\.ts/);
    assert.match(resultFor("directory-find-nested-empty").content[0].text, /nested\/empty\//);
    assert.equal(resultFor("directory-find-limit").details?.resultLimitReached, 1);
    assert.match(resultFor("directory-find-limit").content[0].text, /1 results limit reached/);
    assert.equal(resultFor("directory-ls-limit").details?.entryLimitReached, 1);
    assert.match(resultFor("directory-ls-limit").content[0].text, /1 entries limit reached/);
    assert.equal(resultFor("directory-ls-empty").content[0].text, "(empty directory)");
    assert.doesNotMatch(resultFor("directory-find-root-internals").content[0].text, /(?:^|\/)\.git\//m);
    for (const toolName of ["grep", "rg"]) {
      const regex = resultFor(`directory-${toolName}-ripgrep-regex`);
      assert.equal(regex.details?.linesTruncated, true);
      assert.match(regex.content[0].text, /\.\.\. \[truncated\]/);
      assert.match(resultFor(`directory-${toolName}-literal-ignore-case`).content[0].text, /VISIBLE_MARKER/);
      const byteLimit = resultFor(`directory-${toolName}-byte-limit`);
      assert.equal(byteLimit.details?.truncation?.truncated, true);
      assert.match(byteLimit.content[0].text, /50KB limit reached/);
      const overlap = resultFor(`directory-${toolName}-overlap`).content[0].text;
      assert.equal((overlap.match(/context\.md[:-]2[:-]/g) ?? []).length, 2);
      assert.equal((overlap.match(/context\.md[:-]3[:-]/g) ?? []).length, 2);
      const matchLimit = resultFor(`directory-${toolName}-match-limit`);
      assert.equal(matchLimit.details?.matchLimitReached, 1);
      assert.equal((matchLimit.content[0].text.match(/^large\.md:\d+:/gm) ?? []).length, 1);
      assert.equal(resultFor(`directory-${toolName}-no-match`).content[0].text, "No matches found");
    }

    for (const toolName of ["grep", "rg"]) {
      const abortController = new AbortController();
      abortController.abort();
      const [abortCall] = await preflightParallelToolCalls(h, ctx, [{
        id: `directory-${toolName}-aborted`,
        toolName,
        input: { path: "docs", pattern: "marker" },
        signal: abortController.signal,
        tool: h.tools.get(toolName),
      }]);
      const [aborted] = await Promise.all(executePreflightedToolCalls(h, ctx, [abortCall]));
      assert.equal(aborted.isError, true);
      assert.match(aborted.result.content[0].text, /Operation aborted/);
    }
  });
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
      await assert.rejects(fileBinding.operations.readFile("resource/large.txt"), /exceeds 32 bytes/);
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

      const entryGate = createGitReadGate({
        cwd: root,
        packageRoot,
        pathBindingLimits: { maxTraversalEntries: 1 },
      });
      const entryDecision = await entryGate.checkPath(toolName, "resource");
      assert.equal(entryDecision.allowed, false);
      assert.match(entryDecision.reason, /traversal admission exceeds 1 entries/);
      await entryGate.dispose();

      const metadataGate = createGitReadGate({
        cwd: root,
        packageRoot,
        pathBindingLimits: { maxTraversalSnapshotBytes: 1 },
      });
      const metadataDecision = await metadataGate.checkPath(toolName, "resource");
      assert.equal(metadataDecision.allowed, false);
      assert.match(metadataDecision.reason, /traversal admission exceeds 1 bytes/);
      await metadataGate.dispose();
    }
  });
});

test("guarded traversal bounds directory discovery before retaining entries", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    writeFileSync(
      join(root, ".gitignore"),
      `${readFileSync(join(root, ".gitignore"), "utf8")}resource-discovery/ignored-*\n`,
    );
    write(join(root, "resource-discovery", "visible.txt"), "visible\n");
    for (let index = 0; index < 32; index += 1) {
      write(join(root, "resource-discovery", `ignored-${index}.txt`), "ignored\n");
    }
    git(root, "add", ".gitignore", "resource-discovery/visible.txt");

    for (const toolName of ["grep", "rg", "find", "ls"]) {
      const gate = createGitReadGate({
        cwd: root,
        packageRoot,
        pathBindingLimits: { maxTraversalEntries: 8 },
      });
      const decision = await gate.checkPath(toolName, "resource-discovery");
      assert.equal(decision.allowed, false);
      assert.match(decision.reason, /traversal discovery exceeds 8 entries/);
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

test("guarded grep aborts while ripgrep resolution is pending", async () => {
  const resolution = deferred();
  const controller = new AbortController();
  const execution = executeBoundGrep(
    { absolutePath: "/virtual/file", operations: { readFile: async () => Buffer.from("match\n") } },
    { pattern: "match" },
    controller.signal,
    async () => resolution.promise,
  );
  controller.abort();
  resolution.resolve("rg");
  await assert.rejects(execution, /Operation aborted/);
});

test("guarded grep rejects malformed subprocess output failures and resource overruns", async () => {
  const binding = {
    absolutePath: "/virtual/file.txt",
    operations: { readFile: async () => Buffer.from("match\n") },
  };
  const execute = (spawnMatcher, resourceLimits, signal) => executeBoundGrep(
    binding,
    { pattern: "match" },
    signal,
    {
      resolveMatcher: async () => "synthetic-rg",
      spawnMatcher,
      resourceLimits,
    },
  );

  await assert.rejects(
    execute(fakeRipgrepSpawn({ stdout: ["not-json\n"] })),
    /malformed ripgrep JSON record/,
  );
  await assert.rejects(
    execute(fakeRipgrepSpawn({ stdout: ["x".repeat(65)] }), {
      maxRipgrepRecordBytes: 32,
      maxRipgrepStdoutBytes: 128,
    }),
    /JSON record exceeds 32 bytes/,
  );
  await assert.rejects(
    execute(fakeRipgrepSpawn({ stdout: ["x".repeat(65)] }), {
      maxRipgrepRecordBytes: 128,
      maxRipgrepStdoutBytes: 32,
    }),
    /stdout exceeds 32 bytes/,
  );
  await assert.rejects(
    execute(fakeRipgrepSpawn({ stderr: ["e".repeat(65)], code: 2 }), {
      maxRipgrepStderrBytes: 32,
    }),
    /stderr exceeds 32 bytes/,
  );
  await assert.rejects(
    execute(() => { throw new Error("synthetic spawn failure"); }),
    /Failed to run ripgrep: synthetic spawn failure/,
  );
  await assert.rejects(
    execute(fakeRipgrepSpawn({ stderr: ["synthetic exit failure"], code: 2 })),
    /synthetic exit failure/,
  );

  const controller = new AbortController();
  const pending = execute(fakeRipgrepSpawn({ hold: true }), undefined, controller.signal);
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  controller.abort();
  await assert.rejects(pending, /Operation aborted/);
});

test("registered grep and rg handle malformed output cancellation spawn and exit failures", async () => {
  const cases = [
    {
      name: "malformed",
      spawnMatcher: fakeRipgrepSpawn({ stdout: ["not-json\n"] }),
      expected: /malformed ripgrep JSON record/,
    },
    {
      name: "record-limit",
      spawnMatcher: fakeRipgrepSpawn({ stdout: ["x".repeat(65)] }),
      resourceLimits: { maxRipgrepRecordBytes: 32, maxRipgrepStdoutBytes: 128 },
      expected: /JSON record exceeds 32 bytes/,
    },
    {
      name: "stdout-limit",
      spawnMatcher: fakeRipgrepSpawn({ stdout: ["x".repeat(65)] }),
      resourceLimits: { maxRipgrepRecordBytes: 128, maxRipgrepStdoutBytes: 32 },
      expected: /stdout exceeds 32 bytes/,
    },
    {
      name: "stderr-limit",
      spawnMatcher: fakeRipgrepSpawn({ stderr: ["e".repeat(65)], code: 2 }),
      resourceLimits: { maxRipgrepStderrBytes: 32 },
      expected: /stderr exceeds 32 bytes/,
    },
    {
      name: "spawn",
      spawnMatcher: () => { throw new Error("registered spawn failure"); },
      expected: /Failed to run ripgrep: registered spawn failure/,
    },
    {
      name: "exit",
      spawnMatcher: fakeRipgrepSpawn({ stderr: ["registered exit failure"], code: 2 }),
      expected: /registered exit failure/,
    },
    {
      name: "cancel",
      spawnMatcher: fakeRipgrepSpawn({ hold: true }),
      expected: /Operation aborted/,
      abort: true,
    },
  ];
  await withFixture(async ({ root }) => {
    for (const toolName of ["grep", "rg"]) {
      for (const scenario of cases) {
        const h = extensionHarness({
          grepExecutionOptions: {
            resolveMatcher: async () => "synthetic-rg",
            spawnMatcher: scenario.spawnMatcher,
            resourceLimits: scenario.resourceLimits,
          },
        });
        const ctx = h.context(root, `registered-${toolName}-${scenario.name}`);
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
        const controller = new AbortController();
        const [call] = await preflightParallelToolCalls(h, ctx, [{
          id: `${toolName}-${scenario.name}`,
          toolName,
          input: { path: "safe.txt", pattern: "safe" },
          signal: controller.signal,
          tool: h.tools.get(toolName),
        }]);
        const [execution] = executePreflightedToolCalls(h, ctx, [call]);
        if (scenario.abort) {
          await new Promise((resolvePromise) => setImmediate(resolvePromise));
          controller.abort();
        }
        const result = await execution;
        assert.equal(result.isError, true);
        assert.match(result.result.content[0].text, scenario.expected);
        await h.handlers.get("session_shutdown")({}, ctx);
      }
    }
  });
});

test("registered grep and rg bound match context and rendered-output work", async () => {
  await withFixture(async ({ root }) => {
    const sourceLines = Array.from(
      { length: 40 },
      (_, index) => `line-${index}-${"x".repeat(40)}`,
    );
    write(join(root, "bounded-render.txt"), sourceLines.join("\n"));
    git(root, "add", "bounded-render.txt");
    const records = [2, 4, 6].map((lineNumber) => `${JSON.stringify({
      type: "match",
      data: { line_number: lineNumber },
    })}\n`).join("");
    const h = extensionHarness({
      grepExecutionOptions: {
        resolveMatcher: async () => "synthetic-rg",
        spawnMatcher: fakeRipgrepSpawn({ stdout: [records] }),
        resourceLimits: {
          maxGrepMatches: 2,
          maxGrepContextLines: 2,
          maxGrepRenderedBytes: 64,
        },
      },
    });
    const ctx = h.context(root, "registered-grep-render-limits");
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

    for (const toolName of ["grep", "rg"]) {
      const [call] = await preflightParallelToolCalls(h, ctx, [{
        id: `bounded-render-${toolName}`,
        toolName,
        input: {
          path: "bounded-render.txt",
          pattern: "line",
          limit: Number.MAX_SAFE_INTEGER,
          context: Number.MAX_SAFE_INTEGER,
        },
        tool: h.tools.get(toolName),
      }]);
      const [result] = await Promise.all(executePreflightedToolCalls(h, ctx, [call]));
      assert.equal(result.isError, false);
      assert.equal(result.result.details?.matchLimitReached, 2);
      assert.equal(result.result.details?.matchResourceLimitReached, 2);
      assert.equal(result.result.details?.contextLimitReached, 2);
      assert.equal(result.result.details?.truncation?.truncated, true);
      const logicalOutput = [1, 3].flatMap((matchIndex) => {
        const start = Math.max(0, matchIndex - 2);
        const end = Math.min(sourceLines.length - 1, matchIndex + 2);
        return sourceLines.slice(start, end + 1).map((line, offset) => {
          const lineIndex = start + offset;
          const separator = lineIndex === matchIndex ? ":" : "-";
          return `bounded-render.txt${separator}${lineIndex + 1}${separator} ${line}`;
        });
      }).join("\n");
      assert.equal(result.result.details.truncation.totalLines, 9);
      assert.equal(
        result.result.details.truncation.totalBytes,
        Buffer.byteLength(logicalOutput, "utf8"),
      );
    }
    await h.handlers.get("session_shutdown")({}, ctx);
  });
});

test("execution bindings close their stable file descriptors", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const decision = await gate.checkPath("read", "safe.txt");
    assert.equal(decision.allowed, true);
    assert.ok(decision.executionBinding);

    const binding = gate.bindPath(decision.executionBinding);
    assert.equal(fstatSync(binding.fd).isFile(), true);
    binding.release();
    assert.throws(() => fstatSync(binding.fd), { code: "EBADF" });
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
    if (process.platform === "linux") {
      assert.equal(missingCall.blocked, undefined);
      const [missingResult] = await Promise.all(executePreflightedToolCalls(h, ctx, [missingCall]));
      assert.equal(missingResult.isError, false);
      assert.equal(readFileSync(join(root, "output", "missing.txt"), "utf8"), "new file\n");
    } else {
      assert.equal(missingCall.blocked?.block, true);
      assert.match(missingCall.blocked.reason, /descriptor-relative prospective writes are unavailable/);
      assert.equal(existsSync(join(root, "output", "missing.txt")), false);
    }
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

test("supports a declared symlinked package root without trusting nested aliases", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }

  const parent = mkdtempSync(join(tmpdir(), "picm-symlinked-package-root-"));
  const projectRoot = join(parent, "project");
  const packageRoot = join(parent, "package-real");
  const declaredPackageRoot = join(parent, "package-link");
  mkdirSync(projectRoot, { recursive: true });
  write(join(packageRoot, "skills", "picm-factory", "SKILL.md"), "---\nname: picm-factory\n---\n");
  write(join(packageRoot, "skills", "picm-factory", "references", "guide.md"), "guide\n");
  write(join(packageRoot, "skills", "picm-factory", "templates", "context.md"), "template\n");
  symlinkSync(packageRoot, declaredPackageRoot, "dir");

  const gate = createGitReadGate({ cwd: projectRoot, packageRoot: declaredPackageRoot });
  t.after(async () => {
    await gate.dispose();
    rmSync(parent, { recursive: true, force: true });
  });

  const declaredSkill = join(declaredPackageRoot, "skills", "picm-factory", "SKILL.md");
  const skillDecision = await gate.checkTrustedPackageRead("read", declaredSkill);
  assert.equal(skillDecision.allowed, true);
  assert.equal(skillDecision.canonicalPath, await realpathFile(declaredSkill));

  const canonicalPackageRoot = await realpathFile(packageRoot);
  for (const path of [
    join(canonicalPackageRoot, "skills", "picm-factory", "references", "guide.md"),
    join(declaredPackageRoot, "skills", "picm-factory", "templates", "context.md"),
  ]) {
    assert.equal((await gate.checkTrustedPackageRead("read", path)).allowed, true);
  }

  const references = join(packageRoot, "skills", "picm-factory", "references");
  symlinkSync("guide.md", join(references, "leaf.md"));
  symlinkSync(".", join(references, "nested"), "dir");
  for (const path of [
    join(declaredPackageRoot, "skills", "picm-factory", "references", "leaf.md"),
    join(declaredPackageRoot, "skills", "picm-factory", "references", "nested", "guide.md"),
  ]) {
    assert.equal((await gate.checkTrustedPackageRead("read", path)).allowed, false);
  }
});

test("pins a declared symlinked package root before its first trusted read", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }

  const parent = mkdtempSync(join(tmpdir(), "picm-pinned-package-root-"));
  const projectRoot = join(parent, "project");
  const packageRoot = join(parent, "package-real");
  const replacementRoot = join(parent, "replacement");
  const declaredPackageRoot = join(parent, "package-link");
  mkdirSync(projectRoot, { recursive: true });
  write(join(packageRoot, "skills", "picm-factory", "SKILL.md"), "---\nname: picm-factory\n---\n");
  write(
    join(replacementRoot, "skills", "picm-factory", "SKILL.md"),
    "SYNTHETIC_REPLACEMENT_PACKAGE\n",
  );
  symlinkSync(packageRoot, declaredPackageRoot, "dir");
  const canonicalPackageRoot = await realpathFile(declaredPackageRoot);
  rmSync(declaredPackageRoot);
  symlinkSync(replacementRoot, declaredPackageRoot, "dir");

  const gate = createGitReadGate({
    cwd: projectRoot,
    packageRoot: declaredPackageRoot,
    canonicalPackageRoot,
  });
  t.after(async () => {
    await gate.dispose();
    rmSync(parent, { recursive: true, force: true });
  });

  const redirectedSkill = join(declaredPackageRoot, "skills", "picm-factory", "SKILL.md");
  assert.equal((await gate.checkTrustedPackageRead("read", redirectedSkill)).allowed, false);
  assert.equal((await gate.checkTrustedPackageRead(
    "read",
    join(await realpathFile(packageRoot), "skills", "picm-factory", "SKILL.md"),
  )).allowed, true);
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
  assert.equal((await gate.checkPath("write", "new-parent/nested/new.txt")).allowed, true);
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
  write(join(source, ".gitignore"), "secret.txt\nignored-empty/\n");
  write(join(source, "safe.txt"), "safe\n");
  write(join(source, "secret.txt"), "synthetic ignored\n");
  git(source, "add", ".gitignore", "safe.txt");
  git(source, "add", "-f", "secret.txt");
  git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");

  git(root, "init", "-q");
  git(root, "-c", "protocol.file.allow=always", "submodule", "add", "-q", source, "vendor/lib");
  const gate = createGitReadGate({ cwd: root, packageRoot: root });
  t.after(() => gate.dispose());
  mkdirSync(join(root, "vendor", "lib", "ignored-empty"));

  assert.equal((await gate.checkPath("read", "vendor/lib/safe.txt")).allowed, true);
  assert.match((await gate.checkPath("read", "vendor/lib/secret.txt")).reason, /ignored by Git/);
  assert.match((await gate.checkPath("read", "vendor/lib/.git")).reason, /\.git internals/);
  const inventory = await gate.refreshInventory("vendor/lib");
  assert.equal(inventory.worktree.endsWith("/vendor/lib"), true);
  assert.equal(inventory.candidates.has("safe.txt"), true);
  assert.equal(inventory.candidates.has("secret.txt"), false);
  const privacyTraversal = await gate.checkPrivacyPath("find", "vendor/lib", ["unrelated-private"]);
  assert.equal(privacyTraversal.allowed, true);
  assert.equal(
    privacyTraversal.executionBinding.traversalEntries.some((entry) => entry.displayPath.endsWith("ignored-empty")),
    false,
  );
  const nestedGitFile = join(root, "vendor", "lib", ".git");
  const nestedGitMetadata = readFileSync(nestedGitFile, "utf8");
  writeFileSync(nestedGitFile, "gitdir: missing-git-metadata\n");
  const brokenActiveTraversal = await gate.checkPath("find", "vendor/lib");
  assert.equal(brokenActiveTraversal.allowed, false);
  assert.match(brokenActiveTraversal.reason, /Nested Git worktree discovery failed/);
  const brokenPrivacyTraversal = await gate.checkPrivacyPath("rg", "vendor/lib", ["unrelated-private"]);
  assert.equal(brokenPrivacyTraversal.allowed, false);
  assert.match(brokenPrivacyTraversal.reason, /Nested Git worktree discovery failed/);
  writeFileSync(nestedGitFile, nestedGitMetadata);

  rmSync(nestedGitFile);
  const absentActiveTraversal = await gate.checkPath("ls", "vendor/lib");
  assert.equal(absentActiveTraversal.allowed, false);
  assert.match(absentActiveTraversal.reason, /did not resolve the parent gitlink boundary/);
  const absentPrivacyTraversal = await gate.checkPrivacyPath("grep", "vendor/lib", ["unrelated-private"]);
  assert.equal(absentPrivacyTraversal.allowed, false);
  assert.match(absentPrivacyTraversal.reason, /did not resolve the parent gitlink boundary/);
  writeFileSync(nestedGitFile, nestedGitMetadata);

  assert.equal(
    (await gate.checkPath("write", "vendor/lib/new-parent/nested/new.txt")).allowed,
    true,
  );
  assert.match(
    (await gate.checkPath("write", "vendor/lib/ignored-empty/new.txt")).reason,
    /ignored by Git/,
  );

  const nestedRepository = join(root, "nested-repository");
  mkdirSync(nestedRepository);
  git(nestedRepository, "init", "-q");
  write(join(nestedRepository, ".gitignore"), "private.txt\n");
  write(join(nestedRepository, "public.txt"), "public\n");
  assert.match(
    (await gate.checkPath("find", "nested-repository")).reason,
    /not registered as a parent gitlink/,
  );
  assert.match(
    (await gate.checkPrivacyPath("rg", "nested-repository", ["unrelated-private"])).reason,
    /not registered as a parent gitlink/,
  );

  const canonicalRoot = await realpathFile(root);
  const queryFailureGate = createGitReadGate({
    cwd: root,
    packageRoot: root,
    runGit: async (gitCwd, args) => {
      if (gitCwd === canonicalRoot && args[0] === "ls-files" && args.includes("--stage")) {
        return { code: 2, stdout: "", stderr: "synthetic gitlink query failure" };
      }
      try {
        return {
          code: 0,
          stdout: execFileSync("git", ["-C", gitCwd, ...args], { encoding: "utf8" }),
          stderr: "",
        };
      } catch (error) {
        return {
          code: error.status ?? 1,
          stdout: typeof error.stdout === "string" ? error.stdout : "",
          stderr: typeof error.stderr === "string" ? error.stderr : "",
        };
      }
    },
  });
  t.after(() => queryFailureGate.dispose());
  const queryFailure = await queryFailureGate.checkPath("ls", "vendor/lib");
  assert.equal(queryFailure.allowed, false);
  assert.match(queryFailure.reason, /synthetic gitlink query failure/);
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
    write(join(root, "output", "barrier.txt"), "before\n");
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

test("rewritten trusted reads settle execution leases on success and failure", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "execution-barrier-trusted-reads");
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

    const packageRoot = resolve(".");
    const canonicalSkill = await realpathFile(join(packageRoot, "skills", "picm-factory", "SKILL.md"));
    const successStarted = deferred();
    const failureStarted = deferred();
    const releaseSuccess = deferred();
    const releaseFailure = deferred();
    const successTool = createReadTool(root, {
      operations: {
        access: accessFile,
        readFile: async (path) => {
          successStarted.resolve();
          await releaseSuccess.promise;
          return readFileAsync(path);
        },
      },
    });
    const failureTool = createReadTool(root, {
      operations: {
        access: accessFile,
        readFile: async () => {
          failureStarted.resolve();
          await releaseFailure.promise;
          throw new Error("synthetic trusted read failure");
        },
      },
    });
    const successInput = { path: `@${canonicalSkill}` };
    const failureInput = {
      path: join(packageRoot, "skills", "picm-factory", "references", "..", "SKILL.md"),
    };
    const calls = await preflightParallelToolCalls(h, ctx, [
      {
        id: "trusted-read-success",
        toolName: "read",
        input: successInput,
        tool: successTool,
      },
      {
        id: "trusted-read-failure",
        toolName: "read",
        input: failureInput,
        tool: failureTool,
      },
      {
        id: "complete-after-trusted-reads",
        toolName: "picm_scan_control",
        input: { action: "complete" },
        tool: control,
      },
    ]);
    assert.equal(calls.every((call) => call.blocked === undefined), true);
    assert.equal(successInput.path, canonicalSkill);
    assert.equal(failureInput.path, canonicalSkill);

    const timeline = [];
    const executions = executePreflightedToolCalls(h, ctx, calls, timeline);
    await Promise.all([successStarted.promise, failureStarted.promise]);
    assert.equal(await promiseSettled(executions[2]), false);

    releaseSuccess.resolve();
    const success = await executions[0];
    assert.equal(await promiseSettled(executions[2]), false);
    releaseFailure.resolve();
    const [, failure, completion] = await Promise.all(executions);

    assert.match(success.result.content[0].text, /name: picm-factory/);
    assert.equal(failure.isError, true);
    assert.match(failure.result.content[0].text, /synthetic trusted read failure/);
    assert.equal(completion.result.details.completed, true);
    assert.equal(timeline.at(-1), "result:complete-after-trusted-reads");
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
    write(join(root, "output", "failure.txt"), "before\n");
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
    write(join(root, "output", "cancelled.txt"), "before\n");
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
    write(join(root, "output", "before-retry.txt"), "before\n");
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

test("registered guarded tools fail closed after restore settlement and shutdown clear admission", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }
  for (const resetEvent of ["session_tree", "agent_settled", "session_shutdown"]) {
    for (const toolName of ["read", "edit", "write"]) {
      await withFixture(async ({ root }) => {
        writeFileSync(
          join(root, ".gitignore"),
          `${readFileSync(join(root, ".gitignore"), "utf8")}private-lifecycle*/\n`,
        );
        let path;
        let input;
        let approvedPath;
        let privatePath;
        if (toolName === "read") {
          path = "safe.txt";
          approvedPath = join(root, "approved-safe.txt");
          privatePath = join(root, "private-lifecycle", "read.txt");
          write(privatePath, "PRIVATE_READ_MUST_NOT_APPEAR\n");
          input = { path };
        } else if (toolName === "edit") {
          path = "edit-lifecycle/file.txt";
          approvedPath = join(root, "approved-edit-lifecycle");
          privatePath = join(root, "private-lifecycle-edit", "file.txt");
          write(join(root, path), "approved before\n");
          write(privatePath, "approved before\n");
          git(root, "add", path);
          input = {
            path,
            edits: [{ oldText: "approved before", newText: "must not reach private" }],
          };
        } else {
          path = "write-lifecycle/file.txt";
          approvedPath = join(root, "approved-write-lifecycle");
          privatePath = join(root, "private-lifecycle-write", "file.txt");
          write(join(root, path), "approved before\n");
          write(privatePath, "PRIVATE_WRITE_UNCHANGED\n");
          git(root, "add", path);
          input = { path, content: "must not reach private\n" };
        }

        const entries = [];
        const h = extensionHarness({ entries });
        const ctx = h.context(root, `cleared-admission-${resetEvent}-${toolName}`);
        const control = h.tools.get("picm_scan_control");
        await h.commands.get("picm-adopt").handler("coding", ctx);
        await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
        await control.execute(
          "privacy",
          { action: "privacy", excludedPaths: ["private-lifecycle", "private-lifecycle-edit", "private-lifecycle-write"], persist: false },
          undefined,
          undefined,
          ctx,
        );
        await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

        const id = `${resetEvent}-${toolName}`;
        await h.handlers.get("tool_execution_start")(
          { toolCallId: id, toolName, args: input },
          ctx,
        );
        assert.equal(await h.handlers.get("tool_call")(
          { toolCallId: id, toolName, input },
          ctx,
        ), undefined);

        if (toolName === "read") {
          renameSync(join(root, path), approvedPath);
          symlinkSync("private-lifecycle/read.txt", join(root, path));
        } else {
          const originalParent = dirname(join(root, path));
          renameSync(originalParent, approvedPath);
          const target = toolName === "edit" ? "private-lifecycle-edit" : "private-lifecycle-write";
          symlinkSync(target, originalParent, "dir");
        }

        await h.handlers.get(resetEvent)({}, ctx);
        await assert.rejects(
          h.tools.get(toolName).execute(id, input, undefined, undefined, ctx),
          /PICM_PATH_BINDING_MISSING/,
        );
        assert.equal(
          readFileSync(privatePath, "utf8"),
          toolName === "edit" ? "approved before\n" : toolName === "write" ? "PRIVATE_WRITE_UNCHANGED\n" : "PRIVATE_READ_MUST_NOT_APPEAR\n",
        );
        await h.handlers.get("tool_execution_end")(
          { toolCallId: id, toolName, result: { content: [] }, isError: true },
          ctx,
        );
        if (resetEvent !== "session_shutdown") {
          await h.handlers.get("session_shutdown")({}, ctx);
        }
      });
    }
  }
});

test("protected cleanup retains every tombstone until matching execution end", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }
  await withFixture(async ({ root }) => {
    writeFileSync(
      join(root, ".gitignore"),
      `${readFileSync(join(root, ".gitignore"), "utf8")}private-tombstones/\n`,
    );
    write(join(root, "private-tombstones", "secret.txt"), "PRIVATE_TOMBSTONE\n");
    const h = extensionHarness();
    const ctx = h.context(root, "tombstone-capacity");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["private-tombstones"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    for (let index = 0; index < 257; index += 1) {
      const id = `tombstone-${index}`;
      const input = { path: "safe.txt" };
      await h.handlers.get("tool_execution_start")(
        { toolCallId: id, toolName: "read", args: input },
        ctx,
      );
      assert.equal(await h.handlers.get("tool_call")(
        { toolCallId: id, toolName: "read", input },
        ctx,
      ), undefined);
    }
    renameSync(join(root, "safe.txt"), join(root, "approved-tombstone-safe.txt"));
    symlinkSync("private-tombstones/secret.txt", join(root, "safe.txt"));
    await h.handlers.get("session_shutdown")({}, ctx);
    await assert.rejects(
      h.tools.get("read").execute(
        "tombstone-0",
        { path: "safe.txt" },
        undefined,
        undefined,
        ctx,
      ),
      /PICM_PATH_BINDING_MISSING/,
    );
    await h.handlers.get("tool_execution_end")(
      { toolCallId: "tombstone-0", toolName: "read", result: { content: [] }, isError: true },
      ctx,
    );
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

test("session shutdown clears orphaned execution leases", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, "output", "orphan.txt"), "before\n");
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

test("one session shutdown preserves another session's bound execution", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }
  await withFixture(async ({ root }) => {
    writeFileSync(
      join(root, ".gitignore"),
      `${readFileSync(join(root, ".gitignore"), "utf8")}private-cross-session/\n`,
    );
    write(join(root, "private-cross-session", "secret.txt"), "PRIVATE_CROSS_SESSION\n");
    const h = extensionHarness();
    const control = h.tools.get("picm_scan_control");
    const firstCtx = h.context(root, "cross-session-shutdown-a");
    const secondCtx = h.context(root, "cross-session-shutdown-b");
    for (const ctx of [firstCtx, secondCtx]) {
      await h.commands.get("picm-adopt").handler("coding", ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute(
        "privacy",
        { action: "privacy", excludedPaths: ["private-cross-session"], persist: false },
        undefined,
        undefined,
        ctx,
      );
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    }

    const id = "cross-session-bound-read";
    const input = { path: "safe.txt" };
    await h.handlers.get("tool_execution_start")(
      { toolCallId: id, toolName: "read", args: input },
      secondCtx,
    );
    assert.equal(await h.handlers.get("tool_call")(
      { toolCallId: id, toolName: "read", input },
      secondCtx,
    ), undefined);
    renameSync(join(root, "safe.txt"), join(root, "approved-cross-session-safe.txt"));
    symlinkSync("private-cross-session/secret.txt", join(root, "safe.txt"));

    await h.handlers.get("session_shutdown")({}, firstCtx);
    const result = await h.tools.get("read").execute(id, input, undefined, undefined, secondCtx);
    const text = result.content.map((part) => part.text ?? "").join("\n");
    assert.match(text, /safe/);
    assert.doesNotMatch(text, /PRIVATE_CROSS_SESSION/);
    await h.handlers.get("tool_execution_end")(
      { toolCallId: id, toolName: "read", result, isError: false },
      secondCtx,
    );
    await h.handlers.get("session_shutdown")({}, secondCtx);
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

test("trusted package parent alias stays canonical after successful pre-begin and active admission", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }

  const parent = mkdtempSync(join(tmpdir(), "picm-trusted-parent-lifecycle-"));
  const root = join(parent, "project");
  const packageRoot = join(parent, "package-real");
  const declaredPackageRoot = join(parent, "package-link");
  const excludedRoot = join(root, "private");
  const canonicalSkill = join(packageRoot, "skills", "picm-factory", "SKILL.md");
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  write(join(root, ".gitignore"), "private/\n");
  write(join(root, "safe.txt"), "safe\n");
  git(root, "add", ".gitignore", "safe.txt");
  write(canonicalSkill, "---\nname: picm-factory\n---\nSAFE_CANONICAL_PACKAGE\n");
  write(join(excludedRoot, "skills", "picm-factory", "SKILL.md"), "SYNTHETIC_EXCLUDED_ALIAS\n");
  symlinkSync(packageRoot, declaredPackageRoot, "dir");

  const coordinator = createRuntimeCoordinator({
    packageRoot: declaredPackageRoot,
    canonicalPackageRoot: await realpathFile(packageRoot),
  });
  const ctx = extensionHarness().context(root, "trusted-parent-alias-lifecycle");
  const read = createReadTool(root);
  t.after(async () => {
    await coordinator.dispose(ctx);
    rmSync(parent, { recursive: true, force: true });
  });

  coordinator.authorizeWorkflow(ctx, "picm-adopt");
  await coordinator.scanControl(ctx, { action: "preflight" });
  await coordinator.scanControl(ctx, {
    action: "privacy",
    excludedPaths: ["private"],
    persist: false,
  });

  for (const phase of ["pre-begin", "active"]) {
    if (phase === "active") await coordinator.scanControl(ctx, { action: "begin" });
    rmSync(declaredPackageRoot, { force: true });
    symlinkSync(packageRoot, declaredPackageRoot, "dir");
    const input = {
      path: join(declaredPackageRoot, "skills", "picm-factory", "SKILL.md"),
    };
    const event = {
      toolCallId: `trusted-${phase}`,
      toolName: "read",
      input,
    };
    coordinator.startToolExecution({ ...event, args: input }, ctx);
    const decision = await coordinator.checkToolCall(event, ctx);
    assert.equal(decision.allowed, true);
    assert.equal(input.path, await realpathFile(canonicalSkill));
    coordinator.admitToolExecution(event, ctx);

    rmSync(declaredPackageRoot);
    symlinkSync(excludedRoot, declaredPackageRoot, "dir");
    const result = await read.execute(event.toolCallId, input, undefined, undefined, ctx);
    const text = result.content.map((part) => part.text ?? "").join("\n");
    assert.match(text, /SAFE_CANONICAL_PACKAGE/);
    assert.doesNotMatch(text, /SYNTHETIC_EXCLUDED_ALIAS/);
    coordinator.endToolExecution(event, ctx);
  }
});

test("ordinary built-in reads and writes stay bound after admitted parent swaps", async (t) => {
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
    assert.match(readText, /safe/);
    assert.doesNotMatch(readText, /SYNTHETIC_PRIVACY_SECRET/);

    const [writeCall] = await preflightParallelToolCalls(h, ctx, [{
      id: "ordinary-bound-write",
      toolName: "write",
      input: { path: "output/file.txt", content: "short\n" },
      tool: h.tools.get("write") ?? createWriteTool(root),
    }]);
    assert.equal(writeCall.blocked, undefined);
    renameSync(join(root, "output"), join(root, "approved-output"));
    symlinkSync("private-write", join(root, "output"), "dir");
    const [writeResult] = await Promise.all(executePreflightedToolCalls(h, ctx, [writeCall]));
    assert.equal(writeResult.isError, false);
    assert.equal(readFileSync(join(root, "approved-output", "file.txt"), "utf8"), "short\n");
    assert.equal(readFileSync(join(root, "private-write", "file.txt"), "utf8"), "PRIVATE_WRITE_UNCHANGED\n");
  });
});

test("ordinary edits stay bound after an admitted parent swap", async (t) => {
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
    assert.equal(edited.isError, false);
    assert.equal(readFileSync(join(root, "approved-edit-dir", "file.txt"), "utf8"), "approved after\n");
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
        id: "ordinary-bound-grep",
        toolName: "grep",
        input: { path: "docs/guide.md", pattern: "guide" },
        tool: h.tools.get("grep"),
      },
      {
        id: "ordinary-bound-find",
        toolName: "find",
        input: { path: "docs/guide.md", pattern: "*" },
        tool: h.tools.get("find"),
      },
      {
        id: "ordinary-bound-ls",
        toolName: "ls",
        input: { path: "docs/guide.md" },
        tool: h.tools.get("ls"),
      },
    ]);
    assert.equal(calls.every((call) => call.blocked === undefined), true);
    renameSync(join(root, "docs"), join(root, "approved-docs"));
    symlinkSync("private-search", join(root, "docs"), "dir");

    const [grepResult, findResult, lsResult] = await Promise.all(
      executePreflightedToolCalls(h, ctx, calls),
    );
    const grepText = grepResult.result.content.map((part) => part.text ?? "").join("\n");
    assert.match(grepText, /guide\.md:1: guide/);
    assert.doesNotMatch(grepText, /SYNTHETIC_PRIVATE_SEARCH/);
    for (const result of [findResult, lsResult]) {
      assert.equal(result.isError, true);
      const text = result.result.content.map((part) => part.text ?? "").join("\n");
      assert.doesNotMatch(text, /nested-secret|SYNTHETIC_PRIVATE_SEARCH/);
    }
  });
});

test("bound writes preserve create semantics and clean up pre-execution cancellation", async (t) => {
  if (process.platform !== "linux") {
    t.skip("descriptor-relative prospective writes are Linux-specific");
    return;
  }

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
    assert.equal(existsSync(join(root, "output", "new.txt")), true);
    renameSync(join(root, "output"), join(root, "approved-output"));
    symlinkSync("private-write", join(root, "output"), "dir");
    const [created] = await Promise.all(executePreflightedToolCalls(h, ctx, [createCall]));
    assert.equal(created.isError, false);
    assert.equal(readFileSync(join(root, "approved-output", "new.txt"), "utf8"), "created safely\n");
    assert.equal(existsSync(join(root, "private-write", "new.txt")), false);
  });

  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "ordinary-binding-cancel");
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
    const abort = new AbortController();
    const [cancelCall] = await preflightParallelToolCalls(h, ctx, [{
      id: "ordinary-bound-cancel",
      toolName: "write",
      input: { path: "new-parent/nested/cancelled.txt", content: "must not persist\n" },
      tool: h.tools.get("write") ?? createWriteTool(root),
      signal: abort.signal,
    }]);
    assert.equal(cancelCall.blocked, undefined);
    assert.equal(existsSync(join(root, "new-parent", "nested", "cancelled.txt")), true);
    abort.abort();
    const [cancelled] = await Promise.all(executePreflightedToolCalls(h, ctx, [cancelCall]));
    assert.equal(cancelled.isError, true);
    assert.match(cancelled.result.content[0].text, /Operation aborted/);
    assert.equal(existsSync(join(root, "new-parent")), false);
  });
});

test("active scans reject trusted parent aliases before they can cross project boundaries", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }

  await withFixture(async ({ root }) => {
    const packageRoot = resolve(".");
    const trustedRoot = join(packageRoot, "skills", "picm-factory");
    const targets = [
      { name: "excluded", root: join(root, "private"), marker: "SYNTHETIC_ACTIVE_EXCLUDED" },
      { name: "ignored", root: join(root, "secrets"), marker: "SYNTHETIC_ACTIVE_IGNORED" },
      { name: "project", root: join(root, "project-lookalike"), marker: "SYNTHETIC_ACTIVE_PROJECT" },
    ];
    for (const target of targets) write(join(target.root, "SKILL.md"), `${target.marker}\n`);

    const h = extensionHarness();
    const ctx = h.context(root, "trusted-parent-alias-active");
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "privacy",
      { action: "privacy", excludedPaths: ["private"], persist: false },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    for (const target of targets) {
      const aliasRoot = join(root, `package-alias-${target.name}`);
      symlinkSync(trustedRoot, aliasRoot, "dir");
      const input = { path: join(aliasRoot, "SKILL.md") };
      const [prepared] = await preflightParallelToolCalls(h, ctx, [{
        id: `active-parent-alias-${target.name}`,
        toolName: "read",
        input,
        tool: createReadTool(root),
      }]);
      rmSync(aliasRoot);
      symlinkSync(target.root, aliasRoot, "dir");
      const [executed] = await Promise.all(executePreflightedToolCalls(h, ctx, [prepared]));
      const text = executed.result.content.map((part) => part.text ?? "").join("\n");
      assert.equal(executed.blocked?.block, true);
      assert.doesNotMatch(text, new RegExp(target.marker));
    }

    const safeInput = { path: "safe.txt" };
    const [safePrepared] = await preflightParallelToolCalls(h, ctx, [{
      id: "active-normal-project-read",
      toolName: "read",
      input: safeInput,
      tool: createReadTool(root),
    }]);
    const [safeRead] = await Promise.all(executePreflightedToolCalls(h, ctx, [safePrepared]));
    assert.equal(safeRead.blocked, undefined);
    assert.match(safeRead.result.content[0].text, /safe/);
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
      const input = { path: `@${path}` };
      assert.equal(await h.handlers.get("tool_call")(
        { toolName: "read", input },
        ctx,
      ), undefined);
      assert.equal(input.path, await realpathFile(path));
    }

    const lookalike = join(root, "skills", "picm-factory", "SKILL.md");
    write(lookalike, "---\nname: lookalike\n---\n");
    const blockedEvents = [
      { toolName: "read", input: { path: "safe.txt" } },
      { toolName: "read", input: { path: ".env" } },
      { toolName: "read", input: { path: "safe-dir/file.txt" } },
      { toolName: "read", input: { path: lookalike } },
      { toolName: "bash", input: { command: "cat safe.txt" } },
      { toolName: "unknown", input: { path: packageRoot } },
    ];
    if (process.platform !== "win32") {
      const skill = join(packageRoot, "skills", "picm-factory", "SKILL.md");
      const leafAlias = join(root, "package-skill-leaf");
      const projectLookalikeRoot = join(root, "project-package-lookalike");
      const projectLookalikeAlias = join(root, "project-package-parent-alias");
      symlinkSync(skill, leafAlias);
      write(join(projectLookalikeRoot, "SKILL.md"), "---\nname: project-lookalike\n---\n");
      symlinkSync(projectLookalikeRoot, projectLookalikeAlias, "dir");
      blockedEvents.push(
        { toolName: "read", input: { path: leafAlias } },
        { toolName: "read", input: { path: join(projectLookalikeAlias, "SKILL.md") } },
      );
    }
    for (const event of blockedEvents) {
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
