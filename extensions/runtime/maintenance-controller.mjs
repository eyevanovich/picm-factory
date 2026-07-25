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

  function preview({ mode, intervalValue, intervalUnit } = {}) {
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

  async function resetExistingCycle() {
    const current = await store.read();
    if (!current.ok) return current;
    if (!current.maintenance || current.maintenance.mode === "manual") {
      return { ok: true, changed: false, maintenance: current.maintenance };
    }
    try {
      const previous = validatePolicy(current.maintenance);
      const maintenance = resetPolicy(previous, now());
      const result = await store.compareAndUpdateMaintenance(previous, maintenance);
      return result.ok ? { ...result, maintenance: result.conflict ? result.maintenance : maintenance } : result;
    } catch (error) {
      return failed(error);
    }
  }

  async function claimAutomaticCycle(previous) {
    try {
      const expected = validatePolicy(previous);
      if (expected.mode !== "automatic") {
        return failed(Object.assign(new Error("only automatic policies can be claimed"), { code: "INVALID_CLAIM_MODE" }));
      }
      const replacement = resetPolicy(expected, now());
      const result = await store.compareAndUpdateMaintenance(expected, replacement);
      if (!result.ok) return result;
      if (result.conflict) {
        return {
          ok: true,
          claimed: false,
          changed: false,
          code: "MAINTENANCE_ALREADY_CLAIMED",
          reason: "already-claimed",
          maintenance: result.maintenance,
        };
      }
      return {
        ...result,
        claimed: true,
        previousMaintenance: expected,
        replacementMaintenance: replacement,
        maintenance: replacement,
      };
    } catch (error) {
      return failed(error);
    }
  }

  async function rollbackAutomaticClaim({ previousMaintenance, replacementMaintenance } = {}) {
    try {
      const previous = validatePolicy(previousMaintenance);
      const replacement = validatePolicy(replacementMaintenance);
      const result = await store.compareAndUpdateMaintenance(replacement, previous);
      if (!result.ok) return result;
      if (result.conflict) {
        return {
          ok: true,
          rolledBack: false,
          changed: false,
          code: "MAINTENANCE_ROLLBACK_CONFLICT",
          reason: "claim-changed",
          maintenance: result.maintenance,
        };
      }
      return { ...result, rolledBack: true, maintenance: previous };
    } catch (error) {
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

    if (maintenance.mode === "nudge") {
      seenKeys.add(dueKey);
      return { ok: true, action: "notify", dueKey, maintenance };
    }

    const claim = await claimAutomaticCycle(maintenance);
    if (!claim.ok) return claim;
    if (!claim.claimed) {
      return { ...claim, action: "none", dueKey };
    }
    return { ok: true, action: "dispatch", dueKey, maintenance: claim.maintenance, claim };
  }

  return {
    apply,
    applyPolicy,
    claimAutomaticCycle,
    preview,
    resetExistingCycle,
    rollbackAutomaticClaim,
    startupProbe,
    status,
  };
}
