import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const specialistRequirements = [
  "approved generated routes",
  "exact first workflow/task recipe path",
  "inputs",
  "expected artifact",
  "inspect, edit, and explicitly approve",
  "route the next action reads from",
  "uncertainty, unsupported claims, missing information, blockers, or low-confidence points",
  "never invent optional folders, recipes, or operations",
  "after the first real use or when the specialist workflow, routing, or stable guidance changes",
];

test("Specialist Folder first-run guidance is complete and route-derived", () => {
  for (const path of [
    "skills/picm-factory/SKILL.md",
    "skills/picm-factory/references/layout-profiles.md",
    "skills/picm-factory/references/interview-guide.md",
  ]) {
    const content = read(path);
    for (const requirement of specialistRequirements) {
      assert.ok(content.includes(requirement), `${path} missing: ${requirement}`);
    }
  }
});

test("reported FAQ specialist fixture supplies the concrete first-run routes", () => {
  const fixture = "test/fixtures/layout-profiles/specialist-folder/faq-polisher/workflows/polish-faq.md";
  assert.ok(existsSync(join(root, fixture)), `missing reported fixture: ${fixture}`);

  const workflow = read(fixture);
  for (const route of [
    "reference/faq-style.md",
    "review/polished-faq.md",
    "inspect, edit, and approve",
    "unsupported claims and unresolved questions visible",
    "approved edited draft, not chat memory",
  ]) {
    assert.ok(workflow.includes(route), `${fixture} missing: ${route}`);
  }

  const qa = read("docs/layout-fixture-qa.md");
  assert.ok(qa.includes(fixture), "QA guide must retain the reported fixture route");
});
