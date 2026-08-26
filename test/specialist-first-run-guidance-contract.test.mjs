import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";

function harness() {
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const pi = {
    on() {},
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry() {},
    sendUserMessage(message) { sent.push(message); },
  };
  picmFactoryExtension(pi);
  return { commands, tools, sent };
}

test("picm-new emits final guidance derived from the reported Specialist fixture", async () => {
  const h = harness();
  const fixture = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const context = {
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
  };

  await h.commands.get("picm-new").handler("Create the FAQ polisher Specialist Folder", context);
  assert.equal(h.sent.length, 1);

  const recipePath = "workflows/polish-faq.md";
  const recipe = readFileSync(join(fixture, recipePath), "utf8");
  const result = await h.tools.get("picm_specialist_first_run_guidance").execute(
    "guidance",
    { recipePath, recipe },
    undefined,
    undefined,
    context,
  );
  const guidance = result.content[0].text;

  assert.match(guidance, /Start with `workflows\/polish-faq\.md`/);
  assert.match(guidance, /rough FAQ answer supplied for this run/);
  assert.match(guidance, /`reference\/faq-style\.md` for reusable style guidance/);
  assert.match(guidance, /Expected artifact: `review\/polished-faq\.md`/);
  assert.match(guidance, /Inspect, edit, and explicitly approve `review\/polished-faq\.md`/);
  assert.match(guidance, /unsupported claims and unresolved questions visible/);
  assert.match(guidance, /next specialist action reads from the approved edited `review\/polished-faq\.md`/);
  assert.match(guidance, /Run `\/picm-maintain` after the first real use/);
});
