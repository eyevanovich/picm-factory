import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { realpath as realpathFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";

import { git, write, withFixture } from "./helpers/git-fixtures.mjs";
import {
  executePreflightedToolCalls,
  extensionHarness,
  preflightParallelToolCalls,
} from "./helpers/picm-extension-harness.mjs";

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
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

async function defaultRunGit(cwd, args) {
  try {
    const result = execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    return { code: 0, stdout: result, stderr: "" };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}
