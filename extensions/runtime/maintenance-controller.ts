import {
  createPolicy,
  isDue,
  resetPolicy,
  validatePolicy,
} from "./maintenance-policy.ts";

import { codedError, errorCode } from "./errors.ts";
import type { ConfigFailure, ConfigMutationResult, MutationOptions, createMaintenanceConfigStore } from "./maintenance-config-store.ts";
import type { PolicyOptions, ScheduledMaintenancePolicy } from "./maintenance-policy.ts";

type StartupProbe = ConfigFailure |
  { ok: true; action: "none"; reason: string } |
  { ok: true; action: "due"; dueKey: string; maintenance: ScheduledMaintenancePolicy };

function failed(error: unknown): ConfigFailure {
  return {
    ok: false,
    code: errorCode(error) ?? "MAINTENANCE_POLICY_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function createMaintenanceController({ store: configuredStore, now = () => new Date() }: {
  store?: Pick<ReturnType<typeof createMaintenanceConfigStore>, "read" | "compareAndUpdateMaintenance">;
  now?: () => Date | string | number;
} = {}) {
  if (!configuredStore) throw new Error("Maintenance controller requires a config store");
  const store = configuredStore;

  function preview({ mode = "nudge", intervalValue, intervalUnit }: PolicyOptions = {}) {
    try {
      const maintenance = createPolicy({ mode, intervalValue, intervalUnit, now: now() });
      return {
        ok: true as const,
        maintenance,
      };
    } catch (error) {
      return failed(error);
    }
  }

  async function status() {
    const result = await store.read();
    if (!result.ok) return result;
    return {
      ok: true,
      exists: result.exists,
      maintenance: result.maintenance,
      effectiveMode: result.maintenance?.mode ?? "manual",
    };
  }

  async function completeCycle({ signal }: MutationOptions = {}): Promise<ConfigMutationResult> {
    const throwIfAborted = () => {
      if (signal?.aborted) {
        const error = codedError("CONFIG_OPERATION_CANCELLED", "CONFIG_OPERATION_CANCELLED: operation was cancelled before mutation");
        throw error;
      }
    };

    throwIfAborted();
    const current = await store.read();
    throwIfAborted();
    if (!current.ok) return current;
    if (!current.maintenance || current.maintenance.mode === "manual") {
      return { ok: true, changed: false, maintenance: current.maintenance };
    }
    try {
      const previous = validatePolicy(current.maintenance);
      const maintenance = resetPolicy(previous, now());
      throwIfAborted();
      const result = await store.compareAndUpdateMaintenance(previous, maintenance, { signal });
      return result.ok ? { ...result, maintenance: result.conflict ? result.maintenance : maintenance } : result;
    } catch (error) {
      if (errorCode(error) === "CONFIG_OPERATION_CANCELLED") throw error;
      return failed(error);
    }
  }

  async function startupProbe({ mode }: { mode?: string } = {}): Promise<StartupProbe> {
    if (mode !== "tui") return { ok: true, action: "none", reason: "non-tui" };
    const current = await store.read();
    if (!current.ok) return current;
    if (!current.maintenance || current.maintenance.mode === "manual") {
      return { ok: true, action: "none", reason: "manual" };
    }

    let maintenance;
    try {
      maintenance = validatePolicy(current.maintenance);
      if (maintenance.mode === "manual" || !isDue(maintenance, now())) return { ok: true, action: "none", reason: "not-due" };
    } catch (error) {
      return failed(error);
    }

    const dueKey = `${maintenance.mode}:${maintenance.nextDueAt}`;

    return { ok: true, action: "due", dueKey, maintenance };
  }

  return {
    completeCycle,
    preview,
    startupProbe,
    status,
  };
}
