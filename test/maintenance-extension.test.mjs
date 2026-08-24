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

function harness(options = {}) {
  const { entries = [], confirm = true, selectHandler, sendError } = options;
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const sent = [];
  const notifications = [];
  const confirmations = [];
  const selections = [];
  const widgets = new Map();
  let confirmationResult = confirm;
  let hasSelectResult = "selectResult" in options;
  let nextSelection = options.selectResult;
  let customSelectHandler = selectHandler;
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
      select: async (title, items) => {
        selections.push({ title, items });
        if (customSelectHandler) return customSelectHandler(title, items);
        if (hasSelectResult) return nextSelection;
        return items[0];
      },
      confirm: async (title, message) => {
        confirmations.push({ title, message });
        return confirmationResult;
      },
      setWidget: (key, lines, options) => {
        if (lines === undefined) {
          widgets.delete(key);
        } else {
          widgets.set(key, { lines, options });
        }
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
    selections,
    widgets,
    entries,
    context,
    setConfirm(value) { confirmationResult = value; },
    setSelection(value) {
      hasSelectResult = true;
      nextSelection = value;
    },
    setSelectHandler(handler) { customSelectHandler = handler; },
  };
}

function oldDue(mode) {
  return createPolicy({ mode, intervalValue: 1, intervalUnit: "days", now: "2020-01-01T00:00:00.000Z" });
}

test("command descriptions and completions expose optional arguments", () => {
  const h = harness();
  assert.match(h.commands.get("picm-new").description, /optionally add a workflow description/);
  assert.match(h.commands.get("picm-adopt").description, /type a space for optional arguments/);
  assert.match(h.commands.get("picm-maintain").description, /type a space for one-run depth and focus arguments/);
  assert.match(h.commands.get("picm-optimize").description, /agent-facing documentation/);
  assert.match(h.commands.get("picm-help").description, /command syntax, arguments, examples/);

  const adopt = h.commands.get("picm-adopt").getArgumentCompletions("");
  assert.deepEqual(adopt, [{
    value: "coding",
    label: "coding",
    description: "Skip initial classification and enter Coding Repository adoption",
  }]);
  assert.deepEqual(h.commands.get("picm-adopt").getArgumentCompletions("  COD"), adopt);
  assert.equal(h.commands.get("picm-adopt").getArgumentCompletions("unknown"), null);

  const maintain = h.commands.get("picm-maintain").getArgumentCompletions("");
  assert.equal(maintain.length, 10);
  assert.deepEqual(maintain.slice(0, 2), [
    {
      value: "strict",
      label: "strict",
      description: "Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.",
    },
    {
      value: "balanced",
      label: "balanced",
      description: "Balanced: representative coverage of major boundaries and one coding path; lower cost.",
    },
  ]);
  assert.equal(maintain.every((item) => typeof item.description === "string" && item.description.length > 0), true);
  assert.equal(h.commands.get("picm-maintain").getArgumentCompletions("tr").length, 3);
  assert.equal(h.commands.get("picm-maintain").getArgumentCompletions("unknown"), null);
});

test("interactive maintain selects strict-first one-run depth without mutating the stored preset", async (t) => {
  const cwd = fixture(t);
  const h = harness();

  await h.commands.get("picm-maintain").handler("coding", h.context(cwd));

  assert.equal(h.selections.length, 1);
  assert.deepEqual(h.selections[0], {
    title: "Choose maintenance depth for this run (stored preset will not change)",
    items: [
      "Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.",
      "Balanced: representative coverage of major boundaries and one coding path; lower cost.",
    ],
  });
  assert.match(h.sent[0], /User arguments:\ncoding/);
  assert.match(h.sent[0], /Maintenance run depth: strict\. Apply this depth to this run only\./);
  assert.match(h.sent[0], /Do not mutate `capabilities\.codebaseMap\.maintenancePreset`/);
});

test("explicit strict and balanced maintenance depths bypass the selector", async (t) => {
  for (const depth of ["strict", "balanced"]) {
    const cwd = fixture(t);
    const h = harness();

    await h.commands.get("picm-maintain").handler(depth, h.context(cwd));

    assert.equal(h.selections.length, 0);
    assert.doesNotMatch(h.sent[0], /User arguments:/);
    assert.match(h.sent[0], new RegExp(`Maintenance run depth: ${depth}\\.`));
    assert.match(h.sent[0], /Apply this depth to this run only/);
  }
});

test("cancelled maintenance depth selection does not authorize a scan", async (t) => {
  const cwd = fixture(t);
  const h = harness({ selectResult: "" });

  await h.commands.get("picm-maintain").handler("", h.context(cwd));

  assert.equal(h.sent.length, 0);
  assert.equal(h.entries.length, 0);
  assert.match(h.notifications.at(-1).message, /cancelled before scan authorization/);
});

test("adopt coding dispatches preflight and exact privacy copy before skill loading", async (t) => {
  const cwd = fixture(t);
  const h = harness();

  await h.commands.get("picm-adopt").handler("coding", h.context(cwd));

  assert.equal(h.sent.length, 1);
  const prompt = h.sent[0];
  const preflight = prompt.indexOf("Call `picm_scan_control` with `action: \"preflight\"`");
  const reassurance = prompt.indexOf("PiCM automatically protects:");
  const additionalPaths = prompt.indexOf("Name any additional project-relative exclusions, or reply `none`.");
  const summary = prompt.indexOf("complete concise `.picm/config.json` summary categories");
  const acceptance = prompt.indexOf("obtain the user's summary acceptance");
  const privacy = prompt.indexOf("call `picm_scan_control` with `action: \"privacy\"`");
  const confirmation = prompt.indexOf("exact TUI patch confirmation");
  const skill = prompt.indexOf("load the `picm-factory` skill and its `SKILL.md`");

  assert.ok(preflight >= 0);
  assert.ok(preflight < reassurance);
  assert.ok(reassurance < additionalPaths);
  assert.match(prompt, /Git internals/);
  assert.match(prompt, /symlinks and nested repository\/submodule boundaries/);
  assert.ok(additionalPaths < summary);
  assert.ok(summary < acceptance);
  assert.ok(acceptance < privacy);
  assert.ok(privacy < confirmation);
  assert.ok(confirmation < skill);
  assert.doesNotMatch(prompt.slice(0, preflight), /skill|SKILL\.md/);
  assert.match(prompt, /Mode: adopt\nCommand: \/picm-adopt\n\nUser arguments:\ncoding/);
});

test("maintain automatically loads persisted exclusions without requiring a privacy interview", async (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, ".picm/config.json"), JSON.stringify({
    version: 1,
    privacy: { excludedPaths: ["private"] },
  }));
  const h = harness();
  const ctx = h.context(cwd);

  await h.commands.get("picm-maintain").handler("routing", ctx);

  const prompt = h.sent[0];
  assert.match(prompt, /preflight automatically loads persisted `.picm\/config.json` privacy exclusions/);
  assert.match(prompt, /do not ask a privacy question or call `privacy`/);
  const preflight = await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  assert.equal(preflight.details.privacyReviewed, true);
  assert.deepEqual(preflight.details.excludedPaths, ["private"]);
});

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

test("Run Now prompts depth selection, starts maintenance flow, and advances timestamps only upon completion", async (t) => {
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

test("a maintenance reset conflict leaves the losing workflow incomplete", async (t) => {
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

  const results = await Promise.allSettled([
    h.scanControl.execute("first", { action: "complete" }, undefined, undefined, first),
    h.scanControl.execute("second", { action: "complete" }, undefined, undefined, second),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.match(results.find(({ status }) => status === "rejected").reason.message, /MAINTENANCE_POLICY_CONFLICT/);

  const incomplete = results[0].status === "rejected" ? first : second;
  const status = await h.scanControl.execute("status", { action: "status" }, undefined, undefined, incomplete);
  assert.equal(status.details.completed, false);
  assert.equal(status.details.maintenanceResetAttempted, false);
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

test("new, adopt, and maintain reset scheduled cycles only after complete", async (t) => {
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
    assert.notEqual(config.maintenance.lastCycleAt, "2020-01-01T00:00:00.000Z");
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
