import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateNextDue,
  canonicalTimestamp,
  createPolicy,
  isDue,
  normalizeInterval,
  resetPolicy,
  validatePolicy,
} from "../extensions/runtime/maintenance-policy.mjs";

test("calendar months clamp month-end and handle leap years", () => {
  assert.equal(calculateNextDue("2025-01-31T12:34:56.789Z", { value: 1, unit: "months" }), "2025-02-28T12:34:56.789Z");
  assert.equal(calculateNextDue("2024-01-31T12:34:56.789Z", { value: 1, unit: "months" }), "2024-02-29T12:34:56.789Z");
  assert.equal(calculateNextDue("2024-02-29T12:34:56.789Z", { value: 12, unit: "months" }), "2025-02-28T12:34:56.789Z");
});

test("days and weeks are fixed UTC durations", () => {
  assert.equal(calculateNextDue("2026-03-07T23:00:00.000Z", { value: 1, unit: "days" }), "2026-03-08T23:00:00.000Z");
  assert.equal(calculateNextDue("2026-03-07T23:00:00.000Z", { value: 2, unit: "weeks" }), "2026-03-21T23:00:00.000Z");
});

test("creates, resets, and checks scheduled policies deterministically", () => {
  const policy = createPolicy({ mode: "nudge", intervalValue: 1, intervalUnit: "months", now: "2026-01-31T10:00:00.000Z" });
  assert.deepEqual(policy, {
    mode: "nudge",
    interval: { value: 1, unit: "months" },
    lastCycleAt: "2026-01-31T10:00:00.000Z",
    nextDueAt: "2026-02-28T10:00:00.000Z",
  });
  assert.equal(isDue(policy, "2026-02-28T09:59:59.999Z"), false);
  assert.equal(isDue(policy, "2026-02-28T10:00:00.000Z"), true);
  assert.equal(resetPolicy(policy, "2026-03-02T01:02:03.004Z").nextDueAt, "2026-04-02T01:02:03.004Z");
});

test("manual policy is strict and never due", () => {
  assert.deepEqual(createPolicy({ mode: "manual" }), { mode: "manual" });
  assert.deepEqual(validatePolicy({ mode: "manual" }), { mode: "manual" });
  assert.equal(isDue({ mode: "manual" }, "2026-01-01T00:00:00.000Z"), false);
  assert.throws(() => validatePolicy({ mode: "manual", interval: { value: 1, unit: "months" } }), { code: "INVALID_POLICY" });
});

test("rejects invalid intervals, timestamps, fields, and derived due dates", () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeInterval(value, "days"), { code: "INVALID_INTERVAL_VALUE" });
  }
  assert.throws(() => normalizeInterval(1, "years"), { code: "INVALID_INTERVAL_UNIT" });
  assert.throws(() => calculateNextDue("2026-01-01T00:00:00.000Z", { value: 100_000_001, unit: "days" }), { code: "INTERVAL_OUT_OF_RANGE" });
  assert.throws(() => canonicalTimestamp("2026-01-01T00:00:00Z"), { code: "INVALID_TIMESTAMP" });
  const policy = createPolicy({ mode: "automatic", intervalValue: 1, intervalUnit: "weeks", now: "2026-01-01T00:00:00.000Z" });
  assert.throws(() => validatePolicy({ ...policy, extra: true }), { code: "INVALID_POLICY" });
  assert.throws(() => validatePolicy({ ...policy, nextDueAt: "2026-01-09T00:00:00.000Z" }), { code: "INVALID_NEXT_DUE" });
});
