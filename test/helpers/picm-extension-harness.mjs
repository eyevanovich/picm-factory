import picmFactoryExtension from "../../extensions/picm-factory.ts";

export function extensionHarness({
  entries = [],
  sendError,
  appendError,
  confirm = true,
  createCoordinator,
  grepExecutionOptions,
} = {}) {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry(customType, data) {
      const error = appendError?.(customType, data);
      if (error) throw error;
      entries.push({ type: "custom", customType, data });
    },
    sendUserMessage(message) {
      if (sendError) throw sendError;
      sent.push(message);
    },
  };
  picmFactoryExtension(pi, { createCoordinator, grepExecutionOptions });
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
      confirm: async (...args) => typeof confirm === "function" ? confirm(...args) : confirm,
    },
  });
  return { handlers, commands, tools, sent, context };
}

export async function preflightParallelToolCalls(h, ctx, calls) {
  const prepared = [];
  for (const call of calls) {
    const lifecycle = {
      toolCallId: call.id,
      toolName: call.toolName,
      args: call.input,
    };
    await h.handlers.get("tool_execution_start")?.(lifecycle, ctx);
    const blocked = await h.handlers.get("tool_call")(
      {
        toolCallId: call.id,
        toolName: call.toolName,
        input: call.input,
      },
      ctx,
    );
    if (blocked?.block) {
      const result = {
        content: [{ type: "text", text: blocked.reason ?? "Tool execution was blocked" }],
        details: {},
      };
      await h.handlers.get("tool_execution_end")?.(
        { ...lifecycle, result, isError: true },
        ctx,
      );
      prepared.push({ ...call, blocked, result, isError: true });
    } else {
      prepared.push({ ...call, blocked: undefined });
    }
  }
  return prepared;
}

export function executePreflightedToolCalls(h, ctx, calls, timeline = []) {
  return calls.map(async (call) => {
    const lifecycle = {
      toolCallId: call.id,
      toolName: call.toolName,
      args: call.input,
    };
    if (call.blocked?.block) {
      timeline.push(`blocked:${call.id}`);
      return { id: call.id, isError: true, result: call.result };
    }
    const tool = call.tool ?? h.tools.get(call.toolName);
    try {
      const result = await tool.execute(
        call.id,
        call.input,
        call.signal,
        undefined,
        ctx,
      );
      const isError = Boolean(result?.isError);
      await h.handlers.get("tool_execution_end")?.(
        { ...lifecycle, result, isError },
        ctx,
      );
      timeline.push(`result:${call.id}`);
      return { id: call.id, isError, result };
    } catch (error) {
      const result = {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        details: {},
      };
      await h.handlers.get("tool_execution_end")?.(
        { ...lifecycle, result, isError: true },
        ctx,
      );
      timeline.push(`error:${call.id}`);
      return { id: call.id, isError: true, result };
    }
  });
}
