import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const fixtures = join(process.cwd(), "test/fixtures");
const read = (path) => readFileSync(join(fixtures, path), "utf8");

test("root and nested stage fixtures route to local contracts and reviewed outputs", () => {
  for (const [fixture, stages] of [
    ["newsletter-production", ["01_intake", "02_draft", "03_review"]],
    ["workshop-planning", ["stages/01_discovery", "stages/02_design", "stages/03_followup"]],
  ]) {
    const base = `layout-profiles/stage-pipeline/${fixture}`;
    const root = read(`${base}/AGENTS.md`);
    assert.match(root, /CONTEXT\.md/);
    assert.match(root, fixture === "workshop-planning" ? /stages\// : /01_intake/);
    const overview = read(`${base}/CONTEXT.md`);
    for (const stage of stages) {
      const label = stage.split("/").at(-1).replace(/^\d+_/, "").replace(/followup$/, "follow-up");
      assert.match(`${root}\n${overview}`, new RegExp(label, "i"), `${fixture} cannot route to ${stage}`);
      const path = `${base}/${stage}/CONTEXT.md`;
      const text = read(path);
      for (const section of ["## Inputs", "## Process", "## Outputs", "## Handoff / review gate"]) {
        assert.ok(text.includes(section), `${path} missing ${section}`);
      }
      assert.match(text, /human review|inspect\/edit|approve/i);
      const output = /`(output\/[^`]+\.md)`/.exec(text);
      assert.ok(output, `${path} has no named review artifact`);
      assert.ok(existsSync(join(fixtures, dirname(path), output[1])));
    }
  }
});

test("coding map fixtures link boundaries, entry points and verification", () => {
  const base = "coding-repository/monorepo-distributed";
  assert.match(read(`${base}/AGENTS.md`), /CONTEXT-MAP\.md/);
  const map = read(`${base}/CONTEXT-MAP.md`);
  for (const area of ["apps/api", "packages/shared"]) {
    assert.match(map, new RegExp(`${area}/CONTEXT\\.md`));
    for (const suffix of ["CONTEXT.md", "src/", "test/"]) {
      const path = join(fixtures, base, area, suffix);
      assert.ok(existsSync(path), `missing mapped boundary resource ${path}`);
    }
  }
  assert.match(map, /Cross-boundary constraints/);
});

test("maintenance guidance distinguishes artifact presence, correctness and approval", () => {
  const guide = readFileSync(resolve("skills/picm-factory/references/maintenance-rubric.md"), "utf8");
  assert.match(guide, /Read relevant artifact content when needed to spot unsupported assertions or an unmet review gate/);
  assert.match(guide, /report presence, correctness, and human approval separately/);
  assert.match(guide, /Trace mode|trace/i);
});
