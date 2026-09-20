import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isUnverifiedCheckpointAcknowledgement } from "../extensions/runtime/scaffold-approval.mjs";
import { withFixture } from "./helpers/git-fixtures.mjs";
import { extensionHarness } from "./helpers/picm-extension-harness.mjs";

async function invoke(h, ctx, id, toolName, input) {
  const event = { toolCallId: id, toolName, input };
  const blocked = await h.handlers.get("tool_call")(event, ctx);
  assert.equal(blocked, undefined, blocked?.reason);
  const result = await h.tools.get(toolName).execute(id, input, undefined, undefined, ctx);
  await h.handlers.get("tool_execution_end")({ ...event, result, isError: Boolean(result.isError) }, ctx);
  return result;
}

async function start(h, ctx, command) {
  await h.commands.get(command).handler("", ctx);
  for (const action of ["preflight", "privacy", "begin"]) {
    await invoke(h, ctx, action, "picm_scan_control", {
      action,
      ...(action === "privacy" ? { excludedPaths: ["safe-dir"] } : {}),
    });
  }
}

async function reply(h, ctx, text) {
  await h.handlers.get("input")({ text, source: "interactive" }, ctx);
  await h.handlers.get("before_agent_start")({ prompt: text }, ctx);
}

test("ordinary question and approval turns preserve an active protected proposal phase", async () => {
  for (const command of ["picm-adopt", "picm-maintain"]) {
    await withFixture(async ({ root }) => {
      const h = extensionHarness();
      const ctx = h.context(root, command);
      try {
        await start(h, ctx, command);
        await h.handlers.get("agent_settled")({}, ctx);
        await reply(h, ctx, "Manual maintenance, please.");
        const prepared = await invoke(h, ctx, "prepare", "picm_proposal_batch", {
          action: "prepare",
          operations: [{ type: "modify", path: "safe.txt", expectedContent: "safe\n", content: "approved\n" }],
        });
        const proposalId = prepared.details.proposalId;
        await invoke(h, ctx, "present", "picm_proposal_batch", {
          action: "present", proposalId, digest: prepared.details.digest,
        });
        await h.handlers.get("agent_settled")({}, ctx);
        await reply(h, ctx, "I created a Git checkpoint.");
        await h.handlers.get("agent_settled")({}, ctx);
        assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "safe\n");
        const excluded = await h.handlers.get("tool_call")({
          toolName: "read", input: { path: "safe-dir/nested.txt" },
        }, ctx);
        assert.equal(excluded.block, true);
        await reply(h, ctx, "approve");
        const applied = await invoke(h, ctx, "apply", "picm_proposal_batch", { action: "apply", proposalId });
        assert.equal(applied.details.ok, true, JSON.stringify(applied.details));
        assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "approved\n");
        await invoke(h, ctx, "end", "picm_scan_control", { action: "end" });
        await h.handlers.get("agent_settled")({}, ctx);
        assert.equal((await h.handlers.get("tool_call")({
          toolName: "read", input: { path: "safe.txt" },
        }, ctx)).block, true);
      } finally {
        await h.handlers.get("session_shutdown")({}, ctx);
      }
    });
  }
});

test("scaffold preview and approved writes share a protected phase across conversational turns", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "scaffold-conversation");
    try {
      await start(h, ctx, "picm-new");
      const operation = { tool: "write", input: { path: "new/context.md", content: "Reviewed scaffold\n" } };
      await invoke(h, ctx, "preview", "picm_scaffold_proposal", { action: "preview", operations: [operation] });
      await h.handlers.get("agent_settled")({}, ctx);
      await reply(h, ctx, "view all");
      await h.handlers.get("agent_settled")({}, ctx);
      assert.equal(existsSync(join(root, operation.input.path)), false);
      assert.equal((await h.handlers.get("tool_call")({
        toolCallId: "unapproved", toolName: operation.tool, input: operation.input,
      }, ctx)).block, true);
      await reply(h, ctx, "approve this exact scaffold");
      await invoke(h, ctx, "write", operation.tool, operation.input);
      assert.equal(readFileSync(join(root, operation.input.path), "utf8"), operation.input.content);
    } finally {
      await h.handlers.get("session_shutdown")({}, ctx);
    }
  });
});

test("checkpoint coverage reports exclude negative, conditional, and revised statements", () => {
  for (const report of [
    "The Git checkpoint covers the current contents of all affected existing files.",
    "The fixture checkpoint commit covers the current contents of all affected existing files in this replacement proposal.",
  ]) assert.equal(isUnverifiedCheckpointAcknowledgement(report), true, report);
  for (const reply of [
    "The Git checkpoint does not cover the current contents of all affected existing files.",
    "If the Git checkpoint covers the current contents of all affected existing files.",
    "The Git checkpoint covers the current contents of all affected existing files?",
    "The Git checkpoint covers the current contents of all affected existing files. Revise the proposal.",
    "The Git checkpoint covers the current contents of all affected existing files. Cancel.",
  ]) assert.equal(isUnverifiedCheckpointAcknowledgement(reply), false, reply);
});

test("a current-content checkpoint report acknowledges risk but does not approve a batch", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "checkpoint-coverage");
    try {
      await start(h, ctx, "picm-adopt");
      const prepared = await invoke(h, ctx, "prepare", "picm_proposal_batch", {
        action: "prepare",
        operations: [{ type: "modify", path: "safe.txt", expectedContent: "safe\n", content: "approved\n" }],
      });
      const proposalId = prepared.details.proposalId;
      await invoke(h, ctx, "present", "picm_proposal_batch", {
        action: "present", proposalId, digest: prepared.details.digest,
      });
      await reply(h, ctx, "The fixture checkpoint commit covers the current contents of all affected existing files. Continue.");
      const pending = await invoke(h, ctx, "pending", "picm_proposal_batch", { action: "apply", proposalId });
      assert.equal(pending.details.code, "PICM_PROPOSAL_NOT_APPROVED");
      assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "safe\n");
      await reply(h, ctx, "approve");
      const applied = await invoke(h, ctx, "apply", "picm_proposal_batch", { action: "apply", proposalId });
      assert.equal(applied.details.ok, true, JSON.stringify(applied.details));
    } finally {
      await h.handlers.get("session_shutdown")({}, ctx);
    }
  });
});

for (const [name, path, review] of [
  ["multi-level parents", "stages/01_extraction/CONTEXT.md", "view all"],
  ["expanded preview-only review", "AGENTS.md", "preview only. Show the complete exact proposed contents of all seven files."],
  ["post-write inventory", "AGENTS.md", "view all"],
]) {
  test(`scaffold supports ${name} without changing approval`, async () => {
    await withFixture(async ({ root }) => {
      const h = extensionHarness();
      const ctx = h.context(root, name);
      try {
        await start(h, ctx, "picm-new");
        await invoke(h, ctx, "inventory-before", "picm_scan_control", { action: "inventory" });
        const operation = { tool: "write", input: { path, content: "Reviewed scaffold\n" } };
        await invoke(h, ctx, "preview", "picm_scaffold_proposal", { action: "preview", operations: [operation] });
        for (const text of [review, "continue", "."]) {
          await h.handlers.get("agent_settled")({}, ctx);
          await reply(h, ctx, text);
          assert.equal(existsSync(join(root, path)), false);
          assert.equal((await h.handlers.get("tool_call")({
            toolCallId: `unapproved-${text}`, toolName: "write", input: operation.input,
          }, ctx)).block, true);
        }
        await h.handlers.get("agent_settled")({}, ctx);
        await reply(h, ctx, "approve this exact scaffold");
        await invoke(h, ctx, "write", operation.tool, operation.input);
        assert.equal(readFileSync(join(root, path), "utf8"), operation.input.content);
        await h.handlers.get("agent_settled")({}, ctx);
        const inventory = await invoke(h, ctx, "inventory-after", "picm_scan_control", { action: "inventory" });
        assert.equal(inventory.details.newWorkflowIntentRequired, false);
        await invoke(h, ctx, "end", "picm_scan_control", { action: "end" });
        assert.equal((await invoke(h, ctx, "complete", "picm_scan_control", { action: "complete" })).details.completed, true);
      } finally {
        await h.handlers.get("session_shutdown")({}, ctx);
      }
    });
  });
}

test("inventory-only preview request keeps an unchanged seven-file stage proposal approvable", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "stage-inventory-preview-request");
    const operations = [
      "AGENTS.md",
      "CONTEXT.md",
      "reference/style-guide.md",
      "01_intake/CONTEXT.md",
      "02_draft/CONTEXT.md",
      "03_review/CONTEXT.md",
      ".picm/config.json",
    ].map((path) => ({ tool: "write", input: { path, content: `Reviewed ${path}\n` } }));
    try {
      await start(h, ctx, "picm-new");
      await invoke(h, ctx, "inventory-before", "picm_scan_control", { action: "inventory" });
      await invoke(h, ctx, "preview", "picm_scaffold_proposal", { action: "preview", operations });

      for (const text of [
        "preview only. Show the complete exact proposed contents of all seven files.",
        "continue",
        ".",
        "Preview only for now. When I subsequently approve, please check the resulting file inventory before finishing so the summary accurately lists what was created.",
      ]) {
        await h.handlers.get("agent_settled")({}, ctx);
        await reply(h, ctx, text);
        assert.equal(existsSync(join(root, "AGENTS.md")), false);
        assert.equal((await h.handlers.get("tool_call")({
          toolCallId: `unapproved-${text}`,
          toolName: "write",
          input: operations[0].input,
        }, ctx)).block, true);
      }

      await h.handlers.get("agent_settled")({}, ctx);
      await reply(h, ctx, "approve this exact scaffold");
      for (const [index, operation] of operations.entries()) {
        await invoke(h, ctx, `write-${index}`, operation.tool, operation.input);
        assert.equal(readFileSync(join(root, operation.input.path), "utf8"), operation.input.content);
      }
      await h.handlers.get("agent_settled")({}, ctx);
      const inventory = await invoke(h, ctx, "inventory-after", "picm_scan_control", { action: "inventory" });
      assert.equal(inventory.details.newWorkflowIntentRequired, false);
      for (const operation of operations) {
        assert.ok(inventory.details.candidates.includes(operation.input.path), operation.input.path);
      }
      await invoke(h, ctx, "end", "picm_scan_control", { action: "end" });
      assert.equal((await invoke(h, ctx, "complete", "picm_scan_control", { action: "complete" })).details.completed, true);
    } finally {
      await h.handlers.get("session_shutdown")({}, ctx);
    }
  });
});

for (const response of [
  "preview only. Show the files, then change the root instructions.",
  "preview only. Show the proposal. Cancel.",
]) {
  test(`expanded preview never hides revision or cancellation: ${response}`, async () => {
    await withFixture(async ({ root }) => {
      const h = extensionHarness();
      const ctx = h.context(root);
      await start(h, ctx, "picm-new");
      const operation = { tool: "write", input: { path: "AGENTS.md", content: "Reviewed\n" } };
      await invoke(h, ctx, "preview", "picm_scaffold_proposal", { action: "preview", operations: [operation] });
      await reply(h, ctx, response);
      await reply(h, ctx, "approve this exact scaffold");
      assert.equal((await h.handlers.get("tool_call")({ toolCallId: "stale", toolName: "write", input: operation.input }, ctx)).block, true);
      assert.equal(existsSync(join(root, "AGENTS.md")), false);
      await h.handlers.get("session_shutdown")({}, ctx);
    });
  });
}

test("workflow cancellation revokes issued scaffold authority and preserves completed files", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root);
    await start(h, ctx, "picm-new");
    const operations = ["AGENTS.md", "CONTEXT.md"].map((path) => ({ tool: "write", input: { path, content: "Approved\n" } }));
    await invoke(h, ctx, "preview", "picm_scaffold_proposal", { action: "preview", operations });
    await reply(h, ctx, "approve this exact scaffold");
    await invoke(h, ctx, "first", "write", operations[0].input);
    assert.equal(await h.handlers.get("tool_call")({ toolCallId: "issued", toolName: "write", input: operations[1].input }, ctx), undefined);
    await invoke(h, ctx, "cancel", "picm_scan_control", { action: "cancel" });
    await assert.rejects(h.tools.get("write").execute("issued", operations[1].input, undefined, undefined, ctx), /PICM_PATH_BINDING/);
    assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "Approved\n");
    assert.equal(existsSync(join(root, "CONTEXT.md")), false);
    await assert.rejects(invoke(h, ctx, "queued-begin", "picm_scan_control", { action: "begin" }), /PICM_SCAN_NOT_AUTHORIZED/);
    await h.handlers.get("session_shutdown")({}, ctx);
  });
});
