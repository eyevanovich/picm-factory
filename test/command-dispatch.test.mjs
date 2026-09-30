import assert from "node:assert/strict";
import test from "node:test";

import { commandPrompt, maintenanceRequest } from "../extensions/runtime/command-dispatch.mjs";

test("each registered command maps to its shared skill mode without protocol instructions", () => {
  for (const [command, mode] of [
    ["picm-new", "new"],
    ["picm-adopt", "adopt"],
    ["picm-maintain", "maintain"],
    ["picm-optimize", "optimize"],
    ["picm-help", "help"],
  ]) {
    const prompt = commandPrompt(command, "focused request");
    assert.match(prompt, /Load the picm-factory skill/);
    assert.match(prompt, new RegExp(`Mode: ${mode}`));
    assert.match(prompt, /User arguments: focused request/);
    assert.doesNotMatch(prompt, /scan_control|proposal|approval token|preflight/i);
  }
  assert.throws(() => commandPrompt("picm-unknown"), /Unknown PiCM command/);
});

test("maintenance depth is a one-run argument and leaves the remaining focus intact", () => {
  assert.deepEqual(maintenanceRequest('balanced trace "handoff drift"'), {
    depth: "balanced",
    args: 'trace "handoff drift"',
  });
  assert.deepEqual(maintenanceRequest("routing"), { depth: undefined, args: "routing" });
  assert.match(commandPrompt("picm-maintain", "routing", { depth: "balanced" }), /One-run depth: balanced\. Do not change stored maintenancePreset\./);
});
