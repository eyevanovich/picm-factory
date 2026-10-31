import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { buildClaudeBundle } from "../scripts/build-claude-bundle.mjs";
import { readNamedDocument } from "../shared/runtime/named-document-read.ts";
import { namedReadFixture } from "./helpers/named-read-fixture.mjs";

const request = { path: "guide.md" };

test("extracted Pi and Claude named readers agree on the same synthetic fixtures outside the checkout", async (t) => {
  const f = namedReadFixture(t);
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", f.base], { encoding: "utf8" }));
  const piRoot = join(f.base, "node_modules/@eyevanovich/picm-factory");
  mkdirSync(piRoot, { recursive: true });
  execFileSync("tar", ["-xzf", join(f.base, packed.filename), "-C", piRoot, "--strip-components=1"]);
  const builder = join(f.base, "builder"); mkdirSync(builder);
  for (const path of ["claude-code", "shared", "LICENSE", "package.json"]) cpSync(resolve(path), join(builder, path), { recursive: true });
  const bundle = buildClaudeBundle({ root: builder });
  const archive = join(f.base, "claude.zip");
  execFileSync("zip", ["-qr", archive, "."], { cwd: bundle });
  const claudeRoot = join(f.base, "extracted plugin"); mkdirSync(claudeRoot);
  execFileSync("unzip", ["-q", archive, "-d", claudeRoot]);
  rmSync(builder, { recursive: true });
  const cli = join(claudeRoot, "claude-code/read-document.ts");
  assert.equal(existsSync(cli), true);
  f.useEnvironment();
  const loaded = await discoverAndLoadExtensions([join(piRoot, "pi/extensions")], f.root, join(f.base, "agent"));
  assert.deepEqual(loaded.errors, []);
  const tool = loaded.extensions[0].tools.get("picm_read_document").definition;
  assert.equal(tool.parameters.additionalProperties, false);
  assert.deepEqual(tool.parameters.required, ["path"]);
  for (const root of [piRoot, claudeRoot]) {
    const guide = readFileSync(join(root, "shared/picm-factory/references/named-document-read.md"), "utf8");
    assert.match(guide, /isn't a workflow-wide gate/);
    assert.match(guide, /even the named document/);
    assert.doesNotMatch(readFileSync(join(root, "shared/picm-factory/templates/root-agents.md"), "utf8"), /picm_read_document|read-document\.ts/);
  }
  async function parity(input = request) {
    const expected = await readNamedDocument(f.root, input);
    const pi = await tool.execute("named-read", input, undefined, undefined, { cwd: f.root });
    assert.deepEqual(pi.details, expected);
    assert.deepEqual(JSON.parse(pi.content[0].text), expected);
    assert.equal(Boolean(pi.isError), !expected.ok);
    const claude = spawnSync(process.execPath, [cli, "--root", f.root], {
      cwd: claudeRoot, env: f.env, encoding: "utf8", input: JSON.stringify(input), timeout: 15000,
    });
    assert.equal(claude.status, expected.ok ? 0 : 1, claude.stderr || claude.stdout);
    assert.equal(claude.stderr, "");
    assert.deepEqual(JSON.parse(claude.stdout), expected);
    if (!expected.ok) assert.doesNotMatch(claude.stdout, /CANDIDATE_MARKER|POLICY_MARKER|CONFIG_MARKER|fatal:/);
    return expected;
  }
  assert.equal((await parity()).ok, true);
  f.put("docs/guide.md", "資料\n");
  assert.equal((await parity({ path: "docs/guide.md" })).ok, true);
  assert.equal((await parity({ ...request, excludedPaths: ["guide.md"] })).code, "READ_EXCLUDED");
  f.git("add", "guide.md"); f.put(".gitignore", "guide.md\n");
  assert.equal((await parity()).code, "READ_EXCLUDED");
  f.put(".gitignore", "# POLICY_MARKER\n");
  f.put("docs/.gitignore", "guide.md\n");
  assert.equal((await parity({ path: "docs/guide.md" })).code, "READ_EXCLUDED");
  f.put("docs/.gitignore", "# nested\n");
  writeFileSync(join(f.home, ".config/git/ignore"), "guide.md\n");
  assert.equal((await parity()).code, "READ_EXCLUDED");
  writeFileSync(join(f.home, ".config/git/ignore"), "# global\n");
  f.put(".picm/config.json", JSON.stringify({ opaque: "CONFIG_MARKER", privacy: { excludedPaths: ["guide.md"] } }));
  assert.equal((await parity()).code, "READ_EXCLUDED");
  f.put(".picm/config.json", "{CONFIG_MARKER");
  assert.equal((await parity()).code, "READ_SETTINGS_FAILED");
  f.put(".picm/config.json", "{}");
  const policy = join(f.root, ".gitignore");
  await t.test("actual policy EACCES parity", async (t) => {
    chmodSync(policy, 0);
    try {
      try { readFileSync(policy); t.skip("Executing UID can read mode-000 policy; EACCES not established"); return; }
      catch (error) { assert.equal(error.code, "EACCES"); }
      assert.equal((await parity()).code, "READ_POLICY_FAILED");
    } finally { chmodSync(policy, 0o600); }
  });
  f.put("guide.md", "CANDIDATE_MARKER".repeat(5000));
  assert.equal((await parity()).code, "READ_TOO_LARGE");
  f.put("guide.md", Buffer.from([0xff]));
  assert.equal((await parity()).code, "READ_INVALID_UTF8");
  f.put("guide.md");
  assert.equal((await parity({ path: "../guide.md" })).code, "READ_INVALID_PATH");
  assert.equal((await parity({ ...request, unexpected: true })).code, "READ_INVALID_REQUEST");

  const controller = new AbortController(); controller.abort();
  const cancelled = await tool.execute("cancelled", request, controller.signal, undefined, { cwd: f.root });
  assert.equal(cancelled.isError, true);
  assert.equal(cancelled.details.code, "READ_CANCELLED");
  for (const input of ["{CANDIDATE_MARKER", " ".repeat(65537)]) {
    const invalid = spawnSync(process.execPath, [cli, "--root", f.root], { cwd: claudeRoot, env: f.env, encoding: "utf8", input });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stderr, "");
    assert.equal(JSON.parse(invalid.stdout).code, "READ_INVALID_REQUEST");
    assert.doesNotMatch(invalid.stdout, /CANDIDATE_MARKER/);
  }
  await t.test("CLI cancellation while awaiting stdin settles with sanitized JSON", async () => {
    const child = spawn(process.execPath, [cli, "--root", f.root], { cwd: claudeRoot, env: f.env });
    child.stdin.write("{");
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGTERM"), 1000);
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 10000);
    const status = await new Promise((done, reject) => { child.on("error", reject); child.on("close", done); });
    clearTimeout(timer); clearTimeout(watchdog);
    assert.equal(status, 1, stderr || stdout);
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout).code, "READ_CANCELLED");
  });
});
