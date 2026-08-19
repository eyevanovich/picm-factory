export const STRICT_MAINTENANCE_GUIDANCE =
  "Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.";

export const BALANCED_MAINTENANCE_GUIDANCE =
  "Balanced: representative coverage of major boundaries and one coding path; lower cost.";

export const MAINTENANCE_DEPTH_CHOICES = Object.freeze([
  STRICT_MAINTENANCE_GUIDANCE,
  BALANCED_MAINTENANCE_GUIDANCE,
]);

const storedPresets = new Set(["light", "balanced", "strict"]);

export function resolveStoredCodingMaintenancePreset(value) {
  if (value === undefined) return "balanced";
  if (storedPresets.has(value)) return value;
  throw new Error(`Unsupported coding maintenance preset: ${value}`);
}

export function parseMaintenanceDepthArgument(args) {
  const trimmed = args.trim();
  const match = /^(strict|balanced)(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (!match) return { depth: undefined, remainingArgs: trimmed };
  return {
    depth: match[1].toLowerCase(),
    remainingArgs: match[2]?.trim() ?? "",
  };
}
