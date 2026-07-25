import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  createGitReadGate,
  packageRootFromImportMeta,
} from "./runtime/git-read-gate.mjs";
import { createMaintenanceConfigStore } from "./runtime/maintenance-config-store.mjs";
import { createMaintenanceController } from "./runtime/maintenance-controller.mjs";

type CommandName = "picm-new" | "picm-adopt" | "picm-maintain" | "picm-help";

type PolicyPreviewHandoff = {
  cwd: string;
  maintenance: Record<string, unknown>;
  expiresAt: number;
  inUse: boolean;
};

type ScanWorkflow = {
  cwd: string;
  command: Exclude<CommandName, "picm-help">;
  expiresAt: number;
};

type ActiveScan = {
  cwd: string;
  expiresAt: number;
};

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
  const runtimes = new Map<string, {
    gate: ReturnType<typeof createGitReadGate>;
    controller: ReturnType<typeof createMaintenanceController>;
  }>();
  const automaticReadOnlySessions = new Map<unknown, string>();
  const scanWorkflows = new Map<unknown, ScanWorkflow>();
  const activeScans = new Map<unknown, ActiveScan>();
  const policyPreviews = new Map<string, PolicyPreviewHandoff>();
  const scanWorkflowTtlMs = 2 * 60 * 60 * 1000;
  const policyPreviewTtlMs = 10 * 60 * 1000;
  const maxPolicyPreviews = 32;

  const prunePolicyPreviews = (reserveSlot = false, now = Date.now()): void => {
    for (const [previewId, preview] of policyPreviews) {
      if (preview.expiresAt <= now) policyPreviews.delete(previewId);
    }
    while (reserveSlot && policyPreviews.size >= maxPolicyPreviews) {
      const oldest = policyPreviews.keys().next().value;
      if (typeof oldest !== "string") break;
      policyPreviews.delete(oldest);
    }
  };

  const sessionIdFor = (ctx: any): unknown =>
    ctx.sessionManager?.getSessionId?.() ??
    ctx.sessionManager?.getSessionFile?.() ??
    ctx.sessionManager ??
    ctx;

  const clearScanWorkflow = (ctx: any): void => {
    const sessionId = sessionIdFor(ctx);
    scanWorkflows.delete(sessionId);
    activeScans.delete(sessionId);
  };

  const pruneScanWorkflows = (now = Date.now()): void => {
    for (const [sessionId, workflow] of scanWorkflows) {
      if (workflow.expiresAt <= now) {
        scanWorkflows.delete(sessionId);
        activeScans.delete(sessionId);
      }
    }
    for (const [sessionId, scan] of activeScans) {
      if (scan.expiresAt <= now) activeScans.delete(sessionId);
    }
  };

  const authorizeScanWorkflow = (ctx: any, command: Exclude<CommandName, "picm-help">): void => {
    const sessionId = sessionIdFor(ctx);
    const expiresAt = Date.now() + scanWorkflowTtlMs;
    scanWorkflows.set(sessionId, { cwd: ctx.cwd, command, expiresAt });
    activeScans.set(sessionId, { cwd: ctx.cwd, expiresAt });
  };

  const activeWorkflowFor = (ctx: any): ScanWorkflow | undefined => {
    pruneScanWorkflows();
    const sessionId = sessionIdFor(ctx);
    const workflow = scanWorkflows.get(sessionId);
    const scan = activeScans.get(sessionId);
    if ((workflow && workflow.cwd !== ctx.cwd) || (scan && scan.cwd !== ctx.cwd)) {
      scanWorkflows.delete(sessionId);
      activeScans.delete(sessionId);
      return undefined;
    }
    return workflow;
  };

  const isScanActive = (ctx: any): boolean => {
    activeWorkflowFor(ctx);
    return activeScans.get(sessionIdFor(ctx))?.cwd === ctx.cwd;
  };

  const clearActiveScan = (ctx: any): void => {
    const sessionId = sessionIdFor(ctx);
    if (activeScans.get(sessionId)?.cwd === ctx.cwd) activeScans.delete(sessionId);
  };

  const isAutomaticSession = (ctx: any): boolean =>
    automaticReadOnlySessions.get(sessionIdFor(ctx)) === ctx.cwd;

  const clearAutomaticSession = (ctx: any): void => {
    const sessionId = sessionIdFor(ctx);
    if (automaticReadOnlySessions.get(sessionId) === ctx.cwd) {
      automaticReadOnlySessions.delete(sessionId);
    }
  };

  const getRuntime = (cwd: string) => {
    let runtime = runtimes.get(cwd);
    if (!runtime) {
      const gate = createGitReadGate({ cwd, packageRoot });
      const store = createMaintenanceConfigStore({ cwd, gate });
      runtime = { gate, controller: createMaintenanceController({ store }) };
      runtimes.set(cwd, runtime);
    }
    return runtime;
  };

  const disposeRuntime = async (cwd: string): Promise<void> => {
    const runtime = runtimes.get(cwd);
    runtimes.delete(cwd);
    await runtime?.gate.dispose();
  };

  pi.registerTool({
    name: "picm_scan_control",
    label: "PiCM Scan Control",
    description: "Control Git-guarded scan phases inside an explicitly authorized PiCM command workflow",
    promptSnippet: "Begin, end, complete, or inspect an explicitly authorized PiCM scan phase",
    promptGuidelines: [
      "Only an explicit /picm-new, /picm-adopt, or /picm-maintain command authorizes this tool; natural-language requests do not.",
      "The command's first turn is already scan-active. On later interview turns, call begin immediately before filesystem or Bash scanning, call end when that scan phase finishes, and call complete when the PiCM workflow is finished.",
    ],
    parameters: Type.Object({
      action: StringEnum(["begin", "end", "complete", "status"] as const),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionId = sessionIdFor(ctx);
      const workflow = activeWorkflowFor(ctx);

      if (params.action === "begin") {
        if (!workflow) {
          throw new Error("PICM_SCAN_NOT_AUTHORIZED: invoke /picm-new, /picm-adopt, or /picm-maintain before scanning");
        }
        workflow.expiresAt = Date.now() + scanWorkflowTtlMs;
        activeScans.set(sessionId, { cwd: ctx.cwd, expiresAt: workflow.expiresAt });
      } else if (params.action === "end") {
        clearActiveScan(ctx);
      } else if (params.action === "complete") {
        clearScanWorkflow(ctx);
      }

      const currentWorkflow = activeWorkflowFor(ctx);
      const result = {
        ok: true,
        action: params.action,
        authorized: Boolean(currentWorkflow),
        active: isScanActive(ctx),
        command: currentWorkflow?.command,
        expiresAt: currentWorkflow ? new Date(currentWorkflow.expiresAt).toISOString() : undefined,
      };
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
      const controller = getRuntime(ctx.cwd).controller;
      if (params.action === "status") {
        const result = await controller.status();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      }

      if (params.action === "preview") {
        if (!params.mode) throw new Error("mode is required for preview");
        const preview = controller.preview({
          mode: params.mode,
          intervalValue: params.intervalValue,
          intervalUnit: params.intervalUnit,
        });
        if (!preview.ok) throw new Error(`${preview.code}: ${preview.message}`);
        prunePolicyPreviews(true);
        const previewId = `picm-maintenance-preview:${randomUUID()}`;
        const expiresAt = Date.now() + policyPreviewTtlMs;
        policyPreviews.set(previewId, {
          cwd: ctx.cwd,
          maintenance: structuredClone(preview.maintenance),
          expiresAt,
          inUse: false,
        });
        const result = { ...preview, previewId, expiresAt: new Date(expiresAt).toISOString() };
        const response = { previewId, expiresAt: result.expiresAt, patch: preview.patch };
        return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], details: result };
      }

      if (ctx.mode !== "tui") throw new Error("MAINTENANCE_APPLY_TUI_ONLY: apply is available only in interactive TUI mode");
      let previewId: string | undefined;
      let reservedPreview: PolicyPreviewHandoff | undefined;
      let maintenance: Record<string, unknown>;
      if (params.previewId) {
        if (params.mode || params.intervalValue !== undefined || params.intervalUnit) {
          throw new Error("MAINTENANCE_PREVIEW_AMBIGUOUS: apply with previewId must not include policy fields");
        }
        prunePolicyPreviews();
        previewId = params.previewId;
        reservedPreview = policyPreviews.get(previewId);
        if (!reservedPreview) throw new Error("MAINTENANCE_PREVIEW_EXPIRED: previewId is unknown or expired; create a new preview");
        if (reservedPreview.cwd !== ctx.cwd) throw new Error("MAINTENANCE_PREVIEW_CWD_MISMATCH: previewId belongs to a different working directory");
        if (reservedPreview.inUse) throw new Error("MAINTENANCE_PREVIEW_IN_USE: previewId is already being applied");
        reservedPreview.inUse = true;
        maintenance = structuredClone(reservedPreview.maintenance);
      } else {
        if (!params.mode) throw new Error("mode is required for direct apply");
        const preview = controller.preview({
          mode: params.mode,
          intervalValue: params.intervalValue,
          intervalUnit: params.intervalUnit,
        });
        if (!preview.ok) throw new Error(`${preview.code}: ${preview.message}`);
        maintenance = preview.maintenance;
      }

      const patch = { maintenance };
      try {
        const confirmed = await ctx.ui.confirm(
          "Apply PiCM maintenance policy?",
          `Exact .picm/config.json patch:\n${JSON.stringify(patch, null, 2)}`,
        );
        if (!confirmed) {
          const declined = {
            ok: false,
            code: "MAINTENANCE_APPLY_DECLINED",
            message: previewId
              ? "No file was changed; previewId remains available until it expires"
              : "No file was changed",
            previewRetained: Boolean(previewId),
          };
          return { content: [{ type: "text", text: JSON.stringify(declined, null, 2) }], details: declined };
        }
        const result = await controller.applyPolicy(maintenance);
        if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
        if (previewId && policyPreviews.get(previewId) === reservedPreview) policyPreviews.delete(previewId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      } finally {
        if (previewId && policyPreviews.get(previewId) === reservedPreview && reservedPreview) {
          reservedPreview.inUse = false;
        }
      }
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (isAutomaticSession(ctx) && !["read", "grep", "find", "ls"].includes(event.toolName)) {
      const reason = "[picm-factory] Scheduled maintenance is advisory and read-only; this tool is blocked";
      if (ctx.hasUI) ctx.ui.notify(reason, "warning");
      return { block: true, reason };
    }
    if (!isScanActive(ctx)) return;

    let decision;
    try {
      const gate = getRuntime(ctx.cwd).gate;
      decision = event.toolName === "bash"
        ? await gate.checkBash((event.input as { command?: unknown }).command)
        : await gate.checkPath(event.toolName, (event.input as { path?: unknown }).path);
    } catch (error) {
      decision = { allowed: false, reason: `gate exception: ${error instanceof Error ? error.message : error}` };
    }
    if (!decision.allowed) {
      const reason = `[picm-factory] Blocked by Git read gate: ${decision.reason}`;
      if (ctx.hasUI) ctx.ui.notify(reason, "warning");
      return { block: true, reason };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const seenKeys = new Set<string>();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "picm-maintenance-due" && typeof entry.data?.dueKey === "string") {
        seenKeys.add(entry.data.dueKey);
      }
    }
    const decision = await getRuntime(ctx.cwd).controller.startupProbe({ mode: ctx.mode, seenKeys });
    if (!decision.ok) {
      ctx.ui.notify(`[picm-factory] Maintenance schedule check skipped: ${decision.message}`, "warning");
      return;
    }
    if (decision.action === "notify") {
      pi.appendEntry("picm-maintenance-due", { dueKey: decision.dueKey, action: "notify" });
      ctx.ui.notify(`[picm-factory] PiCM maintenance is due (scheduled for ${decision.maintenance.nextDueAt}). Run /picm-maintain when ready.`, "info");
    } else if (decision.action === "dispatch") {
      const sessionId = sessionIdFor(ctx);
      automaticReadOnlySessions.set(sessionId, ctx.cwd);
      activeScans.set(sessionId, { cwd: ctx.cwd, expiresAt: Date.now() + scanWorkflowTtlMs });
      try {
        pi.sendUserMessage(scheduledMaintenancePrompt());
      } catch (error) {
        clearAutomaticSession(ctx);
        clearActiveScan(ctx);
        const rollback = await getRuntime(ctx.cwd).controller.rollbackAutomaticClaim(decision.claim);
        const rollbackNote = rollback.ok && rollback.rolledBack
          ? "The due cycle remains pending."
          : `The claim could not be rolled back: ${rollback.message ?? rollback.code}.`;
        ctx.ui.notify(
          `[picm-factory] Automatic maintenance could not start: ${error instanceof Error ? error.message : error}. ${rollbackNote}`,
          "error",
        );
        return;
      }
      pi.appendEntry("picm-maintenance-due", { dueKey: decision.dueKey, action: "dispatch" });
    }
  });

  pi.on("agent_settled", async (_event, ctx) => {
    clearAutomaticSession(ctx);
    clearActiveScan(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearAutomaticSession(ctx);
    clearScanWorkflow(ctx);
    await disposeRuntime(ctx.cwd);
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
          const reset = await getRuntime(ctx.cwd).controller.resetExistingCycle();
          if (!reset.ok && ctx.hasUI) {
            ctx.ui.notify(`[picm-factory] Maintenance cycle was not reset: ${reset.message}`, "warning");
          }
          authorizeScanWorkflow(ctx, command);
        } else {
          clearScanWorkflow(ctx);
        }
        try {
          pi.sendUserMessage(buildPrompt(command, args));
        } catch (error) {
          if (command !== "picm-help") clearScanWorkflow(ctx);
          throw error;
        }
      },
    });
  }
}
