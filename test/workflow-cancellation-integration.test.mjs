import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fixture, harness, oldDue } from "./helpers/maintenance-extension-harness.mjs";

async function control(h, ctx, action) {
  const input = { action, ...(action === "privacy" ? { excludedPaths: ["private"] } : {}) };
  const blocked = await h.handlers.get("tool_call")({ toolCallId: action, toolName: "picm_scan_control", input }, ctx);
  assert.equal(blocked, undefined, blocked?.reason);
  return (await h.scanControl.execute(action, input, undefined, undefined, ctx)).details;
}

for (const command of ["picm-new", "picm-adopt", "picm-maintain", "picm-optimize"]) {
  for (const actions of [[], ["preflight"], ["preflight", "privacy", "begin"], ["preflight", "privacy", "begin", "end"]]) {
    test(`${command} cancellation after ${actions.at(-1) ?? "authorization"} clears authority without completing maintenance`, async (t) => {
      const cwd = fixture(t, oldDue("nudge"));
      const entries = [];
      const h = harness({ entries });
      const ctx = h.context(cwd);
      const config = readFileSync(join(cwd, ".picm/config.json"), "utf8");
      h.widgets.set("picm-maintenance-reminder", { lines: ["Maintenance due"] });
      await h.commands.get(command).handler("", ctx);
      for (const action of actions) await control(h, ctx, action);
      if (!actions.includes("privacy")) {
        await assert.rejects(control(h, ctx, "complete"), actions.length ? /PICM_PRIVACY_NOT_REVIEWED/ : /PICM_PREFLIGHT_INCOMPLETE/);
      }
      const cancelled = await control(h, ctx, "cancel");
      assert.equal(cancelled.cancelled, true);
      assert.equal(cancelled.authorized, false);
      assert.equal(cancelled.completed, false);
      assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), config);
      assert.equal(h.widgets.has("picm-maintenance-reminder"), true);
      assert.equal(entries.at(-1).data.status, "cleared");
      assert.equal((await control(h, ctx, "cancel")).cancelled, true);
      await assert.rejects(control(h, ctx, "begin"), /PICM_SCAN_NOT_AUTHORIZED/);
      await h.handlers.get("agent_settled")({}, ctx);
      const restored = harness({ entries, selectResult: "Defer" });
      const restoredCtx = restored.context(cwd);
      await restored.handlers.get("session_start")({}, restoredCtx);
      await assert.rejects(control(restored, restoredCtx, "begin"), /PICM_SCAN_NOT_AUTHORIZED/);
      assert.equal(await restored.handlers.get("tool_call")({ toolName: "read", input: { path: ".env" } }, restoredCtx), undefined);
      assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), config);
    });
  }
}

test("cancellation after completed maintenance preserves and accurately describes the committed cycle", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness();
  const ctx = h.context(cwd);
  await h.commands.get("picm-maintain").handler("strict", ctx);
  for (const action of ["preflight", "privacy", "begin", "end", "complete"]) await control(h, ctx, action);
  const completedConfig = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  assert.notEqual(JSON.parse(completedConfig).maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
  const cancelled = await control(h, ctx, "cancel");
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), completedConfig);
  assert.match(cancelled.message, /Completed changes remain; cancellation does not record maintenance completion/);
  assert.doesNotMatch(cancelled.message, /was not recorded/);
});
