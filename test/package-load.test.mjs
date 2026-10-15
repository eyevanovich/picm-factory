import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

test("packed TypeScript runtime loads through Pi from node_modules", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "picm-package-load-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const [packed] = JSON.parse(execFileSync("npm", [
    "pack", "--ignore-scripts", "--json", "--pack-destination", cwd,
  ], { encoding: "utf8" }));
  const packageRoot = join(cwd, "node_modules", "@eyevanovich", "picm-factory");
  mkdirSync(packageRoot, { recursive: true });
  execFileSync("tar", ["-xzf", join(cwd, packed.filename), "-C", packageRoot, "--strip-components=1"]);

  const result = await discoverAndLoadExtensions([
    join(packageRoot, "extensions"),
  ], cwd, join(cwd, "agent"));
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  const [extension] = result.extensions;
  assert.deepEqual([...extension.commands.keys()].sort(), [
    "picm-adopt", "picm-help", "picm-maintain", "picm-new", "picm-optimize",
  ]);
  assert.deepEqual([...extension.tools.keys()].sort(), [
    "picm_decision", "picm_maintenance_policy", "picm_settings",
  ]);
  const status = await extension.tools.get("picm_maintenance_policy").definition.execute(
    "package-status", { action: "status" }, undefined, undefined, { cwd },
  );
  assert.deepEqual(status.details, {
    ok: true, exists: false, maintenance: undefined, effectiveMode: "manual",
  });
});
