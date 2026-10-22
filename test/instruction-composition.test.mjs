import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { composeModeInstructions, MODE_GUIDES, rebaseInstructionLinks } from "../shared/compose-instructions.ts";

const read = (file) => readFileSync(resolve(file), "utf8").trim();

test("each mode includes the complete common contract, host rules, and only its primary procedure in order", () => {
  for (const [hostFile, resourceRoot] of [["pi/HOST.md", "/installed package"], ["claude-code/HOST.md", "${CLAUDE_PLUGIN_ROOT}"]]) {
    for (const [mode, guide] of Object.entries(MODE_GUIDES)) {
      const output = composeModeInstructions({ mode, hostFile, resourceRoot });
      let previous = -1;
      for (const source of ["shared/picm-factory/CONTRACT.md", hostFile, `shared/picm-factory/references/${guide}`]) {
        const section = rebaseInstructionLinks(read(source), source, resourceRoot);
        assert.equal(output.split(section).length - 1, 1, `${mode}: ${source}`);
        const index = output.indexOf(section);
        assert.ok(index > previous, `${mode}: ${source} out of order`);
        previous = index;
      }
      for (const other of Object.values(MODE_GUIDES).filter((candidate) => candidate !== guide)) {
        const heading = read(`shared/picm-factory/references/${other}`).split("\n")[0];
        assert.equal(output.includes(`\n${heading}\n`), false, `${mode}: loaded ${other}`);
      }
      const labels = [...output.matchAll(/^ {0,3}\[([^\]\n]+)\]:/gm)].map(([, label]) => label.trim().replace(/\s+/g, " ").toLowerCase());
      assert.equal(new Set(labels).size, labels.length, `${mode}: conflicting reference labels`);
      assert.doesNotMatch(output, /## Mode routing|Load the picm-factory skill|CONTRACT\.md/);
      assert.match(output, /\[shared contract\]\(#shared-trusted-assistant-contract\)/);
      assert.match(output, /Wait for conversational sign-off/);
      assert.match(output, /sanitizing after disclosure is too late/);
      assert.match(output, /Prior reports are leads, not independent evidence/);
      assert.match(output, /recheck the relevant eligible source/);
      assert.match(output, /Maintainer-only routing and privacy exclusions don't establish Git-ignore status/);
      assert.match(output, /Report persisted adoption status as unknown unless already available eligible evidence explicitly establishes it/);
      assert.match(output, /projected privacy status and declining a metadata write establish neither its presence nor absence/);
      assert.match(output, /Don't expand discovery or open raw config to resolve it/);
      assert.match(output, /Describe coverage with named inspected paths\/boundaries and omissions, not totals/);
      assert.match(output, /Include file\/path\/line counts only when requested or decision-relevant/);
      assert.match(output, /use tool-computed counts from already eligible evidence, separating regular files, directories, and root/);
      assert.match(output, /Don't infer totals from a listing or truncated output, or substitute estimates for inventory counts/);
      if (mode === "adopt") {
        assert.match(output, /Persisted adoption status: evidence-backed value \/ unknown/);
        assert.doesNotMatch(output, /Inferred profile, routing source, and adoption status/);
        assert.match(output, /Report-only coding adoption still requires the Strict examination/);
        assert.match(output, /load and apply \[coding maintenance\]\([^\)\n]*\/coding-maintenance-rubric\.md>?\) and \[redundancy review\]\([^\)\n]*\/redundancy-review\.md>?\) before the readiness report/);
        assert.match(output, /Report-only limits writes, not inspection depth; privacy exclusions, authorized scope, and access limits still apply/);
        assert.match(output, /mark blocked or uninspected required checks as incomplete/);
      }
      if (mode === "optimize") {
        assert.match(output, /The helper report is the required audit/);
        assert.match(output, /Decide the outcome from the agreed inspection, preservation, and redundancy review, not audit ratings alone/);
        assert.match(output, /The report owns named source coverage and declared omissions/);
        assert.match(output, /Do not write a separate audit or reproduce the helper report/);
        assert.doesNotMatch(output, /Begin the first discovery response|After the audit and required reviews/);
        assert.match(output, /coding tests\/checks and verification pointers/);
        assert.match(output, /Use Unverified per criterion when evidence is unavailable, uninspected, excluded, or outside scope/);
        assert.match(output, /Not applicable needs inspected evidence of inapplicability/);
        assert.match(output, /reading a check definition doesn't establish that it passed, and execution isn't required/);
      }
      assert.doesNotMatch(output, /^# (?:Coding adoption|Redundancy review|Layout profiles and first runs|Session retrospective|Session history)$/m);
      assert.doesNotMatch(output, /PI_SESSION_FILE|CLAUDE_CODE_PROJECT_DIR_NAME/);
    }
  }
});

test("supporting links retain source-relative meaning, titles, anchors, and resource roots with spaces", () => {
  const source = "shared/picm-factory/references/example.md";
  const root = "/installed package";
  const text = '[guide](guide.md#section "Title")\n![diagram](../templates/diagram.png)\n[contract](../CONTRACT.md)\n[reference]: <guide with spaces.md> "Reference title"\n[web](https://example.com/guide.md) [anchor](#section)\n`[example](unchanged.md)`\n```md\n[example](unchanged.md)\n```';
  const output = rebaseInstructionLinks(text, source, root);
  assert.match(output, /\[guide\]\(<\/installed package\/shared\/picm-factory\/references\/guide\.md#section> "Title"\)/);
  assert.match(output, /!\[diagram\]\(<\/installed package\/shared\/picm-factory\/templates\/diagram\.png>\)/);
  assert.match(output, /\[contract\]\(#shared-trusted-assistant-contract\)/);
  assert.match(output, /\[reference\]: <\/installed package\/shared\/picm-factory\/references\/guide with spaces\.md> "Reference title"/);
  assert.match(output, /\[web\]\(https:\/\/example.com\/guide.md\) \[anchor\]\(#section\)/);
  assert.ok(output.endsWith('`[example](unchanged.md)`\n```md\n[example](unchanged.md)\n```'));
  assert.throws(() => rebaseInstructionLinks("[outside](../../../../outside.md)", source, root), /escapes the package/);
});

test("composition fails closed for unknown modes and sources outside the package", () => {
  for (const mode of ["unknown", "constructor", "toString"]) {
    assert.throws(() => composeModeInstructions({ mode, hostFile: "pi/HOST.md" }), /Unknown PiCM mode/);
  }
  assert.throws(() => composeModeInstructions({ mode: "adopt", hostFile: "../outside.md" }), /inside the package/);
  assert.throws(() => composeModeInstructions({ mode: "adopt", hostFile: "pi/missing.md" }), /ENOENT/);
  assert.match(composeModeInstructions({ mode: "help", hostFile: "pi/HOST.md" }), /without inspecting or editing the workspace/);
});
