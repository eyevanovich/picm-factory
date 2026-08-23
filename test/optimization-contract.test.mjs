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
  const question = prompt.indexOf("Only name additional sensitive project-relative paths");
  const privacy = prompt.indexOf('action: "privacy"');
  const skill = prompt.indexOf("load the `picm-factory` skill");
  assert.ok(preflight >= 0 && preflight < question);
  assert.ok(question < privacy && privacy < skill);
  assert.match(prompt, /Mode: optimize\nCommand: \/picm-optimize/);
  assert.equal(h.entries.at(-1).data.command, "picm-optimize");
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
    "direct explicit approval",
    "If the proposal changes, invalidate prior approval",
  ]) assert.ok(guide.includes(signal), `missing preservation/approval signal: ${signal}`);
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
    ],
    "prompts/picm-optimize.md": [
      "Command: /picm-optimize",
      "Inspect all agent-facing documentation",
      "summary-preview and exact-review protocol",
      "No worthwhile optimizations found",
    ],
    "prompts/picm-help.md": ["`/picm-optimize`", "semantic equivalence"],
    "README.md": ["five project-local commands", "Outcome-preserving optimization"],
    "skills/picm-factory/references/preview-review-protocol.md": ["`/picm-optimize`"],
    "docs/layout-fixture-qa.md": ["## `/picm-optimize` smoke check", "No worthwhile optimizations found"],
  };
  for (const [file, signals] of Object.entries(expected)) {
    const text = read(file);
    for (const signal of signals) assert.ok(text.includes(signal), `${file} missing ${signal}`);
  }
});
