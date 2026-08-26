import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";

const root = process.cwd();
const fixtureNames = ["product-voice-reviewer", "faq-polisher"];

function snapshot(cwd) {
  const entries = [];
  function visit(path) {
    for (const name of readdirSync(path).sort()) {
      const entry = join(path, name);
      const stat = statSync(entry);
      if (stat.isDirectory()) visit(entry);
      else entries.push({
        path: relative(cwd, entry),
        digest: createHash("sha256").update(readFileSync(entry)).digest("hex"),
      });
    }
  }
  visit(cwd);
  return entries;
}

function harness(cwd, sessionId) {
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const entries = [];
  const pi = {
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    on() {},
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message) { sent.push(message); },
  };
  picmFactoryExtension(pi);
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => entries, getEntries: () => entries, getSessionId: () => sessionId },
    ui: { notify() {}, select: async (_title, items) => items[0], confirm: async () => false },
  };
  return { commands, tools, sent, ctx };
}

for (const fixtureName of fixtureNames) {
  test(`/picm-maintain identifies ${fixtureName} without approving fixture writes`, async (t) => {
    const cwd = join(root, "test/fixtures/layout-profiles/specialist-folder", fixtureName);
    const before = snapshot(cwd);
    const h = harness(cwd, `specialist-${fixtureName}`);
    const control = h.tools.get("picm_scan_control");
    const batch = h.tools.get("picm_proposal_batch");

    await h.commands.get("picm-maintain").handler("strict", h.ctx);
    assert.equal(h.sent.length, 1);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, h.ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, h.ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, h.ctx);
    const inventory = await control.execute("inventory", { action: "inventory" }, undefined, undefined, h.ctx);

    assert.equal(inventory.details.layoutProfile.primary, "Specialist Folder");
    assert.deepEqual(inventory.details.layoutProfile.specialistSignals, {
      identity: true,
      rules: true,
      reference: true,
      workflows: true,
    });
    assert.equal(inventory.details.layoutProfile.examplesPresent, fixtureName === "product-voice-reviewer");
    assert.equal(inventory.details.candidates.includes("AGENTS.md"), true);
    assert.equal(inventory.details.candidates.includes("CONTEXT.md"), true);

    const currentContext = readFileSync(join(cwd, "CONTEXT.md"), "utf8");
    const prepared = await batch.execute("prepare", {
      action: "prepare",
      operations: [{
        type: "modify",
        path: "CONTEXT.md",
        expectedContent: currentContext,
        content: `${currentContext}\nUnapproved maintenance change.\n`,
      }],
    }, undefined, undefined, h.ctx);
    await batch.execute("present", {
      action: "present",
      proposalId: prepared.details.proposalId,
      digest: prepared.details.digest,
    }, undefined, undefined, h.ctx);
    await batch.execute("cancel", {
      action: "cancel",
      proposalId: prepared.details.proposalId,
    }, undefined, undefined, h.ctx);

    const unchanged = snapshot(cwd);
    assert.deepEqual(unchanged, before);
    t.diagnostic(JSON.stringify({
      fixture: fixtureName,
      layoutProfile: inventory.details.layoutProfile,
      routingPreserved: {
        agents: inventory.details.candidates.includes("AGENTS.md"),
        context: inventory.details.candidates.includes("CONTEXT.md"),
      },
      proposalOutcome: "cancelled",
      fixtureUnchanged: true,
    }));
  });
}
