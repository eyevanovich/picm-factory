import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";

const root = process.cwd();
const fixture = join(root, "test/fixtures/layout-profiles/security-red-team/adoption-sensitive-existing");

function workspaceSnapshot(cwd) {
  const snapshot = [];
  function visit(path) {
    for (const name of readdirSync(path).sort()) {
      const entry = join(path, name);
      const stat = statSync(entry);
      if (stat.isDirectory()) {
        visit(entry);
      } else {
        snapshot.push({
          path: relative(cwd, entry),
          mode: stat.mode,
          digest: createHash("sha256").update(readFileSync(entry)).digest("hex"),
        });
      }
    }
  }
  visit(cwd);
  return snapshot;
}

function adoptionHarness(cwd = root) {
  const commands = new Map();
  const handlers = new Map();
  const tools = new Map();
  const sent = [];
  picmFactoryExtension({
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    on(name, handler) { handlers.set(name, handler); },
    appendEntry() {},
    sendUserMessage(message) { sent.push(message); },
  });
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => [], getEntries: () => [], getSessionId: () => "security-adoption-contract" },
    ui: {
      notify() {},
      confirm: async () => true,
      select: async (_title, items) => items[0],
      setWidget() {},
    },
  };
  return { commands, ctx, handlers, scanControl: tools.get("picm_scan_control"), sent };
}

test("security-adoption fixture remains unchanged while safeguards precede write review", async () => {
  const before = workspaceSnapshot(fixture);
  const previousCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = join(fixture, "..");
  const h = adoptionHarness(fixture);

  try {
    await h.commands.get("picm-adopt").handler("", h.ctx);
    const prompt = h.sent[0];
    const safeguardPosition = prompt.indexOf("Before offering any adoption write");
    const writeReviewPosition = prompt.indexOf("Before applying a proposal batch");

    assert.notEqual(safeguardPosition, -1);
    assert.notEqual(writeReviewPosition, -1);
    assert.ok(safeguardPosition < writeReviewPosition);
    assert.match(prompt, /non-Git workspace/);
    assert.match(prompt, /\.gitignore/);
    assert.match(prompt, /repository\/workspace visibility/);
    assert.match(prompt, /reusable context/);
    assert.match(prompt, /Do not initialize Git or modify `\.gitignore` without direct approval/);

    const preflight = await h.scanControl.execute(
      "preflight",
      { action: "preflight" },
      undefined,
      undefined,
      h.ctx,
    );
    assert.equal(preflight.details.gitRepository, false);
    await h.scanControl.execute(
      "privacy",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      h.ctx,
    );
    const earlyWrite = await h.handlers.get("tool_call")(
      { toolCallId: "early-write", toolName: "write", input: { path: "CONTEXT.md" } },
      h.ctx,
    );
    assert.equal(earlyWrite.block, true);

    await h.scanControl.execute("begin", { action: "begin" }, undefined, undefined, h.ctx);
    const inventory = await h.scanControl.execute(
      "inventory",
      { action: "inventory" },
      undefined,
      undefined,
      h.ctx,
    );
    assert.equal(inventory.details.isolated, true);
    assert.equal(inventory.details.candidates.includes("synthetic.env"), true);
    assert.equal(inventory.details.candidates.includes("reference/private-client-brief.md"), true);
    assert.equal(inventory.details.candidates.includes("intake/source-notes.md"), true);

    const firstWriteOpportunity = await h.handlers.get("tool_call")(
      { toolCallId: "previewed-write", toolName: "write", input: { path: "CONTEXT.md" } },
      h.ctx,
    );
    assert.equal(firstWriteOpportunity.block, true);
    assert.match(firstWriteOpportunity.reason, /Use picm_proposal_batch/);
    assert.deepEqual(workspaceSnapshot(fixture), before);
  } finally {
    await h.handlers.get("session_shutdown")({}, h.ctx);
    if (previousCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = previousCeiling;
  }

  assert.equal(existsSync(join(fixture, ".git")), false);
  assert.equal(existsSync(join(fixture, ".gitignore")), false);
  assert.deepEqual(workspaceSnapshot(fixture), before);
});
