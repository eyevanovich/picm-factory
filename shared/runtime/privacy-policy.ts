import { isAbsolute, relative, resolve, sep } from "node:path";

import { codedError as privacyError } from "./errors.ts";

export type StoredPrivacyPolicy = Record<string, unknown> & { excludedPaths?: string[] };
export type PrivacyPolicy = StoredPrivacyPolicy & { excludedPaths: string[] };

function isOutside(root: string, candidate: string) {
  const path = relative(root, candidate);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function toPortablePath(path: string) {
  return path.split(sep).join("/");
}

export function normalizePrivacyExcludedPaths(cwd: string, values: unknown): string[] {
  if (!Array.isArray(values)) {
    throw privacyError("PRIVACY_EXCLUDED_PATHS_INVALID", "privacy.excludedPaths must be an array");
  }

  const root = resolve(cwd);
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || value.trim() === "") {
      throw privacyError("PRIVACY_EXCLUDED_PATH_INVALID", "privacy exclusions must be non-empty strings");
    }
    if (value.includes("\0")) {
      throw privacyError("PRIVACY_EXCLUDED_PATH_INVALID", "privacy exclusions must not contain null bytes");
    }
    const trimmed = value.trim();
    if (isAbsolute(trimmed)) {
      throw privacyError("PRIVACY_EXCLUDED_PATH_ABSOLUTE", "privacy exclusions must be project-relative paths");
    }
    const absolute = resolve(root, trimmed);
    if (absolute === root || isOutside(root, absolute)) {
      throw privacyError("PRIVACY_EXCLUDED_PATH_OUTSIDE", "privacy exclusions must stay beneath the project root");
    }
    normalized.push(toPortablePath(relative(root, absolute)));
  }

  const unique = [...new Set(normalized)].sort();
  return unique.filter((candidate, index) => !unique.some(
    (parent, parentIndex) => parentIndex !== index && privacyPathMatches(parent, candidate),
  ));
}

export function privacyPathMatches(exclusion: string, candidate: string) {
  return candidate === exclusion || candidate.startsWith(`${exclusion}/`);
}

export function validatePrivacyPolicy(value: unknown, cwd: string): PrivacyPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw privacyError("PRIVACY_POLICY_INVALID", "privacy must be an object");
  }
  if (!Object.hasOwn(value, "excludedPaths")) {
    throw privacyError("PRIVACY_EXCLUDED_PATHS_MISSING", "privacy.excludedPaths is required");
  }
  return {
    ...value,
    excludedPaths: normalizePrivacyExcludedPaths(cwd, "excludedPaths" in value ? value.excludedPaths : undefined),
  };
}

export function validateStoredPrivacyPolicy(value: unknown, cwd: string): StoredPrivacyPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw privacyError(
      "PRIVACY_LEGACY_MIGRATION_REQUIRED",
      "legacy privacy data is not an object; migrate it explicitly before adding PiCM exclusions",
    );
  }
  if (!Object.hasOwn(value, "excludedPaths")) return { ...value };
  return validatePrivacyPolicy(value, cwd);
}

export function projectStoredPrivacyPolicy(value: unknown, cwd: string) {
  if (value === undefined) return undefined;
  const privacy = validateStoredPrivacyPolicy(value, cwd);
  return Array.isArray(privacy.excludedPaths)
    ? { excludedPaths: privacy.excludedPaths }
    : undefined;
}
