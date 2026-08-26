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

test("Stage Pipeline dispatch preserves placement input for skill resolution", async () => {
  for (const args of [
    "Stage Pipeline; use root-numbered folders",
    "Stage Pipeline; use nested stages without placeholder files",
    "Stage Pipeline; I prefer not to use nested stages",
    "Stage Pipeline; do not use root-numbered folders and nested stages",
  ]) {
    const h = harness();
    await h.commands.get("picm-new").handler(args, h.context());
    assert.match(h.sent[0], new RegExp(`User arguments:\\n${args.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(h.sent[0], /follow the loaded skill when interpreting User arguments/);
  }
});

test("placement contract distinguishes affirmative and unresolved input", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler("Create a Stage Pipeline", h.context());
  const prompt = h.sent[0];
  assert.match(prompt, /Retain exactly one unambiguous affirmative root-numbered or nested placement/);
  assert.match(prompt, /Treat negated, conflicting, or absent placement as unresolved/);
  assert.match(prompt, /root-numbered only after the user says they have no preference/);
  assert.match(prompt, /use the resolved placement in every preview and generated path/);
});

test("TUI placement contract retains privacy-first ordering", async () => {
  const h = harness();
  await h.commands.get("picm-new").handler("Stage Pipeline; use nested stages", h.context("tui"));
  const prompt = h.sent[0];
  const placement = prompt.indexOf("Stage Pipeline placement:");
  assert.ok(prompt.indexOf('action: "preflight"') < placement);
  assert.ok(prompt.indexOf('action: "privacy"') < placement);
  assert.ok(prompt.indexOf("privacy review completes") < placement);
});
