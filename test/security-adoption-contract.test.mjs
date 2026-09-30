import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("adoption guidance keeps privacy defaults and external-write boundaries without claiming interception", () => {
  const skill = read("skills/picm-factory/SKILL.md");
  const guide = read("skills/picm-factory/references/adoption-guide.md");
  for (const signal of [
    "Git ignores",
    "privacy.excludedPaths",
    "known sensitive paths",
    "read scope, not authority to write there",
    "not a sandbox claim",
  ]) assert.ok(skill.includes(signal), `missing shared boundary: ${signal}`);
  for (const signal of ["Read-first scope", "preserve", "final direction", "sign-off"]) {
    assert.ok(guide.includes(signal), `missing adoption methodology: ${signal}`);
  }
  assert.doesNotMatch(skill, /blocks every agent Bash|protected scans|scan authorization/);
});
