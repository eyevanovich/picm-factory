import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), "shared/picm-factory", path), "utf8");

test("source material and external context grant scope, not automatic writes", () => {
  const skill = read("CONTRACT.md");
  const creation = read("references/interview-guide.md");
  assert.match(creation, /For source material, ask whether to build around it without moving or rewriting it/);
  assert.match(creation, /existing architecture, recommend adoption/);
  assert.match(skill, /A named external file or folder is read scope, not authority to write there/);
  assert.match(skill, /no initialization or fetching/);
  assert.match(skill, /preserving unrelated material/);
  assert.match(skill, /Wait for conversational sign-off/);
  assert.doesNotMatch(skill, /local-only-preflight|picm_scan_control/);
});
