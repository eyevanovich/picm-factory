import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";
import { applyProposalBatch, prepareProposalBatch } from "../extensions/runtime/proposal-batch.mjs";

import { git, write, withFixture } from "./helpers/git-fixtures.mjs";
import { extensionHarness } from "./helpers/picm-extension-harness.mjs";

async function withMixedProposalFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "picm-mixed-proposal-batch-"));
  cpSync(
    join(process.cwd(), "test/fixtures/layout-profiles/custom-existing-structure/mixed-proposal-batch"),
    root,
    { recursive: true },
  );
  git(root, "init", "-q");
  git(root, "add", ".");
  try {
    await run({ root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("checkpoint reports and risk opt-outs remain pending until later direct approval", async () => {
  for (const acknowledgement of [
    "I created a Git checkpoint.",
    "I understand the risk and want to proceed without a Git checkpoint.",
  ]) {
    await withFixture(async ({ root }) => {
      const h = extensionHarness();
      const ctx = h.context(root, `checkpoint-${acknowledgement.slice(0, 8)}`);
      const control = h.tools.get("picm_scan_control");
      const batch = h.tools.get("picm_proposal_batch");

      await h.commands.get("picm-adopt").handler("coding", ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
      const prepared = await batch.execute("prepare", {
        action: "prepare",
        operations: [{ type: "modify", path: "safe.txt", expectedContent: "safe\n", content: "written\n" }],
      }, undefined, undefined, ctx);
      const presented = await batch.execute("present", {
        action: "present",
        proposalId: prepared.details.proposalId,
        digest: prepared.details.digest,
      }, undefined, undefined, ctx);
      assert.match(presented.details.summary, /I understand the risk and want to proceed without a Git checkpoint/);

      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      const unacknowledged = await batch.execute(
        "apply",
        { action: "apply", proposalId: prepared.details.proposalId },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(unacknowledged.details.ok, false);
      assert.equal(unacknowledged.details.code, "PICM_PROPOSAL_CHECKPOINT_ACKNOWLEDGEMENT_REQUIRED");
      assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "safe\n");

      await h.handlers.get("before_agent_start")({ prompt: acknowledgement }, ctx);
      const acknowledgementOnly = await batch.execute(
        "apply",
        { action: "apply", proposalId: prepared.details.proposalId },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(acknowledgementOnly.details.ok, false);
      assert.equal(acknowledgementOnly.details.code, "PICM_PROPOSAL_NOT_APPROVED");
      assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "safe\n");

      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      const approved = await batch.execute(
        "apply",
        { action: "apply", proposalId: prepared.details.proposalId },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(approved.details.ok, true);
      assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "written\n");
    });
  }
});

test("proposal terminal clauses outrank combined checkpoint acknowledgements", async () => {
  const replies = [
    "I created a Git checkpoint for this proposal; cancel it.",
    "I created a Git checkpoint for this proposal; revise it.",
    "I understand the risk and want to proceed without a Git checkpoint; cancel it.",
    "I understand the risk and want to proceed without a Git checkpoint; revise it.",
  ];

  for (const [index, reply] of replies.entries()) {
    await withFixture(async ({ root }) => {
      const h = extensionHarness();
      const ctx = h.context(root, `terminal-checkpoint-${index}`);
      const control = h.tools.get("picm_scan_control");
      const batch = h.tools.get("picm_proposal_batch");

      await h.commands.get("picm-adopt").handler("coding", ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
      const prepared = await batch.execute("prepare", {
        action: "prepare",
        operations: [{ type: "modify", path: "safe.txt", expectedContent: "safe\n", content: "written\n" }],
      }, undefined, undefined, ctx);
      await batch.execute("present", {
        action: "present",
        proposalId: prepared.details.proposalId,
        digest: prepared.details.digest,
      }, undefined, undefined, ctx);

      await h.handlers.get("before_agent_start")({ prompt: reply }, ctx);
      const replacementRequired = await batch.execute("present", {
        action: "present",
        proposalId: prepared.details.proposalId,
        digest: prepared.details.digest,
      }, undefined, undefined, ctx);
      assert.equal(replacementRequired.details.ok, false);
      assert.equal(replacementRequired.details.code, "PICM_PROPOSAL_REPLACEMENT_REQUIRED");

      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      const noWrite = await batch.execute(
        "apply",
        { action: "apply", proposalId: prepared.details.proposalId },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(noWrite.details.ok, false);
      assert.equal(noWrite.details.code, "PICM_PROPOSAL_NOT_APPROVED");
      assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "safe\n");
    });
  }
});

test("revised proposal batches do not inherit checkpoint acknowledgements", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "revised-checkpoint");
    const control = h.tools.get("picm_scan_control");
    const batch = h.tools.get("picm_proposal_batch");
    const prepare = (content) => batch.execute("prepare", {
      action: "prepare",
      operations: [{ type: "modify", path: "safe.txt", expectedContent: "safe\n", content }],
    }, undefined, undefined, ctx);
    const present = (prepared) => batch.execute("present", {
      action: "present",
      proposalId: prepared.details.proposalId,
      digest: prepared.details.digest,
    }, undefined, undefined, ctx);

    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const original = await prepare("original draft\n");
    await present(original);
    await h.handlers.get("before_agent_start")({ prompt: "I created a Git checkpoint." }, ctx);
    await h.handlers.get("before_agent_start")({ prompt: "please revise this proposal" }, ctx);
    const revised = await prepare("revised draft\n");
    await present(revised);
    await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);

    const missingRenewal = await batch.execute(
      "apply",
      { action: "apply", proposalId: revised.details.proposalId },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(missingRenewal.details.code, "PICM_PROPOSAL_CHECKPOINT_ACKNOWLEDGEMENT_REQUIRED");
    assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "safe\n");

    await h.handlers.get("before_agent_start")({ prompt: "I understand the risk and want to proceed without a Git checkpoint." }, ctx);
    await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
    const applied = await batch.execute(
      "apply",
      { action: "apply", proposalId: revised.details.proposalId },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(applied.details.ok, true);
    assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "revised draft\n");
  });
});

test("new-only proposal batches remain directly approvable", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "new-only-checkpoint");
    const control = h.tools.get("picm_scan_control");
    const batch = h.tools.get("picm_proposal_batch");

    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    const prepared = await batch.execute("prepare", {
      action: "prepare",
      operations: [{ type: "create", path: "checkpoint-result.md", content: "written\n" }],
    }, undefined, undefined, ctx);
    const presented = await batch.execute("present", {
      action: "present",
      proposalId: prepared.details.proposalId,
      digest: prepared.details.digest,
    }, undefined, undefined, ctx);
    assert.match(presented.details.summary, /creates new files only/);
    await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);

    const applied = await batch.execute(
      "apply",
      { action: "apply", proposalId: prepared.details.proposalId },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(applied.details.ok, true);
    assert.equal(readFileSync(join(root, "checkpoint-result.md"), "utf8"), "written\n");
  });
});

test("approved proposal batches create guarded parent directories", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness();
    const ctx = h.context(root, "proposal-created-parents");
    const control = h.tools.get("picm_scan_control");
    const batch = h.tools.get("picm_proposal_batch");
    const config = "{\n  \"version\": 1\n}\n";
    const report = "# Adoption report\n";
    const guide = "# Moved guide\n";

    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

    const prepared = await batch.execute("prepare", {
      action: "prepare",
      operations: [
        { type: "create", path: ".picm/config.json", content: config },
        { type: "create", path: ".picm/adoption-report.md", content: report },
        {
          type: "move",
          from: "docs/guide.md",
          path: "relocated/nested/guide.md",
          expectedContent: "guide\n",
          content: guide,
        },
      ],
    }, undefined, undefined, ctx);
    const presented = await batch.execute("present", {
      action: "present",
      proposalId: prepared.details.proposalId,
      digest: prepared.details.digest,
    }, undefined, undefined, ctx);
    assert.equal(presented.details.ok, true);
    await h.handlers.get("before_agent_start")({ prompt: "I understand the risk and want to proceed without a Git checkpoint." }, ctx);
    await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
    const applied = await batch.execute(
      "apply",
      { action: "apply", proposalId: prepared.details.proposalId },
      undefined,
      undefined,
      ctx,
    );

    assert.equal(applied.details.ok, true);
    assert.equal(readFileSync(join(root, ".picm", "config.json"), "utf8"), config);
    assert.equal(readFileSync(join(root, ".picm", "adoption-report.md"), "utf8"), report);
    assert.equal(readFileSync(join(root, "relocated", "nested", "guide.md"), "utf8"), guide);
    assert.equal(existsSync(join(root, "docs", "guide.md")), false);
  });
});

test("proposal results remain visible when the post-apply session audit fails", async () => {
  await withFixture(async ({ root }) => {
    const h = extensionHarness({
      appendError(_customType, data) {
        return data?.status === "applied" ? new Error("synthetic audit failure") : undefined;
      },
    });
    const ctx = h.context(root, "proposal-audit-failure");
    const control = h.tools.get("picm_scan_control");
    const batch = h.tools.get("picm_proposal_batch");

    await h.commands.get("picm-adopt").handler("coding", ctx);
    await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
    await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
    const prepared = await batch.execute("prepare", {
      action: "prepare",
      operations: [{ type: "create", path: "audit-result.md", content: "written\n" }],
    }, undefined, undefined, ctx);
    await batch.execute("present", {
      action: "present",
      proposalId: prepared.details.proposalId,
      digest: prepared.details.digest,
    }, undefined, undefined, ctx);
    await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);

    const result = await batch.execute("apply", { action: "apply", proposalId: prepared.details.proposalId }, undefined, undefined, ctx);
    assert.equal(result.details.ok, true);
    assert.equal(result.details.auditWarning, "The session audit could not be recorded; the reported file effects were not undone.");
    assert.deepEqual(result.details.results, [{ type: "create", path: "audit-result.md", status: "completed" }]);
    assert.equal(readFileSync(join(root, "audit-result.md"), "utf8"), "written\n");
  });
});

test("approved proposal batches create and move beneath existing parents", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    const batch = await prepareProposalBatch({
      gate,
      operations: [
        { type: "create", path: "docs/new.md", content: "new\n" },
        {
          type: "move",
          from: "safe.txt",
          path: "docs/moved.md",
          expectedContent: "safe\n",
          content: "moved\n",
        },
      ],
    });

    const result = await applyProposalBatch(batch, { gate });

    assert.equal(result.ok, true);
    assert.equal(readFileSync(join(root, "docs", "new.md"), "utf8"), "new\n");
    assert.equal(readFileSync(join(root, "docs", "moved.md"), "utf8"), "moved\n");
    assert.equal(existsSync(join(root, "safe.txt")), false);
    await gate.dispose();
  });
});

test("proposal prevalidation rejects ancestor conflicts before path binding", async () => {
  const createNested = { type: "create", path: "parent/child.md", content: "nested\n" };
  const conflicts = [
    { type: "create", path: "parent", content: "parent\n" },
    { type: "modify", path: "parent", expectedContent: "old\n", content: "new\n" },
    { type: "delete", path: "parent", expectedContent: "old\n" },
    { type: "move", from: "parent", path: "moved.md", expectedContent: "old\n", content: "moved\n" },
    { type: "move", from: "source.md", path: "parent", expectedContent: "old\n", content: "moved\n" },
  ];

  for (const conflict of conflicts) {
    for (const operations of [[conflict, createNested], [createNested, conflict]]) {
      const gate = {
        checkPath() {
          assert.fail("ancestor conflicts must fail before path binding");
        },
      };
      await assert.rejects(
        prepareProposalBatch({ gate, operations }),
        (error) => error.code === "PICM_PROPOSAL_INVALID" && /conflicting ancestor paths/.test(error.message),
      );
    }
  }
});

test("proposal cancellation keeps issued writes and created parents", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    mkdirSync(join(root, "existing-empty"));
    write(join(root, "existing-content", ".keep"), "keep\n");
    const baseGate = createGitReadGate({ cwd: root, packageRoot });
    const abort = new AbortController();
    let writes = 0;
    const gate = {
      checkPath: (...args) => baseGate.checkPath(...args),
      bindPath(plan) {
        const binding = baseGate.bindPath(plan);
        const writeFile = binding.operations.writeFile;
        binding.operations.writeFile = async (...args) => {
          const result = await writeFile(...args);
          writes += 1;
          if (writes === 4) {
            write(join(root, "existing-content", "deep", "external.md"), "external\n");
            abort.abort();
          }
          return result;
        };
        binding.operations.unlink = () => assert.fail("partial batches must not undo completed files");
        binding.operations.rmdir = () => assert.fail("partial batches must not remove parent directories");
        return binding;
      },
    };
    const operations = [
      { type: "create", path: "batch-owned/deep/first.md", content: "first\n" },
      { type: "create", path: "batch-owned/deep/second.md", content: "second\n" },
      { type: "create", path: "existing-empty/deep/third.md", content: "third\n" },
      { type: "create", path: "existing-content/deep/fourth.md", content: "fourth\n" },
    ];
    const batch = await prepareProposalBatch({ gate, operations });

    const result = await applyProposalBatch(batch, { gate, signal: abort.signal });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PICM_PROPOSAL_ABORTED");
    assert.deepEqual(result.results, [
      { type: "create", path: "batch-owned/deep/first.md", status: "completed", createdParents: ["batch-owned", "batch-owned/deep"] },
      { type: "create", path: "batch-owned/deep/second.md", status: "completed" },
      { type: "create", path: "existing-empty/deep/third.md", status: "completed", createdParents: ["existing-empty/deep"] },
      { type: "create", path: "existing-content/deep/fourth.md", status: "completed", createdParents: ["existing-content/deep"] },
    ]);
    assert.equal(writes, 4);
    assert.equal(readFileSync(join(root, "batch-owned", "deep", "first.md"), "utf8"), "first\n");
    assert.equal(readFileSync(join(root, "batch-owned", "deep", "second.md"), "utf8"), "second\n");
    assert.equal(readFileSync(join(root, "existing-empty", "deep", "third.md"), "utf8"), "third\n");
    assert.equal(readFileSync(join(root, "existing-content", "deep", "fourth.md"), "utf8"), "fourth\n");
    assert.equal(readFileSync(join(root, "existing-content", ".keep"), "utf8"), "keep\n");
    assert.equal(readFileSync(join(root, "existing-content", "deep", "external.md"), "utf8"), "external\n");
    await baseGate.dispose();
  });
});

test("proposal cancellation reports created parents before file publication", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const baseGate = createGitReadGate({ cwd: root, packageRoot });
    const abort = new AbortController();
    let created = 0;
    const gate = {
      checkPath: (...args) => baseGate.checkPath(...args),
      bindPath(plan) {
        const binding = baseGate.bindPath(plan);
        const mkdir = binding.operations.mkdir;
        binding.operations.mkdir = async (...args) => {
          const result = await mkdir(...args);
          created += 1;
          abort.abort();
          return result;
        };
        binding.operations.writeFile = () => assert.fail("cancellation must stop before file publication");
        return binding;
      },
    };
    const batch = await prepareProposalBatch({
      gate,
      operations: [{ type: "create", path: "retained/nested/file.md", content: "not written\n" }],
    });

    const result = await applyProposalBatch(batch, { gate, signal: abort.signal });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PICM_PROPOSAL_ABORTED");
    assert.deepEqual(result.results, [
      { type: "create", path: "retained/nested/file.md", status: "failed", createdParents: ["retained"] },
    ]);
    assert.equal(created, 1);
    assert.equal(existsSync(join(root, "retained")), true);
    assert.equal(existsSync(join(root, "retained", "nested")), false);
    assert.equal(existsSync(join(root, "retained", "nested", "file.md")), false);
    await baseGate.dispose();
  });
});

test("proposal failures preserve completed create, modify, delete, and move effects", async () => {
  const scenarios = [
    {
      name: "create",
      operation: { type: "create", path: "created.md", content: "created\n" },
      trigger: "write",
      path: "created.md",
      externalState(root) { write(join(root, "created.md"), "external create\n"); },
      assertState(root) { assert.equal(readFileSync(join(root, "created.md"), "utf8"), "external create\n"); },
    },
    {
      name: "modify",
      operation: { type: "modify", path: "safe.txt", expectedContent: "safe\n", content: "modified\n" },
      trigger: "write",
      path: "safe.txt",
      externalState(root) { write(join(root, "safe.txt"), "external modify\n"); },
      assertState(root) { assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "external modify\n"); },
    },
    {
      name: "delete",
      operation: { type: "delete", path: "safe.txt", expectedContent: "safe\n" },
      trigger: "unlink",
      path: "safe.txt",
      externalState(root) { write(join(root, "safe.txt"), "external delete\n"); },
      assertState(root) { assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "external delete\n"); },
    },
    {
      name: "move",
      operation: {
        type: "move",
        from: "safe.txt",
        path: "moved.txt",
        expectedContent: "safe\n",
        content: "moved\n",
      },
      trigger: "unlink",
      path: "safe.txt",
      externalState(root) {
        write(join(root, "safe.txt"), "external move source\n");
        write(join(root, "moved.txt"), "external move destination\n");
      },
      assertState(root) {
        assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "external move source\n");
        assert.equal(readFileSync(join(root, "moved.txt"), "utf8"), "external move destination\n");
      },
    },
  ];

  for (const scenario of scenarios) {
    await withFixture(async ({ root, packageRoot }) => {
      const baseGate = createGitReadGate({ cwd: root, packageRoot });
      let interleaved = false;
      const gate = {
        checkPath: (...args) => baseGate.checkPath(...args),
        bindPath(plan) {
          const binding = baseGate.bindPath(plan);
          const trigger = () => {
            if (interleaved) return;
            interleaved = true;
            scenario.externalState(root);
            write(join(root, "docs", "guide.md"), "external drift\n");
          };
          if (scenario.trigger === "write") {
            const writeFile = binding.operations.writeFile;
            binding.operations.writeFile = async (path, ...args) => {
              const result = await writeFile(path, ...args);
              if (path === join(root, scenario.path)) trigger();
              return result;
            };
          } else {
            const unlink = binding.operations.unlink;
            binding.operations.unlink = async (path) => {
              const result = await unlink(path);
              if (path === join(root, scenario.path)) trigger();
              return result;
            };
          }
          return binding;
        },
      };
      const batch = await prepareProposalBatch({
        gate,
        operations: [
          scenario.operation,
          { type: "modify", path: "docs/guide.md", expectedContent: "guide\n", content: "updated\n" },
          { type: "create", path: "not-attempted.md", content: "not attempted\n" },
        ],
      });

      const result = await applyProposalBatch(batch, { gate });
      assert.equal(result.ok, false, scenario.name);
      assert.equal(result.code, "PICM_PROPOSAL_STALE", scenario.name);
      assert.deepEqual(result.results, [
        { ...batch.auditOperations[0], status: "completed" },
        { type: "modify", path: "docs/guide.md", status: "failed" },
        { type: "create", path: "not-attempted.md", status: "unattempted" },
      ], scenario.name);
      assert.equal(interleaved, true, scenario.name);
      scenario.assertState(root);
      assert.equal(readFileSync(join(root, "docs", "guide.md"), "utf8"), "external drift\n");
      assert.equal(existsSync(join(root, "not-attempted.md")), false);
      await baseGate.dispose();
    });
  }
});

test("proposal results retain a published move destination and uncertain failed writes", async () => {
  await withFixture(async ({ root, packageRoot }) => {
    const baseGate = createGitReadGate({ cwd: root, packageRoot });
    const gate = {
      checkPath: (...args) => baseGate.checkPath(...args),
      bindPath(plan) {
        const binding = baseGate.bindPath(plan);
        const writeFile = binding.operations.writeFile;
        binding.operations.writeFile = async (path, ...args) => {
          const result = await writeFile(path, ...args);
          if (path === join(root, "moved.txt")) write(join(root, "safe.txt"), "external source\n");
          return result;
        };
        return binding;
      },
    };
    const batch = await prepareProposalBatch({
      gate,
      operations: [
        {
          type: "move",
          from: "safe.txt",
          path: "moved.txt",
          expectedContent: "safe\n",
          content: "moved\n",
        },
        { type: "create", path: "not-attempted.md", content: "not attempted\n" },
      ],
    });

    const result = await applyProposalBatch(batch, { gate });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PICM_PROPOSAL_STALE");
    assert.deepEqual(result.results, [
      { type: "move", from: "safe.txt", path: "moved.txt", status: "failed", destinationPublished: true },
      { type: "create", path: "not-attempted.md", status: "unattempted" },
    ]);
    assert.equal(readFileSync(join(root, "moved.txt"), "utf8"), "moved\n");
    assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "external source\n");
    assert.equal(existsSync(join(root, "not-attempted.md")), false);
    await baseGate.dispose();
  });

  await withFixture(async ({ root, packageRoot }) => {
    const baseGate = createGitReadGate({ cwd: root, packageRoot });
    const gate = {
      checkPath: (...args) => baseGate.checkPath(...args),
      bindPath(plan) {
        const binding = baseGate.bindPath(plan);
        const writeFile = binding.operations.writeFile;
        binding.operations.writeFile = async (path, ...args) => {
          if (path !== join(root, "docs", "guide.md")) return writeFile(path, ...args);
          await writeFile(path, "partial write\n");
          throw Object.assign(new Error("synthetic write failure"), { code: "EIO" });
        };
        return binding;
      },
    };
    const batch = await prepareProposalBatch({
      gate,
      operations: [
        { type: "modify", path: "safe.txt", expectedContent: "safe\n", content: "first completed\n" },
        { type: "modify", path: "docs/guide.md", expectedContent: "guide\n", content: "second uncertain\n" },
        { type: "create", path: "not-attempted.md", content: "not attempted\n" },
      ],
    });

    const result = await applyProposalBatch(batch, { gate });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PICM_PROPOSAL_IO_FAILED");
    assert.equal(result.message, "A filesystem operation failed; inspect the affected approved paths before proposing a repair.");
    assert.deepEqual(result.results, [
      { type: "modify", path: "safe.txt", status: "completed" },
      { type: "modify", path: "docs/guide.md", status: "uncertain" },
      { type: "create", path: "not-attempted.md", status: "unattempted" },
    ]);
    assert.equal(readFileSync(join(root, "safe.txt"), "utf8"), "first completed\n");
    assert.equal(readFileSync(join(root, "docs", "guide.md"), "utf8"), "partial write\n");
    assert.equal(existsSync(join(root, "not-attempted.md")), false);
    await baseGate.dispose();
  });
});

test("proposal parent creation is denied before mkdir for symlinks and exclusions", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink behavior is platform-specific");
    return;
  }
  await withFixture(async ({ root, packageRoot }) => {
    const gate = createGitReadGate({ cwd: root, packageRoot });
    mkdirSync(join(root, "private-target"));
    symlinkSync("private-target", join(root, "linked-parent"), "dir");
    const batch = (path) => ({
      id: `batch:${path}`,
      digest: path,
      operations: [{ type: "create", path, content: "blocked\n" }],
      auditOperations: [{ type: "create", path }],
    });

    const symlinkResult = await applyProposalBatch(batch("linked-parent/nested/file.md"), { gate });
    assert.equal(symlinkResult.ok, false);
    assert.equal(symlinkResult.code, "PICM_PROPOSAL_PATH_BLOCKED");
    assert.deepEqual(symlinkResult.results, [
      { type: "create", path: "linked-parent/nested/file.md", status: "failed" },
    ]);
    assert.equal(existsSync(join(root, "private-target", "nested")), false);

    const excludedResult = await applyProposalBatch(batch("excluded-parent/nested/file.md"), {
      gate,
      excludedPaths: ["excluded-parent"],
    });
    assert.equal(excludedResult.ok, false);
    assert.equal(excludedResult.code, "PICM_PROPOSAL_PATH_BLOCKED");
    assert.deepEqual(excludedResult.results, [
      { type: "create", path: "excluded-parent/nested/file.md", status: "failed" },
    ]);
    assert.equal(existsSync(join(root, "excluded-parent")), false);
    await gate.dispose();
  });
});

test("approved adoption and maintenance batches apply exact mixed operations without Bash", async () => {
  for (const [command, args] of [["picm-adopt", "coding"], ["picm-maintain", "strict"]]) {
    await withMixedProposalFixture(async ({ root }) => {
      const entries = [];
      const h = extensionHarness({ entries });
      const ctx = h.context(root, `mixed-batch-${command}`);
      const control = h.tools.get("picm_scan_control");
      const batch = h.tools.get("picm_proposal_batch");
      await h.commands.get(command).handler(args, ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

      const originalAgents = "# Existing Batch Fixture\n\nUse `routing/legacy-route.md` for workspace routing.\n\nBefore handing off a change, run `npm test`.\n";
      const updatedAgents = "# Existing Batch Fixture\n\nUse `routing/current-route.md` for workspace routing.\n\nBefore handing off a change, run `npm run check`.\n";
      const operations = (expectedDeletedContent = "# Obsolete note\n\nThis note is superseded by the approved routing proposal.\n") => [
        { type: "modify", path: "AGENTS.md", expectedContent: originalAgents, content: updatedAgents },
        { type: "create", path: "reference/approval-notes.md", content: "# Approval notes\n\nReview the current route before handoff.\n" },
        { type: "delete", path: "reference/obsolete.md", expectedContent: expectedDeletedContent },
        {
          type: "move",
          from: "routing/legacy-route.md",
          path: "routing/current-route.md",
          expectedContent: "# Legacy routing\n\nUse the existing specialist folders for task routing.\n",
          content: "# Current routing\n\nUse the existing specialist folders for task routing.\n",
        },
      ];
      const prepare = async (expectedDeletedContent) => batch.execute(
        "prepare",
        { action: "prepare", operations: operations(expectedDeletedContent) },
        undefined,
        undefined,
        ctx,
      );
      const apply = async (proposalId, signal) => batch.execute(
        "apply",
        { action: "apply", proposalId },
        signal,
        undefined,
        ctx,
      );
      const present = async (prepared) => batch.execute(
        "present",
        {
          action: "present",
          proposalId: prepared.details.proposalId,
          digest: prepared.details.digest,
        },
        undefined,
        undefined,
        ctx,
      );

      assert.equal((await h.handlers.get("tool_call")({ toolName: "bash", input: { command: "rm AGENTS.md" } }, ctx)).block, true);
      assert.equal((await h.handlers.get("tool_call")({ toolName: "write", input: { path: "AGENTS.md", content: "bypass" } }, ctx)).block, true);
      assert.equal((await h.handlers.get("tool_call")({ toolName: "edit", input: { path: "AGENTS.md", edits: [] } }, ctx)).block, true);
      assert.equal(await h.handlers.get("tool_call")({ toolName: "picm_proposal_batch", input: { action: "prepare" } }, ctx), undefined);

      const priorWorkflow = await prepare();
      await present(priorWorkflow);
      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      await h.commands.get(command).handler(args, ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute("privacy", { action: "privacy", excludedPaths: ["AGENTS.md"] }, undefined, undefined, ctx);
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
      const staleWorkflowApply = await apply(priorWorkflow.details.proposalId);
      assert.equal(staleWorkflowApply.details.ok, false);
      assert.equal(staleWorkflowApply.details.code, "PICM_PROPOSAL_NOT_PREPARED");
      assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), originalAgents);

      await h.commands.get(command).handler(args, ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

      for (const response of ["looks good", "decline", "please adjust the new guide", "cancel"]) {
        const prepared = await prepare();
        await h.handlers.get("before_agent_start")({ prompt: response }, ctx);
        const result = await apply(prepared.details.proposalId);
        assert.equal(result.details.ok, false, `${command}: ${response} must remain no-write`);
        assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), originalAgents);
        assert.equal(existsSync(join(root, "reference/approval-notes.md")), false);
        assert.equal(readFileSync(join(root, "reference/obsolete.md"), "utf8"), "# Obsolete note\n\nThis note is superseded by the approved routing proposal.\n");
        assert.equal(readFileSync(join(root, "routing/legacy-route.md"), "utf8"), "# Legacy routing\n\nUse the existing specialist folders for task routing.\n");
      }

      const aborted = await prepare();
      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      assert.equal((await apply(aborted.details.proposalId)).details.ok, false);
      const stalePresentation = await batch.execute("present", {
        action: "present",
        proposalId: aborted.details.proposalId,
        digest: "wrong-digest",
      }, undefined, undefined, ctx);
      assert.equal(stalePresentation.details.ok, false);
      const presentedAbort = await present(aborted);
      assert.equal(presentedAbort.details.digest, aborted.details.digest);
      assert.equal(presentedAbort.details.summary, [
        `Exact proposal: ${aborted.details.proposalId}`,
        `Digest: ${aborted.details.digest}`,
        "Operations (4):",
        JSON.stringify(operations(), null, 2),
        "Git checkpoint recommendation:",
        "Before approving this exact proposal, strongly recommend that you create a Git commit covering the current contents of affected existing files.",
        "PiCM does not inspect Git status, history, or file contents to verify checkpoint coverage. No repository-wide clean state is required, and do not add sensitive or ignored material to make a checkpoint.",
        "PiCM will not initialize, stage, commit, reset, clean, or restore Git for you. A repository or old commit does not protect current uncommitted work; a checkpoint does not protect uncommitted or untracked work, which may be unrecoverable through Git. Broad Git restore actions can erase newer edits.",
        "Non-Git and new or empty workspaces remain supported. A first post-scaffold commit protects future contents only.",
        "If coverage is absent or uncertain and you want to proceed, explicitly say: `I understand the risk and want to proceed without a Git checkpoint.` That risk opt-out does not approve this proposal; afterward, use the normal direct approval prompt below.",
        "A user-reported checkpoint or risk opt-out applies only while this exact proposal and digest remain unchanged. A revised proposal needs the normal refreshed summary and direct approval.",
      ].join("\n"));
      assert.match(presentedAbort.details.approvalPrompt, /Git checkpoint or risk opt-out is not approval/);
      await h.handlers.get("before_agent_start")({ prompt: "I understand the risk and want to proceed without a Git checkpoint." }, ctx);
      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      const abortAfterFirstMutation = {
        get aborted() {
          return readFileSync(join(root, "AGENTS.md"), "utf8") === updatedAgents;
        },
      };
      const abortedResult = await apply(aborted.details.proposalId, abortAfterFirstMutation);
      assert.equal(abortedResult.details.ok, false);
      assert.equal(abortedResult.details.code, "PICM_PROPOSAL_ABORTED");
      assert.deepEqual(abortedResult.details.results, [
        { type: "modify", path: "AGENTS.md", status: "completed" },
        ...operations().slice(1).map(({ type, path, from }) => ({
          type,
          ...(from ? { from } : {}),
          path,
          status: "unattempted",
        })),
      ]);
      assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), updatedAgents);
      assert.equal(existsSync(join(root, "reference/approval-notes.md")), false);
      const abortedCancel = await batch.execute("cancel", {
        action: "cancel",
        proposalId: aborted.details.proposalId,
      }, undefined, undefined, ctx);
      assert.equal(abortedCancel.details.ok, false);
      assert.equal(abortedCancel.details.code, "PICM_PROPOSAL_REPLACEMENT_REQUIRED");
      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      const replay = await apply(aborted.details.proposalId);
      assert.equal(replay.details.ok, false);
      assert.equal(replay.details.code, "PICM_PROPOSAL_NOT_APPROVED");
      assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), updatedAgents);
      const abortedAudit = [...entries].reverse().find((entry) => entry.customType === "picm-proposal-batch" && entry.data.status === "aborted");
      assert.ok(abortedAudit);
      assert.deepEqual(abortedAudit.data.results, abortedResult.details.results);
      writeFileSync(join(root, "AGENTS.md"), originalAgents);

      const stale = await prepare();
      await present(stale);
      await h.handlers.get("before_agent_start")({ prompt: "I understand the risk and want to proceed without a Git checkpoint." }, ctx);
      await h.handlers.get("before_agent_start")({ prompt: "accept" }, ctx);
      writeFileSync(join(root, "reference/obsolete.md"), "# Drifted note\n");
      const staleResult = await apply(stale.details.proposalId);
      assert.equal(staleResult.details.ok, false);
      assert.equal(staleResult.details.code, "PICM_PROPOSAL_STALE");
      assert.deepEqual(staleResult.details.results, [
        { type: "modify", path: "AGENTS.md", status: "unattempted" },
        { type: "create", path: "reference/approval-notes.md", status: "unattempted" },
        { type: "delete", path: "reference/obsolete.md", status: "failed" },
        { type: "move", from: "routing/legacy-route.md", path: "routing/current-route.md", status: "unattempted" },
      ]);
      assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), originalAgents);
      assert.equal(existsSync(join(root, "reference/approval-notes.md")), false);
      assert.equal(readFileSync(join(root, "routing/legacy-route.md"), "utf8"), "# Legacy routing\n\nUse the existing specialist folders for task routing.\n");
      assert.equal(readFileSync(join(root, "reference/obsolete.md"), "utf8"), "# Drifted note\n");
      const failedCancel = await batch.execute("cancel", {
        action: "cancel",
        proposalId: stale.details.proposalId,
      }, undefined, undefined, ctx);
      assert.equal(failedCancel.details.ok, false);
      assert.equal(failedCancel.details.code, "PICM_PROPOSAL_REPLACEMENT_REQUIRED");
      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      const failedReplay = await apply(stale.details.proposalId);
      assert.equal(failedReplay.details.ok, false);
      assert.equal(failedReplay.details.code, "PICM_PROPOSAL_NOT_APPROVED");

      const approved = await prepare("# Drifted note\n");
      const presented = await present(approved);
      assert.match(presented.details.approvalPrompt, /accept and write/);
      await h.handlers.get("before_agent_start")({ prompt: "I understand the risk and want to proceed without a Git checkpoint." }, ctx);
      await h.handlers.get("before_agent_start")({ prompt: "accept and write" }, ctx);
      const applying = apply(approved.details.proposalId);
      const ending = control.execute("end", { action: "end" }, undefined, undefined, ctx);
      const [applied, ended] = await Promise.all([applying, ending]);
      assert.equal(applied.details.ok, true);
      assert.equal(ended.details.scanSettled, true);
      assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), updatedAgents);
      assert.equal(readFileSync(join(root, "reference/approval-notes.md"), "utf8"), "# Approval notes\n\nReview the current route before handoff.\n");
      assert.equal(existsSync(join(root, "reference/obsolete.md")), false);
      assert.equal(existsSync(join(root, "routing/legacy-route.md")), false);
      assert.equal(readFileSync(join(root, "routing/current-route.md"), "utf8"), "# Current routing\n\nUse the existing specialist folders for task routing.\n");
      assert.deepEqual(applied.details.operations, [
        { type: "modify", path: "AGENTS.md" },
        { type: "create", path: "reference/approval-notes.md" },
        { type: "delete", path: "reference/obsolete.md" },
        { type: "move", from: "routing/legacy-route.md", path: "routing/current-route.md" },
      ]);
      assert.deepEqual(applied.details.results, applied.details.operations.map((operation) => ({ ...operation, status: "completed" })));
      const appliedAudit = [...entries].reverse().find((entry) => entry.customType === "picm-proposal-batch" && entry.data.status === "applied");
      assert.ok(appliedAudit);
      assert.deepEqual(appliedAudit.data.results, applied.details.results);

      assert.equal((await h.handlers.get("tool_call")({ toolName: "read", input: { path: "AGENTS.md" } }, ctx)).block, true);
      assert.equal((await h.handlers.get("tool_call")({ toolName: "picm_proposal_batch", input: { action: "apply" } }, ctx)).block, true);
      await assert.rejects(
        control.execute("status", { action: "status" }, undefined, undefined, ctx),
        /PICM_SCAN_SETTLED/,
      );
      await assert.rejects(
        control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx),
        /PICM_SCAN_SETTLED/,
      );
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
      await control.execute("end", { action: "end" }, undefined, undefined, ctx);
    });
  }
});

test("approved batches reauthorize every path before mutation against current exclusions", async () => {
  const originalGlobalConfig = process.env.GIT_CONFIG_GLOBAL;
  const globalConfig = join(tmpdir(), `picm-proposal-global-${process.pid}-${Date.now()}.gitconfig`);
  const globalExcludes = `${globalConfig}.exclude`;
  write(globalExcludes, "");
  write(globalConfig, `[core]\n\texcludesFile = ${globalExcludes}\n`);
  process.env.GIT_CONFIG_GLOBAL = globalConfig;

  try {
    await withFixture(async ({ root }) => {
      const h = extensionHarness();
      const ctx = h.context(root, "fresh-proposal-authorization");
      const control = h.tools.get("picm_scan_control");
      const batch = h.tools.get("picm_proposal_batch");
      const sentinelContent = "sentinel before\n";
      const sentinelUpdatedContent = "sentinel after\n";
      const sourceContents = {
        nestedModify: "nested before\n",
        localDelete: "local before\n",
        globalMove: "global source before\n",
        sessionMove: "session source before\n",
      };

      for (const name of ["root", "nested", "local", "global", "session"]) {
        write(join(root, `${name}-sentinel.md`), sentinelContent);
      }
      write(join(root, "nested", ".gitignore"), "# initially unprotected\n");
      write(join(root, "nested", "nested-modify.md"), sourceContents.nestedModify);
      write(join(root, "local-delete.md"), sourceContents.localDelete);
      write(join(root, "global-move-source.md"), sourceContents.globalMove);
      write(join(root, "session-move-source.md"), sourceContents.sessionMove);
      git(
        root,
        "add",
        "root-sentinel.md",
        "nested-sentinel.md",
        "local-sentinel.md",
        "global-sentinel.md",
        "session-sentinel.md",
        "nested/.gitignore",
        "nested/nested-modify.md",
        "local-delete.md",
        "global-move-source.md",
        "session-move-source.md",
      );

      await h.commands.get("picm-adopt").handler("coding", ctx);
      await control.execute("preflight", { action: "preflight" }, undefined, undefined, ctx);
      await control.execute("privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, ctx);
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);

      const prepareApproved = async (operations) => {
        const prepared = await batch.execute(
          "prepare",
          { action: "prepare", operations },
          undefined,
          undefined,
          ctx,
        );
        assert.equal(prepared.details.ok, true);
        const presented = await batch.execute(
          "present",
          {
            action: "present",
            proposalId: prepared.details.proposalId,
            digest: prepared.details.digest,
          },
          undefined,
          undefined,
          ctx,
        );
        assert.equal(presented.details.ok, true);
        await h.handlers.get("before_agent_start")({ prompt: "I understand the risk and want to proceed without a Git checkpoint." }, ctx);
        await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
        return prepared.details.proposalId;
      };

      const assertBlocked = async (proposalId) => {
        const result = await batch.execute("apply", { action: "apply", proposalId }, undefined, undefined, ctx);
        assert.equal(result.details.ok, false);
        assert.equal(result.details.code, "PICM_PROPOSAL_PATH_BLOCKED");
        assert.equal(result.details.results.some((operation) => operation.status === "failed"), true);
        assert.equal(result.details.results.every((operation) => operation.status === "unattempted" || operation.status === "failed"), true);
      };

      const rootCreateProposal = await prepareApproved([
        { type: "modify", path: "root-sentinel.md", expectedContent: sentinelContent, content: sentinelUpdatedContent },
        { type: "create", path: "root-create.md", content: "must not be created\n" },
      ]);
      writeFileSync(
        join(root, ".gitignore"),
        `${readFileSync(join(root, ".gitignore"), "utf8")}root-create.md\n`,
      );
      await assertBlocked(rootCreateProposal);
      assert.equal(readFileSync(join(root, "root-sentinel.md"), "utf8"), sentinelContent);
      assert.equal(existsSync(join(root, "root-create.md")), false);

      const nestedModifyProposal = await prepareApproved([
        { type: "modify", path: "nested-sentinel.md", expectedContent: sentinelContent, content: sentinelUpdatedContent },
        {
          type: "modify",
          path: "nested/nested-modify.md",
          expectedContent: sourceContents.nestedModify,
          content: "nested after\n",
        },
      ]);
      writeFileSync(join(root, "nested", ".gitignore"), "nested-modify.md\n");
      await assertBlocked(nestedModifyProposal);
      assert.equal(readFileSync(join(root, "nested-sentinel.md"), "utf8"), sentinelContent);
      assert.equal(readFileSync(join(root, "nested", "nested-modify.md"), "utf8"), sourceContents.nestedModify);

      const localDeleteProposal = await prepareApproved([
        { type: "modify", path: "local-sentinel.md", expectedContent: sentinelContent, content: sentinelUpdatedContent },
        { type: "delete", path: "local-delete.md", expectedContent: sourceContents.localDelete },
      ]);
      writeFileSync(
        join(root, ".git", "info", "exclude"),
        `${readFileSync(join(root, ".git", "info", "exclude"), "utf8")}\nlocal-delete.md\n`,
      );
      await assertBlocked(localDeleteProposal);
      assert.equal(readFileSync(join(root, "local-sentinel.md"), "utf8"), sentinelContent);
      assert.equal(readFileSync(join(root, "local-delete.md"), "utf8"), sourceContents.localDelete);

      const globalMoveSourceProposal = await prepareApproved([
        { type: "modify", path: "global-sentinel.md", expectedContent: sentinelContent, content: sentinelUpdatedContent },
        {
          type: "move",
          from: "global-move-source.md",
          path: "global-move-destination.md",
          expectedContent: sourceContents.globalMove,
          content: "global destination after\n",
        },
      ]);
      writeFileSync(globalExcludes, "global-move-source.md\n");
      await assertBlocked(globalMoveSourceProposal);
      assert.equal(readFileSync(join(root, "global-sentinel.md"), "utf8"), sentinelContent);
      assert.equal(readFileSync(join(root, "global-move-source.md"), "utf8"), sourceContents.globalMove);
      assert.equal(existsSync(join(root, "global-move-destination.md")), false);

      const sessionMoveDestinationProposal = await prepareApproved([
        { type: "modify", path: "session-sentinel.md", expectedContent: sentinelContent, content: sentinelUpdatedContent },
        {
          type: "move",
          from: "session-move-source.md",
          path: "session-move-destination.md",
          expectedContent: sourceContents.sessionMove,
          content: "session destination after\n",
        },
      ]);
      await control.execute(
        "privacy",
        { action: "privacy", excludedPaths: ["session-move-destination.md"] },
        undefined,
        undefined,
        ctx,
      );
      await control.execute("begin", { action: "begin" }, undefined, undefined, ctx);
      const phaseReplaced = await batch.execute(
        "apply",
        { action: "apply", proposalId: sessionMoveDestinationProposal },
        undefined,
        undefined,
        ctx,
      );
      assert.equal(phaseReplaced.details.code, "PICM_PROPOSAL_CHECKPOINT_ACKNOWLEDGEMENT_REQUIRED");
      await h.handlers.get("before_agent_start")({ prompt: "I understand the risk and want to proceed without a Git checkpoint." }, ctx);
      await h.handlers.get("before_agent_start")({ prompt: "approve" }, ctx);
      await assertBlocked(sessionMoveDestinationProposal);
      assert.equal(readFileSync(join(root, "session-sentinel.md"), "utf8"), sentinelContent);
      assert.equal(readFileSync(join(root, "session-move-source.md"), "utf8"), sourceContents.sessionMove);
      assert.equal(existsSync(join(root, "session-move-destination.md")), false);

      const persistedProposal = await prepareApproved([
        { type: "modify", path: "root-sentinel.md", expectedContent: sentinelContent, content: sentinelUpdatedContent },
        { type: "create", path: "persisted-create.md", content: "must not be created\n" },
      ]);
      write(join(root, ".picm", "config.json"), JSON.stringify({
        version: 1,
        generatedBy: "picm-factory",
        privacy: { excludedPaths: ["persisted-create.md"] },
      }));
      await assertBlocked(persistedProposal);
      assert.equal(readFileSync(join(root, "root-sentinel.md"), "utf8"), sentinelContent);
      assert.equal(existsSync(join(root, "persisted-create.md")), false);
    });
  } finally {
    if (originalGlobalConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = originalGlobalConfig;
    rmSync(globalConfig, { force: true });
    rmSync(globalExcludes, { force: true });
  }
});

test("proposal reauthorization preserves cancellation precedence", async () => {
  const abort = new AbortController();
  const gate = {
    async checkPath() {
      abort.abort();
      return { allowed: false, reason: "newly protected" };
    },
    bindPath() {
      throw new Error("blocked decisions must not bind");
    },
  };
  const batch = {
    id: "cancelled-reauthorization",
    digest: "digest",
    operations: [{ type: "create", path: "blocked.md", content: "blocked\n" }],
    auditOperations: [{ type: "create", path: "blocked.md" }],
  };

  const result = await applyProposalBatch(batch, { gate, signal: abort.signal });
  assert.equal(result.ok, false);
  assert.equal(result.code, "PICM_PROPOSAL_ABORTED");
  assert.deepEqual(result.results, [{ type: "create", path: "blocked.md", status: "unattempted" }]);
});
