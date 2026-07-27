import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";
import { createPolicy } from "../extensions/runtime/maintenance-policy.mjs";

function fixture(t, maintenance) {
  const cwd = mkdtempSync(join(tmpdir(), "picm-extension-maintenance-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd });
  writeFileSync(join(cwd, ".gitignore"), ".env\n");
  writeFileSync(join(cwd, ".env"), "SYNTHETIC_ONLY=ignored\n");
  mkdirSync(join(cwd, ".picm"));
  writeFileSync(join(cwd, ".picm/config.json"), `${JSON.stringify({ version: 1, custom: "keep", maintenance }, null, 2)}\n`);
  return cwd;
}

function nonGitFixture(t, maintenance) {
  const cwd = mkdtempSync(join(tmpdir(), "picm-extension-non-git-maintenance-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, ".gitignore"), ".env\n");
  writeFileSync(join(cwd, ".env"), "SYNTHETIC_ONLY=ignored\n");
  writeFileSync(join(cwd, "safe.txt"), "safe\n");
  mkdirSync(join(cwd, ".picm"));
  writeFileSync(join(cwd, ".picm/config.json"), `${JSON.stringify({ version: 1, custom: "keep", maintenance }, null, 2)}\n`);
  return cwd;
}

function harness({ entries = [], confirm = true, sendError } = {}) {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const notifications = [];
  const confirmations = [];
  let confirmationResult = confirm;
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    sendUserMessage(message) {
      if (sendError) throw sendError;
      sent.push(message);
    },
  };
  picmFactoryExtension(pi);
  const context = (cwd, mode = "tui", sessionId = "session-1") => ({
    cwd,
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
      getSessionId: () => sessionId,
    },
    ui: {
      notify(message, level) { notifications.push({ message, level }); },
      confirm: async (title, message) => {
        confirmations.push({ title, message });
        return confirmationResult;
      },
    },
  });
  return {
    handlers,
    commands,
    tool: tools.get("picm_maintenance_policy"),
    scanControl: tools.get("picm_scan_control"),
    sent,
    notifications,
    confirmations,
    entries,
    context,
    setConfirm(value) { confirmationResult = value; },
  };
}

function oldDue(mode) {
  return createPolicy({ mode, intervalValue: 1, intervalUnit: "days", now: "2020-01-01T00:00:00.000Z" });
}

test("TUI due nudge notifies once without resetting the cycle", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = harness();
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await h.handlers.get("session_start")({}, h.context(cwd));
  assert.equal(h.notifications.length, 1);
  assert.match(h.notifications[0].message, /maintenance is due/);
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  await h.handlers.get("session_start")({ reason: "reload" }, h.context(cwd));
  assert.equal(h.notifications.length, 1);
  assert.equal(h.sent.length, 0);
});

test("TUI automatic cycle resets, dispatches once, and blocks side effects until settled", async (t) => {
  const cwd = fixture(t, oldDue("automatic"));
  writeFileSync(join(cwd, "safe.txt"), "safe\n");
  const h = harness();
  const ctx = h.context(cwd);
  await h.handlers.get("session_start")({}, ctx);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0], /scheduled read-only advisory cycle/);
  assert.match(h.sent[0], /Do not edit or write files/);
  const reset = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
  assert.equal(reset.custom, "keep");
  assert.notEqual(reset.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");

  const blockedWrite = await h.handlers.get("tool_call")({ toolName: "write", input: { path: "safe.txt" } }, h.context(cwd));
  assert.equal(blockedWrite.block, true);
  assert.match(blockedWrite.reason, /advisory and read-only/);
  const blockedIgnoredRead = await h.handlers.get("tool_call")({ toolName: "read", input: { path: ".env" } }, h.context(cwd));
  assert.equal(blockedIgnoredRead.block, true);
  assert.match(blockedIgnoredRead.reason, /ignored by Git/);
  const blockedBash = await h.handlers.get("tool_call")({ toolName: "bash", input: { command: "echo safe" } }, h.context(cwd));
  assert.equal(blockedBash.block, true);
  assert.equal(await h.handlers.get("tool_call")(
    { toolName: "picm_scan_control", input: { action: "inventory" } },
    ctx,
  ), undefined);
  const inventory = await h.scanControl.execute(
    "id",
    { action: "inventory" },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(inventory.details.automatic, true);
  assert.equal(inventory.details.authorized, false);
  assert.equal(inventory.details.candidates.includes("safe.txt"), true);
  assert.equal(inventory.details.candidates.includes(".env"), false);
  const blockedLifecycle = await h.handlers.get("tool_call")(
    { toolName: "picm_scan_control", input: { action: "end" } },
    ctx,
  );
  assert.equal(blockedLifecycle.block, true);
  await assert.rejects(
    h.scanControl.execute("id", { action: "end" }, undefined, undefined, ctx),
    /PICM_AUTOMATIC_INVENTORY_ONLY/,
  );
  assert.equal(h.handlers.has("user_bash"), false);
  await h.handlers.get("agent_settled")({}, h.context(cwd));
  const allowedWrite = await h.handlers.get("tool_call")({ toolName: "write", input: { path: "safe.txt" } }, h.context(cwd));
  assert.equal(allowedWrite, undefined);

  await h.handlers.get("session_start")({ reason: "reload" }, h.context(cwd));
  assert.equal(h.sent.length, 1);
});

test("due automatic maintenance runs in non-Git workspaces while honoring gitignore", async (t) => {
  const cwd = nonGitFixture(t, oldDue("automatic"));
  const h = harness();
  const ctx = h.context(cwd, "tui", "non-git-automatic-session");

  await h.handlers.get("session_start")({}, ctx);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0], /scheduled read-only advisory cycle/);
  assert.equal(await h.handlers.get("tool_call")(
    { toolName: "picm_scan_control", input: { action: "inventory" } },
    ctx,
  ), undefined);
  const inventory = await h.scanControl.execute(
    "id",
    { action: "inventory" },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(inventory.details.automatic, true);
  assert.equal(inventory.details.isolated, true);
  assert.equal(inventory.details.candidates.includes("safe.txt"), true);
  assert.equal(inventory.details.candidates.includes(".env"), false);
  assert.equal(await h.handlers.get("tool_call")(
    { toolName: "read", input: { path: "safe.txt" } },
    ctx,
  ), undefined);
  const blocked = await h.handlers.get("tool_call")(
    { toolName: "read", input: { path: ".env" } },
    ctx,
  );
  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /ignored by Git/);
  assert.equal(h.handlers.has("user_bash"), false);
  assert.equal(existsSync(join(cwd, ".git")), false);
  const config = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
  assert.equal(config.custom, "keep");
  assert.notEqual(config.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
  await h.handlers.get("agent_settled")({}, ctx);
  await h.handlers.get("session_shutdown")({}, ctx);
});

test("automatic advisory fails closed when its scan safety boundary expires", async (t) => {
  const cwd = fixture(t, oldDue("automatic"));
  writeFileSync(join(cwd, "safe.txt"), "safe\n");
  const h = harness();
  const ctx = h.context(cwd, "tui", "expiring-automatic-session");
  let clock = Date.now();
  t.mock.method(Date, "now", () => clock);

  await h.handlers.get("session_start")({}, ctx);
  clock += 2 * 60 * 60 * 1000 + 1;

  for (const event of [
    { toolName: "read", input: { path: "safe.txt" } },
    { toolName: "picm_scan_control", input: { action: "inventory" } },
    { toolName: "write", input: { path: "safe.txt" } },
  ]) {
    const blocked = await h.handlers.get("tool_call")(event, ctx);
    assert.equal(blocked.block, true);
    assert.match(blocked.reason, /safety boundary expired/);
  }
  await assert.rejects(
    h.scanControl.execute("id", { action: "inventory" }, undefined, undefined, ctx),
    /PICM_AUTOMATIC_SCAN_EXPIRED/,
  );

  await h.handlers.get("agent_settled")({}, ctx);
  assert.equal(await h.handlers.get("tool_call")(
    { toolName: "read", input: { path: "safe.txt" } },
    ctx,
  ), undefined);
});

test("automatic send failure rolls back the claim and clears the session guard", async (t) => {
  const due = oldDue("automatic");
  const cwd = fixture(t, due);
  const h = harness({ sendError: new Error("synthetic send failure") });
  await h.handlers.get("session_start")({}, h.context(cwd));
  assert.equal(h.sent.length, 0);
  assert.equal(h.entries.length, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8")).maintenance, due);
  assert.match(h.notifications.at(-1).message, /could not start/);
  assert.match(h.notifications.at(-1).message, /remains pending/);
  const allowedWrite = await h.handlers.get("tool_call")({ toolName: "write", input: { path: "safe.txt" } }, h.context(cwd));
  assert.equal(allowedWrite, undefined);
});

test("automatic read-only guards are scoped to cwd and session", async (t) => {
  const firstCwd = fixture(t, oldDue("automatic"));
  const secondCwd = fixture(t, createPolicy({ mode: "automatic", intervalValue: 2, intervalUnit: "days", now: "2020-01-01T00:00:00.000Z" }));
  const h = harness();
  const first = h.context(firstCwd, "tui", "first-session");
  const second = h.context(secondCwd, "tui", "second-session");
  const unrelated = h.context(firstCwd, "tui", "unrelated-session");
  await h.handlers.get("session_start")({}, first);
  await h.handlers.get("session_start")({}, second);

  await h.handlers.get("agent_settled")({}, unrelated);
  await assert.rejects(
    h.scanControl.execute("id", { action: "inventory" }, undefined, undefined, unrelated),
    /PICM_SCAN_NOT_ACTIVE/,
  );
  assert.equal((await h.handlers.get("tool_call")({ toolName: "write", input: { path: "safe.txt" } }, first)).block, true);
  assert.equal((await h.handlers.get("tool_call")({ toolName: "write", input: { path: "safe.txt" } }, second)).block, true);

  await h.handlers.get("agent_settled")({}, first);
  assert.equal(await h.handlers.get("tool_call")({ toolName: "write", input: { path: "safe.txt" } }, first), undefined);
  assert.equal((await h.handlers.get("tool_call")({ toolName: "write", input: { path: "safe.txt" } }, second)).block, true);
  assert.equal(h.handlers.has("user_bash"), false);
});

test("non-TUI startup is a no-op for print, json, and rpc", async (t) => {
  for (const mode of ["print", "json", "rpc"]) {
    const cwd = fixture(t, oldDue("automatic"));
    const h = harness();
    const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
    await h.handlers.get("session_start")({}, h.context(cwd, mode));
    assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
    assert.equal(h.sent.length, 0);
  }
});

test("new, adopt, and maintain reset scheduled cycles while help does not", async (t) => {
  for (const command of ["picm-new", "picm-adopt", "picm-maintain"]) {
    const cwd = fixture(t, oldDue("nudge"));
    const h = harness();
    await h.commands.get(command).handler("", h.context(cwd));
    const config = JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8"));
    assert.notEqual(config.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
    assert.equal(h.sent.length, 1);
  }
  const helpCwd = fixture(t, oldDue("nudge"));
  const help = harness();
  const before = readFileSync(join(helpCwd, ".picm/config.json"), "utf8");
  await help.commands.get("picm-help").handler("", help.context(helpCwd));
  assert.equal(readFileSync(join(helpCwd, ".picm/config.json"), "utf8"), before);
});

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

test("policy preview handoff applies the exact preview once and keeps it after decline", async (t) => {
  const cwd = fixture(t, { mode: "manual" });
  const h = harness({ confirm: false });
  const preview = await h.tool.execute(
    "id",
    { action: "preview", mode: "nudge", intervalValue: 1, intervalUnit: "months" },
    undefined,
    undefined,
    h.context(cwd),
  );
  assert.match(preview.details.previewId, /^picm-maintenance-preview:[0-9a-f-]+$/);
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
