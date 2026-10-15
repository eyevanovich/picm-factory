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
      assert.doesNotMatch(output, /^# (?:Coding adoption|Redundancy review|Layout profiles and first runs)$/m);
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
