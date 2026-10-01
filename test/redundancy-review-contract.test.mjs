import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

const references = "skills/picm-factory/references";
const fixture = "test/fixtures/layout-profiles/anti-patterns/instruction-redundancy";
const read = (path) => readFileSync(resolve(path), "utf8");

test("both workflows require the shared redundancy procedure during discovery", () => {
  for (const name of ["maintenance-rubric", "optimization-guide"]) {
    const guide = read(`${references}/${name}.md`);
    assert.match(guide, /## Redundancy review/);
    assert.match(guide, /load and apply `redundancy-review\.md`/);
    assert.match(guide, /within and across/);
    assert.ok(existsSync(resolve(references, "redundancy-review.md")));
  }
  assert.match(read(`${references}/maintenance-rubric.md`), /required even when optional optimization is declined/);
  assert.match(read(`${references}/optimization-guide.md`), /before opportunities or a no-op conclusion/);
  const skill = read("skills/picm-factory/SKILL.md");
  assert.match(skill, /required redundancy review of inspected instructions\/pointers/);
  assert.match(skill, /complete the guide's required redundancy review/);
});

test("shared review covers applicability, preservation, dispositions, and bounded completion", () => {
  const guide = read(`${references}/redundancy-review.md`);
  for (const signal of [
    "exact copies", "paraphrases", "overlapping clauses", "repeated pointers",
    "required action, trigger, scope, precedence, exceptions, and qualifiers",
    "Consolidation candidate", "Partial overlap", "Retain intentionally", "Uncertain or conflicting",
    "independent entry points", "every distinct condition", "each unique requirement",
    "privacy exclusions", "generated/do-not-edit", "Focused maintenance and trace",
    "coverage and omissions", "each candidate has a disposition", "final-direction/sign-off",
  ]) assert.ok(guide.includes(signal), `missing redundancy guidance: ${signal}`);
  assert.match(guide, /In maintenance[\s\S]*\*\*Suggestion\*\*[\s\S]*\*\*Warning\*\*/);
  assert.match(guide, /In optimization[\s\S]*existing five-row audit/);
  assert.match(read(`${references}/coding-maintenance-rubric.md`), /Both depths apply the general rubric's redundancy review/);
});

test("synthetic fixture retains exact duplicates, paraphrases, partial overlaps, and distinct pointer triggers", () => {
  const root = read(`${fixture}/AGENTS.md`);
  const local = read(`${fixture}/workflows/brief/AGENTS.md`);
  const rules = read(`${fixture}/reference/review-rules.md`);
  const rule = "Keep review notes separate from the final brief.";
  assert.equal(root.split(rule).length - 1, 2);
  assert.ok(rules.includes(rule));
  assert.match(local, /Keep reviewer commentary outside the final brief/);
  const draftPointer = "Before drafting a brief, read `reference/review-rules.md`.";
  assert.equal(root.split(draftPointer).length - 1, 2);
  assert.match(root, /Before reviewing a brief, read `reference\/review-rules\.md`/);
  assert.match(rules, /For factual claims, cite the supplied source\./);
  assert.match(local, /For factual claims, cite the supplied source and include its page number when available/);
  assert.match(local, /intentionally repeats the shared rule/);
  assert.match(local, /starting directly in this directory/);

  for (const path of ["AGENTS.md", "CONTEXT.md", "workflows/brief/AGENTS.md"]) {
    const absolute = resolve(fixture, path);
    for (const [, target] of read(absolute).matchAll(/`([^`]+\.md)`/g)) {
      assert.ok(existsSync(resolve(dirname(absolute), target)), `${path}: unreachable ${target}`);
    }
  }
});

test("manual QA distinguishes semantic behavior from structural coverage", () => {
  const qa = read("docs/layout-fixture-qa.md");
  assert.match(qa, /Instruction and pointer redundancy smoke checks/);
  assert.ok(qa.includes(fixture));
  assert.match(qa, /planned checks, not recorded interactive results/);
  assert.match(qa, /optional optimization declined/);
  assert.match(qa, /partial overlap/);
  assert.match(qa, /preserves the separate review trigger/);
  assert.match(qa, /Neither writes without sign-off/);
});
