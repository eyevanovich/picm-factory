import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const skill = read("skills/picm-factory/SKILL.md");
const references = "skills/picm-factory/references";

test("all modification prompts enter the shared contract before the selected methodology", () => {
  for (const signal of [
    "before the selected mode", "Inspect before changing anything",
    "State one concise final direction", "Wait for conversational sign-off",
    "initiating request and design selections aren't sign-off",
    "without special phrases", "routine aligned work", "Use ordinary tools",
  ]) assert.ok(skill.includes(signal), `missing shared contract: ${signal}`);

  for (const mode of ["new", "adopt", "maintain", "optimize", "help"]) {
    const text = read(`prompts/picm-${mode}.md`);
    assert.ok(text.includes(`Mode: ${mode}`));
    assert.match(text, /Load this package's `picm-factory` `SKILL.md` before following workspace read-first prerequisites/);
    assert.match(text, /scope\/privacy contract before workspace reads or searches/);
    assert.match(text, /excluded prerequisite needs an already-sanitized replacement, not an approval override/);
    assert.match(text, /shared trusted-assistant contract|shared contract/);
    assert.doesNotMatch(text, /picm_scan_control|picm_scaffold_proposal|picm_proposal_batch/);
  }
  assert.match(read("prompts/picm-help.md"), /Do not inspect or edit the workspace/);
});

test("help explains optional settings and non-autonomous reminders without inspecting", () => {
  const help = read(`${references}/help-guide.md`);
  for (const signal of ["Settings and reminders", "`picm_settings`", "`picm_maintenance_policy`", "Run Now", "Later", "unfinished requested repair", "one concrete example"]) {
    assert.ok(help.includes(signal), `help missing ${signal}`);
  }
  assert.match(help, /without inspecting or editing/);
  assert.match(help, /aren't an execution sandbox/);
  assert.match(help, /without calling them/);
  assert.match(skill, /help-guide\.md/);
});

test("conditional configuration guidance is reachable and retains completion preconditions", () => {
  assert.match(skill, /Before privacy\/cadence configuration or maintenance-cycle completion[\s\S]*settings-guide\.md/);
  const settings = read(`${references}/settings-guide.md`);
  for (const signal of ["`picm_settings` `status`", "`set-exclusions`", "`expectedExcludedPaths`", "`picm_maintenance_policy` `status`", "`configure`", "`expectedMaintenance`", "`complete` only after"]) {
    assert.ok(settings.includes(signal), `missing settings instruction: ${signal}`);
  }
  assert.match(settings, /last observed/);
  assert.match(settings, /only when no policy was observed/);
  assert.match(settings, /A selected unfinished repair must not clear the reminder/);
  assert.match(settings, /repair and validation—or an agreed inspection-only pass/);
  assert.match(settings, /preserve unrelated fields/);
});

test("fixture and QA instructions retain conversational direction, not gate authority", () => {
  for (const file of ["docs/layout-fixture-qa.md", "test/fixtures/coding-repository/README.md", "test/fixtures/layout-profiles/README.md", "test/fixtures/layout-profiles/custom-existing-structure/mixed-proposal-batch/README.md"]) {
    const text = read(file);
    assert.match(text, /final direction|change direction|conversational sign-off/i);
    assert.doesNotMatch(text, /must not write without an exact preview|proposal-batch QA/);
  }
});

test("standalone templates retain routing, review and handoff boundaries", () => {
  for (const [path, signals] of Object.entries({
    "root-agents": ["Routing", "conversational sign-off", "Cancellation", "even with approval"],
    "root-context": ["## Inputs", "## Outputs", "## Security / privacy"],
    "stage-context": ["## Inputs", "## Process", "## Outputs", "## Handoff"],
    "handoff-card": ["## Context", "## Blockers / risks / gaps", "## Review and next action"],
  })) {
    const text = read(`skills/picm-factory/templates/${path}.md`);
    for (const signal of signals) assert.ok(text.includes(signal), `${path} missing ${signal}`);
    assert.doesNotMatch(text, /picm_scan_control|picm_scaffold_proposal|picm_proposal_batch/);
  }
});
