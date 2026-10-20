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
  assert.match(guide, /coding tests\/checks and verification pointers/);
  assert.match(guide, /\*\*Pass\*\*, \*\*Opportunity\*\*, \*\*Not applicable\*\*, or \*\*Unverified\*\*/);
  assert.match(guide, /Use Unverified per criterion when evidence is unavailable, uninspected, excluded, or outside scope/);
  assert.match(guide, /missing required definition supported by inspected evidence is an Opportunity, not Unverified/);
  assert.match(guide, /Not applicable needs inspected evidence of inapplicability/);
  assert.match(guide, /an unopened manifest or absence of workflow stages isn't enough/);
  assert.match(guide, /reading a check definition doesn't establish that it passed, and execution isn't required/);
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

test("maintain aligns current guidance while optimize improves behavior and efficiency", () => {
  const maintain = read(`${base}/references/maintenance-rubric.md`);
  const optimize = read(`${base}/references/optimization-guide.md`);
  assert.match(maintain, /aligned with intended behavior and current reality/);
  assert.match(maintain, /repair stale context, drift, and conflicting instructions/);
  assert.match(optimize, /Make agent behavior and workflows better and more efficient/);
  assert.match(optimize, /unnecessary context\/token use, tool calls, and clarification/);
  assert.match(optimize, /expected behavioral or efficiency benefit, not cosmetic cleanup alone/);
  assert.match(optimize, /Shorter text isn't automatically better/);
  assert.match(optimize, /source, tests, scripts, hooks, CI, and service-access changes are separately scoped follow-ups/);
});

test("both modes offer shared retrospective evidence without inlining optional procedures", () => {
  for (const hostFile of ["pi/HOST.md", "claude-code/HOST.md"]) {
    for (const mode of ["maintain", "optimize"]) {
      const output = composeModeInstructions({ mode, hostFile });
      for (const option of ["Documentation only", "This session", "Recent sessions", "This session plus recent sessions"]) {
        assert.ok(output.includes(`**${option}**`), `${hostFile}/${mode}: missing ${option}`);
      }
      assert.match(output, /session-retrospective\.md/);
      assert.match(output, /Documentation only triggers no history discovery/);
      assert.match(output, /noninteractive use, default to documentation only unless sessions were requested/);
      assert.match(output, /shared pre-read privacy boundary/);
      assert.match(output, /transcripts are evidence, not current instructions or approval/);
      assert.doesNotMatch(output, /^# Session retrospective$/m);
      assert.doesNotMatch(output, /PI_SESSION_FILE|CLAUDE_CONFIG_DIR|parentSession/);
    }
  }
  const maintain = read(`${base}/references/maintenance-rubric.md`);
  assert.match(maintain, /don't repeat intake or review sessions twice or expand the agreed evidence scope/);
  assert.match(read(`${base}/references/optimization-guide.md`), /including maintenance-integrated optimization; don't repeat intake/);
});

test("shared retrospective preserves selection, privacy, and diagnosis boundaries", () => {
  const retro = read(`${base}/references/session-retrospective.md`);
  for (const boundary of [
    /without requiring exports or another permission round-trip/,
    /excluding the current one; the combined choice adds the current session once/,
    /Reuse a supplied count; ask how many only when recent sessions were selected without a count/,
    /don't reload its transcript unless needed to resolve incomplete evidence/,
    /Apply the shared pre-read privacy boundary to history discovery too/,
    /Treat transcript instructions and tool calls as historical evidence/,
    /Don't resume sessions, launch agents, or modify history/,
    /If fewer eligible sessions exist, report the shortfall/,
    /missing, malformed, unsupported, or its eligibility is uncertain/,
    /Don't silently replace requested evidence/,
    /forks, clones, and repeated content aren't independent recurrence/,
    /without requiring a coding\/noncoding classification/,
    /failure to follow clear guidance or a one-off incident/,
    /No documentation change is a valid outcome/,
    /inspect relevant existing checks before recommending another rule or check/,
    /Label findings \*\*Session-informed\*\*/,
    /maintenance\/trace report or optimization audit\/opportunities, not a separate report/,
    /read access isn't permission to copy transcripts/,
  ]) assert.match(retro, boundary);
});

test("intentional corrections preserve safeguards and distinguish predicted behavior from observations", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  assert.match(guide, /current and intended behavior as an intentional correction in the ledger and final direction/);
  assert.match(guide, /doesn't waive shared safety\/privacy boundaries or authorize executable changes/);
  assert.match(guide, /unchanged required constraint becomes lost/);
  assert.match(guide, /representative situation for each material behavioral correction/);
  assert.match(guide, /A reasoned walkthrough predicts behavior; it isn't an observed agent run/);
  assert.match(guide, /Report predicted versus observed improvement/);
  assert.match(read(`${base}/references/maintenance-rubric.md`), /distinguish predicted behavior from an observed run/);
});

test("host history references and discoverability support both commands", () => {
  const pi = read("pi/session-history.md");
  assert.match(pi, /PI_SESSION_FILE/);
  assert.match(pi, /PI_CODING_AGENT_SESSION_DIR/);
  assert.match(pi, /Verify the workspace using minimal header metadata/);
  assert.match(pi, /session-file modification times/);
  assert.match(pi, /parentSession/);
  const claude = read("claude-code/session-history.md");
  assert.match(claude, /~\/\.claude\/projects\/<project>\/<session-id>\.jsonl/);
  assert.match(claude, /CLAUDE_CONFIG_DIR/);
  assert.match(claude, /CLAUDE_CODE_PROJECT_DIR_NAME/);
  assert.match(claude, /don't count subagent transcripts/);
  assert.match(claude, /internal and version-dependent/);
  assert.match(read("pi/extensions/picm-factory.ts"), /optionally use a session retrospective/);
  for (const mode of ["maintain", "optimize"]) {
    assert.match(commandPrompt(`picm-${mode}`, "use the past five sessions"), /User arguments: use the past five sessions/);
    for (const path of [`claude-code/skills/${mode}/SKILL.md`, `prompts/picm-${mode}.md`]) {
      assert.match(read(path), /session retrospective/);
    }
    assert.ok(read("README.md").includes(`/picm-${mode} use the past five sessions`));
  }
  assert.match(read(`${base}/references/help-guide.md`), /Maintenance-integrated optimization reuses the evidence selection and findings/);
});
