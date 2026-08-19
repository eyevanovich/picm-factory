import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  mergePrivacyExcludedPaths,
  normalizePrivacyExcludedPaths,
  privacyPathMatches,
  validatePrivacyPolicy,
} from "../extensions/runtime/privacy-policy.mjs";

const root = resolve("/synthetic/project");

test("normalizes, deduplicates, and minimizes project-relative exclusions", () => {
  assert.deepEqual(normalizePrivacyExcludedPaths(root, [
    "./secrets/token.txt",
    "secrets/",
    "client-data/acme",
    "client-data/acme/private.txt",
  ]), ["client-data/acme", "secrets"]);
  assert.deepEqual(mergePrivacyExcludedPaths(root, [".env"], ["secrets/key"], ["secrets"]), [
    ".env",
    "secrets",
  ]);
});

test("rejects empty, absolute, root, and outside exclusions", () => {
  assert.throws(() => normalizePrivacyExcludedPaths(root, [""]), /non-empty strings/);
  assert.throws(() => normalizePrivacyExcludedPaths(root, [resolve(root, ".env")]), /project-relative/);
  assert.throws(() => normalizePrivacyExcludedPaths(root, ["."]), /beneath the project root/);
  assert.throws(() => normalizePrivacyExcludedPaths(root, ["../outside"]), /beneath the project root/);
});

test("matches an exact path and descendants without matching similar names", () => {
  assert.equal(privacyPathMatches("secrets", "secrets"), true);
  assert.equal(privacyPathMatches("secrets", "secrets/archive/key.txt"), true);
  assert.equal(privacyPathMatches("secrets", "secrets-old/key.txt"), false);
  assert.equal(privacyPathMatches(".env", ".env.local"), false);
});

test("validates the persisted privacy policy shape", () => {
  assert.deepEqual(validatePrivacyPolicy({ excludedPaths: ["secrets/", ".env"] }, root), {
    excludedPaths: [".env", "secrets"],
  });
  assert.throws(() => validatePrivacyPolicy({}, root), /privacy.excludedPaths is required/);
  assert.throws(() => validatePrivacyPolicy({ excludedPaths: "secrets" }, root), /must be an array/);
});
