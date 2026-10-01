import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const base = "skills/picm-factory";
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("shared and standalone privacy boundaries apply before model-visible disclosure", () => {
  for (const path of [`${base}/SKILL.md`, `${base}/templates/root-agents.md`]) {
    const text = read(path);
    assert.match(text, /Before (content reads or searches|reads\/searches)/);
    for (const signal of ["root/nested Git ignores", "repository/global excludes", "session exclusions", "known sensitive paths", "model-visible reads", "tool output", "consultation", "memory", "private keys", "regulated/private data", "sensitive client material", "already-sanitized", "without repeating values"]) {
      assert.ok(text.includes(signal), `${path} missing ${signal}`);
    }
    assert.match(text, /approval does not override|even with approval/);
    assert.match(text, /stop inspecting/i);
    assert.match(text, /sandbox/);
  }
  const skill = read(`${base}/SKILL.md`);
  assert.match(skill, /sanitizing after disclosure is too late/);
  assert.match(skill, /projected exclusions rather than dumping opaque config/);
  assert.match(skill, /read scope, not authority to write there/);
});

test("adoption retains privacy-aware orientation and no approval exception for secrets", () => {
  const guide = read(`${base}/references/adoption-guide.md`);
  assert.match(guide, /shared contract/);
  assert.match(guide, /Read-first orientation/);
  assert.match(guide, /Discovery exclusions aren't commit protection/);
  assert.match(guide, /without opening or quoting protected content/);
  for (const directory of ["references", "templates"]) {
    for (const file of readdirSync(join(base, directory)).filter((name) => name.endsWith(".md"))) {
      const text = read(`${base}/${directory}/${file}`);
      assert.doesNotMatch(text, /copy (?:secrets|sensitive)[^.\n]*(?:unless|if)[^.\n]*(?:approved|sign-off)/i, `${file} restores a disclosure exception`);
    }
  }
});
