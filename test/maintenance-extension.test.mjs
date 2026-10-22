import assert from "node:assert/strict";
import test from "node:test";

import { harness } from "./helpers/maintenance-extension-harness.mjs";

const commands = ["picm-new", "picm-adopt", "picm-maintain", "picm-optimize", "picm-help"];

test("extension registers five thin commands and only local utility tools", () => {
  const h = harness();
  assert.deepEqual([...h.commands.keys()], commands);
  assert.deepEqual([...h.tools.keys()].sort(), ["picm_decision", "picm_evidence_report", "picm_maintenance_policy", "picm_settings"]);
  assert.equal(h.handlers.has("tool_call"), false);
  assert.equal(h.handlers.has("input"), false);
  assert.equal(h.handlers.has("agent_settled"), false);
});

test("commands dispatch a composed command prompt and preserve optional arguments", async (t) => {
  for (const command of commands) {
    await t.test(command, async () => {
      const h = harness();
      const args = command === "picm-adopt" ? "coding" : "focused request";
      await h.commands.get(command).handler(args, h.context(process.cwd(), "rpc"));
      assert.equal(h.sent.length, 1);
      assert.equal(h.sent[0], `Running /${command}${command === "picm-maintain" ? " (strict)" : ""}.`);
      assert.equal(h.instructions.length, 1);
      assert.equal(h.instructions[0].display, false);
      assert.equal(h.instructions[0].customType, "picm-instructions");
      assert.match(h.instructions[0].content, /## Shared trusted-assistant contract/);
      assert.match(h.instructions[0].content, /User arguments: /);
      assert.doesNotMatch(h.instructions[0].content, /picm_scan_control|picm_scaffold_proposal|picm_proposal_batch|approval token|mandatory preflight/i);
      assert.deepEqual(h.deliveries.map(({ type, options }) => ({ type, options })), [
        { type: "custom", options: { deliverAs: "nextTurn" } },
        { type: "user", options: undefined },
      ]);
    });
  }
});

test("maintenance uses an explicit argument without a redundant depth dialog", async () => {
  const h = harness();
  await h.commands.get("picm-maintain").handler("balanced routing", h.context(process.cwd(), "tui"));
  assert.equal(h.selections.length, 0);
  assert.equal(h.sent[0], "Running /picm-maintain (balanced).");
  assert.match(h.instructions[0].content, /One-run depth: balanced/);
  assert.match(h.instructions[0].content, /User arguments: routing/);
});

test("command completions retain coding and one-run maintenance choices", () => {
  const h = harness();
  assert.equal(h.commands.get("picm-adopt").getArgumentCompletions("cod")[0].value, "coding");
  const choices = h.commands.get("picm-maintain").getArgumentCompletions("");
  assert.equal(choices.some(({ value }) => value === "strict"), true);
  assert.equal(choices.some(({ value }) => value === "balanced"), true);
  assert.equal(choices.some(({ value }) => value === "coding"), true);
});
