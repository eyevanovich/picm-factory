import picmFactoryExtension from "../../extensions/picm-factory.ts";

export function extensionHarness({ sendError } = {}) {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const entries = [];
  const sent = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message, options) {
      if (sendError) throw sendError;
      sent.push({ message, options });
    },
  };
  picmFactoryExtension(pi);
  const context = (cwd, sessionId = "session-1", mode = "tui") => ({
    cwd,
    mode,
    hasUI: false,
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
      getSessionId: () => sessionId,
    },
    ui: {
      notify() {},
      select: async (_title, items) => items[0],
      setWidget() {},
    },
  });
  return { handlers, commands, tools, sent, entries, context };
}
