import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";
import { runSpecialistFirstRunCommand } from "./fixtures/specialist-first-run-command.mjs";

function harness() {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry() {},
    sendUserMessage(message) { sent.push(message); },
  };
  picmFactoryExtension(pi);
  return { handlers, commands, tools, sent };
}

function context(cwd, sessionId) {
  return {
    cwd,
    mode: "rpc",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => [],
      getEntries: () => [],
      getSessionId: () => sessionId,
    },
    ui: { notify() {}, setWidget() {} },
  };
}

test("picm-new emits final guidance derived from the reported Specialist fixture", async () => {
  const h = harness();
  const fixture = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const ctx = context(fixture, "specialist-guidance-test");

  const guidance = await runSpecialistFirstRunCommand({
    ...h,
    context: ctx,
    args: "Create the FAQ polisher Specialist Folder",
    recipePath: "workflows/polish-faq.md",
  });

  assert.match(guidance, /Start with `workflows\/polish-faq\.md`/);
  assert.match(guidance, /rough FAQ answer supplied for this run/);
  assert.match(guidance, /`reference\/faq-style\.md` for reusable style guidance/);
  assert.match(guidance, /Expected artifact: `review\/polished-faq\.md`/);
  assert.match(guidance, /Inspect, edit, and explicitly approve `review\/polished-faq\.md`/);
  assert.match(guidance, /unsupported claims and unresolved questions visible/);
  assert.match(guidance, /next specialist action reads from the approved `review\/polished-faq\.md`/);
  assert.match(guidance, /Run `\/picm-maintain` after the first real use/);
});

test("picm-new rejects an omitted generated recipe input", async () => {
  const h = harness();
  const fixture = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const ctx = context(fixture, "specialist-omitted-input-test");

  await assert.rejects(
    runSpecialistFirstRunCommand({
      ...h,
      context: ctx,
      args: "Create the FAQ polisher Specialist Folder",
      recipePath: "workflows/polish-faq.md",
      generatedInputs: [],
    }),
    /SPECIALIST_TEST_TOOL_BLOCKED/,
  );
});
