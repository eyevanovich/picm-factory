import test from "node:test";
import assert from "node:assert/strict";
import picmFactoryExtension from "../extensions/picm-factory.ts";

function harness() {
  const commands = new Map();
  const sent = [];
  const pi = {
    on() {},
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool() {},
    appendEntry() {},
    sendUserMessage(message) { sent.push(message); },
  };
  picmFactoryExtension(pi);
  const context = (mode = "rpc") => ({
    cwd: process.cwd(),
    mode,
    hasUI: mode === "tui",
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => [], getEntries: () => [], getSessionId: () => "placement-test" },
    ui: { notify() {}, setWidget() {} },
  });
  return { commands, sent, context };
}

test("unseeded Stage Pipeline dispatch requires a placement answer", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler("Create a Stage Pipeline", h.context());
  assert.match(h.sent[0], /placement is unresolved/);
  assert.match(h.sent[0], /ask whether stages should be root-numbered or nested under `stages\/`/);
  assert.match(h.sent[0], /root-numbered only after the user says they have no preference/);
});

test("root-numbered seed is preserved by dispatch", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler("Stage Pipeline; use root numbered folders", h.context());
  assert.match(h.sent[0], /placement seed: root-numbered/);
  assert.match(h.sent[0], /retain this explicit placement, skip the placement question/);
  assert.doesNotMatch(h.sent[0], /placement is unresolved/);
});

test("nested seed is preserved by dispatch", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler("Stage Pipeline; use nested stages", h.context());
  assert.match(h.sent[0], /placement seed: nested under `stages\/`/);
  assert.match(h.sent[0], /use it in every preview and generated path/);
  assert.doesNotMatch(h.sent[0], /placement is unresolved/);
});

test("negated root cue preserves an explicit nested override", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler(
    "Stage Pipeline; do not use root-numbered folders; use nested stages",
    h.context(),
  );
  assert.match(h.sent[0], /placement seed: nested under `stages\/`/);
  assert.doesNotMatch(h.sent[0], /placement seed: root-numbered/);
});

test("negated or conflicting placement cues remain unresolved", async () => {
  for (const args of [
    "Stage Pipeline; do not use root-numbered folders",
    "Stage Pipeline; root-numbered folders are not acceptable",
    "Stage Pipeline; nested stages would be unacceptable",
    "Stage Pipeline; either root-numbered folders or nested stages",
    "Stage Pipeline; do not use root-numbered folders and nested stages",
    "Stage Pipeline; use root-numbered folders and nested stages",
  ]) {
    const h = harness();
    await h.commands.get("picm-new").handler(args, h.context());
    assert.match(h.sent[0], /placement is unresolved/);
    assert.doesNotMatch(h.sent[0], /placement seed:/);
  }
});

test("coordinated explicit override remains affirmative", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler(
    "Stage Pipeline; do not use root-numbered folders and use nested stages",
    h.context(),
  );
  assert.match(h.sent[0], /placement seed: nested under `stages\/`/);
  assert.doesNotMatch(h.sent[0], /placement is unresolved/);
});

test("postfix affirmative placement is preserved", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler(
    "Stage Pipeline; nested stages are preferred",
    h.context(),
  );
  assert.match(h.sent[0], /placement seed: nested under `stages\/`/);
  assert.doesNotMatch(h.sent[0], /placement is unresolved/);
});

test("unrelated negation does not discard an explicit placement", async () => {
  for (const [args, expected] of [
    ["Stage Pipeline; use nested stages without placeholder files", /placement seed: nested under `stages\/`/],
    ["Stage Pipeline; keep root-numbered folders without examples", /placement seed: root-numbered/],
  ]) {
    const h = harness();
    await h.commands.get("picm-new").handler(args, h.context());
    assert.match(h.sent[0], expected);
    assert.doesNotMatch(h.sent[0], /placement is unresolved/);
  }
});

test("TUI placement dispatch retains privacy-first ordering", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler("Stage Pipeline; stages/", h.context("tui"));
  const prompt = h.sent[0];
  assert.ok(prompt.indexOf('action: "preflight"') < prompt.indexOf("Stage Pipeline placement seed"));
  assert.ok(prompt.indexOf('action: "privacy"') < prompt.indexOf("Stage Pipeline placement seed"));
  assert.ok(prompt.indexOf("privacy review completes") < prompt.indexOf("Stage Pipeline placement seed"));
});
