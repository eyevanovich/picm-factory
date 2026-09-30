import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fixture, harness, oldDue } from "./helpers/maintenance-extension-harness.mjs";

test("due reminder offers Later without changing cadence", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: "Later" });
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.handlers.get("session_start")({}, h.context(cwd));
  assert.deepEqual(h.selections[0], { title: "PiCM maintenance is due", items: ["Run Now", "Later"] });
  assert.equal(h.sent.length, 0);
  assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("Run Now sends an ordinary maintenance request and does not reset cadence", async (t) => {
  const cwd = fixture(t, oldDue("automatic"));
  const h = harness({ selectHandler: (_title, items) => items.includes("Run Now") ? "Run Now" : items[0] });
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.handlers.get("session_start")({}, h.context(cwd));
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0], /Mode: maintain/);
  assert.match(h.sent[0], /One-run depth: strict/);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("failed reminder dialog clears UI and does not advance cadence", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectHandler: () => { throw new Error("synthetic UI failure"); } });
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.handlers.get("session_start")({}, h.context(cwd));
  assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
  assert.equal(h.sent.length, 0);
  assert.match(h.notifications.at(-1).message, /could not be presented/);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});

test("Run Now honors Balanced depth and a dismissed depth leaves cadence due", async (t) => {
  for (const depth of ["balanced", "dismissed"]) {
    await t.test(depth, async (t) => {
      const cwd = fixture(t, oldDue("nudge"));
      const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
      const h = harness({ selectHandler: (_title, items) => items.includes("Run Now") ? "Run Now" :
        depth === "balanced" ? items[1] : undefined });
      await h.handlers.get("session_start")({}, h.context(cwd));
      assert.equal(h.selections.length, 2);
      assert.equal(h.sent.length, depth === "balanced" ? 1 : 0);
      if (depth === "balanced") assert.match(h.sent[0], /One-run depth: balanced/);
      assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
    });
  }
});

test("reload does not re-offer a dismissed reminder in the same session", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: "Later" });
  const ctx = h.context(cwd);
  await h.handlers.get("session_start")({ reason: "startup" }, ctx);
  await h.handlers.get("session_shutdown")({ reason: "reload" }, ctx);
  await h.handlers.get("session_start")({ reason: "reload" }, ctx);
  assert.equal(h.selections.length, 1);
  assert.equal(h.sent.length, 0);
});

test("shutdown only clears reminder presentation", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness({ selectResult: undefined });
  const ctx = h.context(cwd);
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.handlers.get("session_start")({}, ctx);
  await h.handlers.get("session_shutdown")({}, ctx);
  assert.equal(h.widgets.has("picm-maintenance-reminder"), false);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
});
