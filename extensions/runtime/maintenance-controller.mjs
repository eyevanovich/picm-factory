import {
  createPolicy,
  isDue,
  resetPolicy,
  validatePolicy,
} from "./maintenance-policy.mjs";

function failed(error) {
  return {
    ok: false,
    code: error?.code ?? "MAINTENANCE_POLICY_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function createMaintenanceController({ store, now = () => new Date() } = {}) {
  if (!store) throw new Error("Maintenance controller requires a config store");

  function preview({ mode = "nudge", intervalValue, intervalUnit } = {}) {
    try {
      const maintenance = createPolicy({ mode, intervalValue, intervalUnit, now: now() });
      return {
        ok: true,
        maintenance,
        patch: { maintenance },
      };
    } catch (error) {
      return failed(error);
    }
  }

  async function applyPolicy(maintenance) {
    try {
      const valid = validatePolicy(maintenance);
      const result = await store.updateMaintenance(valid);
      return result.ok ? { ...result, patch: { maintenance: valid } } : result;
    } catch (error) {
      return failed(error);
    }
  }

  async function apply(input) {
    const decision = preview(input);
    return decision.ok ? applyPolicy(decision.maintenance) : decision;
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

  async function resetExistingCycle({ signal } = {}) {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new Error("PICM_SCAN_ABORTED: operation was cancelled before mutation");
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
      if (error?.message?.startsWith("PICM_SCAN_ABORTED:")) throw error;
      return failed(error);
    }
  }

  async function startupProbe({ mode, seenKeys = new Set() } = {}) {
    if (mode !== "tui") return { ok: true, action: "none", reason: "non-tui" };
    const current = await store.read();
    if (!current.ok) return current;
    if (!current.maintenance || current.maintenance.mode === "manual") {
      return { ok: true, action: "none", reason: "manual" };
    }

    let maintenance;
    try {
      maintenance = validatePolicy(current.maintenance);
      if (!isDue(maintenance, now())) return { ok: true, action: "none", reason: "not-due" };
    } catch (error) {
      return failed(error);
    }

    const dueKey = `${maintenance.mode}:${maintenance.nextDueAt}`;
    if (seenKeys.has(dueKey)) return { ok: true, action: "none", reason: "already-seen", dueKey };

    return { ok: true, action: "due", dueKey, maintenance };
  }

  return {
    apply,
    applyPolicy,
    preview,
    resetExistingCycle,
    startupProbe,
    status,
  };
}
