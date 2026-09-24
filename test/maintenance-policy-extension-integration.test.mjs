import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fixture, harness } from "./helpers/maintenance-extension-harness.mjs";

test("policy tool applies the exact accepted confirmation", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness({ confirm: true });
  const applied = await h.tool.execute(
    "id",
    { action: "apply", mode: "nudge", intervalValue: 2, intervalUnit: "weeks" },
    undefined,
    undefined,
    h.context(cwd),
  );
  assert.equal(applied.details.ok, true);
  const config = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
  assert.deepEqual(config.maintenance, applied.details.patch.maintenance);
  assert.equal(config.maintenance.mode, "nudge");
  assert.deepEqual(config.maintenance.interval, { value: 2, unit: "weeks" });
});

test("one-day policy preview is no-write and its accepted handoff applies exactly once", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness({ confirm: false });
  const beforePreview = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  const preview = await h.tool.execute(
    "id",
    { action: "preview", mode: "nudge", intervalValue: 1, intervalUnit: "days" },
    undefined,
    undefined,
    h.context(cwd),
  );
  assert.match(preview.details.previewId, /^picm-maintenance-preview:[0-9a-f-]+$/);
  assert.deepEqual(preview.details.maintenance.interval, { value: 1, unit: "days" });
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), beforePreview);
  assert.deepEqual(JSON.parse(preview.content[0].text), {
    previewId: preview.details.previewId,
    expiresAt: preview.details.expiresAt,
    patch: preview.details.patch,
  });
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  const declined = await h.tool.execute(
    "id",
    { action: "apply", previewId: preview.details.previewId },
    undefined,
    undefined,
    h.context(cwd),
  );
  assert.equal(declined.details.code, "MAINTENANCE_APPLY_DECLINED");
  assert.equal(declined.details.previewRetained, true);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);

  h.setConfirm(true);
  const applied = await h.tool.execute(
    "id",
    { action: "apply", previewId: preview.details.previewId },
    undefined,
    undefined,
    h.context(cwd),
  );
  assert.deepEqual(applied.details.patch, preview.details.patch);
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8")).maintenance, preview.details.maintenance);
  assert.equal(
    h.confirmations.at(-1).message,
    `Exact .picm/config.json patch:\n${JSON.stringify(preview.details.patch, null, 2)}`,
  );
  await assert.rejects(
    h.tool.execute("id", { action: "apply", previewId: preview.details.previewId }, undefined, undefined, h.context(cwd)),
    /MAINTENANCE_PREVIEW_EXPIRED/,
  );
});

test("policy guidance requires a no-write complete summary before its exact confirmation", () => {
  const h = harness();
  const guidance = h.tool.promptGuidelines.join("\n");
  for (const category of [
    "affected files and operations",
    "behavior or configuration changes",
    "linked moves",
    "preserved behavior",
    "known uncertainty",
    "review suggestions (or None)",
    "privacy/configuration impact",
  ]) assert.ok(guidance.includes(category), `missing ${category}`);
  assert.match(guidance, /one-day cadence/);
  assert.match(guidance, /durably records reminder timestamps/);
  assert.match(guidance, /nothing runs while Pi is closed/);
  assert.match(guidance, /summary acceptance without calling apply or writing/);
  assert.match(guidance, /exact TUI patch confirmation remains the separate runtime write confirmation/);
});

test("policy preview handoff remains available after an apply failure", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness();
  const preview = await h.tool.execute(
    "id",
    { action: "preview", mode: "nudge", intervalValue: 2, intervalUnit: "days" },
    undefined,
    undefined,
    h.context(cwd),
  );
  writeFileSync(join(cwd, ".gitignore"), ".picm/config.json\n");
  await assert.rejects(
    h.tool.execute("id", { action: "apply", previewId: preview.details.previewId }, undefined, undefined, h.context(cwd)),
    /ignored|CONFIG/i,
  );
  writeFileSync(join(cwd, ".gitignore"), "");
  const applied = await h.tool.execute(
    "id",
    { action: "apply", previewId: preview.details.previewId },
    undefined,
    undefined,
    h.context(cwd),
  );
  assert.equal(applied.details.ok, true);
  assert.deepEqual(applied.details.patch, preview.details.patch);
});

test("policy preview identifiers cannot cross cwd and direct apply remains compatible", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const otherCwd = fixture(t, { mode: "manual" });
  const h = harness();
  const preview = await h.tool.execute("id", { action: "preview", mode: "manual" }, undefined, undefined, h.context(cwd));
  await assert.rejects(
    h.tool.execute("id", { action: "apply", previewId: preview.details.previewId }, undefined, undefined, h.context(otherCwd)),
    /MAINTENANCE_PREVIEW_CWD_MISMATCH/,
  );
  await assert.rejects(
    h.tool.execute(
      "id",
      { action: "apply", previewId: preview.details.previewId, mode: "manual" },
      undefined,
      undefined,
      h.context(cwd),
    ),
    /MAINTENANCE_PREVIEW_AMBIGUOUS/,
  );
  const direct = await h.tool.execute("id", { action: "apply", mode: "manual" }, undefined, undefined, h.context(cwd));
  assert.equal(direct.details.ok, true);
});

test("policy preview identifiers expire", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness();
  let clock = Date.now();
  t.mock.method(Date, "now", () => clock);
  const preview = await h.tool.execute("id", { action: "preview", mode: "manual" }, undefined, undefined, h.context(cwd));
  clock += 10 * 60 * 1000 + 1;
  await assert.rejects(
    h.tool.execute("id", { action: "apply", previewId: preview.details.previewId }, undefined, undefined, h.context(cwd)),
    /MAINTENANCE_PREVIEW_EXPIRED/,
  );
});

test("policy tool refuses non-TUI apply and bounds retained previews", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness();
  await assert.rejects(
    h.tool.execute("id", { action: "apply", mode: "manual" }, undefined, undefined, h.context(cwd, "print")),
    /MAINTENANCE_APPLY_TUI_ONLY/,
  );
  const previews = [];
  for (let index = 0; index < 33; index += 1) {
    previews.push(await h.tool.execute("id", { action: "preview", mode: "manual" }, undefined, undefined, h.context(cwd)));
  }
  await assert.rejects(
    h.tool.execute("id", { action: "apply", previewId: previews[0].details.previewId }, undefined, undefined, h.context(cwd)),
    /MAINTENANCE_PREVIEW_EXPIRED/,
  );
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8").includes('"mode": "manual"'), true);
});
