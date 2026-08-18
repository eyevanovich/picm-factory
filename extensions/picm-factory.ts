import {
  withFileMutationQueue,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { join } from "node:path";
import { Type } from "typebox";
import { packageRootFromImportMeta } from "./runtime/git-read-gate.mjs";
import { createRuntimeCoordinator } from "./runtime/runtime-coordinator.mjs";

type CommandName = "picm-new" | "picm-adopt" | "picm-maintain" | "picm-help";

const scanWorkflowEntryType = "picm-scan-workflow";

const commandDescriptions: Record<CommandName, string> = {
  "picm-new": "Create a workspace; optionally add a workflow description after the command",
  "picm-adopt": "Adopt an existing workspace safely; type a space for optional arguments",
  "picm-maintain": "Check workspace health; type a space for focus and trace arguments",
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

function buildPrompt(command: CommandName, args: string): string {
  const mode = command.replace("picm-", "");
  const argText = args.trim() ? `\n\nUser arguments:\n${args.trim()}` : "";
  return `Use the picm-factory skill. Load its SKILL.md before proceeding.\n\nMode: ${mode}\nCommand: /${command}${argText}`;
}

function scheduledMaintenancePrompt(): string {
  return `${buildPrompt("picm-maintain", "scheduled read-only advisory cycle")}\n\nThis is an automatic due-cycle advisory. Do not edit or write files, run Bash, create a report, repair anything, commit, send data, or cause external side effects. Report findings in chat only.`;
}

export default function picmFactoryExtension(pi: ExtensionAPI) {
  const packageRoot = packageRootFromImportMeta(import.meta.url);
  const coordinator = createRuntimeCoordinator({ packageRoot });

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
      "Only an explicit /picm-new, /picm-adopt, or /picm-maintain command authorizes picm_scan_control; natural-language requests do not.",
      "After an explicit command, call picm_scan_control preflight before any scan, ask the privacy question, then call privacy with every exact project-relative excluded path before begin.",
      "Use picm_scan_control privacy with persist true only when the user requests durable exclusions; the action presents the exact .picm/config.json patch for TUI confirmation.",
      "Use picm_scan_control inventory only after begin, end after each scan phase, and complete when the PiCM workflow finishes.",
      "An active automatic advisory session may use only picm_scan_control inventory; it does not authorize begin, end, complete, status, Bash, or writes.",
    ],
    parameters: Type.Object({
      action: StringEnum(["preflight", "privacy", "begin", "inventory", "end", "complete", "status"] as const),
      path: Type.Optional(Type.String({ minLength: 1 })),
      excludedPaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      persist: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const run = () => coordinator.scanControl(ctx, params);
      const result = params.action === "privacy" && params.persist
        ? await withFileMutationQueue(join(ctx.cwd, ".picm", "config.json"), run)
        : await run();
      if (result.ok && (params.action === "privacy" || params.action === "begin") && result.authorized) {
        pi.appendEntry(scanWorkflowEntryType, {
          status: "authorized",
          cwd: result.cwd,
          command: result.command,
          expiresAt: result.expiresAt,
          privacyReviewed: result.privacyReviewed,
          scanStarted: result.scanStarted,
          excludedPaths: result.excludedPaths,
        });
      } else if (params.action === "complete") {
        recordClearedWorkflow(ctx);
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
      "A preview returns a previewId. When applying that preview as a standalone policy write, pass only action apply and that previewId so the exact timestamps are reused; the tool performs its own TUI confirmation.",
    ],
    parameters: Type.Object({
      action: StringEnum(["preview", "apply", "status"] as const),
      previewId: Type.Optional(Type.String({ minLength: 1 })),
      mode: Type.Optional(StringEnum(["manual", "nudge", "automatic"] as const)),
      intervalValue: Type.Optional(Type.Integer({ minimum: 1 })),
      intervalUnit: Type.Optional(StringEnum(["days", "weeks", "months"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await coordinator.maintenancePolicy(params, ctx);
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

  pi.on("tool_call", async (event, ctx) => {
    const decision = await coordinator.checkToolCall(event, ctx);
    if (!decision.allowed) {
      const reason = `[picm-factory] Blocked by PiCM scan gate: ${decision.reason}`;
      if (ctx.hasUI) ctx.ui.notify(reason, "warning");
      return { block: true, reason };
    }
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
    coordinator.settle(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await coordinator.dispose(ctx);
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
        if (command !== "picm-help") {
          const reset = await coordinator.resetCycle(ctx);
          if (!reset.ok && ctx.hasUI) {
            ctx.ui.notify(`[picm-factory] Maintenance cycle was not reset: ${reset.message}`, "warning");
          }
          const authorization = coordinator.authorizeWorkflow(ctx, command);
          pi.appendEntry(scanWorkflowEntryType, { status: "authorized", ...authorization });
        } else if (coordinator.clearWorkflow(ctx)) {
          recordClearedWorkflow(ctx);
        }
        try {
          pi.sendUserMessage(buildPrompt(command, args));
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
