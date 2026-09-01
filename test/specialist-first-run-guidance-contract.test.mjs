import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("picm-new derives guidance from the persisted recipe after an edit", async () => {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const fixture = mkdtempSync(join(process.cwd(), ".specialist-guidance-"));
  cpSync(source, fixture, { recursive: true });
  try {
    const h = harness();
    const ctx = context(fixture, "specialist-edited-recipe-test");
    const recipePath = "workflows/polish-faq.md";
    const persistedRecipe = readFileSync(join(fixture, recipePath), "utf8");
    const initialRecipe = persistedRecipe.replaceAll("review/polished-faq.md", "review/stale-faq.md");

    const guidance = await runSpecialistFirstRunCommand({
      ...h,
      context: ctx,
      args: "Create the FAQ polisher Specialist Folder",
      recipePath,
      initialRecipeContent: initialRecipe,
    });

    assert.match(guidance, /Expected artifact: `review\/polished-faq\.md`/);
    assert.doesNotMatch(guidance, /stale-faq/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("picm-new rederives guidance after a post-config recipe edit", async () => {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const fixture = mkdtempSync(join(process.cwd(), ".specialist-guidance-"));
  cpSync(source, fixture, { recursive: true });
  try {
    const h = harness();
    const ctx = context(fixture, "specialist-post-config-edit-test");
    const recipePath = "workflows/polish-faq.md";
    const persistedRecipe = readFileSync(join(fixture, recipePath), "utf8");
    const initialRecipe = persistedRecipe.replaceAll("review/polished-faq.md", "review/stale-faq.md");

    const guidance = await runSpecialistFirstRunCommand({
      ...h,
      context: ctx,
      args: "Create the FAQ polisher Specialist Folder",
      recipePath,
      initialRecipeContent: initialRecipe,
      editRecipeAfterConfig: true,
    });

    assert.match(guidance, /Expected artifact: `review\/polished-faq\.md`/);
    assert.doesNotMatch(guidance, /stale-faq/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("picm-new revalidates a persisted config after an edit", async () => {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const fixture = mkdtempSync(join(process.cwd(), ".specialist-guidance-"));
  cpSync(source, fixture, { recursive: true });
  try {
    const h = harness();
    const guidance = await runSpecialistFirstRunCommand({
      ...h,
      context: context(fixture, "specialist-config-edit-test"),
      args: "Create the FAQ polisher Specialist Folder",
      recipePath: "workflows/polish-faq.md",
      editConfigAfterWrite: true,
    });

    assert.match(guidance, /Start with `workflows\/polish-faq\.md`/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("picm-new authorizes guidance after an invalid config is corrected", async () => {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const fixture = mkdtempSync(join(process.cwd(), ".specialist-guidance-"));
  cpSync(source, fixture, { recursive: true });
  try {
    const h = harness();
    const guidance = await runSpecialistFirstRunCommand({
      ...h,
      context: context(fixture, "specialist-corrected-config-test"),
      args: "Create the FAQ polisher Specialist Folder",
      recipePath: "workflows/polish-faq.md",
      initialConfigContent: "{}",
      editConfigAfterWrite: true,
    });

    assert.match(guidance, /Start with `workflows\/polish-faq\.md`/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("picm-new rejects non-local declared routes", async () => {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const fixture = mkdtempSync(join(process.cwd(), ".specialist-guidance-"));
  cpSync(source, fixture, { recursive: true });
  try {
    const h = harness();
    const recipePath = join(fixture, "workflows/polish-faq.md");
    writeFileSync(
      recipePath,
      readFileSync(recipePath, "utf8").replace(
        "- `reference/faq-style.md` for reusable style guidance.",
        "- `reference/faq-style.md` for reusable style guidance.\n- `../private.md` for private notes.",
      ),
      "utf8",
    );
    await assert.rejects(runSpecialistFirstRunCommand({
      ...h,
      context: context(fixture, "specialist-outside-route-test"),
      args: "Create the FAQ polisher Specialist Folder",
      recipePath: "workflows/polish-faq.md",
      generatedInputs: ["reference/faq-style.md"],
      runtimeInputs: ["../private.md"],
    }), /SPECIALIST_TEST_TOOL_BLOCKED/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("picm-new rejects an incomplete persisted required file after edit", async () => {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const fixture = mkdtempSync(join(process.cwd(), ".specialist-guidance-"));
  cpSync(source, fixture, { recursive: true });
  try {
    const h = harness();
    await assert.rejects(runSpecialistFirstRunCommand({
      ...h,
      context: context(fixture, "specialist-required-file-edit-test"),
      args: "Create the FAQ polisher Specialist Folder",
      recipePath: "workflows/polish-faq.md",
      persistedEdits: { "reference/faq-style.md": "{{STYLE_GUIDANCE}}\n" },
    }), /SPECIALIST_GUIDANCE_NOT_APPROVED/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("picm-new accepts Markdown links in persisted required files", async () => {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const fixture = mkdtempSync(join(process.cwd(), ".specialist-guidance-"));
  cpSync(source, fixture, { recursive: true });
  try {
    const h = harness();
    const guidance = await runSpecialistFirstRunCommand({
      ...h,
      context: context(fixture, "specialist-markdown-link-test"),
      args: "Create the FAQ polisher Specialist Folder",
      recipePath: "workflows/polish-faq.md",
      persistedEdits: {
        "reference/faq-style.md": "# Style guidance\n\nFollow the [API guide](reference/api.md).\n",
      },
    });

    assert.match(guidance, /Start with `workflows\/polish-faq\.md`/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("picm-new accepts a pre-existing input classified as runtime", async () => {
  const h = harness();
  const fixture = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");

  const guidance = await runSpecialistFirstRunCommand({
    ...h,
    context: context(fixture, "specialist-reclassified-input-test"),
    args: "Create the FAQ polisher Specialist Folder",
    recipePath: "workflows/polish-faq.md",
    generatedInputs: [],
    runtimeInputs: ["reference/faq-style.md"],
  });

  assert.match(guidance, /`reference\/faq-style\.md` for reusable style guidance/);
});
