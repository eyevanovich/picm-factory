import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composeModeInstructions } from "../shared/compose-instructions.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("both hosts require successful projected settings before workspace content discovery", () => {
  for (const hostFile of ["pi/HOST.md", "claude-code/HOST.md"]) {
    for (const mode of ["new", "adopt", "maintain", "optimize"]) {
      const text = composeModeInstructions({ mode, hostFile });
      assert.match(text, /Before workspace content reads\/searches, first obtain successful projected settings status/);
      assert.match(text, /even when no config is expected/);
      assert.match(text, /If status fails or is malformed, stop workspace discovery/);
      assert.match(text, /trusted helper may read configuration internally/);
      assert.match(text, /preserving intended exclusions outside the conversation/);
      assert.match(text, /Don't request configuration contents or diagnostic output/);
      assert.match(text, /suggest alternate inspection\/repair commands or deleting\/resetting config, including as a user action/);
      assert.match(text, /After a claim of repair, rerun the helper and resume only after successful settings status/);
      assert.match(text, /another failure has the same bounded stop, not escalating troubleshooting/);
      assert.match(text, /never by opening opaque config to infer adoption status/);
    }
    assert.match(composeModeInstructions({ mode: "help", hostFile }), /without inspecting or editing the workspace/);
  }
});

test("AGENTS is canonical and legacy migration covers each existing-file case without silent changes", () => {
  const guide = read("shared/picm-factory/references/adoption-guide.md");
  for (const label of ["AGENTS-only", "CLAUDE-only", "Both", "Neither"]) {
    assert.ok(guide.includes(`**${label}:**`), label);
  }
  assert.match(guide, /`AGENTS.md` is the canonical target at root/);
  assert.match(guide, /Preserve every applicable instruction, resolve relative paths and incoming pointers/);
  assert.match(guide, /Wait for sign-off before writing, renaming, or deleting/);
  assert.match(guide, /declined migration leaves the original untouched/);
  assert.match(guide, /Don't silently overwrite or delete either file/);
  assert.match(guide, /retaining both doesn't complete migration/);
  assert.match(guide, /Generate no import shim/);
  assert.match(guide, /unsupported versions\/settings are a setup limitation/);
  assert.doesNotMatch(read("shared/picm-factory/references/coding-adoption-guide.md"), /`AGENTS.md`\/`CLAUDE.md`/);
});

test("coding adoption is an early mandatory branch rather than an optional closing suggestion", () => {
  const guide = read("shared/picm-factory/references/adoption-guide.md");
  const branch = guide.indexOf("Load [coding adoption](coding-adoption-guide.md)");
  assert.ok(branch >= 0 && branch < guide.indexOf("## Read-first orientation"));
  assert.match(guide, /before assessing readiness or producing a report/);
  assert.match(guide, /shortcut skips classification, not its mapping decisions or Strict examination/);
});

test("Claude targets native AGENTS loading and namespaced command guidance without shims", () => {
  const host = read("claude-code/HOST.md");
  assert.match(host, /Claude Code 2\.1\.277 or newer/);
  assert.match(host, /Use canonical root\/nested `AGENTS.md`/);
  assert.match(host, /adoption-guide.md#instruction-file-migration/);
  assert.match(host, /don't change host settings automatically/);
  assert.match(host, /user-facing command examples use the namespaced commands/);
  assert.doesNotMatch(host, /@AGENTS\.md|create or merge a neighboring/);
});
