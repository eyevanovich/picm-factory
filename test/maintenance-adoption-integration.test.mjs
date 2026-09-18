import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fixture, harness, oldDue, setAdoptionStatus } from "./helpers/maintenance-extension-harness.mjs";

test("non-adopted adoption completion skips initial maintenance and preserves its schedule", async (t) => {
  for (const [name, adoption] of [
    ["scanned only", { status: "scanned" }],
    ["needs routing", { status: "needs-routing" }],
    ["missing status", undefined],
    ["declined", { status: "declined" }],
    ["cancelled", { status: "cancelled" }],
    ["failed", { status: "failed" }],
    ["malformed status", { status: { value: "adopted" } }],
  ]) {
    await t.test(name, async (t) => {
      const cwd = fixture(t, oldDue("nudge"));
      if (adoption !== undefined) setAdoptionStatus(cwd, adoption);
      const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
      const h = harness();
      const ctx = h.context(cwd, "tui", `post-adoption-${name}`);

      await h.commands.get("picm-adopt").handler("", ctx);
      await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
      await h.scanControl.execute("id", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
      await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
      await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
      const completed = await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

      assert.deepEqual(h.selections, []);
      assert.equal(completed.details.initialMaintenance, "finished");
      assert.equal(completed.details.completed, true);
      assert.equal(completed.details.command, "picm-adopt");
      assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
    });
  }
});

test("already-adopted coding fixtures complete without the initial maintenance selector", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const configPath = join(cwd, ".picm/config.json");
  const codingConfig = JSON.parse(readFileSync(
    new URL("./fixtures/coding-repository/small-service/.picm/config.json", import.meta.url),
    "utf8",
  ));
  codingConfig.maintenance = oldDue("nudge");
  writeFileSync(configPath, `${JSON.stringify(codingConfig, null, 2)}\n`);
  const before = readFileSync(configPath, "utf8");
  const h = harness();
  const ctx = h.context(cwd, "tui", "already-adopted-coding-fixture");

  await h.commands.get("picm-adopt").handler("coding", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: ["private"] }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  const completed = await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

  assert.deepEqual(h.selections, []);
  assert.equal(completed.details.initialMaintenance, "finished");
  assert.equal(readFileSync(configPath, "utf8"), before);
});

test("newly adopted workspaces offer initial maintenance once; Finish preserves the schedule", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: "Finish" });
  const ctx = h.context(cwd, "tui", "post-adoption-finish");

  await h.commands.get("picm-adopt").handler("", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: ["private"] }, undefined, undefined, ctx);
  setAdoptionStatus(cwd, { status: "adopted" });
  const afterAdoption = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  const completed = await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

  assert.deepEqual(h.selections, [{
    title: "Would you like to run an initial maintenance pass now (recommended)?",
    items: ["Run maintenance now", "Finish"],
  }]);
  assert.equal(completed.details.initialMaintenance, "finished");
  assert.equal(completed.details.completed, true);
  assert.equal(completed.details.command, "picm-adopt");
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), afterAdoption);
});

test("initial maintenance offer is persisted before the selector opens", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const entries = [];
  let persistedClaim;
  let interruptedEntries;
  const initial = harness({
    entries,
    selectHandler: () => {
      persistedClaim = entries.at(-1)?.data;
      interruptedEntries = structuredClone(entries);
      return undefined;
    },
  });
  const ctx = initial.context(cwd, "tui", "persisted-initial-maintenance-offer");

  await initial.commands.get("picm-adopt").handler("", ctx);
  await initial.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await initial.scanControl.execute("id", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  setAdoptionStatus(cwd, { status: "adopted" });
  await initial.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await initial.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  await initial.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

  assert.equal(persistedClaim?.status, "authorized");
  assert.equal(persistedClaim?.initialMaintenanceOffered, true);

  const restored = harness({ entries: interruptedEntries, selectResult: "Finish" });
  const restoredCtx = restored.context(cwd, "tui", "persisted-initial-maintenance-offer");
  await restored.handlers.get("session_start")({ reason: "resume" }, restoredCtx);
  await restored.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, restoredCtx);

  assert.deepEqual(restored.selections, []);
});

test("repeated privacy review cannot overwrite the pre-adoption baseline", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: "Finish" });
  const ctx = h.context(cwd, "tui", "post-adoption-repeated-privacy");

  await h.commands.get("picm-adopt").handler("", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: ["private"] }, undefined, undefined, ctx);
  setAdoptionStatus(cwd, { status: "adopted" });
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

  assert.equal(h.selections.length, 1);
  assert.deepEqual(h.selections[0].items, ["Run maintenance now", "Finish"]);
});

test("restoring before privacy preserves the uncaptured adoption baseline", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const entries = [];
  const initial = harness({ entries });
  const initialCtx = initial.context(cwd, "tui", "restored-before-privacy");

  await initial.commands.get("picm-adopt").handler("", initialCtx);
  await initial.scanControl.execute("id", { action: "preflight" }, undefined, undefined, initialCtx);

  const restored = harness({ entries, selectResult: "Finish" });
  const restoredCtx = restored.context(cwd, "tui", "restored-before-privacy");
  await restored.handlers.get("session_start")({ reason: "resume" }, restoredCtx);
  await restored.scanControl.execute("id", { action: "privacy", excludedPaths: [] }, undefined, undefined, restoredCtx);
  setAdoptionStatus(cwd, { status: "adopted" });
  await restored.scanControl.execute("id", { action: "begin" }, undefined, undefined, restoredCtx);
  await restored.scanControl.execute("id", { action: "end" }, undefined, undefined, restoredCtx);
  await restored.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, restoredCtx);

  assert.equal(restored.selections.length, 1);
});

test("declined privacy does not capture the adoption baseline", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ confirm: false });
  const ctx = h.context(cwd, "tui", "declined-adoption-privacy");

  await h.commands.get("picm-adopt").handler("", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute(
    "id",
    { action: "privacy", excludedPaths: ["private"], persist: true },
    undefined,
    undefined,
    ctx,
  );
  setAdoptionStatus(cwd, { status: "adopted" });
  h.setConfirm(true);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

  assert.deepEqual(h.selections, []);
});

test("initial maintenance reuses adoption exclusions, selects strict first, and resets only after maintenance completes", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  let selection = 0;
  const h = harness({
    selectHandler: (title, items) => {
      selection += 1;
      if (selection === 1) {
        assert.equal(title, "Would you like to run an initial maintenance pass now (recommended)?");
        return "Run maintenance now";
      }
      assert.equal(title, "Choose maintenance depth for this run (stored preset will not change)");
      return items[0];
    },
  });
  const ctx = h.context(cwd, "tui", "post-adoption-run");

  await h.commands.get("picm-adopt").handler("", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: ["private"] }, undefined, undefined, ctx);
  setAdoptionStatus(cwd, { status: "adopted" });
  const afterAdoption = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  const started = await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

  assert.equal(started.details.initialMaintenance, "started");
  assert.equal(started.details.command, "picm-maintain");
  assert.equal(started.details.privacyReviewed, true);
  assert.deepEqual(started.details.excludedPaths, ["private"]);
  assert.match(h.sent.at(-1), /Do not repeat preflight or the privacy question/);
  assert.match(h.sent.at(-1), /Initial maintenance run depth: strict/);
  assert.match(h.sent.at(-1), /agent-document optimization.*Default to No/i);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), afterAdoption);

  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "complete" }, undefined, undefined, ctx);
  assert.notEqual(JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8")).maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
});

test("cancelling the initial maintenance depth leaves adoption complete and the schedule unchanged", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  let selection = 0;
  const h = harness({
    selectHandler: () => {
      selection += 1;
      return selection === 1 ? "Run maintenance now" : undefined;
    },
  });
  const ctx = h.context(cwd, "tui", "post-adoption-cancel");

  await h.commands.get("picm-adopt").handler("", ctx);
  await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  setAdoptionStatus(cwd, { status: "adopted" });
  const afterAdoption = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx);
  await h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx);
  const completed = await h.scanControl.execute("id", { action: "adoption-complete" }, undefined, undefined, ctx);

  assert.equal(completed.details.initialMaintenance, "cancelled");
  assert.equal(completed.details.completed, true);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), afterAdoption);
});
