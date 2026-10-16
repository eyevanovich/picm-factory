import {
  withFileMutationQueue,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { join } from "node:path";
import { Type } from "typebox";
import {
  BALANCED_MAINTENANCE_GUIDANCE,
  MAINTENANCE_DEPTH_CHOICES,
  STRICT_MAINTENANCE_GUIDANCE,
} from "../../shared/runtime/coding-maintenance-depth.ts";
import { commandPrompt, maintenanceRequest } from "./runtime/command-dispatch.ts";
import { createMaintenanceConfigStore } from "../../shared/runtime/maintenance-config-store.ts";
import { createMaintenanceController } from "../../shared/runtime/maintenance-controller.ts";
import { createMaintenanceReminder } from "./runtime/maintenance-reminder.ts";

const commandDescriptions = {
  "picm-new": "Create a workspace; optionally add a workflow description after the command",
  "picm-adopt": "Adopt an existing workspace safely; type a space for optional arguments",
  "picm-maintain": "Check workspace health; type a space for one-run depth and focus arguments",
  "picm-optimize": "Improve agent-facing documentation, optionally informed by a session retrospective",
  "picm-help": "Show command syntax, arguments, examples, setup, and safety guidance",
} as const;

type CommandName = keyof typeof commandDescriptions;

const adoptArgumentCompletions = [
  { value: "coding", label: "coding", description: "Skip initial classification and enter Coding Repository adoption" },
];
const maintainArgumentCompletions = [
  { value: "strict", label: "strict", description: STRICT_MAINTENANCE_GUIDANCE },
  { value: "balanced", label: "balanced", description: BALANCED_MAINTENANCE_GUIDANCE },
  { value: "coding", label: "coding", description: "Check repository context-map drift" },
  { value: 'trace "final output drifted from approved source"', label: 'trace "drift symptom"', description: "Investigate one concrete drift symptom" },
  { value: 'trace "handoffs are losing uncertainty"', label: 'trace "handoff symptom"', description: "Investigate a handoff problem" },
  { value: 'trace "stage output no longer matches prior decisions"', label: 'trace "stage alignment symptom"', description: "Investigate stage-output drift" },
  { value: "routing", label: "routing", description: "Focus on task and context routing" },
  { value: "handoffs", label: "handoffs", description: "Focus on handoff contracts" },
  { value: "stale-context", label: "stale-context", description: "Focus on stale context" },
  { value: "security", label: "security", description: "Focus on security boundaries" },
];

function response(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: result };
}

function settingsStore(cwd: string) {
  return createMaintenanceConfigStore({ cwd });
}

export default function picmFactoryExtension(pi: ExtensionAPI) {
  const reminder = createMaintenanceReminder({
    controllerForWorkspace: (cwd: string) => createMaintenanceController({ store: settingsStore(cwd) }),
  });

  pi.registerTool({
    name: "picm_settings",
    label: "PiCM Settings",
    description: "Read projected privacy settings or conditionally update exclusions in the current workspace. Status privacy is null when no exclusions are stored, otherwise { excludedPaths: string[] }. For set-exclusions, omit expectedExcludedPaths for null; otherwise pass the observed list, including an empty list. Both forms check for concurrent changes.",
    parameters: Type.Object({
      action: StringEnum(["status", "set-exclusions"] as const),
      excludedPaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      expectedExcludedPaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const store = settingsStore(ctx.cwd);
      if (params.action === "status") return response(await store.readSettings());
      if (!params.excludedPaths) throw new Error("Provide excludedPaths for set-exclusions");
      return response(await withFileMutationQueue(join(ctx.cwd, ".picm", "config.json"), () =>
        store.compareAndUpdatePrivacyExclusions(params.expectedExcludedPaths, params.excludedPaths, { signal })));
    },
  });

  pi.registerTool({
    name: "picm_maintenance_policy",
    label: "PiCM Maintenance Policy",
    description: "Inspect, configure or complete an optional maintenance reminder cycle",
    parameters: Type.Object({
      action: StringEnum(["status", "configure", "complete"] as const),
      mode: Type.Optional(StringEnum(["manual", "nudge", "automatic"] as const)),
      intervalValue: Type.Optional(Type.Integer({ minimum: 1 })),
      intervalUnit: Type.Optional(StringEnum(["days", "weeks", "months"] as const)),
      expectedMaintenance: Type.Optional(Type.Any()),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const store = settingsStore(ctx.cwd);
      const controller = createMaintenanceController({ store });
      if (params.action === "status") return response(await controller.status());
      return response(await withFileMutationQueue(join(ctx.cwd, ".picm", "config.json"), async () => {
        if (params.action === "complete") {
          const result = await controller.completeCycle({ signal });
          return { ok: result.ok, changed: result.changed, committed: result.committed, conflict: result.conflict, code: result.code, warning: result.warning, message: result.message, maintenance: result.maintenance };
        }
        const calculated = controller.preview({
          mode: params.mode ?? "nudge",
          intervalValue: params.intervalValue,
          intervalUnit: params.intervalUnit,
        });
        if (!calculated.ok) return calculated;
        const result = await store.compareAndUpdateMaintenance(params.expectedMaintenance, calculated.maintenance, { signal });
        return { ok: result.ok, changed: result.changed, committed: result.committed, conflict: result.conflict, code: result.code, warning: result.warning, message: result.message, maintenance: result.maintenance };
      }));
    },
  });

  pi.registerTool({
    name: "picm_decision",
    label: "PiCM Decision",
    description: "Offer a non-authoritative choice when an interactive selection is useful",
    parameters: Type.Object({
      question: Type.String({ minLength: 1 }),
      choices: Type.Array(Type.String({ minLength: 1 }), { minItems: 2 }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) return response({ status: "unavailable" });
      const choice = await ctx.ui.select(params.question, params.choices);
      return response(choice ? { status: "selected", choice } : { status: "dismissed" });
    },
  });

  async function chooseDepth(ctx: Pick<ExtensionContext, "mode" | "ui">, args: string): Promise<ReturnType<typeof maintenanceRequest> | undefined> {
    const parsed = maintenanceRequest(args);
    if (parsed.depth) return parsed;
    if (ctx.mode !== "tui") return { ...parsed, depth: "strict" };
    const choice = await ctx.ui.select("Choose maintenance depth for this run (stored preset will not change)", [...MAINTENANCE_DEPTH_CHOICES]);
    if (choice !== BALANCED_MAINTENANCE_GUIDANCE && choice !== STRICT_MAINTENANCE_GUIDANCE) return undefined;
    return { ...parsed, depth: choice === BALANCED_MAINTENANCE_GUIDANCE ? "balanced" : "strict" };
  }

  function dispatch(command: CommandName, args: string, depth?: "strict" | "balanced", followUp = false) {
    pi.sendMessage({
      customType: "picm-instructions",
      content: commandPrompt(command, args, { depth }),
      display: false,
    }, { deliverAs: "nextTurn" });
    pi.sendUserMessage(`Running /${command}${depth ? ` (${depth})` : ""}.`, followUp ? { deliverAs: "followUp" } : undefined);
  }

  for (const command of Object.keys(commandDescriptions) as CommandName[]) {
    pi.registerCommand(command, {
      description: commandDescriptions[command],
      ...(command === "picm-adopt" || command === "picm-maintain" ? {
        getArgumentCompletions: (prefix: string) => {
          const items = command === "picm-adopt" ? adoptArgumentCompletions : maintainArgumentCompletions;
          const matches = items.filter((item) => item.value.toLowerCase().startsWith(prefix.trimStart().toLowerCase()));
          return matches.length ? matches : null;
        },
      } : {}),
      handler: async (args, ctx) => {
        await ctx.waitForIdle();
        if (command === "picm-maintain") {
          const selected = await chooseDepth(ctx, args);
          if (!selected) return;
          dispatch(command, selected.args, selected.depth);
          return;
        }
        dispatch(command, args);
      },
    });
  }

  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "reload") return;
    reminder.reset();
    if (ctx.mode !== "tui") return;
    let result;
    try {
      result = await reminder.offer({
        cwd: ctx.cwd,
        mode: ctx.mode,
        present: async (maintenance: { nextDueAt: string }) => {
          if (!ctx.hasUI) return "later";
          ctx.ui.setWidget("picm-maintenance-reminder", [`PiCM maintenance due: ${maintenance.nextDueAt}`]);
          try {
            const choice = await ctx.ui.select("PiCM maintenance is due", ["Run Now", "Later"]);
            return choice === "Run Now" ? "run-now" : "later";
          } finally {
            ctx.ui.setWidget("picm-maintenance-reminder", undefined);
          }
        },
      });
    } catch {
      if (ctx.hasUI) ctx.ui.notify("PiCM reminder could not be presented; it may be offered again.", "warning");
      return;
    }
    if (result.ok && result.action === "run-now") {
      const selected = await chooseDepth(ctx, "");
      if (selected) dispatch("picm-maintain", selected.args, selected.depth, true);
    } else if (!result.ok && ctx.hasUI) {
      ctx.ui.notify(`PiCM reminder unavailable: ${result.code ?? "configuration error"}`, "warning");
    }
  });
  pi.on("session_shutdown", (event, ctx) => {
    if (event.reason !== "reload") reminder.reset();
    if (ctx.hasUI) ctx.ui.setWidget("picm-maintenance-reminder", undefined);
  });
}
