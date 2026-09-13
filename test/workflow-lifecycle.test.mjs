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
