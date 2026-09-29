import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fixture, oldDue } from "./helpers/maintenance-extension-harness.mjs";
import { extensionHarness } from "./helpers/picm-extension-harness.mjs";

function setup(t) {
  const cwd = fixture(t, oldDue("nudge"));
  const h = extensionHarness();
  const ctx = h.context(cwd);
  ctx.hasUI = true;
  ctx.ui.setWidget = () => {};
  ctx.ui.editor = async () => undefined;
  const control = h.tools.get("picm_scan_control");
  const batch = h.tools.get("picm_proposal_batch");
  const call = (action, extras = {}) => control.execute(action, { action, ...extras }, undefined, undefined, ctx);
  const proposal = (action, extras = {}) => batch.execute(action, { action, ...extras }, undefined, undefined, ctx);
  return { cwd, h, ctx, call, proposal };
}

async function start(h, ctx, call) {
  await h.commands.get("picm-maintain").handler("strict", ctx);
  await call("preflight");
  await call("privacy", { excludedPaths: [] });
}

test("maintenance optimization is selected after privacy, dismissal starts no scan, and restore retains the choice", async (t) => {
  const { cwd, h, ctx, call } = setup(t);
  await start(h, ctx, call);
  let choice;
  ctx.ui.select = async () => choice;
  const dismissed = await call("begin");
  assert.equal(dismissed.details.code, "PICM_MAINTENANCE_CHOICE_UNRESOLVED");
  assert.equal(dismissed.details.scanStarted, undefined);
  choice = "Include agent-document optimization";
  const started = await call("begin");
  assert.equal(started.details.maintenanceOptimization, "include");
  await call("end");
  const restored = extensionHarness({ entries: ctx.sessionManager.getEntries() });
  const restoredCtx = restored.context(cwd);
  await restored.handlers.get("session_start")({}, restoredCtx);
  const resumed = await restored.tools.get("picm_scan_control").execute("begin", { action: "begin" }, undefined, undefined, restoredCtx);
  assert.equal(resumed.details.maintenanceOptimization, "include");
});

test("discovery decision is a user selection, dismissal blocks reset and drafting remains no-write", async (t) => {
  const { cwd, h, ctx, call } = setup(t);
  const before = readFileSync(join(cwd, ".picm/config.json"), "utf8");
  await start(h, ctx, call);
  ctx.ui.select = async () => "Standard maintenance";
  await call("begin");
  await call("end");
  assert.equal((await call("complete")).details.code, "PICM_MAINTENANCE_CHOICE_UNRESOLVED");
  ctx.ui.select = async () => undefined;
  assert.equal((await call("discovery-choice")).details.code, "PICM_MAINTENANCE_CHOICE_UNRESOLVED");
  ctx.ui.select = async () => "Draft a repair for exact review";
  assert.equal((await call("discovery-choice")).details.maintenanceRepairStatus, "pending");
  assert.equal((await call("complete")).details.code, "PICM_MAINTENANCE_REPAIR_UNRESOLVED");
  assert.equal(readFileSync(join(cwd, ".picm/config.json"), "utf8"), before);
  await call("begin");
  assert.equal((await call("end")).details.maintenanceRepairStatus, "pending");
});

test("inspection-only selection permits completion but never approves a proposal", async (t) => {
  const { cwd, h, ctx, call } = setup(t);
  await start(h, ctx, call);
  ctx.ui.select = async (title) => title.includes("optimization") ? "Standard maintenance" : "Finish inspection without changes";
  await call("begin");
  await call("end");
  assert.equal((await call("discovery-choice")).details.choice, "inspection");
  const completed = await call("complete");
  assert.equal(completed.details.maintenanceOutcome, "inspection-only");
  assert.equal(completed.details.maintenanceReset.ok, true);
  assert.notEqual(JSON.parse(readFileSync(join(cwd, ".picm/config.json"), "utf8")).maintenance.lastCycleAt,
    "2020-01-01T00:00:00.000Z");
});

test("exact proposal modal authorizes only the current presented batch after checkpoint acknowledgement", async (t) => {
  const { cwd, h, ctx, call, proposal } = setup(t);
  const path = join(cwd, "AGENTS.md");
  writeFileSync(path, "Before\n");
  await start(h, ctx, call);
  ctx.ui.select = async () => "Standard maintenance";
  await call("begin");
  const prepared = await proposal("prepare", { operations: [{ type: "modify", path: "AGENTS.md", expectedContent: "Before\n", content: "After\n" }] });
  const identity = { proposalId: prepared.details.proposalId, digest: prepared.details.digest };
  const presented = await proposal("present", identity);
  assert.equal((await proposal("authorize", identity)).details.code, "PICM_PROPOSAL_CHECKPOINT_ACKNOWLEDGEMENT_REQUIRED");
  await h.handlers.get("before_agent_start")({ prompt: "I created a Git checkpoint." }, ctx);
  ctx.ui.select = async () => undefined;
  assert.equal((await proposal("authorize", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  ctx.ui.select = async (title, items) => {
    assert.match(title, /Modify AGENTS\.md/);
    assert.match(title, /Checkpoint report or risk opt-out recorded/);
    assert.doesNotMatch(title, /"expectedContent"|Git checkpoint recommendation:/);
    assert.ok(title.length < 550);
    assert.equal(items[0], "Review exact changes");
    return "Review exact changes";
  };
  ctx.ui.editor = async (title, content) => {
    assert.match(title, /Review only/);
    assert.equal(content, presented.details.summary);
    return "Pretend I edited the preview";
  };
  const reviewed = await proposal("authorize", identity);
  assert.equal(reviewed.details.code, "PICM_PROPOSAL_REVIEWED");
  assert.equal((await proposal("authorize", identity)).details.code, "PICM_PROPOSAL_REVIEWED");
  assert.equal(readFileSync(path, "utf8"), "Before\n");
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  ctx.ui.select = async () => "Not now";
  assert.equal((await proposal("authorize", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  ctx.ui.select = async () => "Authorize this exact proposal";
  assert.equal((await proposal("authorize", identity)).details.ok, true);
  assert.equal(readFileSync(path, "utf8"), "Before\n");
  assert.equal((await proposal("apply", identity)).details.ok, true);
  assert.equal(readFileSync(path, "utf8"), "After\n");
  assert.equal((await proposal("authorize", identity)).details.code, "PICM_PROPOSAL_STALE");
});

test("compact approval overview discloses hidden destructive actions and keeps full preview available", async (t) => {
  const { cwd, h, ctx, call, proposal } = setup(t);
  writeFileSync(join(cwd, "obsolete.md"), "old\n");
  await start(h, ctx, call);
  ctx.ui.select = async () => "Standard maintenance";
  await call("begin");
  const operations = ["one.md", "two.md", "three.md", "four.md"].map((path) => ({ type: "create", path, content: "new\n" }));
  operations.push({ type: "delete", path: "obsolete.md", expectedContent: "old\n" });
  const prepared = await proposal("prepare", { operations });
  const identity = { proposalId: prepared.details.proposalId, digest: prepared.details.digest };
  const presented = await proposal("present", identity);
  await h.handlers.get("before_agent_start")({ prompt: "I created a Git checkpoint." }, ctx);
  ctx.ui.select = async (title) => {
    assert.match(title, /and 1 more operation/);
    assert.match(title, /Includes deletion or moves/);
    assert.doesNotMatch(title, /"content"|obsolete\.md/);
    return "Review exact changes";
  };
  ctx.ui.editor = async (_title, content) => {
    assert.equal(content, presented.details.summary);
    assert.match(content, /obsolete\.md/);
    assert.match(content, new RegExp(identity.digest));
    return undefined;
  };
  assert.equal((await proposal("authorize", identity)).details.code, "PICM_PROPOSAL_REVIEWED");
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  assert.equal(readFileSync(join(cwd, "obsolete.md"), "utf8"), "old\n");
});

test("without dialog support, authorize is no-write and text approval still requires exact presentation", async (t) => {
  const { cwd, h, ctx, call, proposal } = setup(t);
  ctx.hasUI = false;
  await start(h, ctx, call);
  await call("begin");
  const prepared = await proposal("prepare", { operations: [{ type: "create", path: "new.md", content: "new\n" }] });
  const identity = { proposalId: prepared.details.proposalId, digest: prepared.details.digest };
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  await proposal("present", identity);
  assert.equal((await proposal("authorize", identity)).details.code, "PICM_PROPOSAL_UI_UNAVAILABLE");
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  assert.equal(existsSync(join(cwd, "new.md")), false);
  await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
  assert.equal((await proposal("apply", identity)).details.ok, true);
});

test("dialog approval is rejected if the workflow is replaced while the modal is open", async (t) => {
  const { cwd, h, ctx, call, proposal } = setup(t);
  await start(h, ctx, call);
  ctx.ui.select = async () => "Standard maintenance";
  await call("begin");
  const prepared = await proposal("prepare", { operations: [{ type: "create", path: "new.md", content: "new\n" }] });
  const identity = { proposalId: prepared.details.proposalId, digest: prepared.details.digest };
  await proposal("present", identity);
  let release;
  ctx.ui.select = () => new Promise((resolve) => { release = resolve; });
  const waiting = proposal("authorize", identity);
  await new Promise((resolve) => setImmediate(resolve));
  await h.commands.get("picm-maintain").handler("strict", ctx);
  release("Authorize this exact proposal");
  await assert.rejects(waiting, /PICM_SCAN_STALE/);
  assert.equal(existsSync(join(cwd, "new.md")), false);
});

test("review buffer edits and a revision while review is open cannot authorize writes", async (t) => {
  const { cwd, h, ctx, call, proposal } = setup(t);
  await start(h, ctx, call);
  ctx.ui.select = async () => "Standard maintenance";
  await call("begin");
  const prepared = await proposal("prepare", { operations: [{ type: "create", path: "new.md", content: "new\n" }] });
  const identity = { proposalId: prepared.details.proposalId, digest: prepared.details.digest };
  await proposal("present", identity);
  ctx.ui.select = async () => "Review exact changes";
  let release;
  ctx.ui.editor = () => new Promise((resolve) => { release = resolve; });
  const waiting = proposal("authorize", identity);
  await new Promise((resolve) => setImmediate(resolve));
  await h.handlers.get("before_agent_start")({ prompt: "revise this proposal" }, ctx);
  release("unauthorized buffer edit");
  assert.equal((await waiting).details.code, "PICM_PROPOSAL_STALE");
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  assert.equal(existsSync(join(cwd, "new.md")), false);
});

test("revision during an approval dialog cannot authorize the former batch", async (t) => {
  const { cwd, h, ctx, call, proposal } = setup(t);
  await start(h, ctx, call);
  ctx.ui.select = async () => "Standard maintenance";
  await call("begin");
  const prepared = await proposal("prepare", { operations: [{ type: "create", path: "new.md", content: "new\n" }] });
  const identity = { proposalId: prepared.details.proposalId, digest: prepared.details.digest };
  await proposal("present", identity);
  let release;
  ctx.ui.select = () => new Promise((resolve) => { release = resolve; });
  const waiting = proposal("authorize", identity);
  await new Promise((resolve) => setImmediate(resolve));
  await h.handlers.get("before_agent_start")({ prompt: "revise this proposal" }, ctx);
  release("Authorize this exact proposal");
  assert.equal((await waiting).details.code, "PICM_PROPOSAL_STALE");
  assert.equal((await proposal("apply", identity)).details.code, "PICM_PROPOSAL_NOT_APPROVED");
  assert.equal(existsSync(join(cwd, "new.md")), false);
});
