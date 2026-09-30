import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("all modification prompts route through the shared final-direction sign-off contract", () => {
  const skill = read("skills/picm-factory/SKILL.md");
  for (const signal of [
    "Inspect before changing anything",
    "State one concise final direction",
    "Wait for conversational sign-off on that direction before edits.",
    "Do not require a special phrase, proposal ID, digest, modal, or repeated approval",
    "Use ordinary tools",
  ]) assert.ok(skill.includes(signal), `missing shared contract signal: ${signal}`);

  for (const [prompt, mode] of [
    ["prompts/picm-new.md", "Mode: new"],
    ["prompts/picm-adopt.md", "Mode: adopt"],
    ["prompts/picm-maintain.md", "Mode: maintain"],
    ["prompts/picm-optimize.md", "Mode: optimize"],
    ["prompts/picm-help.md", "Mode: help"],
  ]) {
    const text = read(prompt);
    assert.ok(text.includes(mode), `${prompt} must retain its mode`);
    if (mode !== "Mode: help") assert.match(text, /shared trusted-assistant contract/);
    assert.doesNotMatch(text, /picm_scan_control|picm_scaffold_proposal|picm_proposal_batch/);
  }
  assert.match(read("prompts/picm-help.md"), /Do not inspect or edit the workspace/);
});

test("help explicitly explains optional settings and non-autonomous reminders", () => {
  const help = read("skills/picm-factory/SKILL.md").split("## Mode: help (`/picm-help`)")[1];
  assert.ok(help, "help section is missing");
  for (const signal of ["Settings and reminders", "`picm_settings`", "`picm_maintenance_policy`", "Run Now", "Later", "not an execution sandbox", "Give one concrete example"]) {
    assert.ok(help.includes(signal), `help must mention ${signal}`);
  }
});

test("configuration instructions use narrow conditional tools after sign-off", () => {
  const skill = read("skills/picm-factory/SKILL.md");
  for (const signal of ["`picm_settings` `status`", "`set-exclusions`", "`expectedExcludedPaths`", "`picm_maintenance_policy` `status`", "`configure`", "`expectedMaintenance`", "`complete` only after"]) {
    assert.ok(skill.includes(signal), `missing settings instruction: ${signal}`);
  }
  assert.match(skill, /A selected unfinished repair must not clear the reminder/);
  assert.match(skill, /picm_settings.*picm_maintenance_policy/s);
});

test("active fixture and QA instructions use final-direction review, not gate authority", () => {
  const files = [
    "docs/layout-fixture-qa.md",
    "test/fixtures/coding-repository/README.md",
    "test/fixtures/layout-profiles/README.md",
    "test/fixtures/layout-profiles/custom-existing-structure/mixed-proposal-batch/README.md",
  ];
  for (const file of files) {
    const text = read(file);
    assert.match(text, /final direction|change direction|conversational sign-off/i);
    assert.doesNotMatch(text, /must not write without an exact preview|proposal-batch QA|Before previewing or applying edits, maintain should ask whether/);
  }
});

test("generated methodology retains routing, review, and handoff structure without extension authority", () => {
  for (const [path, signals] of Object.entries({
    "skills/picm-factory/templates/root-agents.md": ["Routing", "conversational sign-off"],
    "skills/picm-factory/templates/root-context.md": ["## Inputs", "## Outputs", "## Security / privacy"],
    "skills/picm-factory/templates/stage-context.md": ["## Inputs", "## Outputs", "## Handoff"],
    "skills/picm-factory/templates/handoff-card.md": ["## Context", "## Gaps / unknowns"],
  })) {
    const text = read(path);
    for (const signal of signals) assert.ok(text.includes(signal), `${path} missing ${signal}`);
    assert.doesNotMatch(text, /picm_scan_control|picm_scaffold_proposal|picm_proposal_batch/);
  }
});
