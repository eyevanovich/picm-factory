import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";
import { createRuntimeCoordinator } from "../extensions/runtime/runtime-coordinator.mjs";
import { extensionHarness } from "./helpers/picm-extension-harness.mjs";
import { git, withFixture, write } from "./helpers/git-fixtures.mjs";

async function activate(h, ctx, command, args = "") {
  const control = h.tools.get("picm_scan_control");
  await h.commands.get(command).handler(args, ctx);
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  return control;
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function deferredWriteGateHarness(path) {
  const pathCheckStarted = deferred();
  const releasePathCheck = deferred();
  let holdNextMatchingWrite = true;
  const h = extensionHarness({
    createCoordinator: (options) => createRuntimeCoordinator({
      ...options,
      createGitGate(gateOptions) {
        const gate = createGitReadGate(gateOptions);
        return {
          ...gate,
          async checkPath(...args) {
            if (holdNextMatchingWrite && args[0] === "write" && args[1] === path) {
              holdNextMatchingWrite = false;
              pathCheckStarted.resolve();
              await releasePathCheck.promise;
            }
            return gate.checkPath(...args);
          },
        };
      },
    }),
  });
  return { h, pathCheckStarted, releasePathCheck };
}

async function prepareApprovedScaffold(h, ctx, operation) {
  const control = h.tools.get("picm_scan_control");
  const scaffold = h.tools.get("picm_scaffold_proposal");
  await h.commands.get("picm-new").handler("deferred scaffold", ctx);
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await scaffold.execute("preview", { action: "preview", operations: [operation] }, undefined, undefined, ctx);
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  return { control, scaffold };
}

test("workflow authority records cannot cross sessions or replacements", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const first = h.context(root, "authority-first");
    const second = h.context(root, "authority-second");
    const batch = h.tools.get("picm_proposal_batch");

    await activate(h, first, "picm-adopt", "coding");
    const prepared = await batch.execute("prepare", {
      action: "prepare",
      operations: [{ type: "create", path: "first-proposal.md", content: "first\n" }],
    }, undefined, undefined, first);
    await batch.execute("present", {
      action: "present",
      proposalId: prepared.details.proposalId,
      digest: prepared.details.digest,
    }, undefined, undefined, first);
    await h.handlers.get("before_agent_start")({ prompt: "approve" }, first);

    await activate(h, second, "picm-adopt", "coding");
    const proposalMismatch = await batch.execute("apply", {
      action: "apply",
      proposalId: prepared.details.proposalId,
    }, undefined, undefined, second);
    assert.equal(proposalMismatch.details.code, "PICM_PROPOSAL_NOT_PREPARED");

    const replacementWorkspace = join(root, "proposal-replacement-workspace");
    mkdirSync(replacementWorkspace);
    const replacement = h.context(replacementWorkspace, "authority-first");
    await activate(h, replacement, "picm-adopt", "coding");
    const workspaceMismatch = await batch.execute("apply", {
      action: "apply",
      proposalId: prepared.details.proposalId,
    }, undefined, undefined, replacement);
    assert.equal(workspaceMismatch.details.code, "PICM_PROPOSAL_NOT_PREPARED");

    const policy = h.tools.get("picm_maintenance_policy");
    const preview = await policy.execute(
      "preview",
      { action: "preview", mode: "manual" },
      undefined,
      undefined,
      h.context(root, "policy-first"),
    );
    await assert.rejects(
      policy.execute(
        "apply",
        { action: "apply", previewId: preview.details.previewId },
        undefined,
        undefined,
        h.context(root, "policy-second"),
      ),
      /MAINTENANCE_PREVIEW_SCOPE_MISMATCH/,
    );
  });
});

test("scaffold authority is session-scoped and terminal completion releases it", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const first = h.context(root, "scaffold-scope");
    const workspace = join(root, "replacement-workspace");
    mkdirSync(workspace);
    const second = h.context(workspace, "scaffold-scope");
    const scaffold = h.tools.get("picm_scaffold_proposal");
    const firstOperation = { tool: "write", input: { path: "AGENTS.md", content: "first\n" } };
    const secondOperation = { tool: "write", input: { path: "CONTEXT.md", content: "second\n" } };

    await h.commands.get("picm-new").handler("first", first);
    await scaffold.execute("first-preview", { action: "preview", operations: [firstOperation] }, undefined, undefined, first);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, first);

    await h.commands.get("picm-new").handler("second", second);
    const control = h.tools.get("picm_scan_control");
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, second);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, second);
    await scaffold.execute("second-preview", { action: "preview", operations: [secondOperation] }, undefined, undefined, second);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, second);
    await control.execute("begin", { action: "begin" }, undefined, undefined, second);

    const mismatchedScaffold = await h.handlers.get("tool_call")({
      toolCallId: "mismatched-scaffold",
      toolName: "write",
      input: firstOperation.input,
    }, second);
    assert.equal(mismatchedScaffold.block, true);

    await control.execute("end", { action: "end" }, undefined, undefined, second);
    await control.execute("complete", { action: "complete" }, undefined, undefined, second);
    const ordinaryWrite = await h.handlers.get("tool_call")({
      toolCallId: "ordinary-after-complete",
      toolName: "write",
      input: { path: "ordinary.md", content: "ordinary\n" },
    }, second);
    assert.equal(ordinaryWrite, undefined);

    await control.execute("complete", { action: "complete" }, undefined, undefined, second);
    await h.handlers.get("agent_settled")({}, second);
    await h.handlers.get("agent_settled")({}, second);
    await h.handlers.get("session_shutdown")({}, second);
    await h.handlers.get("session_shutdown")({}, second);
  });
});

test("terminal completion permits fresh ordinary path execution despite prior exclusions", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "complete-with-exclusions");
    const control = h.tools.get("picm_scan_control");
    const input = { path: "ordinary-after-complete.md", content: "ordinary\n" };

    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: ["private"] }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);

    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "ordinary-write-after-complete",
      toolName: "write",
      input,
    }, ctx), undefined);
    await h.tools.get("write").execute("ordinary-write-after-complete", input, undefined, undefined, ctx);
    assert.equal(readFileSync(join(root, input.path), "utf8"), input.content);
  });
});

test("session-tree restoration keeps scaffold mutations blocked until a new proposal is approved", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "scaffold-session-tree");
    const control = h.tools.get("picm_scan_control");
    const scaffold = h.tools.get("picm_scaffold_proposal");
    const oldOperation = { tool: "write", input: { path: "old-after-restore.md", content: "old\n" } };
    const arbitraryInput = { path: "arbitrary-after-restore.md", content: "arbitrary\n" };
    const newOperation = { tool: "write", input: { path: "new-after-restore.md", content: "new\n" } };

    await h.commands.get("picm-new").handler("restore scaffold", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await scaffold.execute("old-preview", { action: "preview", operations: [oldOperation] }, undefined, undefined, ctx);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    await h.handlers.get("session_tree")({}, ctx);
    await control.execute("resume-scan", { action: "begin" }, undefined, undefined, ctx);

    for (const [toolCallId, input] of [
      ["restored-old-write", oldOperation.input],
      ["restored-arbitrary-write", arbitraryInput],
    ]) {
      const blocked = await h.handlers.get("tool_call")({ toolCallId, toolName: "write", input }, ctx);
      assert.equal(blocked?.block, true);
      assert.match(blocked.reason, /Blocked scaffold mutation/);
    }

    await control.execute("end-restored-scan", { action: "end" }, undefined, undefined, ctx);
    await scaffold.execute("new-preview", { action: "preview", operations: [newOperation] }, undefined, undefined, ctx);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin-new-scan", { action: "begin" }, undefined, undefined, ctx);

    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "new-approved-write",
      toolName: "write",
      input: newOperation.input,
    }, ctx), undefined);
    await h.tools.get("write").execute(
      "new-approved-write",
      newOperation.input,
      undefined,
      undefined,
      ctx,
    );
    await h.handlers.get("tool_execution_end")({
      toolCallId: "new-approved-write",
      toolName: "write",
      isError: false,
    }, ctx);

    assert.equal(existsSync(join(root, oldOperation.input.path)), false);
    assert.equal(existsSync(join(root, arbitraryInput.path)), false);
    assert.equal(existsSync(join(root, newOperation.input.path)), true);
  });
});

test("deferred write admission fails closed after revision invalidates approval", async () => {
  await withFixture(async ({ root }) => {
    const staleOperation = { tool: "write", input: { path: "stale-after-revision.md", content: "stale\n" } };
    const currentOperation = { tool: "write", input: { path: "current-after-revision.md", content: "current\n" } };
    const { h, pathCheckStarted, releasePathCheck } = deferredWriteGateHarness(staleOperation.input.path);
    const ctx = h.context(root, "deferred-revision");
    const { control, scaffold } = await prepareApprovedScaffold(h, ctx, staleOperation);

    const inFlight = h.handlers.get("tool_call")({
      toolCallId: "stale-revision-write",
      toolName: "write",
      input: staleOperation.input,
    }, ctx);
    await pathCheckStarted.promise;
    await h.handlers.get("input")({ text: "change the scaffold", source: "interactive" }, ctx);
    releasePathCheck.resolve();

    const stale = await inFlight;
    assert.equal(stale?.block, true);
    assert.equal(existsSync(join(root, staleOperation.input.path)), false);

    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    await scaffold.execute("replacement", { action: "preview", operations: [currentOperation] }, undefined, undefined, ctx);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin-current", { action: "begin" }, undefined, undefined, ctx);

    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "current-revision-write",
      toolName: "write",
      input: currentOperation.input,
    }, ctx), undefined);
    await h.tools.get("write").execute("current-revision-write", currentOperation.input, undefined, undefined, ctx);
    await h.handlers.get("tool_execution_end")({
      toolCallId: "current-revision-write",
      toolName: "write",
      isError: false,
    }, ctx);
    assert.equal(readFileSync(join(root, currentOperation.input.path), "utf8"), "current\n");
  });
});

test("deferred write admission rejects a replaced preview with identical operations", async () => {
  await withFixture(async ({ root }) => {
    const operation = { tool: "write", input: { path: "replacement-current.md", content: "current\n" } };
    const { h, pathCheckStarted, releasePathCheck } = deferredWriteGateHarness(operation.input.path);
    const ctx = h.context(root, "deferred-replacement");
    const { control, scaffold } = await prepareApprovedScaffold(h, ctx, operation);

    const inFlight = h.handlers.get("tool_call")({
      toolCallId: "replaced-preview-write",
      toolName: "write",
      input: operation.input,
    }, ctx);
    await pathCheckStarted.promise;
    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    await scaffold.execute("replacement", { action: "preview", operations: [operation] }, undefined, undefined, ctx);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin-current", { action: "begin" }, undefined, undefined, ctx);
    releasePathCheck.resolve();

    const stale = await inFlight;
    assert.equal(stale?.block, true);
    assert.equal(existsSync(join(root, operation.input.path)), false);

    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "current-preview-write",
      toolName: "write",
      input: operation.input,
    }, ctx), undefined);
    await h.tools.get("write").execute("current-preview-write", operation.input, undefined, undefined, ctx);
    await h.handlers.get("tool_execution_end")({
      toolCallId: "current-preview-write",
      toolName: "write",
      isError: false,
    }, ctx);
    assert.equal(readFileSync(join(root, operation.input.path), "utf8"), "current\n");
  });
});

test("a replacement workflow cannot execute a released guarded path binding", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "binding-replacement");
    await activate(h, ctx, "picm-adopt", "coding");

    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "old-read",
      toolName: "read",
      input: { path: "safe.txt" },
    }, ctx), undefined);

    await activate(h, ctx, "picm-adopt", "coding");
    await assert.rejects(
      h.tools.get("read").execute("old-read", { path: "safe.txt" }, undefined, undefined, ctx),
      /PICM_PATH_BINDING_STALE/,
    );
  });
});

test("issued scaffold writes fail closed after every lifecycle authority revocation", async () => {
  const revocations = [
    {
      name: "command replacement to an inactive preflight",
      revoke: async ({ h, ctx }) => h.commands.get("picm-new").handler("replacement", ctx),
    },
    {
      name: "terminal completion",
      revoke: async ({ control, ctx }) => {
        await control.execute("end", { action: "end" }, undefined, undefined, ctx);
        await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
      },
    },
    {
      name: "agent settlement",
      revoke: async ({ h, ctx }) => h.handlers.get("agent_settled")({}, ctx),
    },
    {
      name: "session-tree restoration",
      revoke: async ({ h, ctx }) => h.handlers.get("session_tree")({}, ctx),
    },
  ];

  for (const { name, revoke } of revocations) {
    await withFixture(async ({ root }) => {
      const operation = {
        tool: "write",
        input: { path: `stale-${name.replace(/[^a-z]+/gi, "-")}.md`, content: "stale\n" },
      };
      const h = extensionHarness();
      const ctx = h.context(root, `issued-${name}`);
      const { control } = await prepareApprovedScaffold(h, ctx, operation);
      const toolCallId = `issued-${name}`;

      assert.equal(await h.handlers.get("tool_call")({
        toolCallId,
        toolName: "write",
        input: operation.input,
      }, ctx), undefined, name);
      await revoke({ h, ctx, control });

      await assert.rejects(
        h.tools.get("write").execute(toolCallId, operation.input, undefined, undefined, ctx),
        /PICM_PATH_BINDING_STALE/,
        name,
      );
      assert.equal(existsSync(join(root, operation.input.path)), false, name);
    });
  }
});

test("late stale config completion cannot contaminate replacement Specialist evidence", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "late-stale-specialist");
    const config = JSON.stringify({
      generatedBy: "picm-factory",
      profile: "specialist-folder",
      paths: {
        rootInstructions: "AGENTS.md",
        rootContext: "CONTEXT.md",
        firstRecipe: "workflows/first.md",
        generatedInputs: ["source/request.md"],
        runtimeInputs: [],
      },
    }, null, 2);
    const recipe = `# First\n\n## Inputs\n\n- Approved source at \`source/request.md\`.\n\n## Expected artifact\n\nCreate \`output/result.md\`.\n\n## Review gate\n\nInspect, edit, and approve \`output/result.md\`. Keep open questions visible. The next action reads from \`output/result.md\`.\n`;
    const oldOperation = { tool: "write", input: { path: ".picm/config.json", content: config } };
    const currentOperations = [
      { tool: "write", input: { path: "AGENTS.md", content: "Current instructions.\n" } },
      { tool: "write", input: { path: "CONTEXT.md", content: "Current context.\n" } },
      { tool: "write", input: { path: "identity.md", content: "Current identity.\n" } },
      { tool: "write", input: { path: "rules.md", content: "Current rules.\n" } },
      { tool: "write", input: { path: "workflows/first.md", content: recipe } },
      { tool: "write", input: { path: "source/request.md", content: "Current request.\n" } },
      { tool: "write", input: { path: ".picm/config.json", content: config } },
    ];
    for (const operation of currentOperations) {
      write(join(root, operation.input.path), operation.input.content);
    }
    git(root, "add", ...currentOperations.map((operation) => operation.input.path));

    const { control } = await prepareApprovedScaffold(h, ctx, oldOperation);
    const oldToolCallId = "old-specialist-config";
    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: oldToolCallId,
      toolName: "write",
      input: oldOperation.input,
    }, ctx), undefined);

    await h.commands.get("picm-new").handler("replacement", ctx);
    await control.execute("preflight-current", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy-current", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await h.tools.get("picm_scaffold_proposal").execute(
      "current-preview",
      { action: "preview", operations: currentOperations },
      undefined,
      undefined,
      ctx,
    );
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin-current", { action: "begin" }, undefined, undefined, ctx);

    for (const [index, operation] of currentOperations.slice(0, -1).entries()) {
      const toolCallId = `current-specialist-${index}`;
      assert.equal(await h.handlers.get("tool_call")({ toolCallId, toolName: "write", input: operation.input }, ctx), undefined);
      await h.tools.get("write").execute(toolCallId, operation.input, undefined, undefined, ctx);
      await h.handlers.get("tool_execution_end")({
        toolCallId,
        toolName: "write",
        args: operation.input,
        isError: false,
      }, ctx);
    }

    await assert.rejects(
      h.tools.get("write").execute(oldToolCallId, oldOperation.input, undefined, undefined, ctx),
      /PICM_PATH_BINDING_STALE/,
    );
    await h.handlers.get("tool_execution_end")({
      toolCallId: oldToolCallId,
      toolName: "write",
      args: oldOperation.input,
      isError: false,
    }, ctx);

    await assert.rejects(
      h.tools.get("picm_specialist_first_run_guidance").execute("stale-guidance", {}, undefined, undefined, ctx),
      /SPECIALIST_GUIDANCE_NOT_APPROVED/,
    );

    const freshOperation = currentOperations.at(-1);
    const freshToolCallId = "current-specialist-config";
    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: freshToolCallId,
      toolName: "write",
      input: freshOperation.input,
    }, ctx), undefined);
    await h.tools.get("write").execute(freshToolCallId, freshOperation.input, undefined, undefined, ctx);
    await h.handlers.get("tool_execution_end")({
      toolCallId: freshToolCallId,
      toolName: "write",
      args: freshOperation.input,
      isError: false,
    }, ctx);

    const guidance = await h.tools.get("picm_specialist_first_run_guidance").execute(
      "current-guidance",
      {},
      undefined,
      undefined,
      ctx,
    );
    assert.match(guidance.content[0].text, /Start with `workflows\/first.md`/);
  });
});
