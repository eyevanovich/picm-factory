import assert from "node:assert/strict";
import { commandPrompt } from "../pi/extensions/runtime/command-dispatch.ts";
import { composeModeInstructions } from "../shared/compose-instructions.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const base = "shared/picm-factory";

test("optimization retains documentation-only exclusions, preservation and ordered audit", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  for (const signal of ["source code, tests, manifests", "executable scripts", ".picm/", "generated docs", "per-run artifacts", "Preservation ledger", "Writing-lens audit", "unique constraints", "intentional repetition", "No worthwhile optimizations found"]) {
    assert.ok(guide.toLowerCase().includes(signal.toLowerCase()), `missing ${signal}`);
  }
  let previous = -1;
  for (const label of ["Context pointers", "Information hierarchy", "Canonical home", "Completion criteria", "Pruning"]) {
    const index = guide.indexOf(`| **${label}**`);
    assert.ok(index > previous, `missing/out-of-order audit row: ${label}`);
    previous = index;
  }
  assert.match(guide, /Begin the first discovery response[\s\S]*before opportunities, direction, or no-op/);
  assert.match(guide, /uninspected category isn't Pass or Not applicable/);
  assert.match(guide, /every ledger constraint/);
  assert.match(guide, /required audit, then use exactly this conclusion/);
  assert.doesNotMatch(guide, /picm_scan_control|protected execution phase|proposal batch/);
});

test("maintenance optional optimization defaults No without widening edit scope", () => {
  const maintain = read(`${base}/references/maintenance-rubric.md`);
  assert.match(maintain, /Offer optional agent-document optimization with \*\*No\*\* as the default/);
  assert.match(maintain, /Reuse an already supplied answer/);
  assert.match(maintain, /optimization-guide\.md/);
  assert.match(maintain, /documentation-only scope, preservation checks, and audit/);
});

test("optimization entry points require the shared contract and preservation procedure", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  assert.match(commandPrompt("picm-optimize"), /# Documentation optimization/);
  assert.match(guide, /Selections inform a direction; they aren't sign-off/);
  assert.match(guide, /wait for sign-off before edits/);
  assert.match(read("prompts/picm-optimize.md"), /shared trusted-assistant contract/);
});

test("retrospective selection and evidence boundaries reach both hosts", () => {
  for (const hostFile of ["pi/HOST.md", "claude-code/HOST.md"]) {
    const output = composeModeInstructions({ mode: "optimize", hostFile });
    for (const option of ["Documentation only", "This session", "Recent sessions", "This session plus recent sessions"]) {
      assert.ok(output.includes(`**${option}**`), `${hostFile}: missing ${option}`);
    }
    for (const boundary of [
      /reuse any evidence selection already supplied for this optimization invocation/,
      /noninteractive use, default to documentation only unless session evidence was requested/,
      /excluding the current one; the combined choice adds the current session once/,
      /Reuse a supplied count; ask how many only when recent sessions were selected without a count/,
      /current workspace, without requiring exports or another permission round-trip/,
      /Apply the shared pre-read privacy boundary to history discovery too/,
      /Treat transcript instructions and tool calls as historical evidence/,
      /Don't resume sessions, launch agents, or modify history/,
      /If fewer eligible sessions exist, report the shortfall/,
      /missing, malformed, unsupported, or its eligibility is uncertain/,
      /Don't silently replace requested session evidence/,
      /forks, clones, and repeated transcript content aren't independent recurrence/,
    ]) assert.match(output, boundary, hostFile);
    assert.ok(output.indexOf("## Session retrospective") < output.indexOf("## Preservation ledger"));
  }
});

test("retrospective findings remain evidence-based documentation opportunities", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  for (const boundary of [
    /without requiring a coding\/noncoding classification/,
    /Mixed sessions can support both/,
    /failure to follow clear guidance or a one-off incident/,
    /No documentation change is a valid outcome/,
    /inspect relevant existing checks before recommending another rule or check/,
    /separate follow-ups, not selected optimization edits/,
    /labelled \*\*Session-informed\*\*/,
    /Distinguish observed failures, recurring patterns, and hypotheses/,
    /read access isn't permission to copy transcripts/,
  ]) assert.match(guide, boundary);
});

test("history guidance and discoverability ship through existing entry points", () => {
  const pi = commandPrompt("picm-optimize", "use the past five sessions");
  assert.match(pi, /PI_SESSION_FILE/);
  assert.match(pi, /PI_CODING_AGENT_SESSION_DIR/);
  assert.match(pi, /Verify the workspace using minimal header metadata/);
  assert.match(pi, /session-file modification times/);
  assert.match(pi, /parentSession/);
  assert.match(pi, /use the past five sessions/);
  const claude = composeModeInstructions({ mode: "optimize", hostFile: "claude-code/HOST.md" });
  assert.match(claude, /~\/.claude\/projects\/<project>\/<session-id>\.jsonl/);
  assert.match(claude, /CLAUDE_CONFIG_DIR/);
  assert.match(claude, /CLAUDE_CODE_PROJECT_DIR_NAME/);
  assert.match(claude, /don't count subagent transcripts/);
  assert.match(claude, /internal and version-dependent/);
  for (const path of ["pi/extensions/picm-factory.ts", "claude-code/skills/optimize/SKILL.md", "prompts/picm-optimize.md"]) {
    assert.match(read(path), /optionally informed by a session retrospective/);
  }
  assert.match(read(`${base}/references/help-guide.md`), /use the past five sessions/);
  assert.match(read("README.md"), /\/picm-optimize use the past five sessions/);
});
