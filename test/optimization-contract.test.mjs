import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("optimization remains documentation-only and preserves the writing-lens audit", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  for (const signal of [
    "agent-facing documentation",
    "Do not edit source code, tests, manifests, build/runtime paths",
    "Preservation ledger",
    "Writing-lens audit",
    "Context pointers",
    "Information hierarchy",
    "Canonical home",
    "Completion criteria",
    "Pruning",
    "No worthwhile optimizations found",
  ]) assert.ok(guide.toLowerCase().includes(signal.toLowerCase()), `missing optimization guidance: ${signal}`);
  assert.doesNotMatch(guide, /picm_scan_control|protected execution phase|proposal batch/);
});

test("maintenance offers optional documentation optimization without widening edits", () => {
  const skill = read("skills/picm-factory/SKILL.md");
  assert.match(skill, /At intake, offer optional agent-document optimization with \*\*No\*\* as the default/);
  assert.match(skill, /when included, load `references\/optimization-guide\.md`/);
  assert.match(skill, /documentation-only scope and preservation checks/);
});

test("skill and backing prompt route optimization through the shared sign-off model", () => {
  const skill = read("skills/picm-factory/SKILL.md");
  const prompt = read("prompts/picm-optimize.md");
  assert.match(skill, /Use the shared final-direction\/sign-off sequence/);
  assert.match(prompt, /shared trusted-assistant contract/);
  assert.match(prompt, /documentation-only optimization methodology/);
});
