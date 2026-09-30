import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const skill = readFileSync(join(process.cwd(), "skills/picm-factory/SKILL.md"), "utf8");

test("source material and named external context remain conversational scope, not automatic writes", () => {
  assert.match(skill, /For source material, ask whether to build around it without moving or rewriting it/);
  assert.match(skill, /A named external file or folder is read scope, not authority to write there/);
  assert.match(skill, /preserving unrelated material/);
  assert.match(skill, /wait for sign-off/);
  assert.doesNotMatch(skill, /local-only-preflight|session scan exclusion|picm_scan_control/);
});
