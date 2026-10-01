import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { commandPrompt } from "../extensions/runtime/command-dispatch.mjs";

const base = resolve("skills/picm-factory");
const read = (path) => readFileSync(join(base, path), "utf8");
const linkedPaths = (path) => [...read(path).matchAll(/\]\(([^)]+\.md)\)/g)]
  .map(([, target]) => relative(base, resolve(base, dirname(path), target)));

// This requirement matrix is independent of the prose layout and wording tests.
const routes = {
  new: "references/interview-guide.md",
  adopt: "references/adoption-guide.md",
  maintain: "references/maintenance-rubric.md",
  optimize: "references/optimization-guide.md",
  help: "references/help-guide.md",
};

test("every registered command routes through shared privacy and alignment before its guide", () => {
  const skill = read("SKILL.md");
  const contract = skill.indexOf("## Shared trusted-assistant contract");
  const routing = skill.indexOf("## Mode routing");
  assert.ok(contract >= 0 && routing > contract);
  assert.ok(skill.indexOf("Before content reads or searches") < routing);
  assert.ok(skill.indexOf("Wait for conversational sign-off") < routing);
  for (const [mode, guide] of Object.entries(routes)) {
    assert.match(commandPrompt(`picm-${mode}`), /shared trusted-assistant contract/);
    assert.ok(commandPrompt(`picm-${mode}`).includes(`Mode: ${mode}`));
    assert.ok(linkedPaths("SKILL.md").includes(guide), `${mode} guide not reachable`);
    assert.ok(linkedPaths(guide).includes("SKILL.md"), `${mode} guide lacks its shared prerequisite`);
    assert.match(skill, new RegExp(`\\| ${mode} \\|[^\\n]*${guide.replaceAll(".", "\\.")}`));
  }
});

test("scope and completion criteria cover the observed QA gaps", () => {
  const skill = read("SKILL.md");
  assert.match(skill, /Keep discovery inside that scope/);
  assert.match(skill, /exact ancestor\/global ignore-policy locations/);
  assert.match(skill, /If policy can't be resolved safely, ask/);
  assert.match(skill, /workspace read-first prerequisites are subject to this eligibility check/);
  assert.match(read("templates/root-agents.md"), /Apply these boundaries before every read-first route/);
  assert.match(read("references/adoption-guide.md"), /Completion includes an optional initial maintenance offer/);
  assert.match(read("references/specialist-guide.md"), /Name the recipe path, each input and its availability/);
  assert.match(read("references/specialist-guide.md"), /Complete only when the checklist identifies those actual routes/);
});

test("all shipped instruction links resolve inside the packaged skill", () => {
  const files = ["SKILL.md", ...["references", "templates"].flatMap((directory) =>
    readdirSync(join(base, directory)).filter((name) => name.endsWith(".md")).map((name) => `${directory}/${name}`))];
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  for (const file of files) {
    for (const target of linkedPaths(file)) {
      assert.ok(!target.startsWith(".."), `${file} escapes package: ${target}`);
      assert.ok(existsSync(join(base, target)), `${file} has broken pointer: ${target}`);
      const packagePath = `skills/picm-factory/${target}`;
      assert.ok(pkg.files.some((entry) => packagePath === entry || packagePath.startsWith(`${entry}/`)), `${target} not publishable`);
    }
  }
});

test("required downstream references remain reachable for every affected branch", () => {
  for (const [source, targets] of [
    ["references/interview-guide.md", ["references/layout-profiles.md", "references/settings-guide.md", "templates/root-agents.md", "templates/stage-context.md"]],
    ["references/layout-profiles.md", ["references/specialist-guide.md", "references/coding-adoption-guide.md"]],
    ["references/adoption-guide.md", ["references/coding-adoption-guide.md", "references/settings-guide.md"]],
    ["references/coding-adoption-guide.md", ["references/coding-maintenance-rubric.md", "references/layout-profiles.md"]],
    ["references/coding-maintenance-rubric.md", ["references/maintenance-rubric.md", "references/redundancy-review.md"]],
    ["references/maintenance-rubric.md", ["references/coding-maintenance-rubric.md", "references/redundancy-review.md", "references/optimization-guide.md", "references/settings-guide.md"]],
    ["references/optimization-guide.md", ["references/redundancy-review.md", "references/settings-guide.md"]],
  ]) {
    for (const target of targets) assert.ok(linkedPaths(source).includes(target), `${source} cannot reach ${target}`);
  }
  assert.match(read("references/maintenance-rubric.md"), /required even when optional optimization is declined/);
  assert.match(read("references/coding-adoption-guide.md"), /performs its \*\*Strict\*\* examination/);
  assert.match(read("references/layout-profiles.md"), /For a specialist recipe or its first-run checklist, load/);
  assert.match(read("references/optimization-guide.md"), /settings-guide\.md.*before completion/);
});

test("creation retains minimal architecture, source preservation and write-time completion", () => {
  const creation = read("references/interview-guide.md");
  for (const requirement of [
    /first real run/, /source-material-only/, /without moving or rewriting/,
    /ask only missing critical questions/, /Preserve deployment\/setup already completed/,
    /omit speculative stages, unused roles, empty folders, and placeholder content/,
    /Resolve `createdAt` at write time/, /configure agreed cadence.*after config exists/,
    /leave no unresolved tokens or authoring notes/, /path-specific first-run checklist/,
  ]) assert.match(creation, requirement);
});

test("adoption readiness is visible routing, never metadata or ambiguous dead status", () => {
  const adopt = read("references/adoption-guide.md");
  for (const label of ["Scanned only", "Needs routing before adoption", "Ready", "Ready with warnings"]) assert.ok(adopt.includes(label));
  assert.match(adopt, /adoption.status:.*adopted.*only with adequate visible routing/);
  assert.match(adopt, /Metadata never replaces the route map/);
  assert.match(adopt, /both exist, identify cooperation\/conflicts/);
  assert.match(adopt, /Saving a report or config is an edit/);
  const coding = read("references/coding-adoption-guide.md");
  assert.match(coding, /Scan and recommend is analysis, not a stored shape/);
  assert.match(coding, /Missing imports alone prove neither leftover nor ghost/);
  assert.match(coding, /archive\/dead status is a user decision/);
});

test("coding depths preserve independent coverage and legacy metadata boundaries", () => {
  const coding = read("references/coding-maintenance-rubric.md");
  const balanced = coding.split("### Balanced")[1].split("### Strict")[0];
  const strict = coding.split("### Strict")[1].split("## Coding cold-agent walk")[0];
  for (const requirement of [/declared roots/, /deleted\/excluded paths/, /verification/, /cross-boundary/, /one representative coding cold-agent walk/]) assert.match(balanced, requirement);
  for (const requirement of [/Run Balanced/, /all declared roots/, /manifest-level internal dependencies/, /mapped local contexts/, /more than one materially different boundary/, /redundancy review/]) assert.match(strict, requirement);
  assert.match(coding, /Preserve `capabilities.codebaseMap.maintenancePreset`/);
  assert.match(coding, /legacy `light`, `balanced`, and `strict` values don't select later depth/);
  assert.match(coding, /No watchers, scheduled scans, automatic commits, or rewrites/);
  assert.match(coding, /During adoption, use those definitions plus the checks here; no separate broad workflow audit or optimization interview is required/);
});

test("template authoring is separated from standalone runtime boundaries", () => {
  for (const file of readdirSync(join(base, "templates")).filter((name) => name.endsWith(".md"))) {
    const text = read(`templates/${file}`);
    assert.doesNotMatch(text, /\.\.\/(?:SKILL|references)/, `${file} depends on the installed package`);
  }
  for (const file of ["root-agents.md", "root-context.md", "stage-context.md", "specialist-context.md", "context-map.md", "code-boundary-context.md"]) {
    assert.match(read(`templates/${file}`), /^<!-- PiCM authoring:[\s\S]*?Remove this comment from generated output\. -->/);
  }
  const creation = read("references/interview-guide.md");
  assert.match(creation, /remove authoring comments\/instructions from generated files/);
  assert.match(creation, /Point only to existing, scaffolded, or explicitly per-run inputs/);
  assert.match(read("templates/root-agents.md"), /Unexpected exposure: stop inspecting/);
});
