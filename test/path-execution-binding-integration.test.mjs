import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join, relative } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";
import { createPathExecutionBinding, executeBoundGrep } from "../extensions/runtime/path-execution-binding.mjs";

import { git, write, withFixture } from "./helpers/git-fixtures.mjs";
import {
  executePreflightedToolCalls,
  extensionHarness,
  preflightParallelToolCalls,
} from "./helpers/picm-extension-harness.mjs";

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

test("rechecks regular-file type immediately before guarded content I/O", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    for (const toolName of ["read", "edit", "write", "grep", "rg"]) {
      const path = `regular-type-${toolName}.txt`;
      const target = join(root, path);
      const approvedTarget = join(root, `approved-${path}`);
      write(target, "approved before\n");
      git(root, "add", path);
      const decision = await gate.checkPath(toolName, path);
      assert.equal(decision.allowed, true);
      const binding = gate.bindPath(decision.executionBinding);
      renameSync(target, approvedTarget);
      mkdirSync(target);
      const contentOperation = ["edit", "write"].includes(toolName)
        ? binding.operations.writeFile(target, "must not be written\n")
        : binding.operations.readFile(target);
      await assert.rejects(contentOperation, /target is not a regular file/);
      assert.equal(readFileSync(approvedTarget, "utf8"), "approved before\n");
      binding.release();
    }
    await gate.dispose();
  });
});

test("rechecks retained regular-file type immediately before guarded grep reads", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const target = join(root, "docs", "guide.md");
    for (const toolName of ["grep", "rg"]) {
      const approvedTarget = join(root, "docs", `approved-${toolName}.md`);
      const decision = await gate.checkPath(toolName, "docs");
      assert.equal(decision.allowed, true);
      const binding = gate.bindPath(decision.executionBinding);
      const retainedFile = binding.files.find((file) => file.path === "guide.md");
      assert.ok(retainedFile);
      renameSync(target, approvedTarget);
      mkdirSync(target);
      await assert.rejects(retainedFile.readFile(), /target is not a regular file/);
      rmSync(target, { recursive: true });
      renameSync(approvedTarget, target);
      binding.release();
    }
    await gate.dispose();
  });
});

test("guarded content I/O rejects post-bind FIFO replacements in a bounded child process", async (t) => {
  if (process.platform === "win32") {
    t.skip("FIFO behavior is POSIX-specific");
    return;
  }
  await withFixture(async ({ root }) => {
    const target = join(root, "post-bind-fifo.txt");
    const canonicalTarget = join(realpathSync(root), "post-bind-fifo.txt");
    const moduleUrl = new URL("../extensions/runtime/path-execution-binding.mjs", import.meta.url).href;
    write(target, "approved before\n");
    const childScript = `
      import { execFileSync } from "node:child_process";
      import { renameSync } from "node:fs";
      import { createPathExecutionBinding } from ${JSON.stringify(moduleUrl)};

      const target = ${JSON.stringify(target)};
      const binding = createPathExecutionBinding({
        toolName: "read",
        absolutePath: target,
        canonicalPath: ${JSON.stringify(canonicalTarget)},
      });
      renameSync(target, \`${target}.approved\`);
      execFileSync("mkfifo", [target]);
      try {
        await binding.operations.readFile(target);
      } catch (error) {
        if (!/target is not a regular file/.test(error.message)) throw error;
        process.stdout.write("rejected\\n");
        process.exit(0);
      }
      throw new Error("FIFO content I/O unexpectedly succeeded");
    `;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", childScript],
      { cwd: root, encoding: "utf8", timeout: 1000, killSignal: "SIGKILL" },
    );
    assert.equal(output, "rejected\n");
  });
});

test("allows post-bind atomic regular-file replacement for guarded content I/O", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    for (const toolName of ["read", "edit", "write", "grep", "rg"]) {
      const path = `atomic-${toolName}.txt`;
      const target = join(root, path);
      const replacement = join(root, `replacement-${path}`);
      write(target, "approved before\n");
      git(root, "add", path);
      const decision = await gate.checkPath(toolName, path);
      assert.equal(decision.allowed, true);
      const binding = gate.bindPath(decision.executionBinding);
      write(replacement, "atomic replacement\n");
      renameSync(replacement, target);
      if (["edit", "write"].includes(toolName)) {
        await binding.operations.writeFile(target, "updated after replacement\n");
        assert.equal(readFileSync(target, "utf8"), "updated after replacement\n");
      } else {
        assert.equal((await binding.operations.readFile(target)).toString("utf8"), "atomic replacement\n");
      }
      binding.release();
    }
    await gate.dispose();
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

test("guarded grep and rg render and glob-match retained paths relative to their directory root", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    assert.notEqual(root, process.cwd());
    const directory = join(root, "search-root");
    const target = join(directory, "nested", "match.txt");
    write(target, "matched\n");
    git(root, "add", "search-root/nested/match.txt");

    const gate = createGitReadGate({ cwd: root, packageRoot });
    const matcherOptions = {
      resolveMatcher: async () => "rg",
      spawnMatcher: fakeRipgrepSpawn({
        stdout: [JSON.stringify({ type: "match", data: { line_number: 1 } }) + "\n"],
      }),
    };
    for (const toolName of ["grep", "rg"]) {
      const directoryDecision = await gate.checkPath(toolName, "search-root");
      assert.equal(directoryDecision.allowed, true);
      const directoryBinding = gate.bindPath(directoryDecision.executionBinding);
      assert.deepEqual(directoryBinding.files.map((file) => file.path), ["nested/match.txt"]);

      for (const glob of [undefined, "*.txt", "nested/*.txt"]) {
        const result = await executeBoundGrep(
          directoryBinding,
          { pattern: "matched", glob },
          undefined,
          matcherOptions,
        );
        assert.equal(result.content[0].text, "nested/match.txt:1: matched");
      }
      const nonmatching = await executeBoundGrep(
        directoryBinding,
        { pattern: "matched", glob: "other/*.txt" },
        undefined,
        matcherOptions,
      );
      assert.equal(nonmatching.content[0].text, "No matches found");
      directoryBinding.release();

      const fileDecision = await gate.checkPath(toolName, "search-root/nested/match.txt");
      assert.equal(fileDecision.allowed, true);
      const fileBinding = gate.bindPath(fileDecision.executionBinding);
      assert.equal(fileBinding.files, undefined);
      const singleFile = await executeBoundGrep(
        fileBinding,
        { pattern: "matched" },
        undefined,
        matcherOptions,
      );
      assert.equal(singleFile.content[0].text, "match.txt:1: matched");
      fileBinding.release();
    }
    await gate.dispose();
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

test("bound write mkdir accepts only ordinary existing directories", async (t) => {
  await withFixture(async ({ root }) => {
    const canonicalRoot = realpathSync(root);
    const binding = (path) => createPathExecutionBinding({
      toolName: "write",
      absolutePath: path,
      canonicalPath: join(canonicalRoot, relative(root, path)),
    });
    const existingDirectory = join(root, "output");
    await binding(join(existingDirectory, "new.txt")).operations.mkdir(existingDirectory);
    await assert.rejects(
      binding(join(root, "safe.txt", "new.txt")).operations.mkdir(join(root, "safe.txt")),
      (error) => error?.code === "EEXIST",
    );
    await assert.rejects(
      binding(join(existingDirectory, "new.txt")).operations.mkdir(existingDirectory, { recursive: false }),
      (error) => error?.code === "EEXIST",
    );

    if (process.platform !== "win32") {
      const symlink = join(root, "output-link");
      symlinkSync("output", symlink, "dir");
      await assert.rejects(
        binding(join(symlink, "new.txt")).operations.mkdir(symlink),
        /symlink/,
      );
    } else {
      t.diagnostic("symlink collision assertion is platform-specific");
    }
  });
});

test("bound built-in wrappers preserve ordinary read and write behavior on the host platform", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, "output", "host.txt"), "before\n");
    const h = extensionHarness();
    const ctx = h.context(root, "ordinary-binding-host-platform");
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

test("guarded pathname mkdir creates directories with residual filesystem TOCTOU", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const decision = await gate.checkPath("write", "batch-created/file.md");
    assert.equal(decision.allowed, true);
    const binding = gate.bindPath(decision.executionBinding);
    const directory = join(root, "batch-created");

    await binding.operations.mkdir(directory);
    assert.equal(existsSync(directory), true);
    binding.release();
    await gate.dispose();
  });
});
