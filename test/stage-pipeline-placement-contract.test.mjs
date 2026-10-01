import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("stage pipeline guidance preserves placement choices and stage handoff structure", () => {
  const profiles = readFileSync(join(root, "skills/picm-factory/references/layout-profiles.md"), "utf8");
  const template = readFileSync(join(root, "skills/picm-factory/templates/stage-context.md"), "utf8");
  assert.match(profiles, /Stage Pipeline/);
  assert.match(profiles, /honor an explicit seeded placement/);
  assert.match(profiles, /otherwise ask whether stages should be root-numbered or nested/);
  assert.match(profiles, /choose root-numbered only when the user has no preference/);
  assert.match(profiles, /selected shape consistently in generated paths, config hints, and first-run guidance/);
  assert.match(profiles, /stop for human review\/editing/i);
  for (const signal of ["## Inputs", "## Process", "## Outputs", "## Handoff"]) {
    assert.ok(template.includes(signal), `missing stage contract: ${signal}`);
  }
});
