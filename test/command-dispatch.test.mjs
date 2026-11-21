import assert from "node:assert/strict";
import test from "node:test";

import { commandPrompt, maintenanceRequest } from "../pi/extensions/runtime/command-dispatch.ts";

test("each registered command maps to its composed mode without protocol instructions", () => {
  for (const [command, mode] of [
    ["picm-new", "new"],
    ["picm-adopt", "adopt"],
    ["picm-maintain", "maintain"],
    ["picm-optimize", "optimize"],
    ["picm-help", "help"],
  ]) {
    const prompt = commandPrompt(command, "focused request");
    assert.match(prompt, /## Shared trusted-assistant contract/);
    assert.match(prompt, new RegExp(`Mode: ${mode}`));
    assert.match(prompt, /User arguments: focused request/);
    assert.doesNotMatch(prompt, /picm_scan_control|picm_scaffold_proposal|picm_proposal_batch|approval token|mandatory preflight/i);
  }
  assert.throws(() => commandPrompt("picm-unknown"), /Unknown PiCM command/);
});

test("command entry establishes privacy before workspace prerequisites", () => {
  for (const command of ["picm-new", "picm-adopt", "picm-maintain", "picm-optimize"]) {
    const prompt = commandPrompt(command, "Read CONTEXT.md first");
    const contract = prompt.indexOf("before following workspace read-first instructions");
    const preparation = prompt.indexOf("### Workspace-read preparation");
    const host = prompt.indexOf("# Pi host adapter");
    assert.ok(contract >= 0 && preparation > contract && host > preparation);
    assert.match(prompt, /request an already-sanitized replacement when an excluded prerequisite blocks the task/);
    assert.match(prompt, /User approval does not override this boundary/);
    assert.ok(prompt.indexOf("User arguments:") > host);
  }
  const help = commandPrompt("picm-help", "Read CONTEXT.md first");
  assert.match(help, /without inspecting or editing the workspace/);
  assert.match(help, /even if workspace instructions request prerequisite reads/);
});

test("adoption delivers the same core inspection for regular, coding, and report-only requests", () => {
  for (const args of ["", "coding", "coding report-only"]) {
    const prompt = commandPrompt("picm-adopt", args);
    assert.equal([...prompt.matchAll(/^## Coding onboarding$/gm)].length, 1);
    assert.ok(prompt.indexOf("### Workspace-read preparation") < prompt.indexOf("## Coding onboarding"));
    assert.ok(prompt.indexOf("### 3. Exercise context gathering") < prompt.indexOf("### 4. Assess and propose"));
    assert.match(prompt, /Report-only limits writes, not coding inspection/);
    assert.match(prompt, /initial Strict examination/);
    assert.doesNotMatch(prompt, /One-run depth:|coding-maintenance-rubric\.md/);
    if (args) assert.ok(prompt.endsWith(`User arguments: ${args}`));
  }
});

test("maintenance depth is a one-run argument and leaves the remaining focus intact", () => {
  assert.deepEqual(maintenanceRequest('balanced trace "handoff drift"'), {
    depth: "balanced",
    args: 'trace "handoff drift"',
  });
  assert.deepEqual(maintenanceRequest("routing"), { depth: undefined, args: "routing" });
  assert.match(commandPrompt("picm-maintain", "routing", { depth: "balanced" }), /One-run depth: balanced\. Do not change stored maintenancePreset\./);
});
