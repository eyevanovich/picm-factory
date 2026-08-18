import { isAbsolute, relative, resolve, sep } from "node:path";

function privacyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isOutside(root, candidate) {
  const path = relative(root, candidate);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function toPortablePath(path) {
  return path.split(sep).join("/");
}

export function normalizePrivacyExcludedPaths(cwd, values) {
  if (!Array.isArray(values)) {
    throw privacyError("PRIVACY_EXCLUDED_PATHS_INVALID", "privacy.excludedPaths must be an array");
  }

  const root = resolve(cwd);
  const normalized = [];
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

export function mergePrivacyExcludedPaths(cwd, ...sets) {
  return normalizePrivacyExcludedPaths(cwd, sets.flat());
}

export function privacyPathMatches(exclusion, candidate) {
  return candidate === exclusion || candidate.startsWith(`${exclusion}/`);
}

export function validatePrivacyPolicy(value, cwd) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw privacyError("PRIVACY_POLICY_INVALID", "privacy must be an object");
  }
  if (!Object.hasOwn(value, "excludedPaths")) {
    throw privacyError("PRIVACY_EXCLUDED_PATHS_MISSING", "privacy.excludedPaths is required");
  }
  return {
    excludedPaths: normalizePrivacyExcludedPaths(cwd, value.excludedPaths),
  };
}
