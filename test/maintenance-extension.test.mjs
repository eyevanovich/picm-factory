import assert from "node:assert/strict";
import test from "node:test";

import { harness } from "./helpers/maintenance-extension-harness.mjs";

const commands = ["picm-new", "picm-adopt", "picm-maintain", "picm-optimize", "picm-help"];

test("extension registers five thin commands and only local utility tools", () => {
  const h = harness();
  assert.deepEqual([...h.commands.keys()], commands);
  assert.deepEqual([...h.tools.keys()].sort(), ["picm_decision", "picm_maintenance_policy", "picm_settings"]);
  assert.equal(h.handlers.has("tool_call"), false);
  assert.equal(h.handlers.has("input"), false);
  assert.equal(h.handlers.has("agent_settled"), false);
});

test("commands dispatch a shared skill prompt and preserve optional arguments", async (t) => {
  for (const command of commands) {
    await t.test(command, async () => {
      const h = harness();
      const args = command === "picm-adopt" ? "coding" : "focused request";
      await h.commands.get(command).handler(args, h.context(process.cwd(), "rpc"));
      assert.equal(h.sent.length, 1);
      assert.match(h.sent[0], /Load the picm-factory skill/);
      assert.match(h.sent[0], /User arguments: /);
      assert.doesNotMatch(h.sent[0], /scan_control|proposal|approval token|preflight/i);
    });
  }
});

test("maintenance uses an explicit argument without a redundant depth dialog", async () => {
  const h = harness();
  await h.commands.get("picm-maintain").handler("balanced routing", h.context(process.cwd(), "tui"));
  assert.equal(h.selections.length, 0);
  assert.match(h.sent[0], /One-run depth: balanced/);
  assert.match(h.sent[0], /User arguments: routing/);
});

test("command completions retain coding and one-run maintenance choices", () => {
  const h = harness();
  assert.equal(h.commands.get("picm-adopt").getArgumentCompletions("cod")[0].value, "coding");
  const choices = h.commands.get("picm-maintain").getArgumentCompletions("");
  assert.equal(choices.some(({ value }) => value === "strict"), true);
  assert.equal(choices.some(({ value }) => value === "balanced"), true);
  assert.equal(choices.some(({ value }) => value === "coding"), true);
});
