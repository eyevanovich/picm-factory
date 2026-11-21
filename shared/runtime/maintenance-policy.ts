export const MAINTENANCE_MODES = Object.freeze(["manual", "nudge", "automatic"] as const);
export const MAINTENANCE_INTERVAL_UNITS = Object.freeze(["days", "weeks", "months"] as const);

export type MaintenanceMode = typeof MAINTENANCE_MODES[number];
export type IntervalUnit = typeof MAINTENANCE_INTERVAL_UNITS[number];
export type MaintenanceInterval = { value: number; unit: IntervalUnit };
export type ScheduledMaintenancePolicy = {
  mode: Exclude<MaintenanceMode, "manual">;
  interval: MaintenanceInterval;
  lastCycleAt: string;
  nextDueAt: string;
};
export type MaintenancePolicy = { mode: "manual" } | ScheduledMaintenancePolicy;
export type PolicyOptions = {
  mode?: unknown;
  intervalValue?: unknown;
  intervalUnit?: unknown;
  now?: Date | string | number;
};

export class MaintenancePolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "MaintenancePolicyError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new MaintenancePolicyError(code, message);
}

export function normalizeInterval(value: unknown, unit: unknown): MaintenanceInterval {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    fail("INVALID_INTERVAL_VALUE", "interval value must be a positive safe integer");
  }
  if (!MAINTENANCE_INTERVAL_UNITS.some((candidate) => candidate === unit)) {
    fail("INVALID_INTERVAL_UNIT", "interval unit must be days, weeks, or months");
  }
  return { value, unit: unit as IntervalUnit };
}

export function canonicalTimestamp(value: unknown, field = "timestamp"): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    fail("INVALID_TIMESTAMP", `${field} must be a canonical RFC 3339 UTC millisecond timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    fail("INVALID_TIMESTAMP", `${field} must be a valid canonical RFC 3339 UTC millisecond timestamp`);
  }
  return value;
}

export function canonicalNow(now: Date | string | number = new Date()) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(date.getTime())) {
    fail("INVALID_NOW", "current time is invalid");
  }
  return date.toISOString();
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function calculateNextDue(lastCycleAt: string, interval: { value?: unknown; unit?: unknown } | null | undefined) {
  canonicalTimestamp(lastCycleAt, "lastCycleAt");
  const normalized = normalizeInterval(interval?.value, interval?.unit);
  const from = new Date(lastCycleAt);

  if (normalized.unit === "days" || normalized.unit === "weeks") {
    const days = normalized.value * (normalized.unit === "weeks" ? 7 : 1);
    const milliseconds = days * 24 * 60 * 60 * 1000;
    const nextTime = from.getTime() + milliseconds;
    const next = new Date(nextTime);
    if (!Number.isSafeInteger(milliseconds) || !Number.isFinite(nextTime) || !Number.isFinite(next.getTime())) {
      fail("INTERVAL_OUT_OF_RANGE", "interval cannot be represented as a timestamp");
    }
    return next.toISOString();
  }

  const targetMonthIndex = from.getUTCMonth() + normalized.value;
  const targetYear = from.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(from.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));
  const next = new Date(from.getTime());
  next.setUTCDate(1);
  next.setUTCFullYear(targetYear, targetMonth, targetDay);
  if (!Number.isFinite(next.getTime())) {
    fail("INTERVAL_OUT_OF_RANGE", "interval cannot be represented as a timestamp");
  }
  return next.toISOString();
}

export function validatePolicy(value: unknown): MaintenancePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_POLICY", "maintenance policy must be an object");
  }
  const policy = value as Record<string, unknown>;
  const keys = Object.keys(policy).sort();
  if (policy.mode === "manual") {
    if (keys.length !== 1 || keys[0] !== "mode") {
      fail("INVALID_POLICY", "manual maintenance policy may contain only mode");
    }
    return { mode: "manual" };
  }
  if (policy.mode !== "nudge" && policy.mode !== "automatic") {
    fail("INVALID_MODE", "maintenance mode must be manual, nudge, or automatic");
  }
  const expected = ["interval", "lastCycleAt", "mode", "nextDueAt"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail("INVALID_POLICY", "scheduled maintenance policy has unknown or missing fields");
  }
  const rawInterval = policy.interval as { value?: unknown; unit?: unknown } | null | undefined;
  const interval = normalizeInterval(rawInterval?.value, rawInterval?.unit);
  if (Object.keys(policy.interval ?? {}).sort().join(",") !== "unit,value") {
    fail("INVALID_POLICY", "maintenance interval has unknown or missing fields");
  }
  const lastCycleAt = canonicalTimestamp(policy.lastCycleAt, "lastCycleAt");
  const nextDueAt = canonicalTimestamp(policy.nextDueAt, "nextDueAt");
  const calculated = calculateNextDue(lastCycleAt, interval);
  if (nextDueAt !== calculated) {
    fail("INVALID_NEXT_DUE", "nextDueAt must equal the deterministic interval calculation");
  }
  return { mode: policy.mode, interval, lastCycleAt, nextDueAt };
}

export function createPolicy({ mode = "nudge", intervalValue, intervalUnit, now = new Date() }: PolicyOptions = {}): MaintenancePolicy {
  if (mode === "manual") return { mode: "manual" };
  if (mode !== "nudge" && mode !== "automatic") {
    fail("INVALID_MODE", "maintenance mode must be manual, nudge, or automatic");
  }
  const interval = normalizeInterval(intervalValue, intervalUnit);
  const lastCycleAt = canonicalNow(now);
  return {
    mode,
    interval,
    lastCycleAt,
    nextDueAt: calculateNextDue(lastCycleAt, interval),
  };
}

export function resetPolicy(policy: unknown, now: Date | string | number = new Date()) {
  const valid = validatePolicy(policy);
  if (valid.mode === "manual") return valid;
  return createPolicy({
    mode: valid.mode,
    intervalValue: valid.interval.value,
    intervalUnit: valid.interval.unit,
    now,
  });
}

export function isDue(policy: unknown, now: Date | string | number = new Date()) {
  const valid = validatePolicy(policy);
  if (valid.mode === "manual") return false;
  return Date.parse(canonicalNow(now)) >= Date.parse(valid.nextDueAt);
}
