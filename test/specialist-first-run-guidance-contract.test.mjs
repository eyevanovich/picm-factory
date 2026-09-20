import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { extensionHarness } from "./helpers/picm-extension-harness.mjs";
import { git, withFixture, write } from "./helpers/git-fixtures.mjs";

function specialistReceipt(inputs, expectedArtifact = "output/result.md", visibleUncertainty = ["open questions"]) {
  return [
    "```picm-specialist-first-run",
    JSON.stringify({
      version: 1,
      inputs,
      expectedArtifact,
      review: {
        requiresInspectEditApprove: true,
        visibleUncertainty,
      },
      nextAction: { source: expectedArtifact },
    }, null, 2),
    "```",
  ].join("\n");
}

function specialistEditFixture(root, { runtimeInput = false, includeLegacyArrays = true } = {}) {
  const inputs = [
    { path: "source/request.md", availability: "scaffolded", description: "Approved source" },
    ...(runtimeInput
      ? [{ path: "runtime/request.md", availability: "per-run", description: "Runtime request" }]
      : []),
  ];
  const recipe = [
    specialistReceipt(inputs),
    "",
    "# First specialist run",
    "",
    "## This prose may change",
    "",
    "The leading receipt is authoritative.",
    "",
  ].join("\n");
  const paths = {
    rootInstructions: "AGENTS.md",
    rootContext: "CONTEXT.md",
    firstRecipe: "workflows/first.md",
    ...(includeLegacyArrays ? {
      generatedInputs: ["source/request.md"],
      runtimeInputs: runtimeInput ? ["runtime/request.md"] : [],
    } : {}),
  };
  const config = JSON.stringify({
    version: 1,
    generatedBy: "picm-factory",
    profile: "specialist-folder",
    createdAt: "2026-08-26T00:00:00.000Z",
    paths,
  }, null, 2) + "\n";
  const finalContents = {
    "AGENTS.md": "Specialist instructions.\n",
    "CONTEXT.md": "Specialist context.\n",
    "identity.md": "Specialist identity.\n",
    "rules.md": "Specialist rules.\n",
    "workflows/first.md": recipe,
    "source/request.md": "Approved source.\n",
    ...(runtimeInput ? { "runtime/request.md": "Runtime request.\n" } : {}),
    ".picm/config.json": config,
  };
  return { config, ...createSpecialistEditFixture(root, finalContents) };
}

function createSpecialistEditFixture(root, finalContents, { scaffoldedPaths = Object.keys(finalContents) } = {}) {
  const initialContents = Object.fromEntries(
    Object.keys(finalContents).map((path) => [
      path,
      path === ".picm/config.json" ? "{\"legacy\":true}\n" : `Before ${path}.\n`,
    ]),
  );
  for (const [path, content] of Object.entries(initialContents)) {
    write(join(root, path), content);
  }
  git(root, "add", ...Object.keys(initialContents));
  return {
    finalContents,
    initialContents,
    operations: scaffoldedPaths.map((path) => ({
      tool: "edit",
      input: {
        path,
        edits: [{ oldText: initialContents[path], newText: finalContents[path] }],
      },
    })),
  };
}

function faqRecipe({ generatedInputs, runtimeInputs }) {
  const referencePath = "reference/faq-style.md";
  const sourcePath = "source/rough-faq.md";
  const referenceAvailability = generatedInputs.includes(referencePath)
    ? "scaffolded"
    : runtimeInputs.includes(referencePath)
      ? "pre-existing"
      : "per-run";
  return [
    specialistReceipt([
      { path: sourcePath, availability: "per-run", description: "Rough FAQ answer supplied for this run" },
      { path: referencePath, availability: referenceAvailability, description: "Reusable style guidance" },
    ], "review/polished-faq.md", ["unsupported claims", "unresolved questions"]),
    "",
    "# Polish FAQ Workflow",
    "",
    "## Inputs",
    "",
    "This prose is intentionally not route data.",
    "",
  ].join("\n");
}

function faqSpecialistEditFixture(root, {
  generatedInputs = ["reference/faq-style.md"],
  runtimeInputs = ["source/rough-faq.md"],
  includeLegacyArrays = true,
  recipe,
  contentOverrides = {},
} = {}) {
  const source = join(process.cwd(), "test/fixtures/layout-profiles/specialist-folder/faq-polisher");
  const recipePath = "workflows/polish-faq.md";
  const paths = {
    rootInstructions: "AGENTS.md",
    rootContext: "CONTEXT.md",
    firstRecipe: recipePath,
    ...(includeLegacyArrays ? { generatedInputs, runtimeInputs } : {}),
  };
  const config = JSON.stringify({
    version: 1,
    generatedBy: "picm-factory",
    profile: "specialist-folder",
    createdAt: "2026-08-26T00:00:00.000Z",
    paths,
  }, null, 2) + "\n";
  const readSource = (path) => readFileSync(join(source, path), "utf8");
  const finalContents = {
    "AGENTS.md": readSource("AGENTS.md"),
    "CONTEXT.md": readSource("CONTEXT.md"),
    "identity.md": readSource("identity.md"),
    "rules.md": readSource("rules.md"),
    [recipePath]: recipe ?? faqRecipe({ generatedInputs, runtimeInputs }),
    "reference/faq-style.md": readSource("reference/faq-style.md"),
    ".picm/config.json": config,
    ...contentOverrides,
  };
  const scaffoldedPaths = [
    "AGENTS.md",
    "CONTEXT.md",
    "identity.md",
    "rules.md",
    recipePath,
    ".picm/config.json",
    ...generatedInputs,
  ];
  return { config, ...createSpecialistEditFixture(root, finalContents, { scaffoldedPaths }) };
}

async function prepareApprovedSpecialistEdits(h, ctx, operations) {
  const control = h.tools.get("picm_scan_control");
  await h.commands.get("picm-new").handler("create a Specialist folder", ctx);
  await control.execute("edits-preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("edits-privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await h.tools.get("picm_scaffold_proposal").execute(
    "edits-preview",
    { action: "preview", operations },
    undefined,
    undefined,
    ctx,
  );
  await h.handlers.get("input")({
    text: "I understand the risk and want to proceed without a Git checkpoint.",
    source: "interactive",
  }, ctx);
  await h.handlers.get("input")({ text: "approve this exact scaffold", source: "interactive" }, ctx);
  await control.execute("edits-begin", { action: "begin" }, undefined, undefined, ctx);
  return control;
}

async function executeApprovedOperation(h, ctx, toolCallId, operation, { settle = true } = {}) {
  const event = { toolCallId, toolName: operation.tool, input: operation.input };
  assert.equal(await h.handlers.get("tool_call")(event, ctx), undefined);
  let result;
  try {
    result = await h.tools.get(operation.tool).execute(toolCallId, operation.input, undefined, undefined, ctx);
  } catch (error) {
    await h.handlers.get("tool_execution_end")({
      toolCallId,
      toolName: operation.tool,
      args: operation.input,
      isError: true,
    }, ctx);
    throw error;
  }
  if (settle) {
    await h.handlers.get("tool_execution_end")({
      toolCallId,
      toolName: operation.tool,
      args: operation.input,
      result,
      isError: false,
    }, ctx);
  }
  return result;
}

async function completeApprovedSpecialistOperations(h, ctx, operations, prefix = "specialist-operation") {
  await prepareApprovedSpecialistEdits(h, ctx, operations);
  for (const [index, operation] of operations.entries()) {
    await executeApprovedOperation(h, ctx, `${prefix}-${index}`, operation);
  }
}

async function renderSpecialistGuidance(h, ctx, toolCallId = "specialist-guidance") {
  const result = await h.tools.get("picm_specialist_first_run_guidance").execute(
    toolCallId,
    {},
    undefined,
    undefined,
    ctx,
  );
  return result.content[0].text;
}

function specialistGuidanceAdmission(h, ctx, toolCallId) {
  return h.handlers.get("tool_call")({
    toolCallId,
    toolName: "picm_specialist_first_run_guidance",
    input: {},
  }, ctx);
}

function writeOperations(fixture) {
  return Object.entries(fixture.finalContents).map(([path, content]) => ({
    tool: "write",
    input: { path, content },
  }));
}

async function activateSpecialistRun(h, ctx) {
  const control = h.tools.get("picm_scan_control");
  await h.commands.get("picm-new").handler("create a Specialist folder", ctx);
  await control.execute("writes-preflight", { action: "preflight" }, undefined, undefined, ctx);
  await control.execute("writes-privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
  await control.execute("writes-begin", { action: "begin" }, undefined, undefined, ctx);
}

test("picm-new emits final guidance from a completed exact Specialist fixture", async () => {
  await withFixture(async ({ root }) => {
    const fixture = faqSpecialistEditFixture(root);
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-faq-guidance");
    await completeApprovedSpecialistOperations(h, ctx, fixture.operations, "faq-guidance");

    const guidance = await renderSpecialistGuidance(h, ctx, "faq-guidance-render");
    assert.match(guidance, /Start with `workflows\/polish-faq\.md`/);
    assert.match(guidance, /Rough FAQ answer supplied for this run/);
    assert.match(guidance, /`reference\/faq-style\.md` \(scaffolded\): Reusable style guidance/);
    assert.match(guidance, /Expected artifact: `review\/polished-faq\.md`/);
    assert.match(guidance, /Inspect, edit, and explicitly approve `review\/polished-faq\.md`/);
    assert.match(guidance, /unsupported claims and unresolved questions visible/);
    assert.match(guidance, /next specialist action reads from the approved `review\/polished-faq\.md`/);
    assert.match(guidance, /Run `\/picm-maintain` after the first real use/);
  });
});

test("completed exact Specialist edits preserve persisted recipe, config, and Markdown route semantics", async () => {
  await withFixture(async ({ root }) => {
    const recipePath = "workflows/polish-faq.md";
    const fixture = faqSpecialistEditFixture(root, {
      contentOverrides: {
        "reference/faq-style.md": [
          "# Style guidance",
          "",
          "Follow the [API guide](reference/api.md).",
          "Use [the reference guide][api-guide] and [API guide] shortcuts.",
          "",
          "[api-guide]: reference/api.md",
          "[API guide]: reference/api.md",
          "",
        ].join("\n"),
      },
    });
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-persisted-edits");
    const configOperation = fixture.operations.find((operation) => operation.input.path === ".picm/config.json");
    assert.ok(configOperation);
    const orderedOperations = [
      configOperation,
      ...fixture.operations.filter((operation) => operation !== configOperation),
    ];
    await completeApprovedSpecialistOperations(h, ctx, orderedOperations, "persisted-edits");

    const guidance = await renderSpecialistGuidance(h, ctx, "persisted-edits-render");
    assert.match(guidance, /Expected artifact: `review\/polished-faq\.md`/);
  });
});

test("Specialist guidance rejects incomplete, omitted, and non-local persisted route declarations", async () => {
  const scenarios = [
    {
      name: "omitted generated input",
      fixture: (root) => faqSpecialistEditFixture(root, { generatedInputs: [] }),
    },
    {
      name: "non-local runtime input",
      fixture: (root) => faqSpecialistEditFixture(root, { runtimeInputs: ["source/rough-faq.md", "../private.md"] }),
    },
    {
      name: "incomplete required input",
      fixture: (root) => faqSpecialistEditFixture(root, {
        contentOverrides: { "reference/faq-style.md": "{{picm:quality-rule}}\n" },
      }),
    },
  ];

  for (const { name, fixture: createFixture } of scenarios) {
    await withFixture(async ({ root }) => {
      const fixture = createFixture(root);
      const h = extensionHarness();
      const ctx = h.context(realpathSync(root), `specialist-invalid-${name}`);
      await completeApprovedSpecialistOperations(h, ctx, fixture.operations, `invalid-${name}`);
      await assert.rejects(
        renderSpecialistGuidance(h, ctx, `invalid-${name}-render`),
        /SPECIALIST_GUIDANCE_NOT_APPROVED/,
      );
    });
  }
});

test("reserved PiCM tokens in required Specialist scaffold files prevent guidance", async () => {
  for (const path of [
    "AGENTS.md",
    "CONTEXT.md",
    "identity.md",
    "rules.md",
    "reference/faq-style.md",
    ".picm/config.json",
  ]) {
    await withFixture(async ({ root }) => {
      const fixture = faqSpecialistEditFixture(root);
      const operation = fixture.operations.find((candidate) => candidate.input.path === path);
      assert.ok(operation, path);
      operation.input.edits[0].newText = path === ".picm/config.json"
        ? operation.input.edits[0].newText.replace(
          /\n}\n$/,
          ",\n  \"note\": \"{{picm:config-note}}\"\n}\n",
        )
        : "{{picm:required-scaffold-file}}\n";
      const h = extensionHarness();
      const ctx = h.context(realpathSync(root), `specialist-unresolved-${path}`);
      await completeApprovedSpecialistOperations(h, ctx, fixture.operations, `unresolved-${path}`);
      await assert.rejects(
        renderSpecialistGuidance(h, ctx, `unresolved-${path}-render`),
        /SPECIALIST_GUIDANCE_NOT_APPROVED: final Specialist routes are incomplete/,
      );
    });
  }
});

test("receipt supports omitted legacy arrays and does not read pre-existing inputs", async () => {
  await withFixture(async ({ root }) => {
    const fixture = faqSpecialistEditFixture(root, { includeLegacyArrays: false });
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-legacy-omitted");
    await completeApprovedSpecialistOperations(h, ctx, fixture.operations, "legacy-omitted");

    assert.match(
      await renderSpecialistGuidance(h, ctx, "legacy-omitted-render"),
      /Expected artifact: `review\/polished-faq\.md`/,
    );
  });

  await withFixture(async ({ root }) => {
    const fixture = faqSpecialistEditFixture(root, {
      generatedInputs: [],
      runtimeInputs: ["source/rough-faq.md", "reference/faq-style.md"],
    });
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-runtime-reclassification");
    await completeApprovedSpecialistOperations(h, ctx, fixture.operations, "runtime-reclassification");

    const guidance = await renderSpecialistGuidance(h, ctx, "runtime-reclassification-render");
    assert.match(guidance, /`reference\/faq-style\.md` \(pre-existing\): Reusable style guidance/);
  });
});

test("approved writes to non-scaffolded receipt routes fail closed while approved edits remain supported", async () => {
  await withFixture(async ({ root }) => {
    const fixture = specialistEditFixture(root, { runtimeInput: true });
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-runtime-write");
    const operations = writeOperations(fixture);
    await completeApprovedSpecialistOperations(h, ctx, operations, "runtime-write");

    await assert.rejects(
      renderSpecialistGuidance(h, ctx, "runtime-write-render"),
      /SPECIALIST_GUIDANCE_NOT_APPROVED: final Specialist routes are incomplete/,
    );
  });
});

test("completed exact Specialist edits authorize guarded guidance without reclassifying runtime inputs", async () => {
  await withFixture(async ({ root }) => {
    const fixture = specialistEditFixture(root, { runtimeInput: true });
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-edit-only");
    await prepareApprovedSpecialistEdits(h, ctx, fixture.operations);

    const configOperation = fixture.operations.find((operation) => operation.input.path === ".picm/config.json");
    assert.ok(configOperation);
    for (const [index, operation] of fixture.operations.entries()) {
      if (operation === configOperation) continue;
      await executeApprovedOperation(h, ctx, `specialist-edit-${index}`, operation);
    }
    await executeApprovedOperation(h, ctx, "specialist-config-edit", configOperation, { settle: false });

    assert.equal((await specialistGuidanceAdmission(h, ctx, "guidance-before-config-settles"))?.block, true);
    await h.handlers.get("tool_execution_end")({
      toolCallId: "specialist-config-edit",
      toolName: "edit",
      args: configOperation.input,
      isError: false,
    }, ctx);

    assert.equal(await specialistGuidanceAdmission(h, ctx, "guidance-after-edits-settle"), undefined);
    const guidance = await h.tools.get("picm_specialist_first_run_guidance").execute(
      "guidance-after-edits-settle",
      {},
      undefined,
      undefined,
      ctx,
    );
    assert.match(guidance.content[0].text, /Start with `workflows\/first\.md`/);

    write(join(root, ".picm/config.json"), "{ invalid config\n");
    assert.equal((await specialistGuidanceAdmission(h, ctx, "guidance-after-config-change"))?.block, true);
    write(join(root, ".picm/config.json"), fixture.config);
    assert.equal(await specialistGuidanceAdmission(h, ctx, "guidance-after-config-recovery"), undefined);
    assert.match(
      await renderSpecialistGuidance(h, ctx, "guidance-after-config-recovery"),
      /Start with `workflows\/first\.md`/,
    );

    const control = h.tools.get("picm_scan_control");
    await h.commands.get("picm-new").handler("replacement Specialist folder", ctx);
    await control.execute("replacement-preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("replacement-privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await control.execute("replacement-begin", { action: "begin" }, undefined, undefined, ctx);
    assert.equal((await specialistGuidanceAdmission(h, ctx, "guidance-after-workflow-reset"))?.block, true);
  });
});

test("ordinary successful picm-new writes cannot authorize first-run guidance", async () => {
  await withFixture(async ({ root }) => {
    const fixture = specialistEditFixture(root);
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-ordinary-write");
    await activateSpecialistRun(h, ctx);

    for (const [index, operation] of writeOperations(fixture).entries()) {
      await executeApprovedOperation(h, ctx, `ordinary-specialist-write-${index}`, operation);
    }

    const blocked = await specialistGuidanceAdmission(h, ctx, "ordinary-write-guidance");
    assert.equal(blocked?.block, true);
    assert.match(blocked.reason, /SPECIALIST_GUIDANCE_NOT_APPROVED/);
  });
});

test("guidance reads persisted config after approved writes instead of cached write arguments", async () => {
  await withFixture(async ({ root }) => {
    const fixture = specialistEditFixture(root);
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-config-write-drift");
    const operations = writeOperations(fixture);
    await prepareApprovedSpecialistEdits(h, ctx, operations);

    for (const [index, operation] of operations.entries()) {
      await executeApprovedOperation(h, ctx, `approved-specialist-write-${index}`, operation);
    }

    const driftedConfig = JSON.parse(fixture.config);
    driftedConfig.paths.firstRecipe = "workflows/drifted.md";
    write(join(root, ".picm/config.json"), `${JSON.stringify(driftedConfig, null, 2)}\n`);
    await assert.rejects(
      h.tools.get("picm_specialist_first_run_guidance").execute(
        "guidance-after-config-route-drift",
        {},
        undefined,
        undefined,
        ctx,
      ),
      /SPECIALIST_GUIDANCE_NOT_APPROVED: scaffold file must (?:be an approved write or edit|pass the canonical privacy boundary)/,
    );

    write(join(root, ".picm/config.json"), "{ invalid config\n");
    await assert.rejects(
      h.tools.get("picm_specialist_first_run_guidance").execute(
        "guidance-after-invalid-config-drift",
        {},
        undefined,
        undefined,
        ctx,
      ),
      /SPECIALIST_GUIDANCE_NOT_APPROVED: persisted Specialist config is invalid/,
    );
  });
});

test("guidance waits for every current approved scaffold operation and rejects a replacement proposal", async () => {
  await withFixture(async ({ root }) => {
    const fixture = specialistEditFixture(root);
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-sequential-guidance");
    const operations = writeOperations(fixture);
    const finalOperation = operations.find((operation) => operation.input.path === "source/request.md");
    const configOperation = operations.find((operation) => operation.input.path === ".picm/config.json");
    assert.ok(finalOperation);
    assert.ok(configOperation);
    await prepareApprovedSpecialistEdits(h, ctx, operations);

    await executeApprovedOperation(h, ctx, "sequential-config", configOperation);
    for (const [index, operation] of operations.entries()) {
      if (operation === configOperation || operation === finalOperation) continue;
      await executeApprovedOperation(h, ctx, `sequential-required-${index}`, operation);
    }

    const blocked = await specialistGuidanceAdmission(h, ctx, "guidance-between-required-operations");
    assert.equal(blocked?.block, true);
    assert.match(blocked.reason, /complete the current exact scaffold proposal first/);
    await assert.rejects(
      h.tools.get("picm_specialist_first_run_guidance").execute(
        "direct-guidance-between-required-operations",
        {},
        undefined,
        undefined,
        ctx,
      ),
      /SPECIALIST_GUIDANCE_NOT_APPROVED: complete the current exact scaffold proposal first/,
    );

    await executeApprovedOperation(h, ctx, "sequential-final-required", finalOperation);
    const guidance = await h.tools.get("picm_specialist_first_run_guidance").execute(
      "guidance-after-final-required-operation",
      {},
      undefined,
      undefined,
      ctx,
    );
    assert.match(guidance.content[0].text, /Start with `workflows\/first\.md`/);
    assert.equal(await specialistGuidanceAdmission(h, ctx, "guidance-before-proposal-replacement"), undefined);

    await h.tools.get("picm_scaffold_proposal").execute(
      "replacement-preview",
      {
        action: "preview",
        operations: [{ tool: "write", input: { path: "replacement.md", content: "replacement\n" } }],
      },
      undefined,
      undefined,
      ctx,
    );
    await assert.rejects(
      h.tools.get("picm_specialist_first_run_guidance").execute(
        "guidance-after-proposal-replacement",
        {},
        undefined,
        undefined,
        ctx,
      ),
      /SPECIALIST_GUIDANCE_NOT_APPROVED: complete the current exact scaffold proposal first/,
    );
  });
});

test("failed and unapproved Specialist edits cannot authorize first-run guidance", async () => {
  await withFixture(async ({ root }) => {
    const fixture = specialistEditFixture(root);
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-failed-edit");
    const failedOperation = fixture.operations.find((operation) => operation.input.path === ".picm/config.json");
    assert.ok(failedOperation);
    failedOperation.input.edits[0].oldText = "missing config source\n";
    await prepareApprovedSpecialistEdits(h, ctx, fixture.operations);

    await assert.rejects(
      executeApprovedOperation(h, ctx, "failed-specialist-config-edit", failedOperation),
      /old text must match exactly/i,
    );
    assert.equal((await specialistGuidanceAdmission(h, ctx, "guidance-after-failed-edit"))?.block, true);
  });

  await withFixture(async ({ root }) => {
    const fixture = specialistEditFixture(root);
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "specialist-unapproved-edit");
    const alternateOperation = fixture.operations.find((operation) => operation.input.path === "rules.md");
    assert.ok(alternateOperation);
    const approvedOperations = fixture.operations.filter((operation) => operation !== alternateOperation);
    await prepareApprovedSpecialistEdits(h, ctx, approvedOperations);

    for (const [index, operation] of approvedOperations.entries()) {
      await executeApprovedOperation(h, ctx, `approved-specialist-edit-${index}`, operation);
    }
    const blocked = await h.handlers.get("tool_call")({
      toolCallId: "unapproved-specialist-edit",
      toolName: "edit",
      input: alternateOperation.input,
    }, ctx);
    assert.equal(blocked?.block, true);
    await h.handlers.get("tool_execution_end")({
      toolCallId: "unapproved-specialist-edit",
      toolName: "edit",
      args: alternateOperation.input,
      isError: false,
    }, ctx);
    assert.equal((await specialistGuidanceAdmission(h, ctx, "guidance-after-unapproved-edit"))?.block, true);
  });
});
