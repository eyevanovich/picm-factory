import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const base = "skills/picm-factory";

test("optimization retains documentation-only exclusions, preservation and ordered audit", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  for (const signal of ["source code, tests, manifests", "executable scripts", ".picm/", "generated docs", "per-run artifacts", "Preservation ledger", "Writing-lens audit", "unique constraints", "intentional repetition", "No worthwhile optimizations found"]) {
    assert.ok(guide.toLowerCase().includes(signal.toLowerCase()), `missing ${signal}`);
  }
  let previous = -1;
  for (const label of ["Context pointers", "Information hierarchy", "Canonical home", "Completion criteria", "Pruning"]) {
    const index = guide.indexOf(`| **${label}**`);
    assert.ok(index > previous, `missing/out-of-order audit row: ${label}`);
    previous = index;
  }
  assert.match(guide, /Begin the first discovery response[\s\S]*before opportunities, direction, or no-op/);
  assert.match(guide, /uninspected category isn't Pass or Not applicable/);
  assert.match(guide, /every ledger constraint/);
  assert.match(guide, /required audit, then use exactly this conclusion/);
  assert.doesNotMatch(guide, /picm_scan_control|protected execution phase|proposal batch/);
});

test("maintenance optional optimization defaults No without widening edit scope", () => {
  const maintain = read(`${base}/references/maintenance-rubric.md`);
  assert.match(maintain, /Offer optional agent-document optimization with \*\*No\*\* as the default/);
  assert.match(maintain, /Reuse an already supplied answer/);
  assert.match(maintain, /optimization-guide\.md/);
  assert.match(maintain, /documentation-only scope, preservation checks, and audit/);
});

test("optimization entry points require the shared contract and preservation procedure", () => {
  const skill = read(`${base}/SKILL.md`);
  const guide = read(`${base}/references/optimization-guide.md`);
  assert.match(skill, /\| optimize \|.*optimization-guide\.md/);
  assert.match(guide, /Selections inform a direction; they aren't sign-off/);
  assert.match(guide, /wait for sign-off before edits/);
  assert.match(read("prompts/picm-optimize.md"), /shared trusted-assistant contract/);
});
