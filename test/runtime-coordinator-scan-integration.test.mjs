import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createRuntimeCoordinator } from "../extensions/runtime/runtime-coordinator.mjs";

import { git, write, withFixture } from "./helpers/git-fixtures.mjs";
import {
  executePreflightedToolCalls,
  extensionHarness,
  preflightParallelToolCalls,
} from "./helpers/picm-extension-harness.mjs";

function createCuratedAdoptionFixture() {
  const root = mkdtempSync(join(tmpdir(), "picm-curated-adoption-"));
  cpSync(resolve("test", "fixtures", "coding-repository", "existing-doc-duplication"), root, {
    recursive: true,
  });
  git(root, "init", "-q");
  git(root, "add", ".");
  return root;
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

test("Curated coding adoption reopens a protected phase before inspection and completes without writes", async (t) => {
  const root = createCuratedAdoptionFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const h = extensionHarness();
  const ctx = h.context(root, "curated-adoption-lifecycle");
  const control = h.tools.get("picm_scan_control");
  const batch = h.tools.get("picm_proposal_batch");
  await h.commands.get("picm-adopt").handler("coding", ctx);
  const deliveredGuidance = h.sent.at(-1);
  const mappingChoiceIndex = deliveredGuidance.indexOf("after mapping and adoption-depth choices");
  const inspectionBeginIndex = deliveredGuidance.indexOf('action: "begin"', mappingChoiceIndex);
  const proposalResolutionIndex = deliveredGuidance.indexOf("through proposal resolution", inspectionBeginIndex);
  const inspectionEndIndex = deliveredGuidance.indexOf('action: "end"', proposalResolutionIndex);
  const terminalCompleteIndex = deliveredGuidance.indexOf('action: "complete"', inspectionEndIndex);
  assert.ok(
    mappingChoiceIndex >= 0 &&
    mappingChoiceIndex < inspectionBeginIndex &&
    inspectionBeginIndex < proposalResolutionIndex &&
    proposalResolutionIndex < inspectionEndIndex &&
    inspectionEndIndex < terminalCompleteIndex,
  );
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);

  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  const initialInventory = await control.execute("inventory", { action: "inventory" }, undefined, undefined, ctx);
  assert.equal(initialInventory.details.candidates.includes("AGENTS.md"), true);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);

  const closedPhaseRead = await h.handlers.get("tool_call")(
    { toolName: "read", input: { path: "docs/ARCHITECTURE.md" } },
    ctx,
  );
  assert.equal(closedPhaseRead.block, true);
  assert.match(closedPhaseRead.reason, /Begin the privacy-reviewed PiCM scan/);

  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  const inspectionInventory = await control.execute("inventory", { action: "inventory" }, undefined, undefined, ctx);
  assert.equal(inspectionInventory.details.candidates.includes("docs/ARCHITECTURE.md"), true);
  const reads = await preflightParallelToolCalls(h, ctx, [
    {
      id: "curated-architecture",
      toolName: "read",
      input: { path: "docs/ARCHITECTURE.md" },
      tool: h.tools.get("read"),
    },
    {
      id: "curated-development",
      toolName: "read",
      input: { path: "docs/development.md" },
      tool: h.tools.get("read"),
    },
  ]);
  assert.equal(reads.every((call) => call.blocked === undefined), true);
  const results = await Promise.all(executePreflightedToolCalls(h, ctx, reads));
  assert.equal(results.every((result) => result.isError === false), true);
  assert.match(results[0].result.content[0].text, /Architecture/);
  assert.match(results[1].result.content[0].text, /src\/index\.js/);

  const prepared = await batch.execute("prepare", {
    action: "prepare",
    operations: [{
      type: "create",
      path: ".picm/adoption-report.md",
      content: "# Curated adoption proposal\n",
    }],
  }, undefined, undefined, ctx);
  assert.equal(prepared.details.ok, true);
  const presented = await batch.execute("present", {
    action: "present",
    proposalId: prepared.details.proposalId,
    digest: prepared.details.digest,
  }, undefined, undefined, ctx);
  assert.equal(presented.details.ok, true);
  await h.handlers.get("before_agent_start")({ prompt: "decline" }, ctx);
  const cancelled = await batch.execute("cancel", {
    action: "cancel",
    proposalId: prepared.details.proposalId,
  }, undefined, undefined, ctx);
  assert.equal(cancelled.details.ok, true);
  const repeatedCancellation = await batch.execute("cancel", {
    action: "cancel",
    proposalId: prepared.details.proposalId,
  }, undefined, undefined, ctx);
  assert.equal(repeatedCancellation.details.ok, true);
  await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
  const cancelledReplay = await batch.execute("apply", {
    action: "apply",
    proposalId: prepared.details.proposalId,
  }, undefined, undefined, ctx);
  assert.equal(cancelledReplay.details.ok, false);
  assert.equal(cancelledReplay.details.code, "PICM_PROPOSAL_NOT_APPROVED");
  assert.equal(existsSync(join(root, ".picm", "adoption-report.md")), false);

  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  const complete = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(complete.details.completed, true);
  assert.equal(existsSync(join(root, ".picm", "config.json")), false);
  t.diagnostic(JSON.stringify({
    initialPhase: { inventoryIncluded: "AGENTS.md", ended: true },
    betweenPhases: { projectReadBlocked: true, reason: closedPhaseRead.reason },
    curatedInspectionPhase: {
      inventoryIncluded: "docs/ARCHITECTURE.md",
      guardedReads: ["docs/ARCHITECTURE.md", "docs/development.md"],
      ended: true,
    },
    proposal: { presented: presented.details.ok, declined: true, cancelled: cancelled.details.ok },
    terminal: {
      completed: complete.details.completed,
      proposalDeclineWroteFiles: false,
      proposalDeclineWroteConfig: false,
    },
  }, null, 2));
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

    await resumed.tools.get("picm_scan_control").execute(
      "id",
      { action: "begin" },
      undefined,
      undefined,
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
    assert.equal(restored.details.active, true);
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
    await h.tools.get("picm_scan_control").execute(
      "id",
      { action: "begin" },
      undefined,
      undefined,
      ctx,
    );
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
