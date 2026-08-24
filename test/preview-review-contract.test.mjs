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
    ui: {
      notify() {},
      confirm: async () => true,
      select: async (_title, items) => items[0],
    },
  };
  return { commands, sent, ctx };
}

test("shipped protocol defines complete summary, direct approval, and revision invalidation", () => {
  for (const signal of [
    "proposal batch",
    "Affected files and operations",
    "Behavior or configuration changes",
    "Linked cross-file moves",
    "Preserved behavior",
    "Known uncertainty",
    "Review suggestions",
    "literal `None`",
    "Option choice, cadence choice, a preview request, review navigation, or vague assent is not approval",
    "preserves applicable selection and review state for unchanged paths",
    "Review suggestions never block approval",
    "Approve this proposal to write it, or ask to inspect a diff",
  ]) assert.ok(protocol.includes(signal), `missing protocol signal: ${signal}`);
  assert.equal(protocol.includes("Mandatory exact review"), false);
  assert.equal(protocol.includes("Approval is unavailable while any mandatory item is pending"), false);
});

test("optional exact review choices, navigation state, and rendering kinds are explicit", () => {
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
    "do not reveal it or weaken scan/privacy boundaries",
  ]) assert.ok(protocol.includes(signal), `missing exact-review signal: ${signal}`);
});

test("review suggestions stay non-blocking while control-write confirmations remain explicit", () => {
  for (const signal of [
    "deletions, linked moves, material changes to safety, privacy, permissions, approval boundaries, or required commands",
    "unusually large or uncertain change sets",
    "Review suggestions never block approval",
    "persisted `privacy.excludedPaths`",
    "standalone maintenance-policy control write",
    "complete concise summary and direct acceptance first",
    "built-in exact TUI patch confirmation as the separate runtime write confirmation",
    "pass only `action: \"apply\"` and the accepted preview's `previewId`",
    "direct-apply runtime compatibility remains unchanged",
    "Neither control confirmation authorizes other project writes",
  ]) assert.ok(protocol.includes(signal), `missing control-write signal: ${signal}`);
});

test("skill and adoption references retain one summary-and-approval flow", () => {
  for (const file of [
    "skills/picm-factory/SKILL.md",
    "skills/picm-factory/references/adoption-guide.md",
    "skills/picm-factory/references/coding-adoption-guide.md",
  ]) assert.equal(read(file).includes("mandatory exact review"), false, `${file} retained the removed gate`);

  assert.match(
    read("skills/picm-factory/references/coding-adoption-guide.md"),
    /Highlight linked moves and deletions with their intent and impact in the summary/,
  );
  const adoptionGuide = read("skills/picm-factory/references/adoption-guide.md");
  assert.match(
    adoptionGuide,
    /one direct approval authorizes the whole enumerated batch/,
  );
  assert.match(
    adoptionGuide,
    /Persisted privacy exclusions and standalone maintenance-policy controls retain their separate runtime confirmations/,
  );
  assert.match(
    read("skills/picm-factory/references/optimization-guide.md"),
    /preserve applicable unchanged-path review state/,
  );
});

test("skill, adopt, coding, maintenance, optimization, help, and public guidance point to the protocol", () => {
  const expected = {
    "skills/picm-factory/SKILL.md": [protocolPath.split("/").at(-1), "Before every proposal batch"],
    "skills/picm-factory/references/adoption-guide.md": ["preview-review-protocol.md", "refreshed summary"],
    "skills/picm-factory/references/coding-adoption-guide.md": ["preview-review-protocol.md", "suggest exact review"],
    "skills/picm-factory/references/maintenance-rubric.md": ["preview-review-protocol.md"],
    "skills/picm-factory/references/optimization-guide.md": ["preview-review-protocol.md", "without making review a gate"],
    "prompts/picm-adopt.md": ["summary-preview and optional-diff-review protocol"],
    "prompts/picm-maintain.md": ["summary-preview and optional-diff-review protocol"],
    "prompts/picm-optimize.md": ["summary-preview and optional-diff-review protocol"],
    "prompts/picm-help.md": ["non-blocking review suggestions", "optional exact review"],
    "README.md": ["complete concise summary", "`View all`, `Select files`, and `Return to summary`"],
    "docs/layout-fixture-qa.md": ["both `/picm-adopt` and `/picm-maintain`", "Repeat the no-write check"],
  };
  for (const [file, signals] of Object.entries(expected)) {
    const text = read(file);
    for (const signal of signals) assert.ok(text.includes(signal), `${file} missing ${signal}`);
  }
});

test("dispatch prompts preserve privacy bootstrap ordering and add optional-review guidance", async () => {
  const h = commandHarness();
  await h.commands.get("picm-adopt").handler("coding", h.ctx);
  await h.commands.get("picm-maintain").handler("routing", h.ctx);
  await h.commands.get("picm-optimize").handler("", h.ctx);
  await h.commands.get("picm-help").handler("", h.ctx);

  const [adopt, maintain, optimize, help] = h.sent;
  {
    const preflight = adopt.indexOf('action: "preflight"');
    const question = adopt.indexOf("ask the user");
    const summary = adopt.indexOf("complete concise `.picm/config.json` summary categories");
    const acceptance = adopt.indexOf("obtain the user's summary acceptance");
    const privacy = adopt.indexOf('call `picm_scan_control` with `action: "privacy"`');
    const confirmation = adopt.indexOf("exact TUI patch confirmation");
    const skill = adopt.indexOf("load the `picm-factory` skill");
    assert.ok(preflight >= 0 && preflight < question);
    assert.ok(question < summary);
    assert.ok(summary < acceptance && acceptance < privacy);
    assert.ok(privacy < confirmation && confirmation < skill);
  }
  {
    const preflight = optimize.indexOf('action: "preflight"');
    const conciseQuestion = optimize.indexOf("Name any additional project-relative files or directory that should be excluded from reads, or reply none to continue.");
    const privacy = optimize.indexOf('call `picm_scan_control` with `action: "privacy"`');
    const skill = optimize.indexOf("load the `picm-factory` skill");
    assert.ok(preflight >= 0 && preflight < conciseQuestion);
    assert.ok(conciseQuestion < privacy && privacy < skill);
  }
  for (const prompt of [maintain, optimize]) {
    assert.match(prompt, /privacyQuestionIsConcise/);
    assert.match(prompt, /files or directory that should be excluded from reads/);
  }
  assert.ok(adopt.indexOf("load the `picm-factory` skill") < adopt.indexOf("summary-preview and optional-diff-review protocol"));
  for (const prompt of [adopt, maintain, optimize]) {
    assert.match(prompt, /Present the complete current summary/);
    assert.match(prompt, /accept, approve, accept and write, or proceed/);
    assert.match(prompt, /write only that exact proposal/);
    assert.match(prompt, /non-blocking review suggestions/);
    assert.match(prompt, /Do not require a separate summary-acceptance step or review menu/);
    assert.match(prompt, /exact review available on demand for view all, review files, and show diff for a path/);
    assert.match(prompt, /preserve applicable unchanged-path review state/);
  }
  assert.match(help, /unambiguous direct approval of the complete current summary writes only that exact proposal/);
  assert.match(help, /without a separate acceptance step or review menu/);
  assert.match(help, /non-blocking review suggestions and exact review remain available on demand/);
  assert.match(maintain, /Maintenance run depth: strict.*run only.*Do not mutate/s);
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
  assert.match(adopt, /explain the privacy configuration impact/);
  assert.match(adopt, /exact TUI patch confirmation is the separate runtime write confirmation/);
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
