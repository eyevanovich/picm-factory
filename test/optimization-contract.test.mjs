import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

function commandHarness() {
  const commands = new Map();
  const sent = [];
  const entries = [];
  const pi = {
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool() {},
    on() {},
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message) { sent.push(message); },
  };
  picmFactoryExtension(pi);
  const ctx = {
    cwd: root,
    mode: "tui",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
      getSessionId: () => "optimization-contract",
    },
    ui: { notify() {}, confirm: async () => true },
  };
  return { commands, sent, entries, ctx };
}

test("picm-optimize is registered and dispatches privacy before skill loading", async () => {
  const h = commandHarness();
  const command = h.commands.get("picm-optimize");
  assert.ok(command);
  assert.match(command.description, /agent-facing documentation/);

  await command.handler("", h.ctx);
  assert.equal(h.sent.length, 1);
  const prompt = h.sent[0];
  const preflight = prompt.indexOf('action: "preflight"');
  const conciseQuestion = prompt.indexOf("Name any additional project-relative files or directory that should be excluded from reads, or reply `none` to continue.");
  const privacy = prompt.indexOf('action: "privacy"');
  const skill = prompt.indexOf("load the `picm-factory` skill");
  assert.ok(preflight >= 0 && preflight < conciseQuestion);
  assert.ok(conciseQuestion < privacy && privacy < skill);
  assert.match(prompt, /privacyQuestionIsConcise/);
  assert.match(prompt, /files or directory that should be excluded from reads/);
  assert.match(prompt, /PiCM automatically protects:/);
  assert.match(prompt, /Git internals/);
  assert.match(prompt, /symlinks and nested repository\/submodule boundaries/);
  assert.match(prompt, /Mode: optimize\nCommand: \/picm-optimize/);
  assert.match(prompt, /After the final scan `end`, call `picm_scan_control` with `action: "complete"` before reporting, saving session state, or using any other agent tool/);
  assert.equal(h.entries.at(-1).data.command, "picm-optimize");
});

test("picm-new completes protected scanning before post-scan tools", async () => {
  const h = commandHarness();
  const command = h.commands.get("picm-new");
  assert.ok(command);

  await command.handler("newsletter workflow", h.ctx);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0], /Mode: new\nCommand: \/picm-new\n\nUser arguments:\nnewsletter workflow/);
  assert.match(h.sent[0], /After the final scan `end`, call `picm_scan_control` with `action: "complete"` before reporting, saving session state, or using any other agent tool/);
});

test("picm-help loads the help skill without preview-only override", async () => {
  const h = commandHarness();
  const command = h.commands.get("picm-help");
  assert.ok(command);

  await command.handler("", h.ctx);
  assert.equal(h.sent.length, 1);
  const prompt = h.sent[0];
  assert.match(prompt, /Use the picm-factory skill\. Load its SKILL\.md before proceeding/);
  assert.match(prompt, /Mode: help\nCommand: \/picm-help/);
  assert.doesNotMatch(prompt, /Explain the shipped adoption\/maintenance\/optimization summary-preview/);
});

test("optimization guide defines complete protected discovery and edit scope", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  for (const signal of [
    "root and local agent instructions",
    "repository/context maps and local contracts",
    "prompt and skill guidance",
    "other visible documentation that routing files or local contracts identify as agent inputs",
    "protected Git-derived candidates and guarded reads",
    "Inspect every identified agent-facing document",
    "Never use agent Bash, broad directory traversal",
    "Do not mechanically crawl every reference",
    "generated artifacts or generated documentation",
    "source code, tests, manifests, build files, runtime code paths",
    "`.picm/` policy, configuration, metadata, or reports",
    "Before concluding that no useful opportunity exists",
  ]) assert.ok(guide.includes(signal), `missing optimization scope signal: ${signal}`);
});

test("optimization guide preserves unique constraints and user-controlled writes", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  for (const signal of [
    "Preservation ledger",
    "safety and privacy",
    "permissions and prohibited actions",
    "approval and human-review boundaries",
    "required commands, checks, and verification",
    "handoff, output, and uncertainty requirements",
    "domain terminology, facts, quality bars, and exceptions",
    "Let the user choose, combine, reject, or revise",
    "Selection is design intent only and never write approval",
    "complete concise summary",
  ]) assert.ok(guide.includes(signal), `missing preservation/approval signal: ${signal}`);
});

test("optimization applies a required evidence-backed agent-document writing lens", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  for (const signal of [
    "### Agent-document writing lens",
    "Apply this lens after the preservation ledger",
    "It is a required diagnostic pass",
    "not a house style or a source of new obligations",
    "**Context pointers:**",
    "target and the condition for reading it clear",
    "Do not hide stable prerequisites behind a pointer",
    "**Information hierarchy:**",
    "**Canonical home:**",
    "visible, reachable, and sufficient for the local task",
    "**Completion criteria:**",
    "Do not invent requirements, verification, or human gates",
    "**Pruning:**",
    "Keep deliberately repeated safety, review, and local-boundary guidance",
  ]) assert.ok(guide.includes(signal), `missing agent-document writing lens signal: ${signal}`);
});

test("optimization retains one source snapshot pass with targeted freshness recovery", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  for (const signal of [
    "retain its successful read as a session-only source snapshot",
    "one-pass discovery and drafting work",
    "do not request another agent-visible `inventory` or `read` merely to draft or select it",
    "Begin a protected execution phase only for approved writes",
    "Do not re-read untouched canonical sources",
    "A successful exact replacement does not prove unrelated text stayed fresh",
    "not independent verification of the final on-disk document",
    "Pass**, **Opportunity**, or **Not applicable",
    "fixture, compatibility test, or transition case",
  ]) assert.ok(guide.includes(signal), `missing source-snapshot optimization signal: ${signal}`);
});

test("optimization requires a visible five-row writing-lens audit before proposals", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  const skill = read("skills/picm-factory/SKILL.md");
  const prompt = read("prompts/picm-optimize.md");

  for (const signal of [
    "### Required discovery report",
    "user-visible discovery output, not private scratch work",
    "first post-discovery findings response must begin with `### Writing-lens audit`",
    "**Context pointers** — **Pass**, **Opportunity**, or **Not applicable**",
    "**Information hierarchy** — **Pass**, **Opportunity**, or **Not applicable**",
    "**Canonical home** — **Pass**, **Opportunity**, or **Not applicable**",
    "**Completion criteria** — **Pass**, **Opportunity**, or **Not applicable**",
    "**Pruning** — **Pass**, **Opportunity**, or **Not applicable**",
    "Do not imply a row through a proposal summary",
    "show this audit as an interim discovery result before calling `complete`",
    "Ground every status in an inspected source snapshot",
  ]) assert.ok(guide.includes(signal), `missing visible writing-lens audit signal: ${signal}`);

  assert.match(skill, /present its required visible five-row audit with document-specific evidence/);
  assert.match(prompt, /show the optimization guide's required visible five-row writing-lens audit with document-specific evidence/);
});

test("optimization-writing-lens fixture exposes routed lens evidence and preservation controls", () => {
  const rootInstructions = read("test/fixtures/coding-repository/optimization-writing-lens/AGENTS.md");
  const claudeInstructions = read("test/fixtures/coding-repository/optimization-writing-lens/CLAUDE.md");
  const contextMap = read("test/fixtures/coding-repository/optimization-writing-lens/CONTEXT.md");
  const billingInstructions = read("test/fixtures/coding-repository/optimization-writing-lens/services/billing/AGENTS.md");
  const releaseInstructions = read("test/fixtures/coding-repository/optimization-writing-lens/workflows/release/AGENTS.md");
  const generatedInstructions = read("test/fixtures/coding-repository/optimization-writing-lens/generated/deploy/AGENTS.md");

  assert.match(rootInstructions, /canonical root guide/);
  assert.match(rootInstructions, /Before choosing task-specific guidance, read `CONTEXT\.md`/);
  assert.match(rootInstructions, /A code change is complete when `npm test` passes/);
  assert.match(rootInstructions, /Do not access customer production data/);
  assert.match(claudeInstructions, /read `AGENTS\.md` and `CONTEXT\.md` first/);
  assert.match(claudeInstructions, /Start at `src\/main\.js`, run `npm test`/);
  assert.match(contextMap, /Before modifying billing code, read `services\/billing\/AGENTS\.md`/);
  assert.match(contextMap, /Before preparing a release, read `workflows\/release\/AGENTS\.md`/);
  assert.match(contextMap, /Before changing deployment behavior, read `generated\/deploy\/AGENTS\.md` without editing it/);
  assert.match(billingInstructions, /repeats the root rule intentionally/);
  assert.match(billingInstructions, /Get human approval before changing production billing behavior/);
  assert.match(releaseInstructions, /only for a release task/);
  assert.match(releaseInstructions, /root code-change completion criterion/);
  assert.match(releaseInstructions, /human approves the release notes/);
  assert.match(generatedInstructions, /generated during CI/);
  assert.match(generatedInstructions, /Do not edit it through documentation optimization/);
  assert.match(generatedInstructions, /human approval before changing production deployment behavior/);
});

test("optimization preserves declared fixture intent alongside local safety guidance", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  const intentionalConflict = read("test/fixtures/coding-repository/existing-doc-duplication/docs/development.md");
  const localSafety = read("test/fixtures/coding-repository/optimization-writing-lens/services/billing/AGENTS.md");

  assert.match(intentionalConflict, /intentionally conflicts with the architecture document/);
  assert.match(guide, /Do not erase it in an outcome-preserving proposal/);
  assert.match(localSafety, /This repeats the root rule intentionally/);
  assert.match(guide, /Keep deliberately repeated safety, review, and local-boundary guidance/);
});

test("optimization avoids unsupported claims and deferred infrastructure", () => {
  const guide = read("skills/picm-factory/references/optimization-guide.md");
  for (const signal of [
    "does not promise semantic equivalence or guaranteed context/token savings",
    "Do not add strict token counting or numeric savings claims",
    "Do not build a deterministic plan engine, semantic-equivalence system, reference crawler, orchestration layer",
    "Do not claim semantic equivalence",
    "No worthwhile optimizations found",
  ]) assert.ok(guide.includes(signal), `missing optimization non-goal: ${signal}`);
});

test("skill, backing prompt, help, README, and shared review protocol stay synchronized", () => {
  const expected = {
    "skills/picm-factory/SKILL.md": [
      "## Mode: optimize (`/picm-optimize`)",
      "references/optimization-guide.md",
      "No worthwhile optimizations found",
      "compare claims across every inspected agent-facing document",
      "apply the guide's agent-document writing lens",
    ],
    "prompts/picm-optimize.md": [
      "Command: /picm-optimize",
      "Inspect all agent-facing documentation",
      "summary-preview and optional-diff-review protocol",
      "repeated claim without a visible canonical home",
      "No worthwhile optimizations found",
    ],
    "prompts/picm-help.md": ["`/picm-optimize`", "semantic equivalence"],
    "README.md": ["PiCM Factory gives Pi five commands", "Outcome-preserving optimization"],
    "skills/picm-factory/references/preview-review-protocol.md": ["`/picm-optimize`"],
    "docs/layout-fixture-qa.md": [
      "## `/picm-optimize` smoke check",
      "optimization-writing-lens",
      "No worthwhile optimizations found",
    ],
  };
  for (const [file, signals] of Object.entries(expected)) {
    const text = read(file);
    for (const signal of signals) assert.ok(text.includes(signal), `${file} missing ${signal}`);
  }
});
