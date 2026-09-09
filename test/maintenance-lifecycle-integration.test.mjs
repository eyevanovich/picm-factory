import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as promiseFs from "node:fs/promises";
import { join } from "node:path";

import { createMaintenanceConfigStore } from "../extensions/runtime/maintenance-config-store.mjs";
import { createRuntimeCoordinator } from "../extensions/runtime/runtime-coordinator.mjs";

import { fixture, harness, nonGitFixture, oldDue } from "./helpers/maintenance-extension-harness.mjs";

test("when maintenance is due in TUI, renders persistent reminder widget and presents Run Now and Defer selector", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: undefined });
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.handlers.get("session_start")({}, h.context(cwd));

  assert.equal(h.widgets.has("picm-maintenance-reminder"), true);
  assert.match(h.widgets.get("picm-maintenance-reminder").lines[0], /PiCM maintenance is due/);
  assert.equal(h.selections.length, 1);
  assert.deepEqual(h.selections[0], {
    title: "PiCM maintenance is due. Choose an action:",
    items: ["Run Now", "Defer"],
  });
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("Defer dismisses reminder for session, notifies, appends deferral entry, does not change timestamps", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: "Defer" });
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.handlers.get("session_start")({}, h.context(cwd));

  assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].message, "Maintenance deferred. PiCM will ask again when you start a new session.");
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  assert.equal(h.entries.some((e) => e.customType === "picm-maintenance-due" && e.data?.action === "defer"), true);

  // Reload/resume of the same conversation remains deferred
  h.selections.length = 0;
  h.notifications.length = 0;
  await h.handlers.get("session_start")({ reason: "reload" }, h.context(cwd));
  assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
  assert.equal(h.selections.length, 0);

  // A fresh session prompts again
  const fresh = harness({ selectResult: "Defer" });
  await fresh.handlers.get("session_start")({}, fresh.context(cwd, "tui", "fresh-session"));
  assert.equal(fresh.selections.length, 1);
  assert.equal(fresh.notifications[0].message, "Maintenance deferred. PiCM will ask again when you start a new session.");
});

test("closing selector without choosing leaves reminder widget visible and does not defer or change timestamps", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: undefined });
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.handlers.get("session_start")({}, h.context(cwd));

  assert.equal(h.widgets.has("picm-maintenance-reminder"), true);
  assert.equal(h.entries.some((e) => e.customType === "picm-maintenance-due"), false);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("Run Now without waitForIdle prompts depth selection, starts maintenance flow, and advances timestamps only upon completion", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  let selectionStep = 0;
  const h = harness({
    selectHandler: (title, items) => {
      selectionStep += 1;
      if (selectionStep === 1) {
        assert.equal(title, "PiCM maintenance is due. Choose an action:");
        return "Run Now";
      }
      if (selectionStep === 2) {
        assert.equal(title, "Choose maintenance depth for this run (stored preset will not change)");
        return items[0]; // Strict
      }
      return items[0];
    },
  });
  const ctx = h.context(cwd);
  delete ctx.waitForIdle;
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.handlers.get("session_start")({}, ctx);

  assert.equal(h.selections.length, 2);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0], /Mode: maintain/);
  assert.match(h.sent[0], /Maintenance run depth: strict/);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);

  // Preflight and privacy do not advance timestamps yet
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: [], persist: false }, undefined, undefined, ctx);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);

  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);

  // Complete advances timestamps and clears due reminder widget
  const complete = await h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(complete.details.completed, true);
  assert.equal(complete.details.maintenanceReset.ok, true);
  assert.equal(complete.details.maintenanceReset.changed, true);
  assert.equal(h.widgets.has("picm-maintenance-reminder"), false);

  const after = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
  assert.notEqual(after.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
});

test("Run Now cancelled at depth selection leaves reminder visible and does not authorize or reset", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  let selectionStep = 0;
  const h = harness({
    selectHandler: (_title, items) => {
      selectionStep += 1;
      if (selectionStep === 1) return "Run Now";
      return undefined; // Escape on depth selection
    },
  });
  const ctx = h.context(cwd);
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.handlers.get("session_start")({}, ctx);

  assert.equal(h.selections.length, 2);
  assert.equal(h.sent.length, 0);
  assert.equal(h.notifications.length, 1);
  assert.match(h.notifications[0].message, /PiCM maintenance cancelled before scan authorization/);
  assert.equal(h.widgets.has("picm-maintenance-reminder"), true);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("Maintenance failure or cancellation before complete leaves maintenance due", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness();
  const ctx = h.context(cwd);
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.commands.get("picm-maintain").handler("strict", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: [], persist: false }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);

  // Settlement without complete leaves timestamps unchanged
  await h.handlers.get("agent_settled")({}, ctx);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("completion requires the ordinary privacy-reviewed scan flow", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness();
  const ctx = h.context(cwd);
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.commands.get("picm-maintain").handler("strict", ctx);
  await assert.rejects(
    h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx),
    /PICM_PREFLIGHT_INCOMPLETE/,
  );
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await assert.rejects(
    h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx),
    /PICM_PRIVACY_NOT_REVIEWED/,
  );
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: [], persist: false }, undefined, undefined, ctx);
  await assert.rejects(
    h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx),
    /PICM_SCAN_NOT_STARTED/,
  );
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await assert.rejects(
    h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx),
    /PICM_SCAN_NOT_SETTLED/,
  );

  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  assert.equal(h.entries.some((entry) => entry.data.status === "completed"), false);
});

test("a maintenance reset conflict leaves the losing workflow incomplete with recovery guidance", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness();
  const first = h.context(cwd, "tui", "first-maintenance-session");
  const second = h.context(cwd, "tui", "second-maintenance-session");

  for (const ctx of [first, second]) {
    await h.commands.get("picm-maintain").handler("strict", ctx);
    await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
    await h.scanControl.execute("id", { action: "privacy", excludedPaths: [], persist: false }, undefined, undefined, ctx);
    await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  }

  const results = await Promise.all([
    h.scanControl.execute("first", { action: "complete" }, undefined, undefined, first),
    h.scanControl.execute("second", { action: "complete" }, undefined, undefined, second),
  ]);
  const failed = results.find((result) => !result.details.ok);
  assert.equal(results.filter((result) => result.details.ok).length, 1);
  assert.equal(failed.details.code, "MAINTENANCE_POLICY_CONFLICT");
  assert.match(failed.details.warning, /Maintenance cycle was not reset/);
  assert.match(failed.details.warning, /Resolve the configuration conflict or error, then retry picm_scan_control complete/);
  assert.match(h.notifications.at(-1).message, /Maintenance cycle was not reset/);

  const incomplete = results[0].details.ok ? second : first;
  await h.scanControl.execute("begin", { action: "begin" }, undefined, undefined, incomplete);
  const status = await h.scanControl.execute("status", { action: "status" }, undefined, undefined, incomplete);
  assert.equal(status.details.completed, false);
  assert.equal(status.details.maintenanceResetAttempted, false);
});

test("an already-aborted maintenance completion leaves the scheduled cycle and workflow unchanged", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness();
  const ctx = h.context(cwd, "tui", "aborted-maintenance-session");
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  h.widgets.set("picm-maintenance-reminder", { lines: ["PiCM maintenance is due"] });

  await h.commands.get("picm-maintain").handler("strict", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: [], persist: false }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);

  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    h.scanControl.execute("id", { action: "complete" }, abort.signal, undefined, ctx),
    /PICM_SCAN_ABORTED/,
  );

  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  assert.equal(h.widgets.has("picm-maintenance-reminder"), true);
  await h.scanControl.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  const status = await h.scanControl.execute("status", { action: "status" }, undefined, undefined, ctx);
  assert.equal(status.details.completed, false);
  assert.equal(status.details.maintenanceResetAttempted, false);
});

for (const failDirectorySync of [false, true]) {
  test(`an abort after config publication completes maintenance${failDirectorySync ? " with a durability warning" : ""}`, async (t) => {
    const cwd = fixture(t, oldDue("nudge"));
    const abort = new AbortController();
    let publications = 0;
    const renamingFs = {
      ...promiseFs,
      async rename(from, to) {
        await promiseFs.rename(from, to);
        if (from.includes(".tmp-")) {
          publications += 1;
          abort.abort();
        }
      },
      async open(path, flags, mode) {
        const handle = await promiseFs.open(path, flags, mode);
        if (failDirectorySync && path === join(cwd, ".picm") && flags === "r") {
          return {
            async sync() { throw new Error("synthetic directory sync failure"); },
            async close() { await handle.close(); },
          };
        }
        return handle;
      },
    };
    const h = harness({
      extensionOptions: {
        createCoordinator: (options) => createRuntimeCoordinator({
          ...options,
          createConfigStore: (storeOptions) => createMaintenanceConfigStore({ ...storeOptions, fs: renamingFs }),
        }),
      },
    });
    const ctx = h.context(cwd, "tui", "rename-abort-maintenance-session");
    h.widgets.set("picm-maintenance-reminder", { lines: ["PiCM maintenance is due"] });

    await h.commands.get("picm-maintain").handler("strict", ctx);
    await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
    await h.scanControl.execute("id", { action: "privacy", excludedPaths: [], persist: false }, undefined, undefined, ctx);
    await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);

    const result = await h.scanControl.execute("id", { action: "complete" }, abort.signal, undefined, ctx);
    assert.equal(abort.signal.aborted, true);
    assert.equal(result.details.completed, true);
    assert.equal(result.details.maintenanceResetAttempted, true);
    assert.equal(result.details.maintenanceReset.ok, true);
    assert.equal(result.details.maintenanceReset.committed, true);
    assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
    assert.equal(h.entries.some((entry) => entry.data.status === "completed"), true);
    assert.deepEqual(
      JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8")).maintenance,
      result.details.maintenanceReset.maintenance,
    );
    assert.notEqual(result.details.maintenanceReset.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
    if (failDirectorySync) {
      assert.equal(result.details.maintenanceReset.code, "CONFIG_COMMITTED_SYNC_FAILED");
      assert.match(result.content[0].text, /synthetic directory sync failure/);
    }

    const repeated = await h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
    assert.equal(repeated.details.completed, true);
    assert.equal(publications, 1);
  });
}

test("a committed reset cannot complete a replacement workflow", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const abort = new AbortController();
  let coordinator;
  let ctx;
  const h = harness({
    extensionOptions: {
      createCoordinator: (options) => {
        coordinator = createRuntimeCoordinator({
          ...options,
          createConfigStore: (storeOptions) => createMaintenanceConfigStore({
            ...storeOptions,
            fs: {
              ...promiseFs,
              async rename(from, to) {
                await promiseFs.rename(from, to);
                if (from.includes(".tmp-")) {
                  coordinator.authorizeWorkflow(ctx, "picm-adopt");
                  abort.abort();
                }
              },
            },
          }),
        });
        return coordinator;
      },
    },
  });
  ctx = h.context(cwd, "tui", "replaced-maintenance-session");
  h.widgets.set("picm-maintenance-reminder", { lines: ["PiCM maintenance is due"] });
  await h.commands.get("picm-maintain").handler("strict", ctx);
  for (const action of ["preflight", "privacy", "begin", "end"]) {
    const params = action === "privacy" ? { action, excludedPaths: [] } : { action };
    await h.scanControl.execute(action, params, undefined, undefined, ctx);
  }

  await assert.rejects(
    h.scanControl.execute("complete", { action: "complete" }, abort.signal, undefined, ctx),
    /PICM_SCAN_STALE/,
  );
  assert.notEqual(
    JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8")).maintenance.lastCycleAt,
    "2020-01-01T00:00:00.000Z",
  );
  assert.equal(h.widgets.has("picm-maintenance-reminder"), true);
  assert.equal(h.entries.some((entry) => entry.data.status === "completed"), false);
  const status = await h.scanControl.execute("status", { action: "status" }, undefined, undefined, ctx);
  assert.equal(status.details.command, "picm-adopt");
  assert.equal(status.details.completed, false);
});

test("Legacy automatic and nudge modes both present the reminder selector rather than auto-dispatching", async (t) => {
  for (const mode of ["automatic", "nudge"]) {
    const cwd = fixture(t, oldDue(mode));
    const h = harness({ selectResult: undefined });
    const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

    await h.handlers.get("session_start")({}, h.context(cwd));

    assert.equal(h.widgets.has("picm-maintenance-reminder"), true);
    assert.equal(h.selections.length, 1);
    assert.deepEqual(h.selections[0], {
      title: "PiCM maintenance is due. Choose an action:",
      items: ["Run Now", "Defer"],
    });
    assert.equal(h.sent.length, 0);
    assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  }
});

test("UI resources are cleaned up on session shutdown", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: undefined });
  const ctx = h.context(cwd);

  await h.handlers.get("session_start")({}, ctx);
  assert.equal(h.widgets.has("picm-maintenance-reminder"), true);

  await h.handlers.get("session_shutdown")({}, ctx);
  assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
});

test("non-TUI startup is a no-op for print, json, and rpc", async (t) => {
  for (const mode of ["print", "json", "rpc"]) {
    const cwd = fixture(t, oldDue("automatic"));
    const h = harness();
    const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
    await h.handlers.get("session_start")({}, h.context(cwd, mode));
    assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
    assert.equal(h.sent.length, 0);
    assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
  }
});

test("only completed maintenance resets scheduled cycles", async (t) => {
  for (const command of ["picm-new", "picm-adopt", "picm-maintain"]) {
    const cwd = fixture(t, oldDue("nudge"));
    const h = harness();
    const ctx = h.context(cwd);
    const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
    await h.commands.get(command).handler(command === "picm-maintain" ? "strict" : "", ctx);
    assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
    await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
    assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
    await h.scanControl.execute(
      "id",
      { action: "privacy", excludedPaths: [], persist: false },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
    await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
    await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
    const complete = await h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
    assert.equal(complete.details.completed, true);
    const config = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
    if (command === "picm-maintain") {
      assert.notEqual(config.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
    } else {
      assert.equal(config.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
    }
  }
  const helpCwd = fixture(t, oldDue("nudge"));
  const help = harness();
  const before = readFileSync(join(helpCwd, ".picm/config.json"), "utf8");
  await help.commands.get("picm-help").handler("", help.context(helpCwd));
  assert.equal(readFileSync(join(helpCwd, ".picm/config.json"), "utf8"), before);
});

test("optimization privacy review and complete do not reset maintenance cadence", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness();
  const ctx = h.context(cwd, "tui", "optimize-no-reset-session");
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.commands.get("picm-optimize").handler("", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  const privacy = await h.scanControl.execute(
    "id",
    { action: "privacy", excludedPaths: [], persist: false },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(privacy.details.command, "picm-optimize");
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);

  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  const complete = await h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(complete.details.completed, true);
  assert.equal(complete.details.maintenanceReset, undefined);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("maintenance reset is skipped when privacy is declined, incomplete, cancelled, or unproven on restore", async (t) => {
  const declinedCwd = fixture(t, oldDue("nudge"));
  const declined = harness({ confirm: false });
  const declinedCtx = declined.context(declinedCwd, "tui", "declined-reset-session");
  const declinedBefore = readFileSync(join(declinedCwd, ".picm/config.json"), "utf8");
  await declined.commands.get("picm-adopt").handler("", declinedCtx);
  await declined.scanControl.execute("id", { action: "preflight" }, undefined, undefined, declinedCtx);
  const privacy = await declined.scanControl.execute(
    "id",
    { action: "privacy", excludedPaths: ["private"], persist: true },
    undefined,
    undefined,
    declinedCtx,
  );
  assert.equal(privacy.details.code, "PRIVACY_APPLY_DECLINED");
  assert.equal(readFileSync(join(declinedCwd, ".picm/config.json"), "utf8"), declinedBefore);

  const cancelledCwd = fixture(t, oldDue("nudge"));
  const cancelled = harness();
  const cancelledCtx = cancelled.context(cancelledCwd, "tui", "cancelled-reset-session");
  const cancelledBefore = readFileSync(join(cancelledCwd, ".picm/config.json"), "utf8");
  await cancelled.commands.get("picm-maintain").handler("strict", cancelledCtx);
  await cancelled.scanControl.execute("id", { action: "preflight" }, undefined, undefined, cancelledCtx);
  await cancelled.commands.get("picm-help").handler("", cancelledCtx);
  assert.equal(readFileSync(join(cancelledCwd, ".picm/config.json"), "utf8"), cancelledBefore);

  const restoredCwd = fixture(t, oldDue("nudge"));
  const restoredBefore = readFileSync(join(restoredCwd, ".picm/config.json"), "utf8");
  const restored = harness({ entries: [{
    type: "custom",
    customType: "picm-scan-workflow",
    data: {
      status: "authorized",
      cwd: restoredCwd,
      command: "picm-maintain",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      privacyReviewed: true,
      scanStarted: true,
      maintenanceResetAttempted: true,
      excludedPaths: [],
    },
  }] });
  const restoredCtx = restored.context(restoredCwd, "tui", "legacy-restore-session");
  await restored.handlers.get("session_start")({ reason: "resume" }, restoredCtx);
  const status = await restored.scanControl.execute("id", { action: "status" }, undefined, undefined, restoredCtx);
  assert.equal(status.details.preflightComplete, false);
  assert.equal(status.details.privacyReviewed, false);
  assert.equal(status.details.maintenanceResetAttempted, false);
  await assert.rejects(
    restored.scanControl.execute("id", { action: "begin" }, undefined, undefined, restoredCtx),
    /PICM_PREFLIGHT_INCOMPLETE/,
  );
  assert.equal(readFileSync(join(restoredCwd, ".picm/config.json"), "utf8"), restoredBefore);
});

test("non-Git command startup and preflight do not read maintenance config or create Git metadata", async (t) => {
  const cwd = nonGitFixture(t, oldDue("nudge"));
  const h = harness();
  const ctx = h.context(cwd, "tui", "non-git-privacy-order-session");
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");

  await h.commands.get("picm-maintain").handler("strict", ctx);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  assert.equal(existsSync(join(cwd, ".git")), false);

  const preflight = await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  assert.equal(preflight.details.gitRepository, false);
  assert.equal(preflight.details.preflightComplete, true);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  assert.equal(existsSync(join(cwd, ".git")), false);

  await h.scanControl.execute(
    "id",
    { action: "privacy", excludedPaths: [], persist: false },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  assert.equal(existsSync(join(cwd, ".git")), false);

  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  const inventory = await h.scanControl.execute("id", { action: "inventory" }, undefined, undefined, ctx);
  assert.equal(inventory.details.isolated, true);
  assert.equal(inventory.details.candidates.includes("safe.txt"), true);
  assert.equal(existsSync(join(cwd, ".git")), false);

  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
  const reset = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
  assert.notEqual(reset.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
});
