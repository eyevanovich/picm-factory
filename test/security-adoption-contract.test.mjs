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

function adoptionPrompt(cwd = root) {
  const commands = new Map();
  const sent = [];
  picmFactoryExtension({
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool() {},
    on() {},
    appendEntry() {},
    sendUserMessage(message) { sent.push(message); },
  });
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => [], getEntries: () => [], getSessionId: () => "security-adoption-contract" },
    ui: { notify() {}, confirm: async () => true, select: async (_title, items) => items[0] },
  };
  return commands.get("picm-adopt").handler("", ctx).then(() => sent[0]);
}

test("security-adoption fixture remains unchanged while safeguards precede write review", async () => {
  const before = workspaceSnapshot(fixture);
  const prompt = await adoptionPrompt(fixture);
  const safeguardPosition = prompt.indexOf("Before offering any adoption write");
  const writeReviewPosition = prompt.indexOf("Before applying a proposal batch");

  assert.notEqual(safeguardPosition, -1);
  assert.notEqual(writeReviewPosition, -1);
  assert.ok(safeguardPosition < writeReviewPosition);
  assert.match(prompt, /Before offering any adoption write/);
  assert.match(prompt, /non-Git workspace/);
  assert.match(prompt, /\.gitignore/);
  assert.match(prompt, /repository\/workspace visibility/);
  assert.match(prompt, /reusable context/);
  assert.match(prompt, /Do not initialize Git or modify `\.gitignore` without direct approval/);
  assert.equal(existsSync(join(fixture, ".git")), false);
  assert.equal(existsSync(join(fixture, ".gitignore")), false);
  assert.deepEqual(workspaceSnapshot(fixture), before);
});
