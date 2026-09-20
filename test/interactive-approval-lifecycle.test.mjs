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
