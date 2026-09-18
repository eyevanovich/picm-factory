import assert from "node:assert/strict";
import { readFileSync, renameSync, symlinkSync } from "node:fs";
import { realpath as realpathFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";

import { git, write, withFixture } from "./helpers/git-fixtures.mjs";
import {
  executePreflightedToolCalls,
  extensionHarness,
  preflightParallelToolCalls,
} from "./helpers/picm-extension-harness.mjs";

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
    await h.commands.get("picm-new").handler("", ctx);
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
    await h.commands.get("picm-new").handler("", ctx);
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
