import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import picmFactoryExtension from "../../extensions/picm-factory.ts";
import { createPolicy } from "../../extensions/runtime/maintenance-policy.mjs";

export function fixture(t, maintenance) {
  const cwd = mkdtempSync(join(tmpdir(), "picm-extension-maintenance-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd });
  writeFileSync(join(cwd, ".gitignore"), ".env\n");
  writeFileSync(join(cwd, ".env"), "SYNTHETIC_ONLY=ignored\n");
  mkdirSync(join(cwd, ".picm"));
  writeFileSync(join(cwd, ".picm/config.json"), `${JSON.stringify({ version: 1, custom: "keep", maintenance }, null, 2)}\n`);
  return cwd;
}

export function nonGitFixture(t, maintenance) {
  const cwd = mkdtempSync(join(tmpdir(), "picm-extension-non-git-maintenance-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, ".gitignore"), ".env\n");
  writeFileSync(join(cwd, ".env"), "SYNTHETIC_ONLY=ignored\n");
  writeFileSync(join(cwd, "safe.txt"), "safe\n");
  mkdirSync(join(cwd, ".picm"));
  writeFileSync(join(cwd, ".picm/config.json"), `${JSON.stringify({ version: 1, custom: "keep", maintenance }, null, 2)}\n`);
  return cwd;
}

export function harness(options = {}) {
  const { entries = [], confirm = true, selectHandler, sendError, extensionOptions } = options;
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const notifications = [];
  const confirmations = [];
  const selections = [];
  const widgets = new Map();
  let confirmationResult = confirm;
  let hasSelectResult = "selectResult" in options;
  let nextSelection = options.selectResult;
  let customSelectHandler = selectHandler;
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message) {
      if (sendError) throw sendError;
      sent.push(message);
    },
  };
  picmFactoryExtension(pi, extensionOptions);
  const context = (cwd, mode = "tui", sessionId = "session-1") => ({
    cwd,
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
      getSessionId: () => sessionId,
    },
    ui: {
      notify(message, level) { notifications.push({ message, level }); },
      select: async (title, items) => {
        selections.push({ title, items });
        if (customSelectHandler) return customSelectHandler(title, items);
        if (hasSelectResult) return nextSelection;
        return items[0];
      },
      confirm: async (title, message) => {
        confirmations.push({ title, message });
        return confirmationResult;
      },
      setWidget: (key, lines, options) => {
        if (lines === undefined) {
          widgets.delete(key);
        } else {
          widgets.set(key, { lines, options });
        }
      },
    },
  });
  return {
    handlers,
    commands,
    tool: tools.get("picm_maintenance_policy"),
    scanControl: tools.get("picm_scan_control"),
    sent,
    notifications,
    confirmations,
    selections,
    widgets,
    entries,
    context,
    setConfirm(value) { confirmationResult = value; },
    setSelection(value) {
      hasSelectResult = true;
      nextSelection = value;
    },
    setSelectHandler(handler) { customSelectHandler = handler; },
  };
}

export function oldDue(mode) {
  return createPolicy({ mode, intervalValue: 1, intervalUnit: "days", now: "2020-01-01T00:00:00.000Z" });
}

export function setAdoptionStatus(cwd, status) {
  const path = join(cwd, ".picm/config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.adoption = status;
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}
