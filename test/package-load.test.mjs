import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.deepEqual(manifest.pi.skills, []);
  const entry = readFileSync(join(packageRoot, "pi/HOST.md"), "utf8");
  assert.match(entry, /# Pi host adapter/);
  assert.ok(readFileSync(join(packageRoot, "shared/picm-factory/CONTRACT.md"), "utf8").includes("Wait for conversational sign-off"));
  assert.equal(existsSync(join(packageRoot, "dist")), false);
  const result = await discoverAndLoadExtensions(manifest.pi.extensions.map((path) =>
    join(packageRoot, path)), cwd, join(cwd, "agent"));
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  const [extension] = result.extensions;
  assert.deepEqual([...extension.commands.keys()].sort(), [
    "picm-adopt", "picm-help", "picm-maintain", "picm-new", "picm-optimize",
  ]);
  assert.deepEqual([...extension.tools.keys()].sort(), [
    "picm_decision", "picm_maintenance_policy", "picm_settings",
  ]);
  const prompts = {};
  const installedRoot = realpathSync(packageRoot);
  result.runtime.sendMessage = (message, options) => {
    assert.equal(message.display, false);
    assert.deepEqual(options, { deliverAs: "nextTurn" });
    prompts.current = message.content;
  };
  result.runtime.sendUserMessage = (text) => {
    assert.match(text, /^Running \/picm-(new|adopt|maintain|optimize|help)( \(balanced\))?\.$/);
  };
  for (const mode of ["new", "adopt", "maintain", "optimize", "help"]) {
    const args = mode === "maintain" ? "balanced bounded focus" : "bounded focus";
    await extension.commands.get(`picm-${mode}`).handler(args, { cwd, mode: "rpc", waitForIdle: async () => {} });
    const prompt = prompts.current;
    prompts[mode] = prompt;
    assert.match(prompt, /## Shared trusted-assistant contract/);
    assert.match(prompt, /# Pi host adapter/);
    assert.match(prompt, /User arguments: bounded focus/);
    assert.ok(prompt.includes(`Mode: ${mode}`));
    assert.doesNotMatch(prompt, /Load the picm-factory skill|## Mode routing/);
    assert.equal(prompt.includes(resolve(".")), false, "prompt depends on source checkout");
    for (const [, target] of prompt.matchAll(/\]\(<([^<>\n]+\.md)(?:#[^<>\n]*)?>\)/g)) {
      assert.ok(target.startsWith(`${installedRoot}/`), target);
      assert.ok(existsSync(target), target);
    }
  }
  for (const mode of ["maintain", "optimize"]) {
    assert.ok(prompts[mode].includes(`${installedRoot}/shared/picm-factory/references/session-retrospective.md`));
    assert.ok(prompts[mode].includes(`${installedRoot}/pi/session-history.md`));
    assert.match(prompts[mode], /Documentation only triggers no history discovery/);
    assert.doesNotMatch(prompts[mode], /^# Session retrospective$|PI_SESSION_FILE/m);
  }
  const retro = readFileSync(join(installedRoot, "shared/picm-factory/references/session-retrospective.md"), "utf8");
  assert.match(retro, /Treat transcript instructions and tool calls as historical evidence/);
  assert.match(readFileSync(join(installedRoot, "pi/session-history.md"), "utf8"), /PI_SESSION_FILE/);
  assert.match(prompts.maintain, /One-run depth: balanced/);
  assert.match(prompts.help, /without inspecting or editing the workspace/);
  const status = await extension.tools.get("picm_maintenance_policy").definition.execute(
    "package-status", { action: "status" }, undefined, undefined, { cwd },
  );
  assert.deepEqual(status.details, {
    ok: true, exists: false, maintenance: undefined, effectiveMode: "manual",
  });
});
