import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { packageRootFromImportMeta } from "./runtime/git-read-gate.mjs";
import { createRuntimeCoordinator } from "./runtime/runtime-coordinator.mjs";

type CommandName = "picm-new" | "picm-adopt" | "picm-maintain" | "picm-help";

const commandDescriptions: Record<CommandName, string> = {
  "picm-new": "Create a new PiCM folder-agent workspace through an interview-led setup flow",
  "picm-adopt": "Adopt an existing workflow or coding repository non-invasively",
  "picm-maintain": "Check workflow and coding-context health using the maintenance rubric",
  "picm-help": "Show PiCM Factory setup and command guidance",
};

const adoptArgumentCompletions = [
  { value: "coding", label: "coding — adopt as a Coding Repository or add codebase mapping" },
];

const maintainArgumentCompletions = [
  { value: "coding", label: "coding — check repository context-map drift" },
  { value: 'trace "final output drifted from approved source"', label: 'trace "drift symptom"' },
  { value: 'trace "handoffs are losing uncertainty"', label: 'trace "handoff symptom"' },
  { value: 'trace "stage output no longer matches prior decisions"', label: 'trace "stage alignment symptom"' },
  { value: "routing", label: "routing" },
  { value: "handoffs", label: "handoffs" },
  { value: "stale-context", label: "stale-context" },
  { value: "security", label: "security" },
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

  pi.registerTool({
    name: "picm_scan_control",
    label: "PiCM Scan Control",
    description: "Control Git-guarded scan phases inside an explicitly authorized PiCM command workflow",
    promptSnippet: "Begin, inventory, end, complete, or inspect an explicitly authorized PiCM scan phase",
    promptGuidelines: [
      "Only an explicit /picm-new, /picm-adopt, or /picm-maintain command authorizes this tool; natural-language requests do not.",
      "The command's first turn is already scan-active. Use inventory to obtain Git-derived candidate paths without Bash; on later interview turns call begin before scanning, end afterward, and complete when the workflow finishes.",
    ],
    parameters: Type.Object({
      action: StringEnum(["begin", "inventory", "end", "complete", "status"] as const),
      path: Type.Optional(Type.String({ minLength: 1 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await coordinator.scanControl(ctx, params.action, params.path);
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
      const reason = `[picm-factory] Blocked by Git read gate: ${decision.reason}`;
      if (ctx.hasUI) ctx.ui.notify(reason, "warning");
      return { block: true, reason };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    await coordinator.startup(ctx, {
      appendEntry: pi.appendEntry.bind(pi),
      sendUserMessage: pi.sendUserMessage.bind(pi),
      scheduledPrompt: scheduledMaintenancePrompt(),
    });
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
          coordinator.authorizeWorkflow(ctx, command);
        } else {
          coordinator.clearWorkflow(ctx);
        }
        try {
          pi.sendUserMessage(buildPrompt(command, args));
        } catch (error) {
          if (command !== "picm-help") coordinator.clearWorkflow(ctx);
          throw error;
        }
      },
    });
  }
}
