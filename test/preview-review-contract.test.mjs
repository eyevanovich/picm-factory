import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const protocolPath = "skills/picm-factory/references/preview-review-protocol.md";
const protocol = read(protocolPath);

function commandHarness() {
  const commands = new Map();
  const sent = [];
  const pi = {
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool() {},
    on() {},
    appendEntry() {},
    sendUserMessage(message) { sent.push(message); },
  };
  picmFactoryExtension(pi);
  const ctx = {
    cwd: root,
    mode: "tui",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => [], getEntries: () => [], getSessionId: () => "preview-contract" },
    ui: { notify() {}, confirm: async () => true },
  };
  return { commands, sent, ctx };
}

test("shipped protocol defines complete summary and approval invalidation", () => {
  for (const signal of [
    "Affected files and operations",
    "Behavior or configuration changes",
    "Linked cross-file moves",
    "Preserved behavior",
    "Known uncertainty",
    "Mandatory exact review",
    "literal `None`",
    "separate explicit write approval",
    "Option choice, cadence choice, a preview request, review navigation, or vague assent is not approval",
    "A proposal revision invalidates all earlier preview acceptance, exact-review state, and approval",
  ]) assert.ok(protocol.includes(signal), `missing protocol signal: ${signal}`);
});

test("exact review choices, navigation state, and rendering kinds are explicit", () => {
  assert.deepEqual(
    [...protocol.matchAll(/^\d\. \*\*(View all|Select files|Return to summary)\*\*$/gm)].map((match) => match[1]),
    ["View all", "Select files", "Return to summary"],
  );
  for (const signal of [
    "retains the current selection and which files have been reviewed",
    "**Previous**",
    "**Next**",
    "**Back to selection**",
    "unified diff with path headers",
    "complete proposed content",
    "complete removed content",
    "review source and destination together",
    "conversationally names or checks paths from the current proposal",
    "Selecting either the source or destination of a linked move selects and reviews the whole source-destination pair",
    "protected or sensitive content cannot safely be rendered exactly, stop",
  ]) assert.ok(protocol.includes(signal), `missing exact-review signal: ${signal}`);
});

test("mandatory review and deterministic control-write boundaries remain explicit", () => {
  for (const signal of [
    "every deletion",
    "safety, permissions, approval boundaries, or required commands",
    "persisted `privacy.excludedPaths`",
    "standalone maintenance-policy control write",
    "complete concise summary first",
    "built-in exact TUI patch confirmation as the mandatory exact review and separate write approval",
    "pass only `action: \"apply\"` and the accepted preview's `previewId`",
    "direct-apply runtime compatibility remains unchanged",
    "Approval is unavailable while any mandatory item is pending",
  ]) assert.ok(protocol.includes(signal), `missing mandatory-review signal: ${signal}`);
});

test("skill, adopt, coding, maintenance, optimization, help, and public guidance point to the protocol", () => {
  const expected = {
    "skills/picm-factory/SKILL.md": [protocolPath.split("/").at(-1), "Before every proposed project write"],
    "skills/picm-factory/references/adoption-guide.md": ["preview-review-protocol.md", "refreshed summary"],
    "skills/picm-factory/references/coding-adoption-guide.md": ["preview-review-protocol.md", "mandatory exact review"],
    "skills/picm-factory/references/maintenance-rubric.md": ["preview-review-protocol.md", "separate explicit approval"],
    "skills/picm-factory/references/optimization-guide.md": ["preview-review-protocol.md", "separate explicit approval"],
    "prompts/picm-adopt.md": ["summary-preview and exact-review protocol", "separate explicit approval"],
    "prompts/picm-maintain.md": ["summary-preview and exact-review protocol", "separate explicit approval"],
    "prompts/picm-optimize.md": ["summary-preview and exact-review protocol", "separate explicit approval"],
    "prompts/picm-help.md": ["complete concise summary", "selective exact review"],
    "README.md": ["complete concise summary", "`View all`, `Select files`, and `Return to summary`"],
    "docs/layout-fixture-qa.md": ["both `/picm-adopt` and `/picm-maintain`", "Repeat the no-write check"],
  };
  for (const [file, signals] of Object.entries(expected)) {
    const text = read(file);
    for (const signal of signals) assert.ok(text.includes(signal), `${file} missing ${signal}`);
  }
});

test("dispatch prompts preserve privacy bootstrap ordering and add preview guidance", async () => {
  const h = commandHarness();
  await h.commands.get("picm-adopt").handler("coding", h.ctx);
  await h.commands.get("picm-maintain").handler("routing", h.ctx);
  await h.commands.get("picm-optimize").handler("", h.ctx);
  await h.commands.get("picm-help").handler("", h.ctx);

  const [adopt, maintain, optimize, help] = h.sent;
  for (const prompt of [adopt, maintain, optimize]) {
    const preflight = prompt.indexOf('action: "preflight"');
    const question = prompt.indexOf("ask this exact question");
    const summary = prompt.indexOf("complete concise `.picm/config.json` summary categories");
    const acceptance = prompt.indexOf("obtain the user's summary acceptance");
    const privacy = prompt.indexOf('call `picm_scan_control` with `action: "privacy"`');
    const confirmation = prompt.indexOf("exact TUI patch confirmation");
    const skill = prompt.indexOf("load the `picm-factory` skill");
    assert.ok(preflight >= 0 && preflight < question);
    assert.ok(question < summary);
    assert.ok(summary < acceptance && acceptance < privacy);
    assert.ok(privacy < confirmation && confirmation < skill);
  }
  assert.ok(adopt.indexOf("load the `picm-factory` skill") < adopt.indexOf("summary-preview and exact-review protocol"));
  assert.match(maintain, /Before every proposed project write.*summary-preview and exact-review protocol/s);
  assert.match(optimize, /Before every proposed project write.*summary-preview and exact-review protocol/s);
  assert.match(help, /Explain the shipped adoption\/maintenance\/optimization summary-preview, selective exact-review/);
});

test("shipped adopt prompt requires accepted persisted-privacy summary before privacy and skill", () => {
  const adopt = read("prompts/picm-adopt.md");
  const preflight = adopt.indexOf('action: "preflight"');
  const question = adopt.indexOf("Ask exactly:");
  const summary = adopt.indexOf("complete concise `.picm/config.json` summary categories");
  const acceptance = adopt.indexOf("obtain the user's summary acceptance");
  const privacy = adopt.indexOf('call `picm_scan_control` with `action: "privacy"`');
  const skill = adopt.indexOf("load the `picm-factory` skill");
  assert.ok(preflight >= 0 && preflight < question);
  assert.ok(question < summary && summary < acceptance);
  assert.ok(acceptance < privacy && privacy < skill);
  assert.match(adopt, /mark the safety\/configuration change as mandatory exact review/);
  assert.match(adopt, /exact TUI patch confirmation is the mandatory exact review and separate write approval/);
});

test("contract keeps implementation non-goals explicit", () => {
  for (const signal of [
    "not a deterministic plan engine or semantic-equivalence checker",
    "does not authorize crawling, a custom TUI, a workflow executor",
    "preserving all runtime privacy and scan behavior",
  ]) assert.ok(protocol.includes(signal), `missing non-goal: ${signal}`);

  const packageCheck = read("scripts/check-package.mjs");
  assert.ok(packageCheck.includes(protocolPath));
  assert.ok(packageCheck.includes("test/preview-review-contract.test.mjs"));
});
