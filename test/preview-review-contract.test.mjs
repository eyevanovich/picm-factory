import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import picmFactoryExtension from "../extensions/picm-factory.ts";
import { createScaffoldApprovalRuntime } from "../extensions/runtime/scaffold-approval.mjs";
import { extensionHarness } from "./helpers/picm-extension-harness.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const protocolPath = "skills/picm-factory/references/preview-review-protocol.md";
const protocol = read(protocolPath);

function commandHarness(cwd = root) {
  const commands = new Map();
  const handlers = new Map();
  const tools = new Map();
  const sent = [];
  const pi = {
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    on(name, handler) { handlers.set(name, handler); },
    appendEntry() {},
    sendUserMessage(message) { sent.push(message); },
  };
  let command;
  let completed = false;
  const scaffold = createScaffoldApprovalRuntime();
  const scope = "preview-contract-workflow";
  picmFactoryExtension(pi, {
    createCoordinator: () => ({
      authorizeWorkflow(_ctx, nextCommand) {
        scaffold.clear(scope);
        command = nextCommand;
        completed = false;
        return { command: nextCommand };
      },
      beginBoundPathExecution() {},
      checkToolCall: async (event) => {
        const admission = scaffold.admission(scope, event);
        if (!admission.active) return { allowed: true };
        const allowedControl = new Set(["read", "grep", "rg", "find", "ls", "picm_scan_control", "picm_scaffold_proposal"]);
        const maintenancePreview = event.toolName === "picm_maintenance_policy" && event.input?.action === "preview";
        if (!allowedControl.has(event.toolName) && !maintenancePreview && !admission.allowed) {
          return { allowed: false, reason: "Blocked scaffold mutation: directly approve and apply only the current exact proposal" };
        }
        if (admission.operationIdentity) scaffold.reserve(scope, admission, event.toolCallId);
        return { allowed: true };
      },
      claimInitialMaintenanceOffer: async () => undefined,
      clearWorkflow() { scaffold.clear(scope); command = undefined; return true; },
      continueAdoptionAsMaintenance() {},
      currentWorkflowCommand: () => command,
      workflowCommand: () => command,
      dispose: async () => { scaffold.clear(scope); },
      endToolExecution(event) { scaffold.complete(scope, event.toolCallId, !event.isError); },
      isWorkflowCompleted: () => completed,
      maintenancePolicy() {},
      observeInput(_ctx, text) { scaffold.observeInput(scope, text); },
      observeProposalResponse() {},
      resetCycle() {},
      restoreWorkflow() {
        const hadScaffoldProposal = scaffold.has(scope);
        scaffold.clear(scope);
        if (hadScaffoldProposal) scaffold.replaceWithInvalidatedSentinel(scope);
      },
      scanControl() {},
      scaffoldProposal(_ctx, operations) { return scaffold.register(scope, operations); },
      serializeWorkflow(_ctx, status) { return command ? { status, cwd, command } : undefined; },
      settle: () => {
        if (!completed) {
          scaffold.settle(scope, false);
          return false;
        }
        scaffold.clear(scope);
        command = undefined;
        return true;
      },
      specialistRouteSemantics() {},
      startup: async () => {},
    }),
  });
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => [], getEntries: () => [], getSessionId: () => "preview-contract" },
    ui: {
      notify() {},
      confirm: async () => true,
      select: async (_title, items) => items[0],
    },
  };
  return { commands, handlers, sent, tools, ctx, completeWorkflow: () => { completed = true; } };
}

function workspaceSnapshot(path) {
  const snapshot = {};
  const visit = (directory, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryRelative = join(relative, entry.name);
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath, entryRelative);
      else snapshot[entryRelative] = readFileSync(entryPath, "utf8");
    }
  };
  visit(path);
  return snapshot;
}

async function runScaffoldReply(h, proposal, reply) {
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal",
    { action: "preview", operations: proposal.map(({ path, content }) => ({ tool: "write", input: { path, content } })) },
    undefined,
    undefined,
    h.ctx,
  );
  await h.handlers.get("agent_settled")({}, h.ctx);
  await h.handlers.get("input")({ text: reply, source: "interactive" }, h.ctx);
  const written = [];
  for (const action of proposal) {
    const input = { path: action.path, content: action.content };
    const decision = await h.handlers.get("tool_call")({ toolName: "write", toolCallId: action.path, input }, h.ctx);
    if (decision?.block) continue;
    await h.tools.get("write").execute(action.path, input, undefined, undefined, h.ctx);
    await h.handlers.get("tool_execution_end")({
      toolCallId: action.path,
      toolName: "write",
      result: {},
      isError: false,
    }, h.ctx);
    written.push(action.path);
  }
  return { written };
}

function scaffoldFixture(t, existingArchitecture = false) {
  const workspace = mkdtempSync(join(tmpdir(), "picm-preview-contract-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  if (existingArchitecture) writeFileSync(join(workspace, "AGENTS.md"), "existing architecture\n");
  const proposal = existingArchitecture
    ? [
      { path: "AGENTS.md", content: "reviewed replacement\n" },
      { path: "CONTEXT.md", content: "reviewed context\n" },
    ]
    : [
      { path: "AGENTS.md", content: "reviewed routing\n" },
      { path: "stages/01_intake/CONTEXT.md", content: "reviewed stage\n" },
    ];
  return { workspace, proposal };
}

test("shipped protocol defines complete summary, direct approval, and revision invalidation", () => {
  for (const signal of [
    "proposal batch",
    "Affected files and operations",
    "Behavior or configuration changes",
    "Linked cross-file moves",
    "Preserved behavior",
    "Known uncertainty",
    "Review suggestions",
    "literal `None`",
    "Option choice, cadence choice, a preview request, review navigation, or vague assent is not approval",
    "preserves applicable selection and review state for unchanged paths",
    "Review suggestions never block approval",
    "Approve this proposal to write it, or ask to inspect a diff",
    "Git checkpoint recommendation",
    "not as a separate wizard, approval gate, or repository-wide clean-state requirement",
    "current contents of affected existing files",
    "do not inspect Git status, history, or file contents to verify coverage",
    "uncommitted or untracked work, which may be unrecoverable through Git",
    "broad Git restore can erase newer edits",
    "Non-Git and new/empty workspaces remain supported",
    "I understand the risk and want to proceed without a Git checkpoint.",
    "A clear user report that they created a Git checkpoint is the same unverified, non-approving acknowledgment",
    "new-only proposals remain directly approvable",
    "Retain a user-reported checkpoint or risk opt-out only while the exact proposal's paths, actions, contents, and digest remain unchanged",
    "Cancellation, a terminal result, workflow/session/phase replacement, or teardown clears it",
    "normal refreshed summary and require normal direct approval",
  ]) assert.ok(protocol.includes(signal), `missing protocol signal: ${signal}`);
  assert.equal(protocol.includes("Mandatory exact review"), false);
  assert.equal(protocol.includes("Approval is unavailable while any mandatory item is pending"), false);
});

test("Scenario 6 new scaffold keeps preview-only and vague replies as strict no-write", async (t) => {
  for (const reply of ["preview only", "continue", "looks good", "yes", "go ahead", "."]) {
    const { workspace, proposal } = scaffoldFixture(t);
    const h = commandHarness(workspace);
    await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
    assert.equal(h.sent.length, 1);
    const before = workspaceSnapshot(workspace);
    assert.deepEqual(await runScaffoldReply(h, proposal, reply), { written: [] });
    assert.deepEqual(workspaceSnapshot(workspace), before, `${JSON.stringify(reply)} changed the workspace`);
  }
});

test("new-only picm-new scaffolds write only the directly approved current exact proposal", async (t) => {
  const { workspace, proposal } = scaffoldFixture(t);
  const h = commandHarness(workspace);
  await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
  assert.equal(h.sent.length, 1);
  const result = await runScaffoldReply(h, proposal, "approve this exact scaffold");
  assert.deepEqual(result.written, proposal.map(({ path }) => path));
  assert.deepEqual(
    workspaceSnapshot(workspace),
    Object.fromEntries(proposal.map(({ path, content }) => [path, content])),
  );
});

test("existing scaffold writes require a proposal-scoped checkpoint acknowledgement", async (t) => {
  const activate = async (h, ctx, operations) => {
    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-new").handler("existing scaffold", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await h.tools.get("picm_scaffold_proposal").execute(
      "preview",
      { action: "preview", operations },
      undefined,
      undefined,
      ctx,
    );
    return control;
  };
  const operation = { tool: "write", input: { path: "AGENTS.md", content: "reviewed replacement\n" } };

  {
    const { workspace } = scaffoldFixture(t, true);
    const h = extensionHarness();
    const ctx = h.context(workspace, "scaffold-unacknowledged");
    const control = await activate(h, ctx, [operation]);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const blocked = await h.handlers.get("tool_call")({
      toolCallId: "unacknowledged-existing-write",
      toolName: "write",
      input: operation.input,
    }, ctx);
    assert.equal(blocked?.block, true);
    assert.equal(readFileSync(join(workspace, "AGENTS.md"), "utf8"), "existing architecture\n");
  }

  for (const acknowledgement of [
    "I created a Git checkpoint.",
    "Git checkpoint created.",
    "I committed the affected files in Git.",
    "I understand the risk and want to proceed without a Git checkpoint.",
  ]) {
    const { workspace } = scaffoldFixture(t, true);
    const h = extensionHarness();
    const ctx = h.context(workspace, `scaffold-${acknowledgement.slice(0, 8)}`);
    const control = await activate(h, ctx, [operation]);
    const before = workspaceSnapshot(workspace);

    await h.handlers.get("input")({ text: acknowledgement, source: "interactive" }, ctx);
    const pending = await h.handlers.get("tool_call")({
      toolCallId: "acknowledgement-only",
      toolName: "write",
      input: operation.input,
    }, ctx);
    assert.equal(pending?.block, true);
    assert.deepEqual(workspaceSnapshot(workspace), before);

    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "acknowledged-existing-write",
      toolName: "write",
      input: operation.input,
    }, ctx), undefined);
    await h.tools.get("write").execute(
      "acknowledged-existing-write",
      operation.input,
      undefined,
      undefined,
      ctx,
    );
    await h.handlers.get("tool_execution_end")({
      toolCallId: "acknowledged-existing-write",
      toolName: "write",
      args: operation.input,
      isError: false,
    }, ctx);
    assert.equal(readFileSync(join(workspace, "AGENTS.md"), "utf8"), operation.input.content);
  }

  {
    const { workspace } = scaffoldFixture(t, true);
    const h = extensionHarness();
    const ctx = h.context(workspace, "scaffold-unrecognized-checkpoint");
    const control = await activate(h, ctx, [operation]);
    const before = workspaceSnapshot(workspace);

    await h.handlers.get("input")({ text: "I saved the current files in Git.", source: "interactive" }, ctx);
    const pending = await h.handlers.get("tool_call")({
      toolCallId: "unrecognized-checkpoint-only",
      toolName: "write",
      input: operation.input,
    }, ctx);
    assert.equal(pending?.block, true);
    assert.deepEqual(workspaceSnapshot(workspace), before);

    await h.handlers.get("input")({ text: "I understand the risk and want to proceed without a Git checkpoint.", source: "interactive" }, ctx);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "unrecognized-then-approved-existing-write",
      toolName: "write",
      input: operation.input,
    }, ctx), undefined);
  }

  {
    const { workspace } = scaffoldFixture(t, true);
    const h = extensionHarness();
    const ctx = h.context(workspace, "scaffold-phase-checkpoint");
    const control = await activate(h, ctx, [operation]);
    await h.handlers.get("input")({ text: "I created a Git checkpoint.", source: "interactive" }, ctx);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    const phaseReplaced = await h.handlers.get("tool_call")({
      toolCallId: "phase-replaced-scaffold-write",
      toolName: "write",
      input: operation.input,
    }, ctx);
    assert.equal(phaseReplaced?.block, true);
    assert.equal(readFileSync(join(workspace, "AGENTS.md"), "utf8"), "existing architecture\n");
  }

  {
    const { workspace } = scaffoldFixture(t);
    const h = extensionHarness();
    const ctx = h.context(workspace, "new-only-scaffold-checkpoint");
    const newOperation = { tool: "write", input: { path: "NEW.md", content: "new\n" } };
    const control = await activate(h, ctx, [newOperation]);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    assert.equal(await h.handlers.get("tool_call")({
      toolCallId: "new-only-scaffold-write",
      toolName: "write",
      input: newOperation.input,
    }, ctx), undefined);
    await h.tools.get("write").execute("new-only-scaffold-write", newOperation.input, undefined, undefined, ctx);
    await h.handlers.get("tool_execution_end")({
      toolCallId: "new-only-scaffold-write",
      toolName: "write",
      args: newOperation.input,
      isError: false,
    }, ctx);
    assert.equal(readFileSync(join(workspace, "NEW.md"), "utf8"), "new\n");
  }
});

test("scaffold terminal clauses outrank combined checkpoint acknowledgements", async (t) => {
  const operation = { tool: "write", input: { path: "AGENTS.md", content: "reviewed replacement\n" } };
  const replies = [
    "I created a Git checkpoint for this proposal; cancel it.",
    "I created a Git checkpoint for this proposal; revise it.",
    "I created a Git checkpoint for this proposal; adjust it.",
    "I understand the risk and want to proceed without a Git checkpoint; cancel it.",
    "I understand the risk and want to proceed without a Git checkpoint; revise it.",
  ];

  for (const [index, reply] of replies.entries()) {
    const { workspace } = scaffoldFixture(t, true);
    const before = workspaceSnapshot(workspace);
    const h = extensionHarness();
    const ctx = h.context(workspace, `scaffold-terminal-checkpoint-${index}`);
    const control = h.tools.get("picm_scan_control");
    const scaffold = h.tools.get("picm_scaffold_proposal");

    await h.commands.get("picm-new").handler("existing scaffold", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await scaffold.execute(
      "preview",
      { action: "preview", operations: [operation] },
      undefined,
      undefined,
      ctx,
    );
    await h.handlers.get("input")({ text: reply, source: "interactive" }, ctx);
    await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const blocked = await h.handlers.get("tool_call")({
      toolCallId: `terminal-checkpoint-write-${index}`,
      toolName: "write",
      input: operation.input,
    }, ctx);
    assert.equal(blocked?.block, true);
    assert.deepEqual(workspaceSnapshot(workspace), before);
  }
});

test("scaffold approval before registration remains no-write", async (t) => {
  const { workspace } = scaffoldFixture(t);
  const h = extensionHarness();
  const ctx = h.context(workspace, "scaffold-approval-before-preview");
  const control = h.tools.get("picm_scan_control");
  const scaffold = h.tools.get("picm_scaffold_proposal");
  const operation = { tool: "write", input: { path: "NEW.md", content: "new\n" } };

  await h.commands.get("picm-new").handler("new scaffold", ctx);
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
  await scaffold.execute("preview", { action: "preview", operations: [operation] }, undefined, undefined, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

  const blocked = await h.handlers.get("tool_call")({
    toolCallId: "approval-before-preview-write",
    toolName: "write",
    input: operation.input,
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(workspaceSnapshot(workspace)["NEW.md"], undefined);
});

test("revised scaffold proposals do not inherit checkpoint acknowledgements", async (t) => {
  const { workspace } = scaffoldFixture(t, true);
  const h = extensionHarness();
  const ctx = h.context(workspace, "revised-scaffold-checkpoint");
  const control = h.tools.get("picm_scan_control");
  const scaffold = h.tools.get("picm_scaffold_proposal");
  const original = { tool: "write", input: { path: "AGENTS.md", content: "original draft\n" } };
  const revised = { tool: "write", input: { path: "AGENTS.md", content: "revised draft\n" } };

  await h.commands.get("picm-new").handler("existing scaffold", ctx);
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await scaffold.execute("original-preview", { action: "preview", operations: [original] }, undefined, undefined, ctx);
  await h.handlers.get("input")({ text: "I created a Git checkpoint.", source: "interactive" }, ctx);
  await h.handlers.get("input")({ text: "change the scaffold", source: "interactive" }, ctx);
  await scaffold.execute("revised-preview", { action: "preview", operations: [revised] }, undefined, undefined, ctx);
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

  const missingRenewal = await h.handlers.get("tool_call")({
    toolCallId: "revised-without-acknowledgement",
    toolName: "write",
    input: revised.input,
  }, ctx);
  assert.equal(missingRenewal?.block, true);
  assert.equal(readFileSync(join(workspace, "AGENTS.md"), "utf8"), "existing architecture\n");

  await h.handlers.get("input")({ text: "I understand the risk and want to proceed without a Git checkpoint.", source: "interactive" }, ctx);
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
  assert.equal(await h.handlers.get("tool_call")({
    toolCallId: "revised-with-acknowledgement",
    toolName: "write",
    input: revised.input,
  }, ctx), undefined);
  await h.tools.get("write").execute("revised-with-acknowledgement", revised.input, undefined, undefined, ctx);
  await h.handlers.get("tool_execution_end")({
    toolCallId: "revised-with-acknowledgement",
    toolName: "write",
    args: revised.input,
    isError: false,
  }, ctx);
  assert.equal(readFileSync(join(workspace, "AGENTS.md"), "utf8"), revised.input.content);
});

test("picm-new rejects unregistered mutations and alternate write-capable tools", async (t) => {
  const { workspace, proposal } = scaffoldFixture(t);
  const h = commandHarness(workspace);
  await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal",
    { action: "preview", operations: proposal.map(({ path, content }) => ({ tool: "write", input: { path, content } })) },
    undefined,
    undefined,
    h.ctx,
  );
  await h.handlers.get("agent_settled")({}, h.ctx);
  await h.handlers.get("input")({ text: "continue", source: "interactive" }, h.ctx);
  const bash = await h.handlers.get("tool_call")({
    toolName: "bash",
    toolCallId: "bash-bypass",
    input: { command: "touch UNREVIEWED.md" },
  }, h.ctx);
  await h.handlers.get("input")(
    { text: "I approve the current exact proposal; write it now", source: "interactive" },
    h.ctx,
  );
  const unregistered = await h.handlers.get("tool_call")({
    toolName: "write",
    toolCallId: "unregistered",
    input: { path: "UNREVIEWED.md", content: "not reviewed\n" },
  }, h.ctx);
  assert.equal(unregistered.block, true);
  assert.equal(bash.block, true);
  assert.deepEqual(workspaceSnapshot(workspace), {});
});

test("picm-new retries a reviewed operation after failed execution", async (t) => {
  const { workspace, proposal } = scaffoldFixture(t);
  const h = commandHarness(workspace);
  await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
  const operation = { tool: "write", input: proposal[0] };
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal",
    { action: "preview", operations: [operation] },
    undefined,
    undefined,
    h.ctx,
  );
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, h.ctx);
  const first = await h.handlers.get("tool_call")({
    toolName: "write",
    toolCallId: "failed-write",
    input: operation.input,
  }, h.ctx);
  assert.equal(first, undefined);
  await h.handlers.get("tool_execution_end")({
    toolCallId: "failed-write",
    toolName: "write",
    result: {},
    isError: true,
  }, h.ctx);
  const retry = await h.handlers.get("tool_call")({
    toolName: "write",
    toolCallId: "retry-write",
    input: operation.input,
  }, h.ctx);
  assert.equal(retry, undefined);
});

test("picm-new invalidates stale operations after a revision request", async (t) => {
  const { workspace, proposal } = scaffoldFixture(t);
  const h = commandHarness(workspace);
  await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
  const staleOperation = { tool: "write", input: proposal[0] };
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal-a",
    { action: "preview", operations: [staleOperation] },
    undefined,
    undefined,
    h.ctx,
  );
  await h.handlers.get("input")({ text: "Change AGENTS.md to use the revised routing", source: "interactive" }, h.ctx);
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, h.ctx);
  const stale = await h.handlers.get("tool_call")({
    toolName: "write",
    toolCallId: "stale-write",
    input: staleOperation.input,
  }, h.ctx);
  assert.equal(stale.block, true);

  const revisedOperation = {
    tool: "write",
    input: { path: "AGENTS.md", content: "revised reviewed routing\n" },
  };
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal-b",
    { action: "preview", operations: [revisedOperation] },
    undefined,
    undefined,
    h.ctx,
  );
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, h.ctx);
  const revised = await h.handlers.get("tool_call")({
    toolName: "write",
    toolCallId: "revised-write",
    input: revisedOperation.input,
  }, h.ctx);
  assert.equal(revised, undefined);
});

test("picm-new invalidates a reviewed proposal after switching session branches", async (t) => {
  const { workspace, proposal } = scaffoldFixture(t);
  const h = commandHarness(workspace);
  await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
  const operation = { tool: "write", input: proposal[0] };
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal",
    { action: "preview", operations: [operation] },
    undefined,
    undefined,
    h.ctx,
  );

  await h.handlers.get("session_tree")({}, h.ctx);
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, h.ctx);
  const decision = await h.handlers.get("tool_call")({
    toolName: "write",
    toolCallId: "stale-branch-write",
    input: operation.input,
  }, h.ctx);

  assert.equal(decision.block, true);
  assert.deepEqual(workspaceSnapshot(workspace), {});
});

test("picm-new detects a revision appended to review navigation", async (t) => {
  const { workspace, proposal } = scaffoldFixture(t);
  const h = commandHarness(workspace);
  await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
  const operation = { tool: "write", input: proposal[0] };
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal",
    { action: "preview", operations: [operation] },
    undefined,
    undefined,
    h.ctx,
  );
  await h.handlers.get("input")(
    { text: "show diff for AGENTS.md and change CONTEXT.md", source: "interactive" },
    h.ctx,
  );
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, h.ctx);
  const decision = await h.handlers.get("tool_call")({
    toolName: "write",
    toolCallId: "stale-navigation-write",
    input: operation.input,
  }, h.ctx);
  assert.equal(decision.block, true);
});

test("completed picm-new releases ordinary tools from scaffold approval", async (t) => {
  const { workspace, proposal } = scaffoldFixture(t);
  const h = commandHarness(workspace);
  await h.commands.get("picm-new").handler("stage pipeline", h.ctx);
  await h.tools.get("picm_scaffold_proposal").execute(
    "proposal",
    { action: "preview", operations: [{ tool: "write", input: proposal[0] }] },
    undefined,
    undefined,
    h.ctx,
  );
  h.completeWorkflow();
  await h.handlers.get("agent_settled")({}, h.ctx);
  const decision = await h.handlers.get("tool_call")({
    toolName: "bash",
    toolCallId: "ordinary-bash",
    input: { command: "pwd" },
  }, h.ctx);
  assert.equal(decision, undefined);
});

test("optional exact review choices, navigation state, and rendering kinds are explicit", () => {
  assert.deepEqual(
    [...protocol.matchAll(/^\d\. \*\*(View all|Select files|Return to summary)\*\*$/gm)].map((match) => match[1]),
    ["View all", "Select files", "Return to summary"],
  );
  for (const signal of [
    "retains the current selection and which files have been reviewed",
    "**Previous**",
    "**Next**",
    "**Back to selection**",
    "unified diff with path headers",
    "complete proposed content",
    "complete removed content",
    "review source and destination together",
    "conversationally names or checks paths from the current proposal",
    "Selecting either the source or destination of a linked move selects and reviews the whole source-destination pair",
    "do not reveal it or weaken scan/privacy boundaries",
  ]) assert.ok(protocol.includes(signal), `missing exact-review signal: ${signal}`);
});

test("review suggestions stay non-blocking while control-write confirmations remain explicit", () => {
  for (const signal of [
    "deletions, linked moves, material changes to safety, privacy, permissions, approval boundaries, or required commands",
    "unusually large or uncertain change sets",
    "Review suggestions never block approval",
    "persisted `privacy.excludedPaths`",
    "standalone maintenance-policy control write",
    "complete concise summary and direct acceptance first",
    "built-in exact TUI patch confirmation as the separate runtime write confirmation",
    "pass only `action: \"apply\"` and the accepted preview's `previewId`",
    "direct-apply runtime compatibility remains unchanged",
    "Neither control confirmation authorizes other project writes",
  ]) assert.ok(protocol.includes(signal), `missing control-write signal: ${signal}`);
});

test("skill and adoption references retain one summary-and-approval flow", () => {
  for (const file of [
    "skills/picm-factory/SKILL.md",
    "skills/picm-factory/references/adoption-guide.md",
    "skills/picm-factory/references/coding-adoption-guide.md",
  ]) assert.equal(read(file).includes("mandatory exact review"), false, `${file} retained the removed gate`);

  assert.match(
    read("skills/picm-factory/references/coding-adoption-guide.md"),
    /Highlight linked moves and deletions with their intent and impact in the summary/,
  );
  const adoptionGuide = read("skills/picm-factory/references/adoption-guide.md");
  assert.match(
    adoptionGuide,
    /one direct approval authorizes the whole enumerated batch/,
  );
  assert.match(
    adoptionGuide,
    /Persisted privacy exclusions and standalone maintenance-policy controls retain their separate runtime confirmations/,
  );
  assert.match(
    read("skills/picm-factory/references/optimization-guide.md"),
    /preserve applicable unchanged-path review state/,
  );
});

test("adopt dispatch routes proposal behavior to the adoption guide", async () => {
  const h = commandHarness();
  await h.commands.get("picm-adopt").handler("", h.ctx);

  assert.equal(h.sent.length, 1);
  const prompt = h.sent[0];
  assert.match(prompt, /load the `picm-factory` skill and its `SKILL\.md`/);
  assert.match(prompt, /Load and follow `references\/adoption-guide\.md` before creating an adoption proposal/);
});

test("write-workflow dispatch preserves checkpoint guidance without making its opt-out approval", async () => {
  const h = commandHarness();
  for (const [command, args] of [
    ["picm-new", "stage pipeline"],
    ["picm-adopt", "coding"],
    ["picm-maintain", "routing"],
    ["picm-optimize", ""],
  ]) {
    await h.commands.get(command).handler(args, h.ctx);
  }

  for (const prompt of h.sent) {
    assert.match(prompt, /Git checkpoint recommendation/);
    assert.match(prompt, /affected existing content/);
    assert.match(prompt, /never inspect Git status, history, or contents/);
    assert.match(prompt, /I understand the risk and want to proceed without a Git checkpoint/);
    assert.match(prompt, /unverified acknowledgement, not approval: direct approval must follow/);
    assert.match(prompt, /unchanged presented proposal/);
    assert.match(prompt, /references\/preview-review-protocol\.md/);
  }
});

test("new-workspace guidance replaces Git-status inspection with checkpoint guidance", () => {
  const skill = read("skills/picm-factory/SKILL.md");
  const interview = read("skills/picm-factory/references/interview-guide.md");
  for (const text of [skill, interview]) {
    assert.match(text, /strongly recommend(?: that)? (?:the user create|a user-created) (?:a )?Git commit/i);
    assert.match(text, /do not inspect Git status, history, or file contents/i);
    assert.match(text, /Non-Git and new\/empty workspaces remain supported|non-Git and new\/empty workspaces remain supported/i);
    assert.doesNotMatch(text, /git status --short/);
  }
});

test("skill, adopt, coding, maintenance, optimization, help, and public guidance point to the protocol", () => {
  const expected = {
    "skills/picm-factory/SKILL.md": [protocolPath.split("/").at(-1), "Before every proposal batch"],
    "skills/picm-factory/references/adoption-guide.md": ["preview-review-protocol.md", "refreshed summary"],
    "skills/picm-factory/references/coding-adoption-guide.md": ["preview-review-protocol.md", "suggest exact review"],
    "skills/picm-factory/references/maintenance-rubric.md": ["preview-review-protocol.md"],
    "skills/picm-factory/references/optimization-guide.md": ["preview-review-protocol.md", "without making review a gate"],
    "prompts/picm-adopt.md": ["summary-preview and optional-diff-review protocol"],
    "prompts/picm-maintain.md": ["summary-preview and optional-diff-review protocol"],
    "prompts/picm-optimize.md": ["summary-preview and optional-diff-review protocol"],
    "prompts/picm-help.md": ["non-blocking review suggestions", "optional exact review"],
    "README.md": ["complete concise summary", "`View all`, `Select files`, and `Return to summary`"],
    "docs/layout-fixture-qa.md": ["both `/picm-adopt` and `/picm-maintain`", "Repeat the no-write check"],
  };
  for (const [file, signals] of Object.entries(expected)) {
    const text = read(file);
    for (const signal of signals) assert.ok(text.includes(signal), `${file} missing ${signal}`);
  }
});

test("dispatch prompts preserve privacy bootstrap ordering and add optional-review guidance", async () => {
  const h = commandHarness();
  await h.commands.get("picm-adopt").handler("coding", h.ctx);
  await h.commands.get("picm-maintain").handler("routing", h.ctx);
  await h.commands.get("picm-optimize").handler("", h.ctx);
  await h.commands.get("picm-help").handler("", h.ctx);

  const [adopt, maintain, optimize, help] = h.sent;
  {
    const preflight = adopt.indexOf('action: "preflight"');
    const question = adopt.indexOf("ask the user");
    const summary = adopt.indexOf("complete concise `.picm/config.json` summary categories");
    const acceptance = adopt.indexOf("obtain the user's summary acceptance");
    const privacy = adopt.indexOf('call `picm_scan_control` with `action: "privacy"`');
    const confirmation = adopt.indexOf("exact TUI patch confirmation");
    const skill = adopt.indexOf("load the `picm-factory` skill");
    assert.ok(preflight >= 0 && preflight < question);
    assert.ok(question < summary);
    assert.ok(summary < acceptance && acceptance < privacy);
    assert.ok(privacy < confirmation && confirmation < skill);
  }
  {
    const preflight = optimize.indexOf('action: "preflight"');
    const conciseQuestion = optimize.indexOf("Name any additional project-relative files or directory that should be excluded from reads, or reply `none` to continue.");
    const privacy = optimize.indexOf('call `picm_scan_control` with `action: "privacy"`');
    const skill = optimize.indexOf("load the `picm-factory` skill");
    assert.ok(preflight >= 0 && preflight < conciseQuestion);
    assert.ok(conciseQuestion < privacy && privacy < skill);
  }
  for (const prompt of [maintain, optimize]) {
    assert.match(prompt, /privacyQuestionIsConcise/);
    assert.match(prompt, /files or directory that should be excluded from reads/);
  }
  assert.ok(adopt.indexOf("load the `picm-factory` skill") < adopt.indexOf("summary-preview and optional-diff-review protocol"));
  for (const prompt of [adopt, maintain, optimize]) {
    assert.match(prompt, /Present the complete current summary/);
    assert.match(prompt, /accept, approve, accept and write, or proceed/);
    assert.match(prompt, /write only that exact proposal/);
    assert.match(prompt, /non-blocking review suggestions/);
    assert.match(prompt, /Do not require a separate summary-acceptance step or review menu/);
    assert.match(prompt, /exact review available on demand for view all, review files, and show diff for a path/);
    assert.match(prompt, /preserve applicable unchanged-path review state/);
  }
  assert.match(help, /Use the picm-factory skill\. Load its SKILL\.md before proceeding/);
  assert.match(help, /Mode: help\nCommand: \/picm-help/);
  assert.doesNotMatch(help, /summary-preview/);
  assert.match(maintain, /Maintenance run depth: strict.*run only.*Do not mutate/s);
});

test("shipped adopt prompt requires accepted persisted-privacy summary before privacy and skill", () => {
  const adopt = read("prompts/picm-adopt.md");
  const preflight = adopt.indexOf('action: "preflight"');
  const question = adopt.indexOf("Ask exactly:");
  const summary = adopt.indexOf("complete concise `.picm/config.json` summary categories");
  const acceptance = adopt.indexOf("obtain the user's summary acceptance");
  const privacy = adopt.indexOf('call `picm_scan_control` with `action: "privacy"`');
  const skill = adopt.indexOf("load the `picm-factory` skill");
  assert.ok(preflight >= 0 && preflight < question);
  assert.ok(question < summary && summary < acceptance);
  assert.ok(acceptance < privacy && privacy < skill);
  assert.match(adopt, /explain the privacy configuration impact/);
  assert.match(adopt, /exact TUI patch confirmation is the separate runtime write confirmation/);
});

test("contract keeps implementation non-goals explicit", () => {
  for (const signal of [
    "not a deterministic plan engine or semantic-equivalence checker",
    "does not authorize crawling, a custom TUI, a workflow executor",
    "preserving all runtime privacy and scan behavior",
  ]) assert.ok(protocol.includes(signal), `missing non-goal: ${signal}`);

  const packageCheck = read("scripts/check-package.mjs");
  assert.ok(packageCheck.includes(protocolPath));
  assert.ok(packageCheck.includes("test/preview-review-contract.test.mjs"));
});
