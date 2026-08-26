import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const skill = read("skills/picm-factory/SKILL.md");
const interview = read("skills/picm-factory/references/interview-guide.md");
const layouts = read("skills/picm-factory/references/layout-profiles.md");
const scenarios = read("docs/picm-new-scenarios.md");

test("confirmed Stage Pipeline placement is explicit before root paths are previewed", () => {
  assert.match(skill, /Stage Pipeline is confirmed.*before choosing root stage paths/is);
  assert.match(interview, /Stage Pipeline.*before choosing root stage paths/is);
  assert.match(layouts, /Stage Pipeline is confirmed.*before choosing root stage paths/is);
});

test("only an explicit no-preference response selects the documented root default", () => {
  assert.match(skill, /Only after the user says they have no preference.*root-numbered/is);
  assert.match(interview, /Only after the user says they have no preference.*root-numbered/is);
  assert.match(layouts, /Only after the user says they have no preference.*root-numbered/is);
  assert.match(scenarios, /chooses root-numbered only after the user says they have no preference/i);
});

test("seeded placement is preserved and every preview uses the selected paths", () => {
  for (const text of [skill, interview, layouts]) {
    assert.match(text, /explicitly seeded.*placement/is);
    assert.match(text, /skip the question/i);
  }
  assert.match(layouts, /`01_intake\/`/);
  assert.match(layouts, /`stages\/01_intake\/`/);
  assert.match(layouts, /exact scaffold preview.*generated stage paths/is);
  assert.match(scenarios, /explicitly seeded placement.*skips the question/is);
  assert.match(scenarios, /exact preview.*generated paths.*config path hints.*first-run checklist/is);
});

test("placement guidance retains direct approval and privacy boundaries", () => {
  assert.match(skill, /First call `picm_scan_control` with `preflight`/);
  assert.match(skill, /Call `begin` only after successful preflight and privacy review/);
  assert.match(skill, /accept direct explicit approval of the current summary before writing the exact proposal/);
});
