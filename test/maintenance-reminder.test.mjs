import assert from "node:assert/strict";
import test from "node:test";
import { createMaintenanceReminder } from "../extensions/runtime/maintenance-reminder.mjs";

const due = { mode: "nudge", nextDueAt: "2026-01-01T00:00:00.000Z" };

function reminderWithProbe(probe) {
  return createMaintenanceReminder({
    controllerForWorkspace: () => ({ startupProbe: async () => probe }),
  });
}

test("due reminders are offers, not automatic work or cycle resets", async () => {
  let presentations = 0;
  const reminder = reminderWithProbe({ ok: true, action: "due", dueKey: due.nextDueAt, maintenance: due });
  const present = async () => { presentations += 1; return "run-now"; };
  assert.equal((await reminder.offer({ cwd: "/project", mode: "print", present })).reason, "non-tui");
  assert.equal((await reminder.offer({ cwd: "/project", mode: "tui", present })).action, "run-now");
  assert.equal((await reminder.offer({ cwd: "/project", mode: "tui", present })).reason, "already-seen");
  assert.equal(presentations, 1);

  reminder.reset();
  assert.equal((await reminder.offer({ cwd: "/project", mode: "tui", present })).action, "run-now");
  assert.equal(presentations, 2);
});

test("deduplication is per workspace and due timestamp, including concurrent offers", async () => {
  let timestamp = "first";
  let presentations = 0;
  const reminder = createMaintenanceReminder({
    controllerForWorkspace: () => ({ startupProbe: async () => ({ ok: true, action: "due", dueKey: timestamp, maintenance: { ...due, nextDueAt: timestamp } }) }),
  });
  const present = async () => { presentations += 1; return undefined; };
  await Promise.all([reminder.offer({ cwd: "/a", mode: "tui", present }), reminder.offer({ cwd: "/a", mode: "tui", present })]);
  assert.equal(presentations, 1);
  await reminder.offer({ cwd: "/b", mode: "tui", present });
  timestamp = "second";
  await reminder.offer({ cwd: "/a", mode: "tui", present });
  assert.equal(presentations, 3);
});

test("a legacy mode change at the same due timestamp does not prompt twice", async () => {
  let mode = "nudge";
  let presentations = 0;
  const reminder = createMaintenanceReminder({
    controllerForWorkspace: () => ({ startupProbe: async () => ({
      ok: true, action: "due", dueKey: `${mode}:${due.nextDueAt}`,
      maintenance: { ...due, mode },
    }) }),
  });
  const present = async () => { presentations += 1; return "later"; };
  await reminder.offer({ cwd: "/project", mode: "tui", present });
  mode = "automatic";
  assert.equal((await reminder.offer({ cwd: "/project", mode: "tui", present })).reason, "already-seen");
  assert.equal(presentations, 1);
});

test("failed presentation may retry and non-due probes do not present", async () => {
  const reminder = reminderWithProbe({ ok: true, action: "due", dueKey: "due", maintenance: due });
  await assert.rejects(reminder.offer({ cwd: "/a", mode: "tui", present: () => { throw new Error("UI failed"); } }), /UI failed/);
  assert.equal((await reminder.offer({ cwd: "/a", mode: "tui", present: async () => "later" })).action, "later");
  const notDue = reminderWithProbe({ ok: true, action: "none", reason: "manual" });
  assert.equal((await notDue.offer({ cwd: "/a", mode: "tui", present: () => { throw new Error("unexpected"); } })).reason, "manual");
});
