import assert from "node:assert/strict";
import { commandPrompt } from "../pi/extensions/runtime/command-dispatch.ts";
import { composeModeInstructions } from "../shared/compose-instructions.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const base = "shared/picm-factory";

test("optimization retains documentation-only preservation and ungraded inspection lenses", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  for (const signal of ["source code, tests, manifests", "executable scripts", ".picm/", "generated docs", "per-run artifacts", "Preservation ledger", "unique constraints", "intentional repetition", "No worthwhile optimizations found"]) {
    assert.ok(guide.toLowerCase().includes(signal.toLowerCase()), `missing ${signal}`);
  }
  for (const label of ["Context pointers", "Information hierarchy", "Canonical home", "Completion criteria", "Pruning"]) {
    assert.ok(guide.includes(`| **${label}**`), label);
  }
  assert.match(guide, /inspection aids, not a scored audit/);
  assert.match(guide, /No grades, fixed finding count, or mandatory five-row report/);
  assert.match(guide, /coding tests\/checks and verification pointers/);
  assert.match(guide, /Unavailable, excluded, or uninspected evidence remains unverified/);
  assert.match(guide, /inspected missing required definition can support an opportunity/);
  assert.match(guide, /Inapplicability needs inspected evidence/);
  assert.match(guide, /reading a check definition doesn't establish that it passed/);
  assert.match(guide, /every ledger constraint/);
  assert.doesNotMatch(guide, /blocksVerificationOf|The helper report is the required audit|picm_scan_control|protected execution phase|proposal batch/);
});

test("optimization produces scoped proposals without forced findings or audit prerequisites", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  assert.match(guide, /Ordinary optimization returns improvement proposals, not an audit/);
  assert.match(guide, /Briefly name inspected paths\/boundaries and material limitations/);
  assert.match(guide, /source evidence.*specific change.*expected.*benefit.*preserved.*risk/s);
  assert.match(guide, /Decide the outcome from the agreed inspection, preservation, and redundancy review/);
  assert.match(guide, /An excluded definition may remain unverified without making that agreed review incomplete/);
  assert.match(guide, /Missing findings don't establish completed review or a no-op/);
  assert.match(guide, /required eligible inspection or review is unfinished[\s\S]*report the outstanding path\/operation[\s\S]*don't give the no-op conclusion/);
  assert.match(guide, /review is complete and no worthwhile opportunities were found[\s\S]*inspected scope[\s\S]*No worthwhile optimizations found/);
  assert.doesNotMatch(guide, /report owns named source coverage|provide the helper audit|inspected scope named in the report/);
});

test("experimental audits require explicit requests and retain honest failure and dependency guidance", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  const helper = read(`${base}/references/evidence-report-guide.md`);
  assert.match(guide, /Only when the user explicitly requests an experimental audit/);
  assert.match(guide, /Report-only limits writes; it doesn't request an experimental audit/);
  assert.match(guide, /If the requested helper fails[\s\S]*no experimental audit was produced[\s\S]*don't substitute/);
  assert.match(helper, /Only use this helper for an explicitly requested experimental audit/);
  assert.match(helper, /not a prerequisite for ordinary optimization proposals or a scoped no-op/);
  assert.match(helper, /Completion and final-chat decisions belong to the \[optimization procedure\]/);
  assert.match(helper, /Every listed criterion must be \*\*Unverified\*\*/);
  assert.match(helper, /doesn't infer missing dependencies from paths, quotes, or prose/);
  assert.match(helper, /doesn't establish review completeness, a no-op outcome, or final-chat compliance/);
  const example = JSON.parse(helper.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(example.omissions[0].blocksVerificationOf, ["Completion criteria"]);
  for (const hostFile of ["pi/HOST.md", "claude-code/HOST.md"]) {
    const host = read(hostFile);
    assert.match(host, /Only when the user explicitly requests an experimental audit/);
    assert.match(host, /Ordinary optimization does not require this helper/);
  }
});

test("maintenance optional optimization defaults No without widening edit scope", () => {
  const maintain = read(`${base}/references/maintenance-rubric.md`);
  assert.match(maintain, /Offer optional agent-document optimization with \*\*No\*\* as the default/);
  assert.match(maintain, /Reuse an already supplied answer/);
  assert.match(maintain, /optimization-guide\.md/);
  assert.match(maintain, /documentation-only scope, preservation checks, and proposals/);
});

test("optimization entry points require the shared contract and preservation procedure", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  assert.match(commandPrompt("picm-optimize"), /# Documentation optimization/);
  assert.match(guide, /load it only if it isn't already included in this invocation/);
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

test("optimization weighs future task savings against useful output and routing risks", () => {
  const guide = read(`${base}/references/optimization-guide.md`);
  const efficiency = guide.split("## Efficiency opportunities\n")[1].split("\n## ")[0];
  assert.match(efficiency, /future workflow and coding tasks/);
  assert.match(efficiency, /Token savings don't justify worse output/);
  assert.match(efficiency, /before.*after.*reading.*work.*handoff/s);
  assert.match(efficiency, /domain context.*examples.*judgment.*output expectations/s);
  assert.match(efficiency, /formal requirements alone/i);
  assert.match(efficiency, /lookups.*missed context.*rework/s);
  assert.match(efficiency, /uncertain.*retain.*defer/s);
  assert.match(efficiency, /recognize.*applies.*before/s);
  assert.match(efficiency, /Workflow.*email.*web.*social.*worked example.*review criteria/s);
  assert.match(efficiency, /Coding.*troubleshooting.*dependency constraints.*setup.*test-selection/s);
  assert.match(efficiency, /not a required layout/);
  assert.match(efficiency, /not another report/);
  assert.match(efficiency, /Don't add guidance for isolated incidents/);
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
    /maintenance\/trace report or optimization proposals, not a separate report/,
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
