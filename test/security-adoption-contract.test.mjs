import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";

const root = process.cwd();

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

test("security-adoption fixture requires non-Git safeguards before an adoption write", async (t) => {
  const nonGitWorkspace = mkdtempSync(join(tmpdir(), "picm-security-adoption-"));
  t.after(() => rmSync(nonGitWorkspace, { recursive: true, force: true }));
  const prompt = await adoptionPrompt(nonGitWorkspace);
  assert.match(prompt, /Before offering any adoption write/);
  assert.match(prompt, /non-Git workspace/);
  assert.match(prompt, /\.gitignore/);
  assert.match(prompt, /repository\/workspace visibility/);
  assert.match(prompt, /reusable context/);
  assert.match(prompt, /Do not initialize Git or modify `\.gitignore` without direct approval/);
  assert.equal(existsSync(join(nonGitWorkspace, ".git")), false);
  assert.equal(existsSync(join(nonGitWorkspace, ".gitignore")), false);
});
