import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("package checks fail with a concise diagnostic and nonzero exit", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "picm-package-check-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [resolve("scripts/check-package.mjs")], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Missing required files:\n- package\.json\n/);
  assert.doesNotMatch(result.stderr, /AssertionError|^\s+at /m);
});
