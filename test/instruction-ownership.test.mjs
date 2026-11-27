import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composeModeInstructions } from "../shared/compose-instructions.ts";

const base = "shared/picm-factory";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const occurrences = (text, value) => text.split(value).length - 1;

test("composed commands have one workspace-read preparation owner and both preparation routes", () => {
  for (const hostFile of ["pi/HOST.md", "claude-code/HOST.md"]) {
    const host = read(hostFile);
    assert.doesNotMatch(host, /run `settings` `status` successfully before workspace content inspection/);
    for (const mode of ["new", "adopt", "maintain", "optimize"]) {
      const output = composeModeInstructions({ mode, hostFile });
      assert.equal(occurrences(output, "### Workspace-read preparation"), 1);
      assert.match(output, /\*\*Ordinary tools:\*\*[\s\S]*`settings` `status`[\s\S]*eligibility/);
      assert.match(output, /\*\*Named reader:\*\*[\s\S]*named-document-read\.md[\s\S]*both checks/);
      assert.match(output, /grants no eligibility for later reads/);
      assert.match(output, /If status fails or is malformed, stop workspace discovery/);
      assert.match(output, /User approval does not override this boundary/);
    }
  }
});

test("optimization uses the inline shared preservation review rather than a second inventory", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  const review = read(`${base}/references/redundancy-review.md`);
  assert.doesNotMatch(guide, /For each inspected document, record unique constraints/);
  assert.match(guide, /apply \[redundancy review\]/i);
  assert.match(review, /## Preservation notes[\s\S]*For optimization/);
  assert.match(review, /unique constraints[\s\S]*intentional correction[\s\S]*current and intended behavior/);
  for (const hostFile of ["pi/HOST.md", "claude-code/HOST.md"]) {
    const output = composeModeInstructions({ mode: "optimize", hostFile });
    assert.equal(occurrences(output, "## Preservation notes"), 1);
    assert.equal(occurrences(output, "# Redundancy review\n"), 1);
  }
});

test("shared approval remains complete while supporting review guidance adds only review detail", () => {
  const contract = read(`${base}/CONTRACT.md`);
  const review = read(`${base}/references/preview-review-protocol.md`);
  assert.match(contract, /State one concise final direction/);
  assert.match(contract, /Wait for conversational sign-off/);
  assert.match(contract, /Cancellation or assent to a different question isn't sign-off/);
  assert.match(contract, /routine aligned work/);
  assert.match(review, /\[shared contract\]\(\.\.\/CONTRACT\.md\)/);
  assert.doesNotMatch(review, /A final direction identifies|Option\/profile\/cadence selections inform|user-created Git checkpoint/);
});

test("coding onboarding delivers its ordered inspection directly to both hosts", () => {
  const steps = [
    ["Prepare eligible inspection", [/projected settings status/, /policy.*before.*expanding/i, /Skip unrelated\/generated\/dependency trees and history/]],
    ["Inspect the existing setup", [/all declared roots within eligible scope/, /excluded\/blocked coverage/, /manifest-level internal dependencies/, /mapped local contexts/, /meaning and applicability/, /unique constraints/]],
    ["Exercise context gathering", [/source contents/, /representative test body/, /authoritative check definition/, /materially different boundary when ownership or verification contracts differ/, /Check execution is separately agreed validation/]],
    ["Assess and propose", [/supporting.*evidence/i, /smallest complete/, /consolidation/, /preserv/, /Keep private fixtures, local configuration, and sensitive findings out/]],
    ["Apply approved changes", [/conversational sign-off/, /unrelated/, /material departures/, /Cancellation/]],
    ["Verify and report", [/affected routes/, /preserved/, /native.*loading/, /Report inspection and routing separately/]],
  ];
  for (const hostFile of ["pi/HOST.md", "claude-code/HOST.md"]) {
    const output = composeModeInstructions({ mode: "adopt", hostFile });
    const start = output.indexOf("## Coding onboarding");
    const end = output.indexOf("## Instruction-file migration", start);
    assert.ok(start > output.indexOf("### Workspace-read preparation") && end > start);
    const procedure = output.slice(start, end);
    const sections = procedure.split(/^### \d+\. /m).slice(1);
    assert.equal(sections.length, steps.length);
    steps.forEach(([heading, requirements], index) => {
      assert.ok(sections[index].startsWith(heading), heading);
      for (const requirement of requirements) assert.match(sections[index], requirement);
    });
    assert.match(procedure, /Report-only means no edits; documentation-only evidence means no session retrospective/);
    assert.match(procedure, /Strict examination/);
    assert.doesNotMatch(procedure, /\]\([^)]*\.md/);
    assert.doesNotMatch(output, /coding-maintenance-rubric\.md|redundancy-review\.md/);
    assert.match(output, /required read or comparison is blocked or unperformed, say coverage is incomplete/);
    assert.match(output, /\*\*Changes and validation:\*\*.*state whether checks ran/);
    assert.match(output, /adoption\.status:.*adopted.*only with adequate visible routing and completed required inspection\/verification/);
    assert.match(output, /Persisted adoption status: evidence-backed value \/ unknown/);
  }
});

test("optional coding detail has no hidden adoption prerequisite", () => {
  const detail = read(`${base}/references/coding-adoption-guide.md`);
  const rubric = read(`${base}/references/coding-maintenance-rubric.md`);
  assert.match(detail, /Optional elaboration/);
  assert.match(detail, /adoption-guide\.md#coding-onboarding/);
  assert.doesNotMatch(detail, /coding-maintenance-rubric\.md|layout-profiles\.md|Finish with/);
  assert.match(rubric, /adoption-guide\.md#coding-onboarding/);
  assert.doesNotMatch(rubric, /During initial adoption, load|Load for initial coding adoption/);
  assert.match(rubric, /source and test contents/);
  assert.match(rubric, /required inspection.*incomplete/i);
  assert.match(rubric, /exclusions.*scope.*access limits/i);
});
