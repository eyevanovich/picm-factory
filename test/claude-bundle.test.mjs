import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { buildClaudeBundle } from "../scripts/build-claude-bundle.mjs";
import { settingsRequest } from "../claude-code/settings.ts";
import { commandPrompt } from "../pi/extensions/runtime/command-dispatch.ts";
import { instructionSizeReport } from "../scripts/report-instructions.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "picm-claude-bundle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ["claude-code", "shared", "LICENSE", "package.json"]) cpSync(resolve(path), join(root, path), { recursive: true });
  return root;
}

function files(root, prefix = "") {
  return readdirSync(join(root, prefix)).flatMap((name) => {
    const path = join(prefix, name);
    const stat = lstatSync(join(root, path));
    assert.equal(stat.isSymbolicLink(), false, path);
    return stat.isDirectory() ? files(root, path) : [path];
  });
}

function cli(bundle, workspace, operation, request) {
  return spawnSync(process.execPath, [join(bundle, "claude-code/settings.ts"), "--root", workspace, operation], {
    cwd: bundle, encoding: "utf8", input: typeof request === "string" ? request : JSON.stringify(request),
  });
}

function result(run, status = 0) {
  assert.equal(run.status, status, run.stderr || run.stdout);
  assert.equal(run.stderr, "");
  return JSON.parse(run.stdout);
}

test("release zip is self-contained outside the checkout with explicit-only commands and matching versions", (t) => {
  const root = fixture(t);
  const bundle = buildClaudeBundle({ root });
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const expected = [".claude-plugin/plugin.json", "package.json", "README.md", "LICENSE", "claude-code/settings.ts", "claude-code/session-history.md",
    ...["new", "adopt", "maintain", "optimize", "help"].map((mode) => `skills/${mode}/SKILL.md`),
    ...files(join(root, "shared")).filter((path) => path !== "compose-instructions.ts").map((path) => `shared/${path}`)].sort();
  const procedures = Object.fromEntries(Object.entries({ new: "interview-guide", adopt: "adoption-guide", maintain: "maintenance-rubric", optimize: "optimization-guide", help: "help-guide" })
    .map(([mode, guide]) => [mode, readFileSync(join(root, `shared/picm-factory/references/${guide}.md`), "utf8").split("\n")[0]]));
  const archive = join(root, "plugin.zip");
  execFileSync("zip", ["-qr", archive, "."], { cwd: bundle });
  const extracted = join(root, "extracted plugin");
  mkdirSync(extracted);
  execFileSync("unzip", ["-q", archive, "-d", extracted]);
  rmSync(join(root, "shared"), { recursive: true });
  rmSync(join(root, "claude-code"), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(extracted, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.name, "picm-factory");
  assert.equal(manifest.version, version);
  assert.equal(JSON.parse(readFileSync(join(extracted, "package.json"), "utf8")).version, version);
  const paths = files(extracted);
  assert.deepEqual([...paths].sort(), expected);
  for (const path of paths) {
    assert.doesNotMatch(path, /(?:^|\/)(?:node_modules|test|\.picm|\.pi|\.env|pi)(?:\/|$)/);
    if (!path.endsWith(".md")) continue;
    const text = readFileSync(join(extracted, path), "utf8");
    for (const [, target] of text.matchAll(/\]\(<?([^<>\n)]+\.md)(?:#[^<>\n)]*)?>?\)/g)) {
      if (/^[a-z]+:\/\//i.test(target)) continue;
      const destination = resolve(extracted, dirname(path), target.replace("${CLAUDE_PLUGIN_ROOT}", extracted));
      assert.ok(destination.startsWith(`${extracted}/`), `${path}: ${target}`);
      assert.ok(existsSync(destination), `${path}: ${target}`);
    }
  }
  for (const mode of ["new", "adopt", "maintain", "optimize", "help"]) {
    const text = readFileSync(join(extracted, `skills/${mode}/SKILL.md`), "utf8");
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${mode}: missing frontmatter`);
    // Entry metadata uses plain, single-line YAML scalars.
    assert.match(frontmatter[1], new RegExp(`^name: ${mode}$`, "m"));
    assert.match(frontmatter[1], /^description: [A-Za-z][^\n]*$/m);
    assert.match(frontmatter[1], /^disable-model-invocation: true$/m);
    assert.match(text, /## Shared trusted-assistant contract/);
    assert.match(text, /Claude Code 2\.1\.277 or newer/);
    assert.match(text, /Use canonical root\/nested `AGENTS.md`/);
    assert.match(text, /If status fails or is malformed, stop workspace discovery/);
    assert.doesNotMatch(text, /@AGENTS\.md|create or merge a neighboring/);
    assert.doesNotMatch(text, /## Mode routing|read `\$\{CLAUDE_PLUGIN_ROOT\}\/HOST\.md`/);
    assert.match(text, /\$ARGUMENTS/);
    assert.ok(text.includes(`Mode: ${mode}`));
    assert.equal(text.split("## Shared trusted-assistant contract").length - 1, 1);
    assert.equal(text.split("# Claude Code host adapter").length - 1, 1);
    const procedure = text.indexOf(procedures[mode]);
    assert.ok(text.indexOf("Wait for conversational sign-off") < text.indexOf("# Claude Code host adapter"));
    assert.ok(text.indexOf("# Claude Code host adapter") < procedure);
    assert.ok(procedure < text.indexOf("User arguments: $ARGUMENTS"));
    for (const [other, heading] of Object.entries(procedures)) {
      if (other !== mode) assert.equal(text.includes(`\n${heading}\n`), false);
    }
    assert.equal(text.includes(root), false, "skill depends on the build checkout");
  }
  const sizes = instructionSizeReport(extracted);
  assert.equal(sizes.length, 10);
  for (const row of sizes) {
    const text = row.host === "Pi"
      ? commandPrompt(`picm-${row.mode}`)
      : readFileSync(join(extracted, `skills/${row.mode}/SKILL.md`), "utf8");
    assert.equal(row.lines, [...text.matchAll(/[^\n]*\n|[^\n]+$/g)].length);
    assert.equal(row.words, text.trim().split(/\s+/u).length);
    assert.equal(row.bytes, new TextEncoder().encode(text).length);
    assert.equal(row.payload, row.host === "Pi"
      ? (row.mode === "maintain" ? "prompt, strict depth" : "prompt")
      : "full SKILL.md");
  }
  const optimize = readFileSync(join(extracted, "skills/optimize/SKILL.md"), "utf8");
  assert.match(optimize, /^description: .*session retrospective/m);
  const maintain = readFileSync(join(extracted, "skills/maintain/SKILL.md"), "utf8");
  for (const text of [maintain, optimize]) {
    assert.ok(text.includes("${CLAUDE_PLUGIN_ROOT}/shared/picm-factory/references/session-retrospective.md"));
    assert.ok(text.includes("${CLAUDE_PLUGIN_ROOT}/claude-code/session-history.md"));
    assert.match(text, /Documentation only triggers no history discovery/);
    assert.doesNotMatch(text, /^# Session retrospective$|CLAUDE_CONFIG_DIR/m);
  }
  const retro = readFileSync(join(extracted, "shared/picm-factory/references/session-retrospective.md"), "utf8");
  assert.match(retro, /maintain or optimize includes session evidence/);
  assert.match(retro, /shared pre-read privacy boundary to history discovery/);
  assert.match(retro, /Don't resume sessions, launch agents, or modify history/);
  assert.match(readFileSync(join(extracted, "claude-code/session-history.md"), "utf8"), /CLAUDE_CODE_PROJECT_DIR_NAME/);
  assert.match(optimize, /separately scoped follow-ups, not selected optimization edits/);
  const help = readFileSync(join(extracted, "skills/help/SKILL.md"), "utf8");
  assert.match(help, /without inspecting or editing/);
  assert.match(help, /use the past five sessions/);
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  assert.deepEqual(result(cli(extracted, workspace, "settings", { action: "status" })), { ok: true, exists: false, privacy: null });
  assert.equal(existsSync(join(workspace, ".picm")), false);
});

test("bundle rebuild removes stale generated files and refuses unrelated destinations", (t) => {
  const root = fixture(t);
  const bundle = buildClaudeBundle({ root });
  writeFileSync(join(bundle, "stale.txt"), "generated fixture");
  buildClaudeBundle({ root });
  assert.equal(existsSync(join(bundle, "stale.txt")), false);
  rmSync(join(bundle, "package.json"));
  writeFileSync(join(bundle, "unrelated.txt"), "preserve");
  assert.throws(() => buildClaudeBundle({ root }), /Refusing to replace/);
  assert.equal(readFileSync(join(bundle, "unrelated.txt"), "utf8"), "preserve");
});

test("bundle build rejects linked destinations and sources while preserving existing content", (t) => {
  const root = fixture(t);
  const outside = join(root, "unrelated");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.txt"), "preserve");
  symlinkSync(outside, join(root, "dist"), "dir");
  assert.throws(() => buildClaudeBundle({ root }), /ordinary directory/);
  rmSync(join(root, "dist"));
  mkdirSync(join(root, "dist"));
  symlinkSync(outside, join(root, "dist/claude-code"), "dir");
  assert.throws(() => buildClaudeBundle({ root }), /Refusing to replace/);
  rmSync(join(root, "dist/claude-code"));
  const bundle = buildClaudeBundle({ root });
  const before = readFileSync(join(bundle, "skills/adopt/SKILL.md"), "utf8");
  rmSync(join(root, "claude-code/HOST.md"));
  symlinkSync(join(outside, "keep.txt"), join(root, "claude-code/HOST.md"));
  assert.throws(() => buildClaudeBundle({ root }), /regular instruction source/);
  assert.equal(readFileSync(join(bundle, "skills/adopt/SKILL.md"), "utf8"), before);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "preserve");
  assert.deepEqual(readdirSync(join(root, "dist")), ["claude-code"]);
});

test("settings CLI preserves opaque fields, projects results, and rejects stale writes", (t) => {
  const root = fixture(t);
  const bundle = buildClaudeBundle({ root });
  const workspace = join(root, "workspace");
  mkdirSync(join(workspace, ".picm"), { recursive: true });
  const config = join(workspace, ".picm/config.json");
  writeFileSync(config, JSON.stringify({ version: 1, unrelated: "synthetic-opaque-marker", privacy: { excludedPaths: [], custom: "synthetic-private-field" } }));
  assert.deepEqual(result(cli(bundle, workspace, "settings", { action: "status" })), { ok: true, exists: true, privacy: { excludedPaths: [] } });
  const update = result(cli(bundle, workspace, "settings", { action: "set-exclusions", excludedPaths: ["private", "資料"], expectedExcludedPaths: [] }));
  assert.equal(update.committed, true);
  const beforeConflict = readFileSync(config, "utf8");
  const conflict = result(cli(bundle, workspace, "settings", { action: "set-exclusions", excludedPaths: ["other"], expectedExcludedPaths: [] }), 2);
  assert.equal(conflict.code, "PRIVACY_POLICY_CONFLICT");
  assert.equal(readFileSync(config, "utf8"), beforeConflict);
  const configured = result(cli(bundle, workspace, "maintenance", { action: "configure", intervalValue: 1, intervalUnit: "weeks" }));
  assert.equal(configured.committed, true);
  const status = result(cli(bundle, workspace, "maintenance", { action: "status" }));
  assert.equal(status.maintenance.mode, "nudge");
  const completed = result(cli(bundle, workspace, "maintenance", { action: "complete" }));
  for (const value of [update, conflict, configured, status, completed]) {
    assert.doesNotMatch(JSON.stringify(value), /synthetic-|"config"/);
  }
  const persisted = JSON.parse(readFileSync(config, "utf8"));
  assert.equal(persisted.unrelated, "synthetic-opaque-marker");
  assert.equal(persisted.privacy.custom, "synthetic-private-field");
  assert.deepEqual(persisted.privacy.excludedPaths, ["private", "資料"]);
});

test("settings CLI rejects invalid requests and unsafe roots without mutation", (t) => {
  const root = fixture(t);
  const bundle = buildClaudeBundle({ root });
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  for (const [operation, request] of [
    ["settings", "{not-json"], ["settings", " ".repeat(65537)], ["settings", []], ["settings", { action: "status", unexpected: true }],
    ["settings", { action: "set-exclusions", excludedPaths: ["../outside"] }],
    ["settings", { action: "constructor" }], ["constructor", { action: "status" }],
    ["maintenance", { action: "configure", intervalValue: -1, intervalUnit: "days" }],
  ]) assert.equal(result(cli(bundle, workspace, operation, request), 1).ok, false);
  assert.equal(result(cli(bundle, ".", "settings", { action: "status" }), 1).code, "INVALID_ROOT");
  assert.equal(existsSync(join(workspace, ".picm")), false);
});

test("pre-cancelled helper requests don't create settings or clear cadence", async (t) => {
  const root = fixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(settingsRequest(root, "maintenance", { action: "configure", mode: "manual" }, controller.signal), { name: "AbortError" });
  assert.equal(existsSync(join(root, ".picm")), false);
});
