import test from "node:test";
import assert from "node:assert/strict";
import { createMaintenanceController } from "../extensions/runtime/maintenance-controller.mjs";
import { createPolicy } from "../extensions/runtime/maintenance-policy.mjs";

function memoryStore(maintenance, extra = { custom: true }) {
  let config = maintenance === undefined ? extra : { ...extra, maintenance };
  return {
    async read() { return { ok: true, exists: true, config, maintenance: config.maintenance }; },
    async updateMaintenance(next) {
      config = { ...config, maintenance: next };
      return { ok: true, changed: true, exists: true, config, maintenance: next };
    },
    async compareAndUpdateMaintenance(expected, next) {
      if (JSON.stringify(config.maintenance) !== JSON.stringify(expected)) {
        return { ok: true, changed: false, conflict: true, maintenance: config.maintenance };
      }
      config = { ...config, maintenance: next };
      return { ok: true, changed: true, exists: true, config, maintenance: next };
    },
    current() { return config; },
  };
}

test("preview returns exact deterministic patch and apply preserves store fields", async () => {
  const store = memoryStore(undefined);
  const controller = createMaintenanceController({ store, now: () => new Date("2026-01-31T12:00:00.000Z") });
  const preview = controller.preview({ mode: "nudge", intervalValue: 1, intervalUnit: "months" });
  assert.deepEqual(preview.patch, { maintenance: {
    mode: "nudge",
    interval: { value: 1, unit: "months" },
    lastCycleAt: "2026-01-31T12:00:00.000Z",
    nextDueAt: "2026-02-28T12:00:00.000Z",
  } });
  assert.equal((await controller.apply({ mode: "manual" })).ok, true);
  assert.deepEqual(store.current(), { custom: true, maintenance: { mode: "manual" } });
});

test("startup probe handles absent, manual, not-due, nudge, automatic, and dedupe", async () => {
  const dueNudge = createPolicy({ mode: "nudge", intervalValue: 1, intervalUnit: "days", now: "2026-01-01T00:00:00.000Z" });
  const now = () => new Date("2026-01-02T00:00:00.000Z");
  assert.equal((await createMaintenanceController({ store: memoryStore(undefined), now }).startupProbe({ mode: "tui" })).reason, "manual");
  assert.equal((await createMaintenanceController({ store: memoryStore({ mode: "manual" }), now }).startupProbe({ mode: "tui" })).reason, "manual");
  assert.equal((await createMaintenanceController({ store: memoryStore(dueNudge), now }).startupProbe({ mode: "print" })).reason, "non-tui");

  const seen = new Set();
  const nudgeController = createMaintenanceController({ store: memoryStore(dueNudge), now });
  const nudge = await nudgeController.startupProbe({ mode: "tui", seenKeys: seen });
  assert.equal(nudge.action, "due");
  seen.add(nudge.dueKey);
  assert.equal((await nudgeController.startupProbe({ mode: "tui", seenKeys: seen })).reason, "already-seen");

  const future = createPolicy({ mode: "nudge", intervalValue: 2, intervalUnit: "days", now: "2026-01-01T00:00:00.000Z" });
  assert.equal((await createMaintenanceController({ store: memoryStore(future), now }).startupProbe({ mode: "tui" })).reason, "not-due");

  const automatic = createPolicy({ mode: "automatic", intervalValue: 1, intervalUnit: "days", now: "2026-01-01T00:00:00.000Z" });
  const autoStore = memoryStore(automatic);
  const auto = await createMaintenanceController({ store: autoStore, now }).startupProbe({ mode: "tui", seenKeys: new Set() });
  assert.equal(auto.action, "due");
  assert.equal(autoStore.current().maintenance.lastCycleAt, "2026-01-01T00:00:00.000Z");
  assert.equal(autoStore.current().maintenance.nextDueAt, "2026-01-02T00:00:00.000Z");
});

test("explicit cycle reset affects scheduled modes but not manual", async () => {
  const scheduledStore = memoryStore(createPolicy({ mode: "nudge", intervalValue: 1, intervalUnit: "weeks", now: "2026-01-01T00:00:00.000Z" }));
  const controller = createMaintenanceController({ store: scheduledStore, now: () => new Date("2026-01-10T00:00:00.000Z") });
  assert.equal((await controller.resetExistingCycle()).changed, true);
  assert.equal(scheduledStore.current().maintenance.nextDueAt, "2026-01-17T00:00:00.000Z");

  const manualStore = memoryStore({ mode: "manual" });
  assert.equal((await createMaintenanceController({ store: manualStore }).resetExistingCycle()).changed, false);
});
