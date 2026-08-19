import {
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

const adoptionPrivacyQuestion = "PiCM already honors `.gitignore`, nested Git ignore rules, and repository-local `.git/info/exclude`. It also protects Git internals, symlinks, nested repository/submodule boundaries, and paths outside this project. Only name additional sensitive project-relative paths not already covered by those protections. Reply with exact paths, or `none`.";

function buildPrompt(
  command: CommandName,
  args: string,
  privacyBootstrap = command === "picm-adopt" || command === "picm-optimize",
): string {
  const mode = command.replace("picm-", "");
  const argText = args.trim() ? `\n\nUser arguments:\n${args.trim()}` : "";
  const commandContext = `Mode: ${mode}\nCommand: /${command}${argText}`;
  const previewGuidance = command === "picm-adopt" || command === "picm-maintain" || command === "picm-optimize"
    ? "\n\nBefore every proposed project write, follow the skill's shipped summary-preview and exact-review protocol; require a separate explicit approval for the current proposal."
    : command === "picm-help"
      ? "\n\nExplain the shipped adoption/maintenance/optimization summary-preview, selective exact-review, and separate write-approval behavior."
      : "";
  if (privacyBootstrap) {
    return `Privacy-first startup — follow this order exactly:\n1. Call \`picm_scan_control\` with \`action: "preflight"\`. Do not load the skill or use any other tool yet.\n2. After preflight, ask this exact question and wait for the user's reply:\n\n${adoptionPrivacyQuestion}\n\n3. Prepare the privacy call with every additional exact path from the reply (an empty list for \`none\`). Use \`persist: true\` only if the user requests durable exclusions. Before a call with \`persist: true\`, present the complete concise \`.picm/config.json\` summary categories: affected files and operations, behavior or configuration changes, linked cross-file moves, preserved behavior, known uncertainty, and mandatory exact review. Use \`None\` for empty categories, mark the safety/configuration change as mandatory exact review, and obtain the user's summary acceptance. Then call \`picm_scan_control\` with \`action: "privacy"\`; its exact TUI patch confirmation is the mandatory exact review and separate write approval.\n4. Only after privacy review completes, load the \`picm-factory\` skill and its \`SKILL.md\`, then continue the ${mode} workflow.\n\n${commandContext}${previewGuidance}`;
  }
  return `Use the picm-factory skill. Load its SKILL.md before proceeding.\n\n${commandContext}${previewGuidance}`;
}

function scheduledMaintenancePrompt(): string {
  return `${buildPrompt("picm-maintain", "scheduled read-only advisory cycle", false)}\n\nThis is an automatic due-cycle advisory. Do not edit or write files, run Bash, create a report, repair anything, commit, send data, or cause external side effects. Report findings in chat only.`;
}

export default function picmFactoryExtension(pi: ExtensionAPI) {
  const packageRoot = packageRootFromImportMeta(import.meta.url);
  const canonicalPackageRoot = realpathSync(packageRoot);
  const coordinator = createRuntimeCoordinator({ packageRoot, canonicalPackageRoot });

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
      "After an explicit command, call picm_scan_control preflight before any scan, ask the privacy question, then call privacy with every exact project-relative excluded path before begin.",
      "Use picm_scan_control privacy with persist true only when the user requests durable exclusions. First present and obtain acceptance of the complete concise .picm/config.json summary, marking the safety/configuration change as mandatory exact review; then use the action's exact TUI patch confirmation as the mandatory exact review and separate write approval.",
      "Use picm_scan_control inventory only after begin, end after each scan phase, and complete when the PiCM workflow finishes.",
      "An active automatic advisory session may use only picm_scan_control inventory; it does not authorize begin, end, complete, status, Bash, or writes.",
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
        (params.action === "preflight" || params.action === "privacy" || params.action === "begin") &&
        result.authorized &&
        !result.completed &&
        !coordinator.isWorkflowCompleted(ctx)
      ) {
        pi.appendEntry(scanWorkflowEntryType, {
          status: "authorized",
          cwd: result.cwd,
          command: result.command,
          expiresAt: result.expiresAt,
          preflightComplete: result.preflightComplete,
          privacyReviewed: result.privacyReviewed,
          scanStarted: result.scanStarted,
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
            expiresAt: result.expiresAt,
            preflightComplete: result.preflightComplete,
            privacyReviewed: result.privacyReviewed,
            scanStarted: result.scanStarted,
            maintenanceResetAttempted: result.maintenanceResetAttempted,
            completed: true,
            excludedPaths: result.excludedPaths,
          });
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
      "A preview returns a previewId. Before applying it as a standalone policy write, present and obtain acceptance of the complete concise .picm/config.json summary, marking the configuration change as mandatory exact review. Then pass only action apply and that previewId so the exact timestamps are reused; the tool's exact TUI confirmation is the mandatory exact review and separate write approval.",
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

  pi.on("session_start", async (_event, ctx) => {
    restoreScanWorkflow(ctx);
    await coordinator.startup(ctx, {
      appendEntry: pi.appendEntry.bind(pi),
      sendUserMessage: pi.sendUserMessage.bind(pi),
      scheduledPrompt: scheduledMaintenancePrompt(),
    });
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreScanWorkflow(ctx);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (coordinator.settle(ctx)) recordClearedWorkflow(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
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
        await ctx.waitForIdle();
        let promptArgs = args;
        let maintenanceDepthContext = "";
        if (command === "picm-maintain") {
          const parsed = parseMaintenanceDepthArgument(args);
          let depth = parsed.depth;
          promptArgs = parsed.remainingArgs;
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
          maintenanceDepthContext = `\n\nMaintenance run depth: ${depth}. Apply this depth to this run only. Do not mutate \`capabilities.codebaseMap.maintenancePreset\`.`;
        }
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
              ((command === "picm-new" || command === "picm-maintain") && ctx.mode === "tui"),
          )}${maintenanceDepthContext}`);
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
