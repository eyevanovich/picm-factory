import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
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
  return { commands, sent };
}

test("picm-new emits Specialist final-guidance contract for the reported fixture route", async () => {
  const h = harness();
  const fixture = join(
    process.cwd(),
    "test/fixtures/layout-profiles/specialist-folder/faq-polisher",
  );
  const args = "Create a Specialist Folder for the FAQ polisher fixture";

  await h.commands.get("picm-new").handler(args, {
    cwd: fixture,
    mode: "rpc",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => [],
      getEntries: () => [],
      getSessionId: () => "specialist-guidance-test",
    },
    ui: { notify() {}, setWidget() {} },
  });

  assert.equal(h.sent.length, 1);
  const prompt = h.sent[0];
  assert.match(prompt, /Command: \/picm-new/);
  assert.match(prompt, new RegExp(`User arguments:\\n${args}`));
  assert.match(prompt, /derive every detail from its approved generated routes/);
  assert.match(prompt, /exact first workflow\/task recipe path, its inputs, and expected artifact/);
  assert.match(prompt, /inspect, edit, and explicitly approve that artifact/);
  assert.match(prompt, /keep recipe-named uncertainty visible/);
  assert.match(prompt, /approved artifact as where the next action reads from/);
  assert.match(prompt, /Do not invent optional folders, recipes, or operations/);
  assert.match(prompt, /Recommend `\/picm-maintain` after the first real use/);
});
