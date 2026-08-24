import {
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  withFileMutationQueue,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import {
  BALANCED_MAINTENANCE_GUIDANCE,
  MAINTENANCE_DEPTH_CHOICES,
  STRICT_MAINTENANCE_GUIDANCE,
  parseMaintenanceDepthArgument,
} from "./runtime/coding-maintenance-depth.mjs";
import { packageRootFromImportMeta } from "./runtime/git-read-gate.mjs";
import { executeBoundGrep } from "./runtime/path-execution-binding.mjs";
import { createRuntimeCoordinator } from "./runtime/runtime-coordinator.mjs";

type CommandName = "picm-new" | "picm-adopt" | "picm-maintain" | "picm-optimize" | "picm-help";

const scanWorkflowEntryType = "picm-scan-workflow";

const commandDescriptions: Record<CommandName, string> = {
  "picm-new": "Create a workspace; optionally add a workflow description after the command",
  "picm-adopt": "Adopt an existing workspace safely; type a space for optional arguments",
  "picm-maintain": "Check workspace health; type a space for one-run depth and focus arguments",
  "picm-optimize": "Optimize agent-facing documentation without changing intended outcomes",
  "picm-help": "Show command syntax, arguments, examples, setup, and safety guidance",
};

const adoptArgumentCompletions = [
  {
    value: "coding",
    label: "coding",
    description: "Skip initial classification and enter Coding Repository adoption",
  },
];

const maintainArgumentCompletions = [
  { value: "strict", label: "strict", description: STRICT_MAINTENANCE_GUIDANCE },
  { value: "balanced", label: "balanced", description: BALANCED_MAINTENANCE_GUIDANCE },
  { value: "coding", label: "coding", description: "Check repository context-map drift" },
  {
    value: 'trace "final output drifted from approved source"',
    label: 'trace "drift symptom"',
    description: "Investigate one concrete drift symptom",
  },
  {
    value: 'trace "handoffs are losing uncertainty"',
    label: 'trace "handoff symptom"',
    description: "Investigate a handoff problem",
  },
  {
    value: 'trace "stage output no longer matches prior decisions"',
    label: 'trace "stage alignment symptom"',
    description: "Investigate stage-output drift",
  },
  { value: "routing", label: "routing", description: "Focus on task and context routing" },
  { value: "handoffs", label: "handoffs", description: "Focus on handoff contracts" },
  { value: "stale-context", label: "stale-context", description: "Focus on stale context" },
  { value: "security", label: "security", description: "Focus on security boundaries" },
];

const adoptionPrivacyQuestion = `PiCM automatically protects:
- paths covered by root, nested, and repository-local Git ignore rules;
- Git internals;
- symlinks and nested repository/submodule boundaries; and
- paths outside this project.

Name any additional project-relative exclusions, or reply \`none\`.`;

function buildPrompt(
  command: CommandName,
  args: string,
  privacyBootstrap = command === "picm-adopt" || command === "picm-optimize",
): string {
  const mode = command.replace("picm-", "");
  const argText = args.trim() ? `\n\nUser arguments:\n${args.trim()}` : "";
  const commandContext = `Mode: ${mode}\nCommand: /${command}${argText}`;
  const previewGuidance = command === "picm-adopt" || command === "picm-maintain" || command === "picm-optimize"
    ? "\n\nBefore applying a proposal batch, follow the skill's shipped summary-preview and optional-diff-review protocol. Present the complete current summary, including non-blocking review suggestions for material or uncertain changes, then treat an unambiguous direct approval such as accept, approve, accept and write, or proceed as approval to write only that exact proposal. Do not require a separate summary-acceptance step or review menu. Keep exact review available on demand for view all, review files, and show diff for a path. When the user requests a draft adjustment, revise the current proposal conversationally, preserve applicable unchanged-path review state, and invite direct approval or diff inspection of the revision."
    : command === "picm-help"
      ? "\n\nExplain the shipped adoption/maintenance/optimization summary-preview: unambiguous direct approval of the complete current summary writes only that exact proposal without a separate acceptance step or review menu; non-blocking review suggestions and exact review remain available on demand for view all, review files, and show diff for a path."
      : "";
  if (privacyBootstrap) {
    return `Privacy-first startup — follow this order exactly:\n1. Call \`picm_scan_control\` with \`action: "preflight"\`. Do not load the skill or use any other tool yet.\n2. After preflight, ask the user:\n\n${adoptionPrivacyQuestion}\n\n3. Prepare the privacy call with every additional exact path from the reply (an empty list for \`none\`). Use \`persist: true\` only if the user requests durable exclusions. Before a call with \`persist: true\`, present the complete concise \`.picm/config.json\` summary categories: affected files and operations, behavior or configuration changes, linked cross-file moves, preserved behavior, known uncertainty, and review suggestions. Use \`None\` for empty categories, explain the privacy configuration impact, and obtain the user's summary acceptance. Then call \`picm_scan_control\` with \`action: "privacy"\`; its exact TUI patch confirmation is the separate runtime write confirmation.\n4. Only after privacy review completes, load the \`picm-factory\` skill and its \`SKILL.md\`, then continue the ${mode} workflow.\n\n${commandContext}${previewGuidance}`;
  }
  if (command === "picm-maintain") {
    return `Privacy-first startup — follow this order exactly:\n1. Call \`picm_scan_control\` with \`action: "preflight"\`. Do not load the skill or use any other tool yet.\n2. For maintenance, preflight automatically loads persisted \`.picm/config.json\` privacy exclusions. If its result has \`privacyFollowupPending: true\`, ask only this concise follow-up without repeating the full privacy boilerplate:\n\nPersisted exclusions are already loaded. Name any additional sensitive project-relative paths to exclude for this run, or reply \`none\`.\n\nThen call \`picm_scan_control\` with \`action: "privacy"\` and every additional exact path (an empty list for \`none\`). Existing persisted exclusions remain in effect.\n3. Otherwise, ask the user:\n\n${adoptionPrivacyQuestion}\n\nThen call \`picm_scan_control\` with \`action: "privacy"\` and every additional exact path (an empty list for \`none\`). Use \`persist: true\` only if the user requests durable exclusions and follow its summary and exact TUI confirmation requirements.\n4. After the privacy call completes, load the \`picm-factory\` skill and continue.\n\n${commandContext}${previewGuidance}`;
  }
  return `Use the picm-factory skill. Load its SKILL.md before proceeding.\n\n${commandContext}${previewGuidance}`;
}

type PicmFactoryExtensionOptions = {
  createCoordinator?: typeof createRuntimeCoordinator;
  grepExecutionOptions?: Parameters<typeof executeBoundGrep>[3];
};

export default function picmFactoryExtension(
  pi: ExtensionAPI,
  options: PicmFactoryExtensionOptions = {},
) {
  const packageRoot = packageRootFromImportMeta(import.meta.url);
  const canonicalPackageRoot = realpathSync(packageRoot);
  const coordinator = (options.createCoordinator ?? createRuntimeCoordinator)({
    packageRoot,
    canonicalPackageRoot,
  });

  const registerBoundBuiltin = (
    toolName: "read" | "edit" | "write" | "grep" | "rg" | "find" | "ls",
    createTool: any,
  ) => {
    const definition = createTool(process.cwd());
    pi.registerTool({
      ...definition,
      async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: ExtensionContext) {
        const binding = coordinator.beginBoundPathExecution(toolCallId, ctx, toolName);
        if (binding && (toolName === "grep" || toolName === "rg")) {
          return executeBoundGrep(binding, params, signal, options.grepExecutionOptions);
        }
        const tool = createTool(ctx.cwd, binding ? { operations: binding.operations } : undefined);
        return tool.execute(toolCallId, params, signal, onUpdate, ctx);
      },
    });
  };

  registerBoundBuiltin("read", createReadTool);
  registerBoundBuiltin("edit", createEditTool);
  registerBoundBuiltin("write", createWriteTool);
  registerBoundBuiltin("grep", createGrepTool);
  registerBoundBuiltin("rg", (cwd: string, options?: any) => ({ ...createGrepTool(cwd, options), name: "rg" }));
  registerBoundBuiltin("find", createFindTool);
  registerBoundBuiltin("ls", createLsTool);

  const restoreScanWorkflow = (ctx: ExtensionContext) => {
    let state;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === scanWorkflowEntryType) state = entry.data;
    }
    coordinator.restoreWorkflow(ctx, state);
  };

  const recordClearedWorkflow = (ctx: ExtensionContext) => {
    pi.appendEntry(scanWorkflowEntryType, { status: "cleared", cwd: ctx.cwd });
  };

  pi.registerTool({
    name: "picm_scan_control",
    label: "PiCM Scan Control",
    description: "Preflight, privacy-review, and control protected scan phases inside an explicitly authorized PiCM workflow",
    promptSnippet: "Preflight, record privacy exclusions, and control protected PiCM scan phases",
    promptGuidelines: [
      "Only an explicit /picm-new, /picm-adopt, /picm-maintain, or /picm-optimize command authorizes picm_scan_control; natural-language requests do not.",
      "After an explicit command, call picm_scan_control preflight before any scan. If /picm-maintain preflight returns privacyFollowupPending true, ask only for additional sensitive project-relative exclusions without repeating the full privacy boilerplate, then call privacy; persisted exclusions remain in effect. Otherwise, ask the full privacy question, then call privacy with every exact project-relative excluded path before begin.",
      "Use picm_scan_control privacy with persist true only when the user requests durable exclusions. First present and obtain acceptance of the complete concise .picm/config.json summary, explain the privacy configuration impact, then use the action's exact TUI patch confirmation as the separate runtime write confirmation.",
      "Use picm_scan_control inventory only after begin, end after each scan phase, and complete when the PiCM workflow finishes.",
    ],
    parameters: Type.Object({
      action: StringEnum(["preflight", "privacy", "begin", "inventory", "end", "complete", "status"] as const),
      path: Type.Optional(Type.String({ minLength: 1 })),
      excludedPaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      persist: Type.Optional(Type.Boolean()),
    }),
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const run = () => coordinator.scanControl(ctx, params, { toolCallId, signal });
      const result = params.action === "privacy" && params.persist
        ? await withFileMutationQueue(join(ctx.cwd, ".picm", "config.json"), run)
        : await run();
      if (
        result.ok &&
        (params.action === "preflight" || params.action === "privacy" || params.action === "begin" || params.action === "end") &&
        result.authorized &&
        !result.completed &&
        !coordinator.isWorkflowCompleted(ctx)
      ) {
        pi.appendEntry(scanWorkflowEntryType, {
          status: "authorized",
          cwd: result.cwd,
          command: result.command,
          preflightComplete: result.preflightComplete,
          privacyReviewed: result.privacyReviewed,
          privacyFollowupPending: result.privacyFollowupPending,
          scanStarted: result.scanStarted,
          scanSettled: result.scanSettled,
          maintenanceResetAttempted: result.maintenanceResetAttempted,
          excludedPaths: result.excludedPaths,
        });
        if (result.maintenanceReset && !result.maintenanceReset.ok && ctx.hasUI) {
          ctx.ui.notify(
            `[picm-factory] Maintenance cycle was not reset: ${result.maintenanceReset.message}`,
            "warning",
          );
        }
      } else if (params.action === "complete") {
        if (result.completed) {
          pi.appendEntry(scanWorkflowEntryType, {
            status: "completed",
            cwd: result.cwd,
            command: result.command,
            preflightComplete: result.preflightComplete,
            privacyReviewed: result.privacyReviewed,
            privacyFollowupPending: result.privacyFollowupPending,
            scanStarted: result.scanStarted,
            scanSettled: result.scanSettled,
            maintenanceResetAttempted: result.maintenanceResetAttempted,
            completed: true,
            excludedPaths: result.excludedPaths,
          });
          if (ctx.hasUI) {
            ctx.ui.setWidget("picm-maintenance-reminder", undefined);
          }
          if (result.maintenanceReset && !result.maintenanceReset.ok && ctx.hasUI) {
            ctx.ui.notify(
              `[picm-factory] Maintenance cycle was not reset: ${result.maintenanceReset.message}`,
              "warning",
            );
          }
        } else {
          recordClearedWorkflow(ctx);
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });

  pi.registerTool({
    name: "picm_maintenance_policy",
    label: "PiCM Maintenance Policy",
    description: "Preview, apply, or inspect PiCM maintenance cadence in .picm/config.json",
    promptSnippet: "Preview or configure deterministic PiCM maintenance cadence",
    promptGuidelines: [
      "Use picm_maintenance_policy preview to calculate exact maintenance JSON before including it in a scaffold/adoption preview.",
      "A preview returns a previewId. Before applying it as a standalone policy write, present and obtain acceptance of the complete concise .picm/config.json summary and explain the configuration impact. Then pass only action apply and that previewId so the exact timestamps are reused; the tool's exact TUI confirmation is the separate runtime write confirmation.",
    ],
    parameters: Type.Object({
      action: StringEnum(["preview", "apply", "status"] as const),
      previewId: Type.Optional(Type.String({ minLength: 1 })),
      mode: Type.Optional(StringEnum(["manual", "nudge", "automatic"] as const)),
      intervalValue: Type.Optional(Type.Integer({ minimum: 1 })),
      intervalUnit: Type.Optional(StringEnum(["days", "weeks", "months"] as const)),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await coordinator.maintenancePolicy(params, ctx, signal);
      if (params.action === "preview") {
        const response = {
          previewId: result.previewId,
          expiresAt: result.expiresAt,
          patch: result.patch,
        };
        return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], details: result };
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });

  pi.on("tool_execution_start", (event, ctx) => {
    coordinator.startToolExecution(event, ctx);
  });

  pi.on("tool_call", async (event, ctx) => {
    let admitted = false;
    try {
      const decision = await coordinator.checkToolCall(event, ctx);
      if (!decision.allowed) {
        const reason = `[picm-factory] Blocked by PiCM scan gate: ${decision.reason}`;
        if (ctx.hasUI) ctx.ui.notify(reason, "warning");
        return { block: true, reason };
      }
      coordinator.admitToolExecution(event, ctx);
      admitted = true;
    } finally {
      if (!admitted) coordinator.rejectToolExecution(event, ctx);
    }
  });

  pi.on("tool_execution_end", (event, ctx) => {
    coordinator.endToolExecution(event, ctx);
  });

  async function executeMaintain(ctx: ExtensionContext, args = "") {
    await ctx.waitForIdle();
    const parsed = parseMaintenanceDepthArgument(args);
    let depth = parsed.depth;
    const promptArgs = parsed.remainingArgs;
    if (!depth && ctx.mode === "tui") {
      const selected = await ctx.ui.select(
        "Choose maintenance depth for this run (stored preset will not change)",
        MAINTENANCE_DEPTH_CHOICES,
      );
      if (!selected) {
        ctx.ui.notify("PiCM maintenance cancelled before scan authorization.", "info");
        return;
      }
      depth = selected === BALANCED_MAINTENANCE_GUIDANCE ? "balanced" : "strict";
    }
    depth ??= "strict";
    const maintenanceDepthContext = `\n\nMaintenance run depth: ${depth}. Apply this depth to this run only. Do not mutate \`capabilities.codebaseMap.maintenancePreset\`.`;
    const authorization = coordinator.authorizeWorkflow(ctx, "picm-maintain");
    pi.appendEntry(scanWorkflowEntryType, { status: "authorized", ...authorization });
    try {
      pi.sendUserMessage(`${buildPrompt(
        "picm-maintain",
        promptArgs,
        false,
      )}${maintenanceDepthContext}`);
    } catch (error) {
      coordinator.clearWorkflow(ctx);
      recordClearedWorkflow(ctx);
      throw error;
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    restoreScanWorkflow(ctx);
    await coordinator.startup(ctx, {
      appendEntry: pi.appendEntry.bind(pi),
      promptMaintenanceWorkflow: () => executeMaintain(ctx, ""),
    });
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreScanWorkflow(ctx);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (coordinator.settle(ctx)) recordClearedWorkflow(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setWidget("picm-maintenance-reminder", undefined);
    }
    const completed = coordinator.isWorkflowCompleted(ctx);
    let cleanupError: unknown;
    let cleanupFailed = false;
    try {
      await coordinator.dispose(ctx);
    } catch (error) {
      cleanupError = error;
      cleanupFailed = true;
    }
    let persistenceError: unknown;
    let persistenceFailed = false;
    if (completed) {
      try {
        recordClearedWorkflow(ctx);
      } catch (error) {
        persistenceError = error;
        persistenceFailed = true;
      }
    }
    if (cleanupFailed && persistenceFailed) {
      throw new AggregateError(
        [cleanupError, persistenceError],
        "PiCM shutdown cleanup and terminal-state persistence both failed",
      );
    }
    if (cleanupFailed) throw cleanupError;
    if (persistenceFailed) throw persistenceError;
  });

  for (const command of Object.keys(commandDescriptions) as CommandName[]) {
    pi.registerCommand(command, {
      description: commandDescriptions[command],
      ...(command === "picm-adopt" || command === "picm-maintain" ? {
        getArgumentCompletions: (prefix: string) => {
          const normalizedPrefix = prefix.trimStart().toLowerCase();
          const items = command === "picm-adopt" ? adoptArgumentCompletions : maintainArgumentCompletions;
          const completions = items.filter((item) => item.value.toLowerCase().startsWith(normalizedPrefix));
          return completions.length > 0 ? completions : null;
        },
      } : {}),
      handler: async (args, ctx) => {
        if (command === "picm-maintain") {
          await executeMaintain(ctx, args);
          return;
        }
        await ctx.waitForIdle();
        let promptArgs = args;
        if (command !== "picm-help") {
          const authorization = coordinator.authorizeWorkflow(ctx, command);
          pi.appendEntry(scanWorkflowEntryType, { status: "authorized", ...authorization });
        } else if (coordinator.clearWorkflow(ctx)) {
          recordClearedWorkflow(ctx);
        }
        try {
          pi.sendUserMessage(`${buildPrompt(
            command,
            promptArgs,
            command === "picm-adopt" || command === "picm-optimize" ||
              (command === "picm-new" && ctx.mode === "tui"),
          )}`);
        } catch (error) {
          if (command !== "picm-help") {
            coordinator.clearWorkflow(ctx);
            recordClearedWorkflow(ctx);
          }
          throw error;
        }
      },
    });
  }
}
