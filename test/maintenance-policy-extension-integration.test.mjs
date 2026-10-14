import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fixture, harness } from "./helpers/maintenance-extension-harness.mjs";

const details = (result) => JSON.parse(result.content[0].text);

test("maintenance policy configures directly after conversational alignment and preserves unrelated fields", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness();
  const configured = details(await h.tool.execute("configure", {
    action: "configure", mode: "nudge", intervalValue: 2, intervalUnit: "weeks", expectedMaintenance: { mode: "manual" },
  }, undefined, undefined, h.context(cwd)));
  assert.equal(configured.ok, true);
  assert.equal(configured.maintenance.mode, "nudge");
  const config = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
  assert.equal(config.custom, "keep");
  assert.deepEqual(config.maintenance.interval, { value: 2, unit: "weeks" });
});

test("stale policy configuration does not overwrite concurrent settings", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness();
  const configPath = join(cwd, ".picm/config.json");
  const before = readFileSync(configPath, "utf8");
  const result = details(await h.tool.execute("configure-stale", {
    action: "configure", mode: "nudge", intervalValue: 2, intervalUnit: "weeks",
    expectedMaintenance: undefined,
  }, undefined, undefined, h.context(cwd)));
  assert.equal(result.conflict, true);
  assert.equal(result.code, "MAINTENANCE_POLICY_CONFLICT");
  assert.equal(readFileSync(configPath, "utf8"), before);
});

test("policy status projects maintenance and complete does not create or reset manual cadence", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness();
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  const status = details(await h.tool.execute("status", { action: "status" }, undefined, undefined, h.context(cwd)));
  assert.deepEqual(status.maintenance, { mode: "manual" });
  const completed = details(await h.tool.execute("complete", { action: "complete" }, undefined, undefined, h.context(cwd)));
  assert.equal(completed.changed, false);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);

  writeFileSync(join(cwd, ".picm/config.json"), JSON.stringify({ version: 1, opaque: { secret: "not projected" } }));
  const absent = details(await h.tool.execute("complete-absent", { action: "complete" }, undefined, undefined, h.context(cwd)));
  assert.equal(absent.changed, false);
});

test("settings serializes absent exclusions explicitly and updates the observed state", async (t) => {
  for (const [name, config, expectedPrivacy] of [
    ["missing config", undefined, null],
    ["missing privacy", { custom: "keep" }, null],
    ["legacy privacy", { custom: "keep", privacy: { owner: "preserve" } }, null],
    ["stored empty exclusions", { custom: "keep", privacy: { excludedPaths: [] } }, { excludedPaths: [] }],
  ]) {
    await t.test(name, async (t) => {
      const cwd = fixture(t);
      const h = harness();
      const path = join(cwd, ".picm/config.json");
      if (config === undefined) rmSync(path);
      else writeFileSync(path, JSON.stringify(config));

      const status = details(await h.settings.execute("status", { action: "status" }, undefined, undefined, h.context(cwd)));
      assert.deepEqual(status, { ok: true, exists: config !== undefined, privacy: expectedPrivacy });
      const updated = details(await h.settings.execute("set", {
        action: "set-exclusions",
        excludedPaths: ["private"],
        ...(status.privacy === null ? {} : { expectedExcludedPaths: status.privacy.excludedPaths }),
      }, undefined, undefined, h.context(cwd)));
      assert.equal(updated.changed, true);
      const saved = JSON.parse(readFileSync(path, "utf8"));
      assert.deepEqual(saved.privacy, { ...config?.privacy, excludedPaths: ["private"] });
      if (config) assert.equal(saved.custom, "keep");
    });
  }
});

test("settings distinguishes concurrent absent and empty exclusion states", async (t) => {
  for (const [initialPrivacy, concurrentPrivacy] of [[undefined, { excludedPaths: [] }], [{ excludedPaths: [] }, undefined]]) {
    const cwd = fixture(t);
    const h = harness();
    const path = join(cwd, ".picm/config.json");
    writeFileSync(path, JSON.stringify({ privacy: initialPrivacy }));
    const status = details(await h.settings.execute("status", { action: "status" }, undefined, undefined, h.context(cwd)));
    writeFileSync(path, JSON.stringify({ custom: "concurrent", privacy: concurrentPrivacy }));
    const before = readFileSync(path, "utf8");
    const result = details(await h.settings.execute("stale", {
      action: "set-exclusions",
      excludedPaths: ["private"],
      ...(status.privacy === null ? {} : { expectedExcludedPaths: status.privacy.excludedPaths }),
    }, undefined, undefined, h.context(cwd)));
    assert.equal(result.conflict, true);
    assert.equal(readFileSync(path, "utf8"), before);
  }
});

test("settings projects exclusions and reports a stale conditional update without mutation", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness();
  const configPath = join(cwd, ".picm/config.json");
  writeFileSync(configPath, JSON.stringify({ custom: { keep: true }, privacy: { excludedPaths: ["private"], opaque: "preserve" } }));
  const status = details(await h.settings.execute("status", { action: "status" }, undefined, undefined, h.context(cwd)));
  assert.deepEqual(status, { ok: true, exists: true, privacy: { excludedPaths: ["private"] } });
  assert.equal(JSON.stringify(status).includes("opaque"), false);

  const conflict = details(await h.settings.execute("stale", {
    action: "set-exclusions", expectedExcludedPaths: ["other"], excludedPaths: ["next"],
  }, undefined, undefined, h.context(cwd)));
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.code, "PRIVACY_POLICY_CONFLICT");
  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")).privacy, { excludedPaths: ["private"], opaque: "preserve" });
});
