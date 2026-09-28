import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fixture, oldDue, setAdoptionStatus } from "./helpers/maintenance-extension-harness.mjs";
import { extensionHarness } from "./helpers/picm-extension-harness.mjs";

async function start(h, ctx) {
  const control = h.tools.get("picm_scan_control");
  await h.commands.get("picm-maintain").handler("strict", ctx);
  for (const action of ["preflight", "privacy", "begin"]) {
    await control.execute(action, action === "privacy" ? { action, excludedPaths: [] } : { action }, undefined, undefined, ctx);
  }
  return control;
}

function config(cwd) {
  return readFileSync(join(cwd, ".picm/config.json"), "utf8");
}

async function prepare(batch, ctx, operation) {
  return batch.execute("prepare", { action: "prepare", operations: [operation] }, undefined, undefined, ctx);
}

async function finish(control, ctx) {
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  return control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
}

test("an affirmative draft selection after discovery end cannot complete maintenance before preview", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "AGENTS.md"), "# Routing\n\nCurrent guidance.\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "draft-selected-after-end");
  const control = await start(h, ctx);
  const before = config(cwd);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  await h.handlers.get("input")({ text: "Yes", source: "interactive" }, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "Yes", source: "interactive" }, ctx);
  const blocked = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(blocked.details.ok, false);
  assert.equal(blocked.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(config(cwd), before);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  const prepared = await prepare(batch, ctx, {
    type: "modify", path: "AGENTS.md", expectedContent: "# Routing\n\nCurrent guidance.\n",
    content: "# Routing\n\nUpdated guidance.\n",
  });
  assert.equal(prepared.details.ok, true);
  await batch.execute("present", {
    action: "present", proposalId: prepared.details.proposalId, digest: prepared.details.digest,
  }, undefined, undefined, ctx);
  assert.equal(readFileSync(join(cwd, "AGENTS.md"), "utf8"), "# Routing\n\nCurrent guidance.\n");
  await h.handlers.get("before_agent_start")({ prompt: "I created a Git checkpoint." }, ctx);
  const stillPending = await finish(control, ctx);
  assert.equal(stillPending.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  const replacement = await prepare(batch, ctx, {
    type: "modify", path: "AGENTS.md", expectedContent: "# Routing\n\nCurrent guidance.\n",
    content: "# Routing\n\nUpdated guidance.\n",
  });
  await batch.execute("present", {
    action: "present", proposalId: replacement.details.proposalId, digest: replacement.details.digest,
  }, undefined, undefined, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "approved to write" }, ctx);
  assert.equal((await batch.execute("apply", {
    action: "apply", proposalId: replacement.details.proposalId,
  }, undefined, undefined, ctx)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  assert.equal(readFileSync(join(cwd, "AGENTS.md"), "utf8"), "# Routing\n\nCurrent guidance.\n");
  await h.handlers.get("before_agent_start")({ prompt: "I created a Git checkpoint." }, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "accept and write" }, ctx);
  const applied = await batch.execute("apply", {
    action: "apply", proposalId: replacement.details.proposalId,
  }, undefined, undefined, ctx);
  assert.equal(applied.details.ok, true);
  const completed = await finish(control, ctx);
  assert.equal(completed.details.ok, true);
  assert.equal(completed.details.maintenanceOutcome, "repairs-applied");
  assert.equal(readFileSync(join(cwd, "AGENTS.md"), "utf8"), "# Routing\n\nUpdated guidance.\n");
});

test("adoption-to-initial-maintenance preserves a selected draft across scan phases", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = extensionHarness();
  const ctx = h.context(cwd, "adoption-continued-selection");
  const control = h.tools.get("picm_scan_control");
  await h.commands.get("picm-adopt").handler("coding", ctx);
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  setAdoptionStatus(cwd, { status: "adopted" });
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  const initial = await control.execute("adoption-complete", { action: "adoption-complete" }, undefined, undefined, ctx);
  assert.equal(initial.details.initialMaintenance, "started");
  assert.equal(initial.details.command, "picm-maintain");
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  await h.handlers.get("input")({ text: "Yes", source: "interactive" }, ctx);
  const blocked = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(blocked.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  assert.equal((await control.execute("end", { action: "end" }, undefined, undefined, ctx)).details.maintenanceRepairStatus, "pending");
});

test("settled selection is scoped to a direct reply and this maintenance workflow", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = extensionHarness();
  const ctx = h.context(cwd, "selection-scope");
  const control = await start(h, ctx);
  await h.handlers.get("input")({ text: "Yes", source: "interactive" }, ctx);
  assert.equal((await control.execute("active", { action: "end" }, undefined, undefined, ctx)).details.maintenanceRepairStatus, "none");
  for (const text of ["Yes", "draft the proposal", "prepare"]) {
    await h.handlers.get("input")({ text, source: "extension" }, ctx);
  }
  await h.handlers.get("before_agent_start")({ prompt: "Yes", source: "extension" }, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "No, skip", source: "interactive" }, ctx);
  assert.equal((await control.execute("inspection", { action: "complete" }, undefined, undefined, ctx)).details.maintenanceOutcome, "inspection-only");

  await start(h, ctx);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "draft", source: "interactive" }, ctx);
  await h.handlers.get("input")({ text: "draft", source: "interactive" }, ctx);
  assert.equal((await control.execute("pending", { action: "complete" }, undefined, undefined, ctx)).details.code,
    "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  await control.execute("cancel", { action: "cancel" }, undefined, undefined, ctx);
  await start(h, ctx);
  const nextRun = await finish(control, ctx);
  assert.equal(nextRun.details.maintenanceOutcome, "inspection-only");
});

test("a selected draft stays pending on session restore but is isolated from another session", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const entries = [];
  const h = extensionHarness({ entries });
  const ctx = h.context(cwd, "selected-draft-session");
  const control = await start(h, ctx);
  const before = config(cwd);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  await h.handlers.get("input")({ text: "Yes", source: "interactive" }, ctx);
  await h.handlers.get("session_start")({ reason: "resume" }, ctx);
  const blocked = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(blocked.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(config(cwd), before);
  const other = h.context(cwd, "other-session");
  await start(h, other);
  const completed = await finish(control, other);
  assert.equal(completed.details.maintenanceOutcome, "inspection-only");
  const stillBlocked = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(stillBlocked.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
});

test("rejected partial and missing snapshots leave selected repair unresolved and cadence due", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "# Guide\n\nExisting section.\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "rejected-proposal");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  const before = config(cwd);

  await assert.rejects(
    prepare(batch, ctx, { type: "modify", path: "safe.txt", expectedContent: "Existing section.\n", content: "Updated section.\n" }),
    /PICM_PROPOSAL_STALE: safe.txt does not match expectedContent while preparing; expectedContent must be the complete current file content/,
  );
  await assert.rejects(
    prepare(batch, ctx, { type: "modify", path: "safe.txt", content: "Updated section.\n" }),
    /PICM_PROPOSAL_INVALID: modify requires expectedContent/,
  );
  const result = await finish(control, ctx);
  assert.equal(result.details.ok, false);
  assert.equal(result.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(result.details.completed, false);
  assert.equal(result.details.maintenanceReset.changed, false);
  assert.match(result.details.message, /Report only/);
  assert.equal(config(cwd), before);
  assert.equal(readFileSync(join(cwd, "safe.txt"), "utf8"), "# Guide\n\nExisting section.\n");
  assert.equal(h.sent.length, 1);
});

test("failed preparation can be explicitly completed as report-only without a repair", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "failed-to-report-only");
  const control = await start(h, ctx);
  await assert.rejects(prepare(h.tools.get("picm_proposal_batch"), ctx, {
    type: "modify", path: "safe.txt", expectedContent: "fragment", content: "updated\n",
  }), /PICM_PROPOSAL_STALE/);
  await h.handlers.get("input")({ text: "Report only", source: "interactive" }, ctx);
  const chosen = await control.execute("report-only", { action: "report-only" }, undefined, undefined, ctx);
  assert.equal(chosen.details.maintenanceRepairStatus, "report-only");
  const completed = await finish(control, ctx);
  assert.equal(completed.details.maintenanceOutcome, "report-only");
  assert.equal(completed.details.maintenanceReset.changed, true);
  assert.equal(readFileSync(join(cwd, "safe.txt"), "utf8"), "original\n");
});

test("pending presentation and approval cannot reset a maintenance cycle", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "pending-proposal");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  const before = config(cwd);
  const prepared = await prepare(batch, ctx, { type: "modify", path: "safe.txt", expectedContent: "original\n", content: "updated\n" });
  await batch.execute("present", {
    action: "present", proposalId: prepared.details.proposalId, digest: prepared.details.digest,
  }, undefined, undefined, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
  const result = await finish(control, ctx);
  assert.equal(result.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(config(cwd), before);
  assert.equal(readFileSync(join(cwd, "safe.txt"), "utf8"), "original\n");
});

test("cancelling an unapplied batch does not count as a completed repair", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "cancelled-batch");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  const before = config(cwd);
  const prepared = await prepare(batch, ctx, {
    type: "modify", path: "safe.txt", expectedContent: "original\n", content: "updated\n",
  });
  await batch.execute("cancel", { action: "cancel", proposalId: prepared.details.proposalId }, undefined, undefined, ctx);
  const completion = await finish(control, ctx);
  assert.equal(completion.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(config(cwd), before);
});

test("a corrected, presented and approved replacement applies before resetting the cadence", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "recovered-proposal");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  await assert.rejects(prepare(batch, ctx, {
    type: "modify", path: "safe.txt", expectedContent: "partial", content: "replacement",
  }), /PICM_PROPOSAL_STALE/);
  const prepared = await prepare(batch, ctx, {
    type: "modify", path: "safe.txt", expectedContent: "original\n", content: "updated\n",
  });
  await batch.execute("present", {
    action: "present", proposalId: prepared.details.proposalId, digest: prepared.details.digest,
  }, undefined, undefined, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "I created a Git checkpoint." }, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
  const applied = await batch.execute("apply", {
    action: "apply", proposalId: prepared.details.proposalId,
  }, undefined, undefined, ctx);
  assert.equal(applied.details.ok, true);
  const result = await finish(control, ctx);
  assert.equal(result.details.ok, true);
  assert.equal(result.details.maintenanceOutcome, "repairs-applied");
  assert.equal(result.details.maintenanceReset.changed, true);
  assert.equal(readFileSync(join(cwd, "safe.txt"), "utf8"), "updated\n");
});

test("a later failed batch overrides an earlier applied maintenance repair", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "multiple-batches");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  const first = await prepare(batch, ctx, { type: "create", path: "applied.md", content: "applied\n" });
  await batch.execute("present", {
    action: "present", proposalId: first.details.proposalId, digest: first.details.digest,
  }, undefined, undefined, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
  const applied = await batch.execute("apply", {
    action: "apply", proposalId: first.details.proposalId,
  }, undefined, undefined, ctx);
  assert.equal(applied.details.ok, true);
  const before = config(cwd);
  await assert.rejects(prepare(batch, ctx, {
    type: "modify", path: "safe.txt", expectedContent: "fragment", content: "updated\n",
  }), /PICM_PROPOSAL_STALE/);
  const blocked = await finish(control, ctx);
  assert.equal(blocked.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(config(cwd), before);
  assert.equal(readFileSync(join(cwd, "applied.md"), "utf8"), "applied\n");
});

test("report-only is a direct user choice, resets the cycle and does not approve a pending repair", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "report-only");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  const before = config(cwd);
  const prepared = await prepare(batch, ctx, {
    type: "modify", path: "safe.txt", expectedContent: "original\n", content: "updated\n",
  });
  await assert.rejects(
    control.execute("report-only", { action: "report-only" }, undefined, undefined, ctx),
    /PICM_MAINTENANCE_REPORT_ONLY_NOT_CONFIRMED/,
  );
  await h.handlers.get("input")({ text: "Report only", source: "extension" }, ctx);
  await assert.rejects(
    control.execute("report-only", { action: "report-only" }, undefined, undefined, ctx),
    /PICM_MAINTENANCE_REPORT_ONLY_NOT_CONFIRMED/,
  );
  await h.handlers.get("input")({ text: "Report only", source: "interactive" }, ctx);
  const reportOnly = await control.execute("report-only", { action: "report-only" }, undefined, undefined, ctx);
  assert.equal(reportOnly.details.maintenanceOutcome, "report-only");
  const apply = await batch.execute("apply", { action: "apply", proposalId: prepared.details.proposalId }, undefined, undefined, ctx);
  assert.equal(apply.details.code, "PICM_PROPOSAL_NOT_APPROVED");
  const result = await finish(control, ctx);
  assert.equal(result.details.maintenanceOutcome, "report-only");
  assert.equal(result.details.maintenanceReset.changed, true);
  assert.notEqual(config(cwd), before);
  assert.equal(readFileSync(join(cwd, "safe.txt"), "utf8"), "original\n");
});

test("a report-only reply expires across a new repair and a new scan phase", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const h = extensionHarness();
  const ctx = h.context(cwd, "stale-report-only");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  await h.handlers.get("input")({ text: "Report only", source: "interactive" }, ctx);
  await prepare(batch, ctx, { type: "modify", path: "safe.txt", expectedContent: "original\n", content: "updated\n" });
  await assert.rejects(control.execute("stale-reply", { action: "report-only" }, undefined, undefined, ctx),
    /PICM_MAINTENANCE_REPORT_ONLY_NOT_CONFIRMED/);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  await assert.rejects(control.execute("other-phase", { action: "report-only" }, undefined, undefined, ctx),
    /PICM_MAINTENANCE_REPORT_ONLY_NOT_CONFIRMED/);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  const blocked = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(blocked.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
});

test("an unconsumed report-only reply is not restored as authorization", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = extensionHarness();
  const ctx = h.context(cwd, "restore-report-only");
  const control = await start(h, ctx);
  await h.handlers.get("input")({ text: "Report only", source: "interactive" }, ctx);
  await h.handlers.get("session_start")({ reason: "resume" }, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  await assert.rejects(control.execute("report-only", { action: "report-only" }, undefined, undefined, ctx),
    /PICM_MAINTENANCE_REPORT_ONLY_NOT_CONFIRMED/);
});

test("report-only receipt preserves partial batch effect counts without exposing contents", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  const h = extensionHarness();
  const ctx = h.context(cwd, "partial-report-only");
  const control = await start(h, ctx);
  const batch = h.tools.get("picm_proposal_batch");
  const prepared = await batch.execute("prepare", { action: "prepare", operations: [
    { type: "create", path: "first.md", content: "first\n" },
    { type: "create", path: "second.md", content: "second\n" },
  ] }, undefined, undefined, ctx);
  await batch.execute("present", {
    action: "present", proposalId: prepared.details.proposalId, digest: prepared.details.digest,
  }, undefined, undefined, ctx);
  await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
  const interrupted = await batch.execute("apply", { action: "apply", proposalId: prepared.details.proposalId }, {
    get aborted() { return existsSync(join(cwd, "first.md")); },
  }, undefined, ctx);
  assert.equal(interrupted.details.code, "PICM_PROPOSAL_ABORTED");
  await h.handlers.get("input")({ text: "Report only", source: "interactive" }, ctx);
  const report = await control.execute("report-only", { action: "report-only" }, undefined, undefined, ctx);
  assert.equal(report.details.maintenancePartialEffects.completed, 1);
  assert.equal(report.details.maintenancePartialEffects.uncertain, 0);
  const completed = await finish(control, ctx);
  assert.equal(completed.details.maintenanceOutcome, "report-only");
  assert.equal(completed.details.maintenancePartialEffects.completed, 1);
});

test("unresolved state survives session restoration and does not leak into a later run", async (t) => {
  const cwd = fixture(t, oldDue("nudge"));
  writeFileSync(join(cwd, "safe.txt"), "original\n");
  const entries = [];
  const h = extensionHarness({ entries });
  const ctx = h.context(cwd, "restored-repair");
  const control = await start(h, ctx);
  const before = config(cwd);
  await assert.rejects(prepare(h.tools.get("picm_proposal_batch"), ctx, {
    type: "modify", path: "safe.txt", expectedContent: "partial", content: "updated\n",
  }), /PICM_PROPOSAL_STALE/);
  await control.execute("end", { action: "end" }, undefined, undefined, ctx);
  await h.handlers.get("session_start")({ reason: "resume" }, ctx);
  const blocked = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
  assert.equal(blocked.details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(config(cwd), before);
  await control.execute("cancel", { action: "cancel" }, undefined, undefined, ctx);
  await start(h, ctx);
  const completed = await finish(control, ctx);
  assert.equal(completed.details.ok, true);
  assert.equal(completed.details.maintenanceOutcome, "inspection-only");
  assert.equal(completed.details.maintenanceReset.changed, true);
});
