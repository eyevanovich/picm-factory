import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fixture, harness } from "./helpers/maintenance-extension-harness.mjs";

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
  assert.match(h.sent[0], /agent-document optimization.*Default to No/i);
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
  const sensitiveMaterial = prompt.indexOf("does this workspace contain secrets, regulated data, client data, or personal/private material that must be excluded?");
  const additionalPaths = prompt.indexOf("name each exact project-relative file or directory to exclude");
  const none = prompt.indexOf("reply `none` if there are none");
  const summary = prompt.indexOf("complete concise `.picm/config.json` summary categories");
  const acceptance = prompt.indexOf("obtain the user's summary acceptance");
  const privacy = prompt.indexOf("call `picm_scan_control` with `action: \"privacy\"`");
  const confirmation = prompt.indexOf("exact TUI patch confirmation");
  const skill = prompt.indexOf("load the `picm-factory` skill and its `SKILL.md`");

  assert.ok(preflight >= 0);
  assert.ok(preflight < reassurance);
  assert.ok(reassurance < sensitiveMaterial);
  assert.ok(sensitiveMaterial < additionalPaths);
  assert.ok(additionalPaths < none);
  assert.match(prompt, /Git internals/);
  assert.match(prompt, /symlinks and nested repository\/submodule boundaries/);
  assert.ok(additionalPaths < summary);
  assert.ok(summary < acceptance);
  assert.ok(acceptance < privacy);
  assert.ok(privacy < confirmation);
  assert.ok(confirmation < skill);
  assert.doesNotMatch(prompt.slice(0, preflight), /skill|SKILL\.md/);
  assert.match(prompt, /Mode: adopt\nCommand: \/picm-adopt\n\nUser arguments:\ncoding/);
  assert.match(prompt, /action: "adoption-complete"/);
});

test("maintain loads persisted exclusions and asks the concise privacy question", async (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, ".picm/config.json"), JSON.stringify({
    version: 1,
    privacy: { excludedPaths: ["private"] },
  }));
  const h = harness();
  const ctx = h.context(cwd);

  await h.commands.get("picm-maintain").handler("routing", ctx);

  const prompt = h.sent[0];
  assert.match(prompt, /privacyQuestionIsConcise/);
  assert.match(prompt, /files or directory that should be excluded from reads/);
  assert.doesNotMatch(prompt, /Persisted exclusions are already loaded/);
  const scanGuidance = h.scanControl.promptGuidelines.join("\n");
  assert.match(scanGuidance, /privacyQuestionIsConcise/);
  assert.match(scanGuidance, /files or directory that should be excluded from reads/);
  const preflight = await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
  assert.equal(preflight.details.privacyReviewed, false);
  assert.equal(preflight.details.privacyFollowupPending, true);
  assert.equal(preflight.details.privacyQuestionIsConcise, true);
  assert.deepEqual(preflight.details.excludedPaths, ["private"]);
  await assert.rejects(
    h.scanControl.execute("id", { action: "begin" }, undefined, undefined, ctx),
    /PICM_PRIVACY_NOT_REVIEWED/,
  );
  const privacy = await h.scanControl.execute(
    "id",
    { action: "privacy", excludedPaths: [] },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(privacy.details.privacyReviewed, true);
  assert.equal(privacy.details.privacyFollowupPending, false);
  assert.equal(privacy.details.privacyQuestionIsConcise, false);
  assert.deepEqual(privacy.details.excludedPaths, ["private"]);
});

test("maintain and optimize use concise privacy wording for adopted and scaffolded workspaces", async (t) => {
  const completedConfigs = [
    { version: 1, adoption: { status: "adopted" } },
    {
      version: 1,
      generatedBy: "picm-factory",
      profile: "stage-pipeline",
      createdAt: "2026-08-24",
      paths: { rootInstructions: "AGENTS.md" },
    },
  ];

  for (const command of ["picm-maintain", "picm-optimize"]) {
    for (const config of completedConfigs) {
      const cwd = fixture(t);
      writeFileSync(join(cwd, ".picm/config.json"), JSON.stringify(config));
      const h = harness();
      const ctx = h.context(cwd);

      await h.commands.get(command).handler("", ctx);

      assert.match(h.sent[0], /privacyQuestionIsConcise/);
      assert.match(h.sent[0], /files or directory that should be excluded from reads/);
      const preflight = await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
      assert.equal(preflight.details.privacyQuestionIsConcise, true);
    }
  }
});

test("full privacy bootstrap asks about sensitive material for fresh and incomplete workspaces", async (t) => {
  for (const [command, mode] of [
    ["picm-new", "tui"],
    ["picm-adopt", "tui"],
    ["picm-maintain", "tui"],
    ["picm-optimize", "tui"],
  ]) {
    const cwd = fixture(t);
    const h = harness();
    const ctx = h.context(cwd, mode);

    await h.commands.get(command).handler("", ctx);

    const prompt = h.sent[0];
    assert.match(prompt, /Before scanning any workspace files/);
    assert.match(prompt, /secrets, regulated data, client data, or personal\/private material/);
    assert.match(prompt, /exact project-relative file or directory to exclude/);
    assert.match(prompt, /reply `none` if there are none/);

    const preflight = await h.scanControl.execute("id", { action: "preflight" }, undefined, undefined, ctx);
    assert.equal(preflight.details.privacyQuestionIsConcise, false);
  }
});

test("existing architecture retains picm-new intent through an explicit continuation choice", async (t) => {
  for (const { intent, command, selectedIntent, resumes } of [
    { intent: "add-replace", command: "picm-new", selectedIntent: "add-replace", resumes: true },
    { intent: "adopt-existing", command: "picm-adopt", selectedIntent: "adopt-existing", resumes: true },
    { intent: "cancel", command: "picm-new", selectedIntent: "cancelled", resumes: false },
  ]) {
    const cwd = fixture(t);
    writeFileSync(join(cwd, "AGENTS.md"), "existing architecture\n");
    const h = harness();
    const ctx = h.context(cwd, "tui", `new-intent-${intent}`);
    const control = h.scanControl;

    await h.commands.get("picm-new").handler("customer research pipeline", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    const inventory = await control.execute("inventory", { action: "inventory" }, undefined, undefined, ctx);
    assert.equal(inventory.details.newWorkflowIntentRequired, true);
    assert.equal(inventory.details.initialIntent, "customer research pipeline");
    await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    await h.handlers.get("agent_settled")({}, ctx);
    await h.handlers.get("session_tree")({}, ctx);

    await h.handlers.get("input")({ text: "continue", source: "interactive" }, ctx);
    await assert.rejects(
      control.execute("new-intent", { action: "new-intent", intent }, undefined, undefined, ctx),
      /PICM_NEW_INTENT_NOT_CONFIRMED/,
    );
    await assert.rejects(
      control.execute("begin", { action: "begin" }, undefined, undefined, ctx),
      /PICM_NEW_INTENT_PENDING/,
    );
    await assert.rejects(
      control.execute("complete", { action: "complete" }, undefined, undefined, ctx),
      /PICM_NEW_INTENT_PENDING/,
    );

    const directChoice = {
      "add-replace": "add/replace scaffold",
      "adopt-existing": "adopt existing",
      cancel: "cancel",
    }[intent];
    await h.handlers.get("input")({ text: directChoice, source: "interactive" }, ctx);
    await h.handlers.get("input")({ text: "continue", source: "interactive" }, ctx);

    if (!resumes) {
      const completion = await control.execute("complete", { action: "complete" }, undefined, undefined, ctx);
      assert.equal(completion.details.newWorkflowIntent, "cancelled");
      assert.equal(completion.details.completed, true);
      continue;
    }

    const selected = await control.execute(
      "new-intent",
      { action: "new-intent", intent },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(selected.details.command, command);
    assert.equal(selected.details.initialIntent, "customer research pipeline");
    assert.equal(selected.details.newWorkflowIntent, selectedIntent);
    assert.equal(selected.details.newWorkflowIntentRequired, false);

    const continuation = await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    assert.equal(continuation.details.command, command);
    assert.equal(continuation.details.privacyReviewed, true);
  }
});

test("existing architecture detection stays within a nested picm-new workspace", async (t) => {
  const root = fixture(t);
  const workspace = join(root, "packages", "foo");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "sibling architecture\n");
  const h = harness();
  const ctx = h.context(workspace, "tui", "nested-new-intent");
  const control = h.scanControl;

  await h.commands.get("picm-new").handler("nested workflow", ctx);
  await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  const siblingOnly = await control.execute("inventory", { action: "inventory" }, undefined, undefined, ctx);
  assert.equal(siblingOnly.details.newWorkflowIntentRequired, false);

  writeFileSync(join(workspace, "AGENTS.md"), "nested architecture\n");
  const localArchitecture = await control.execute("inventory", { action: "inventory" }, undefined, undefined, ctx);
  assert.equal(localArchitecture.details.newWorkflowIntentRequired, true);
});

test("privacy-only picm metadata does not count as existing architecture", async (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, ".picm/config.json"), JSON.stringify({
    version: 1,
    privacy: { excludedPaths: ["private"] },
  }));
  writeFileSync(join(cwd, "2026-report.md"), "source file\n");
  writeFileSync(join(cwd, "workflows"), "source file\n");
  writeFileSync(join(cwd, "reference"), "source file\n");
  writeFileSync(join(cwd, "stages"), "source file\n");
  const h = harness();
  const ctx = h.context(cwd, "tui", "privacy-only-metadata");

  await h.commands.get("picm-new").handler("fresh workflow", ctx);
  await h.scanControl.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
  await h.scanControl.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await h.scanControl.execute("begin", { action: "begin" }, undefined, undefined, ctx);
  const inventory = await h.scanControl.execute("inventory", { action: "inventory" }, undefined, undefined, ctx);

  assert.equal(inventory.details.newWorkflowIntentRequired, false);

  mkdirSync(join(cwd, "01_discovery"));
  writeFileSync(join(cwd, "01_discovery/CONTEXT.md"), "numbered architecture\n");
  const numberedDirectory = await h.scanControl.execute(
    "inventory",
    { action: "inventory" },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(numberedDirectory.details.newWorkflowIntentRequired, true);
});

test("completed picm metadata counts as existing architecture", async (t) => {
  for (const config of [
    { version: 1, adoption: { status: "adopted" } },
    {
      version: 1,
      generatedBy: "picm-factory",
      profile: "stage-pipeline",
      createdAt: "2026-08-24",
      paths: { rootInstructions: "AGENTS.md" },
    },
  ]) {
    const cwd = fixture(t);
    writeFileSync(join(cwd, ".picm/config.json"), JSON.stringify(config));
    const h = harness();
    const ctx = h.context(cwd, "tui", `completed-picm-${config.profile ?? "adopted"}`);

    await h.commands.get("picm-new").handler("replacement workflow", ctx);
    await h.scanControl.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await h.scanControl.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await h.scanControl.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    const inventory = await h.scanControl.execute(
      "inventory",
      { action: "inventory" },
      undefined,
      undefined,
      ctx,
    );

    assert.equal(inventory.details.newWorkflowIntentRequired, true);
  }
});

test("direct architecture choice survives session restoration with provenance", async (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, "AGENTS.md"), "existing architecture\n");
  const entries = [];
  const initial = harness({ entries });
  const ctx = initial.context(cwd, "tui", "restored-new-intent");

  await initial.commands.get("picm-new").handler("customer research pipeline", ctx);
  for (const action of ["preflight", "privacy", "begin", "inventory", "end"]) {
    const params = action === "privacy" ? { action, excludedPaths: [] } : { action };
    await initial.scanControl.execute(action, params, undefined, undefined, ctx);
  }
  await initial.handlers.get("input")({ text: "adopt existing", source: "interactive" }, ctx);

  const restored = harness({ entries });
  const restoredCtx = restored.context(cwd, "tui", "restored-new-intent");
  await restored.handlers.get("session_start")({ reason: "resume" }, restoredCtx);
  const selected = await restored.scanControl.execute(
    "new-intent",
    { action: "new-intent", intent: "adopt-existing" },
    undefined,
    undefined,
    restoredCtx,
  );

  assert.equal(selected.details.command, "picm-adopt");
  assert.equal(selected.details.initialIntent, "customer research pipeline");
  assert.equal(selected.details.newWorkflowIntent, "adopt-existing");
});

test("failed adoption validation leaves the architecture choice pending", async (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, "AGENTS.md"), "existing architecture\n");
  const h = harness();
  const ctx = h.context(cwd, "tui", "atomic-adopt-intent");

  await h.commands.get("picm-new").handler("customer research pipeline", ctx);
  for (const action of ["preflight", "privacy", "begin", "inventory", "end"]) {
    const params = action === "privacy" ? { action, excludedPaths: [] } : { action };
    await h.scanControl.execute(action, params, undefined, undefined, ctx);
  }
  await h.handlers.get("input")({ text: "adopt existing", source: "interactive" }, ctx);
  writeFileSync(join(cwd, ".picm/config.json"), "invalid json\n");

  await assert.rejects(
    h.scanControl.execute(
      "new-intent",
      { action: "new-intent", intent: "adopt-existing" },
      undefined,
      undefined,
      ctx,
    ),
    /CONFIG_INVALID_JSON/,
  );
  await assert.rejects(
    h.scanControl.execute("begin", { action: "begin" }, undefined, undefined, ctx),
    /PICM_NEW_INTENT_PENDING/,
  );

  writeFileSync(join(cwd, ".picm/config.json"), '{"version":1}\n');
  const selected = await h.scanControl.execute(
    "new-intent",
    { action: "new-intent", intent: "adopt-existing" },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(selected.details.command, "picm-adopt");
  assert.equal(selected.details.newWorkflowIntent, "adopt-existing");
});

test("picm-new outside TUI keeps its non-bootstrap skill dispatch", async (t) => {
  const cwd = fixture(t);
  const h = harness();

  await h.commands.get("picm-new").handler("", h.context(cwd, "rpc"));

  assert.match(h.sent[0], /Use the picm-factory skill/);
  assert.doesNotMatch(h.sent[0], /Before scanning any workspace files/);
});
