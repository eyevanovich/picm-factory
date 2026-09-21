import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowLifecycle } from "../extensions/runtime/workflow-lifecycle.mjs";

const scope = (sessionId = "session-a", workspace = "/workspace-a") => ({ sessionId, workspace });

test("workflow lifecycle permits only privacy-reviewed scan transitions and serializes the compatible shape", () => {
  const lifecycle = createWorkflowLifecycle();
  const workflow = lifecycle.authorize(scope(), "picm-adopt");

  assert.throws(() => lifecycle.transition(workflow, "begin-scan"), /WORKFLOW_TRANSITION_INVALID/);
  lifecycle.transition(workflow, "preflight-complete");
  lifecycle.transition(workflow, "privacy-reviewed", { excludedPaths: ["private"] });
  lifecycle.transition(workflow, "begin-scan");
  lifecycle.transition(workflow, "end-scan");

  assert.deepEqual(lifecycle.serialize(workflow), {
    cwd: "/workspace-a",
    command: "picm-adopt",
    preflightComplete: true,
    privacyReviewed: true,
    privacyFollowupPending: false,
    privacyQuestionIsConcise: false,
    scanStarted: true,
    scanSettled: true,
    maintenanceResetAttempted: false,
    adoptionBaselineCaptured: false,
    adoptionWasAlreadyAdopted: true,
    initialMaintenanceOffered: false,
    initialIntent: undefined,
    newWorkflowIntentRequired: false,
    newWorkflowIntent: undefined,
    pendingNewWorkflowIntent: undefined,
    pendingNewWorkflowIntentSource: undefined,
    completed: false,
    excludedPaths: ["private"],
  });
});

test("submodule inclusion accepts only one exact canonical user reply and expires with its scan phase", () => {
  const lifecycle = createWorkflowLifecycle();
  const workflow = lifecycle.authorize(scope(), "picm-adopt");
  lifecycle.transition(workflow, "preflight-complete");
  lifecycle.transition(workflow, "privacy-reviewed");
  lifecycle.transition(workflow, "begin-scan");
  lifecycle.transition(workflow, "end-scan");

  for (const input of [
    " Include submodule: vendor/lib",
    "Include submodule: vendor/lib ",
    "Include submodule: vendor/lib/",
    "Say Include submodule: vendor/lib",
    "Include submodule: vendor/lib\n",
    "Include submodule: vendor/lib\r\n",
    "Include submodule: vendor/lib\nInclude submodule: vendor/other",
    "Include submodule: vendor/lib\nthanks",
    "Include submodule: vendor/lib.",
    "Include submodule: vendor/my lib",
    "Include submodule: vendor/lib!",
    "Include submodule: vendor/lib?",
    "Include submodule: vendor/lib,",
    "Include submodule: vendor/lib;",
    "Include submodule: \"vendor/lib\"",
  ]) {
    assert.equal(lifecycle.observeSubmoduleInclusion(workflow, input), false, input);
  }
  assert.equal(lifecycle.observeSubmoduleInclusion(workflow, "Include submodule: vendor/lib"), true);

  lifecycle.transition(workflow, "begin-scan");
  const admission = lifecycle.submoduleInventoryAdmission(workflow, "vendor/lib");
  assert.ok(admission);
  assert.equal(lifecycle.submoduleInventoryAdmission(workflow, "vendor/other"), undefined);
  assert.throws(
    () => lifecycle.admitSubmodule(workflow, { ...admission, projectRelativeRoot: "vendor/other" }, "/workspace-a/vendor/other"),
    /WORKFLOW_TRANSITION_INVALID/,
  );
  assert.equal(lifecycle.submoduleAccessAdmission(workflow), undefined);

  lifecycle.admitSubmodule(workflow, admission, "/workspace-a/vendor/lib");
  assert.equal(lifecycle.submoduleAccessAdmission(workflow)?.canonicalRoot, "/workspace-a/vendor/lib");
  lifecycle.transition(workflow, "end-scan");
  assert.equal(lifecycle.submoduleAccessAdmission(workflow), undefined);
  lifecycle.transition(workflow, "begin-scan");
  assert.equal(lifecycle.submoduleAccessAdmission(workflow), undefined);
  assert.equal(lifecycle.submoduleInventoryAdmission(workflow, "vendor/lib"), undefined);
});

test("workflow lifecycle restores legacy and incomplete state conservatively", () => {
  const lifecycle = createWorkflowLifecycle();
  const restored = lifecycle.restore(scope(), {
    status: "authorized",
    cwd: "/workspace-a",
    command: "picm-maintain",
    privacyReviewed: true,
    scanStarted: true,
    maintenanceResetAttempted: true,
    excludedPaths: [],
  });

  assert.equal(lifecycle.serialize(restored).preflightComplete, false);
  assert.equal(lifecycle.serialize(restored).privacyReviewed, false);
  assert.equal(lifecycle.serialize(restored).scanStarted, false);
  assert.equal(lifecycle.serialize(restored).maintenanceResetAttempted, false);
  assert.equal(lifecycle.restore(scope(), {
    status: "authorized",
    cwd: "/different-workspace",
    command: "picm-adopt",
  }), undefined);
  assert.equal(lifecycle.restore(scope(), {
    status: "authorized",
    command: "picm-adopt",
  }), undefined);
  const malformedCompleted = lifecycle.restore(scope("completed-session"), {
    status: "completed",
    cwd: "/workspace-a",
    command: "picm-adopt",
    preflightComplete: true,
    privacyReviewed: true,
    scanStarted: true,
    scanSettled: true,
    maintenanceResetAttempted: false,
    excludedPaths: "legacy-invalid",
  });
  assert.equal(lifecycle.serialize(malformedCompleted).privacyReviewed, false);
  assert.deepEqual(lifecycle.serialize(malformedCompleted).excludedPaths, []);
});
