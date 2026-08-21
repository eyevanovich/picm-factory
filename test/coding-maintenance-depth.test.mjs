import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCED_MAINTENANCE_GUIDANCE,
  MAINTENANCE_DEPTH_CHOICES,
  STRICT_MAINTENANCE_GUIDANCE,
  parseMaintenanceDepthArgument,
  resolveStoredCodingMaintenancePreset,
} from "../extensions/runtime/coding-maintenance-depth.mjs";

test("stored coding maintenance presets preserve historical compatibility", () => {
  assert.equal(resolveStoredCodingMaintenancePreset("light"), "light");
  assert.equal(resolveStoredCodingMaintenancePreset("balanced"), "balanced");
  assert.equal(resolveStoredCodingMaintenancePreset("strict"), "strict");
  assert.equal(resolveStoredCodingMaintenancePreset(undefined), "balanced");
  assert.throws(
    () => resolveStoredCodingMaintenancePreset("fast"),
    /Unsupported coding maintenance preset/,
  );
});

test("new run-depth choices are strict-first and exclude Light", () => {
  assert.deepEqual(MAINTENANCE_DEPTH_CHOICES, [
    "Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.",
    "Balanced: representative coverage of major boundaries and one coding path; lower cost.",
  ]);
  assert.equal(MAINTENANCE_DEPTH_CHOICES[0], STRICT_MAINTENANCE_GUIDANCE);
  assert.equal(MAINTENANCE_DEPTH_CHOICES[1], BALANCED_MAINTENANCE_GUIDANCE);
  assert.equal(MAINTENANCE_DEPTH_CHOICES.some((choice) => /light/i.test(choice)), false);
});

test("strict and balanced command arguments select one-run depth", () => {
  assert.deepEqual(parseMaintenanceDepthArgument("strict"), {
    depth: "strict",
    remainingArgs: "",
  });
  assert.deepEqual(parseMaintenanceDepthArgument("  BALANCED coding "), {
    depth: "balanced",
    remainingArgs: "coding",
  });
  assert.deepEqual(parseMaintenanceDepthArgument("routing"), {
    depth: undefined,
    remainingArgs: "routing",
  });
  assert.deepEqual(parseMaintenanceDepthArgument("light"), {
    depth: undefined,
    remainingArgs: "light",
  });
});
