import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

export function harness(options = {}) {
  const entries = [];
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const notifications = [];
  const selections = [];
  const widgets = new Map();
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message) { sent.push(message); },
  };
  picmFactoryExtension(pi);
  const context = (cwd, mode = "tui") => ({
    cwd,
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    waitForIdle: async () => {},
    ui: {
      notify(message, level) { notifications.push({ message, level }); },
      select: async (title, items) => {
        selections.push({ title, items });
        if (options.selectHandler) return options.selectHandler(title, items);
        return "selectResult" in options ? options.selectResult : items[0];
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
    tools,
    tool: tools.get("picm_maintenance_policy"),
    settings: tools.get("picm_settings"),
    decision: tools.get("picm_decision"),
    sent,
    notifications,
    selections,
    widgets,
    entries,
    context,
  };
}

export function oldDue(mode) {
  return createPolicy({ mode, intervalValue: 1, intervalUnit: "days", now: "2020-01-01T00:00:00.000Z" });
}
