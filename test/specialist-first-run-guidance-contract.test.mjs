import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";
import { runSpecialistFirstRunCommand } from "./fixtures/specialist-first-run-command.mjs";

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

test("Specialist guidance renders the recipe's distinct next-action route", async () => {
  const h = harness();
  const ctx = context(process.cwd(), "distinct-specialist-route-test");
  await h.commands.get("picm-new").handler("Create a Specialist Folder", ctx);
  const result = await h.tools.get("picm_specialist_first_run_guidance").execute(
    "guidance",
    {
      recipePath: "workflows/review.md",
      recipe: `# Review

## Inputs

- A submitted draft.

## Expected artifact

Create \`review/draft.md\`.

## Review gate and next action

A human must inspect, edit, and approve \`review/draft.md\`. Keep unresolved claims visible there. The next action reads from the approved \`queue/approved.md\`.
`,
    },
    undefined,
    undefined,
    ctx,
  );

  assert.match(result.content[0].text, /Expected artifact: `review\/draft\.md`/);
  assert.match(result.content[0].text, /next specialist action reads from the approved `queue\/approved\.md`/);
});
