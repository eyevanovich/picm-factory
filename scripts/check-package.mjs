import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "CONTEXT.md",
  "LICENSE",
  ".github/workflows/publish.yml",
  ".github/workflows/release.yml",
  "scripts/prepare-release.mjs",
  "test/release-preparer.test.mjs",
  "extensions/picm-factory.ts",
  "skills/picm-factory/SKILL.md",
  "prompts/picm-new.md",
  "prompts/picm-adopt.md",
  "prompts/picm-maintain.md",
  "prompts/picm-help.md",
  "docs/layout-fixture-qa.md",
  "docs/release-tagging-actions-research.md",
  "docs/releasing.md",
  "test/fixtures/coding-repository/README.md",
  "test/fixtures/layout-profiles/README.md",
];

const missing = required.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  console.error("Missing required files:\n" + missing.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.name !== "@eyevanovich/picm-factory") {
  console.error("package.json must use the expected public npm package name");
  process.exit(1);
}
if (pkg.repository?.url !== "git+https://github.com/eyevanovich/picm-factory.git") {
  console.error("package.json repository must match the trusted publishing repository");
  process.exit(1);
}
if (!pkg.keywords?.includes("pi-package")) {
  console.error("package.json must include keyword: pi-package");
  process.exit(1);
}
if (!pkg.pi?.extensions || !pkg.pi?.skills || !pkg.pi?.prompts) {
  console.error("package.json must declare pi.extensions, pi.skills, and pi.prompts");
  process.exit(1);
}
if (pkg.pi.prompts.length !== 0) {
  console.error("Backing prompts must not autoload alongside same-named extension commands");
  process.exit(1);
}
if (pkg.private === true) {
  console.error("package.json must allow npm publication");
  process.exit(1);
}
if (pkg.publishConfig?.access !== "public") {
  console.error("Scoped npm package must publish with public access");
  process.exit(1);
}
if (pkg.scripts?.prepublishOnly !== "npm run check") {
  console.error("npm publication must run the package check first");
  process.exit(1);
}
if (!pkg.scripts?.check?.includes("test/release-preparer.test.mjs")) {
  console.error("npm run check must exercise the release preparer tests");
  process.exit(1);
}

const packResult = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
  }),
)[0];
const requiredPackageFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "extensions/picm-factory.ts",
  "skills/picm-factory/SKILL.md",
  "skills/picm-factory/references/adoption-guide.md",
  "skills/picm-factory/references/coding-adoption-guide.md",
  "skills/picm-factory/references/coding-maintenance-rubric.md",
  "skills/picm-factory/references/interview-guide.md",
  "skills/picm-factory/references/layout-profiles.md",
  "skills/picm-factory/references/maintenance-rubric.md",
  "skills/picm-factory/templates/code-boundary-context.md",
  "skills/picm-factory/templates/context-map.md",
  "skills/picm-factory/templates/handoff-card.md",
  "skills/picm-factory/templates/root-agents.md",
  "skills/picm-factory/templates/root-context.md",
  "skills/picm-factory/templates/specialist-context.md",
  "skills/picm-factory/templates/stage-context.md",
];
const packedFiles = packResult.files.map(({ path }) => path);
const unexpectedPackageFiles = packedFiles.filter(
  (path) => !requiredPackageFiles.includes(path),
);
if (unexpectedPackageFiles.length > 0) {
  console.error(
    "npm package contains development-only files:\n" +
      unexpectedPackageFiles.map((path) => `- ${path}`).join("\n"),
  );
  process.exit(1);
}
const missingPackageFiles = requiredPackageFiles.filter(
  (path) => !packedFiles.includes(path),
);
if (missingPackageFiles.length > 0) {
  console.error(
    "npm package missing runtime files:\n" +
      missingPackageFiles.map((path) => `- ${path}`).join("\n"),
  );
  process.exit(1);
}

const skill = readFileSync(join(root, "skills/picm-factory/SKILL.md"), "utf8");
if (!skill.startsWith("---\n")) {
  console.error("SKILL.md must start with YAML frontmatter");
  process.exit(1);
}
if (!skill.includes("name: picm-factory")) {
  console.error("SKILL.md frontmatter must include name: picm-factory");
  process.exit(1);
}
if (!skill.includes("description:")) {
  console.error("SKILL.md frontmatter must include description");
  process.exit(1);
}

const firstRunGuidanceFiles = [
  "skills/picm-factory/SKILL.md",
  "skills/picm-factory/references/interview-guide.md",
  "skills/picm-factory/references/layout-profiles.md",
  "docs/layout-fixture-qa.md",
  "docs/picm-new-scenarios.md",
];
const firstRunSignals = [
  "first-run",
  "stage pipeline",
  "team / role os",
  "gaps/unknowns",
  "/picm-maintain",
];
for (const file of firstRunGuidanceFiles) {
  const text = readFileSync(join(root, file), "utf8").toLowerCase();
  for (const signal of firstRunSignals) {
    if (!text.includes(signal)) {
      console.error(`First-run review-gate guidance ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
}

const minimumViableGuidanceFiles = [
  "skills/picm-factory/SKILL.md",
  "skills/picm-factory/references/interview-guide.md",
  "docs/picm-new-scenarios.md",
];
const minimumViableSignals = [
  "what will you run first?",
  "first real run",
  "unused roles",
  "after the first real use",
];
for (const file of minimumViableGuidanceFiles) {
  const text = readFileSync(join(root, file), "utf8").toLowerCase();
  for (const signal of minimumViableSignals) {
    if (!text.includes(signal)) {
      console.error(`Minimum viable scaffold guidance ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
}

const mechanicalWorkGuidance = {
  "skills/picm-factory/SKILL.md": [
    "deterministic fetching, file movement, formatting, sending, or API work",
    "do not turn the extension into an executor or orchestrator",
    "user-named scripts/tools",
  ],
  "skills/picm-factory/references/interview-guide.md": [
    "fetch data, move files, format output, send messages/files, or call an API",
    "local script or MCP/tool integration",
    "without inventing one for the scaffold",
  ],
  "skills/picm-factory/references/maintenance-rubric.md": [
    "repeated deterministic instructions",
    "script/tool extraction",
    "do not invent, implement, or execute an integration",
  ],
  "skills/picm-factory/templates/root-agents.md": [
    "unless the user has named the relevant script or tool",
  ],
  "skills/picm-factory/templates/root-context.md": [
    "only when the user has named a relevant local script",
  ],
  "skills/picm-factory/templates/stage-context.md": [
    "only when the user has named a relevant local script",
  ],
};
for (const [file, signals] of Object.entries(mechanicalWorkGuidance)) {
  const text = readFileSync(join(root, file), "utf8");
  for (const signal of signals) {
    if (!text.includes(signal)) {
      console.error(`Mechanical-work boundary guidance ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
}

const codingGuidance = {
  "skills/picm-factory/SKILL.md": [
    "Git ignored means unreadable during coding scans",
    "/picm-adopt coding",
    "Coding Repository",
    "codebase-map capability",
    "Light/Balanced/Strict",
  ],
  "skills/picm-factory/references/coding-adoption-guide.md": [
    "git check-ignore --no-index",
    "Root map",
    "Distributed map",
    "Scan and recommend",
    "Additive",
    "Curated",
    "CONTEXT-MAP.md",
    "Do not follow symlinks during automatic scans",
    "Treat each submodule as a separate repository boundary",
  ],
  "skills/picm-factory/references/coding-maintenance-rubric.md": [
    "### Light",
    "### Balanced",
    "### Strict",
    "Coding cold-agent walk",
    "Future automation boundary",
  ],
  "skills/picm-factory/references/layout-profiles.md": [
    "## Coding Repository",
    "composable codebase-map capability",
    "CONTEXT-MAP.md",
  ],
  "skills/picm-factory/templates/context-map.md": [
    "# Repository Context Map",
    "## Context boundaries",
    "## Unknowns",
  ],
  "skills/picm-factory/templates/code-boundary-context.md": [
    "# Component Context",
    "## Verification",
    "## Known unknowns",
  ],
};
for (const [file, signals] of Object.entries(codingGuidance)) {
  const text = readFileSync(join(root, file), "utf8");
  for (const signal of signals) {
    if (!text.includes(signal)) {
      console.error(`Coding-repository guidance ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
}

const extension = readFileSync(join(root, "extensions/picm-factory.ts"), "utf8");
const forbiddenExtensionRuntimeSignals = [
  "node:child_process",
  "executePipeline",
  "runPipeline",
  "orchestrateWorkflow",
];
for (const signal of forbiddenExtensionRuntimeSignals) {
  if (extension.includes(signal)) {
    console.error(`PiCM extension must remain thin; found runtime signal: ${signal}`);
    process.exit(1);
  }
}
const codingCompletionLists = [
  "adoptArgumentCompletions",
  "maintainArgumentCompletions",
];
for (const listName of codingCompletionLists) {
  const list = extension.match(
    new RegExp(`const ${listName} = \\[([\\s\\S]*?)\\n\\];`),
  )?.[1];
  if (!list?.includes('value: "coding"')) {
    console.error(`PiCM extension ${listName} must offer the coding completion`);
    process.exit(1);
  }
}

const releaseDocs = {
  "README.md": [
    "pi install -l npm:@eyevanovich/picm-factory",
    "GitHub Issues",
  ],
  "CHANGELOG.md": ["Public npm distribution"],
  "CONTRIBUTING.md": [
    "GitHub Issue",
    "npm run check",
    "Interactive `/picm-*` QA is manual",
    "docs/releasing.md",
  ],
  "docs/releasing.md": [
    "npm trusted publishing",
    "Workflow filename: `publish.yml`",
    "Actions → Create release",
    "`feat!:`",
    "prohibit GitHub Actions from creating or approving pull requests",
    "`RELEASE_APP_CLIENT_ID`",
    "`RELEASE_APP_PRIVATE_KEY`",
    "separate default-branch ruleset",
    "https://pi.dev/packages/@eyevanovich/picm-factory",
  ],
  "docs/references.md": ["https://arxiv.org/abs/2603.16021", "Pi documentation"],
};
for (const [file, signals] of Object.entries(releaseDocs)) {
  const text = readFileSync(join(root, file), "utf8");
  for (const signal of signals) {
    if (!text.includes(signal)) {
      console.error(`Release documentation ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
}

for (const obsoleteReleasePleaseFile of [
  "release-please-config.json",
  ".release-please-manifest.json",
]) {
  if (existsSync(join(root, obsoleteReleasePleaseFile))) {
    console.error(`Obsolete Release Please file must be removed: ${obsoleteReleasePleaseFile}`);
    process.exit(1);
  }
}

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
if (changelog.includes("## [Unreleased]")) {
  console.error("The release preparer owns release notes; do not maintain an Unreleased section");
  process.exit(1);
}
const escapedPackageVersion = pkg.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const currentReleaseHeading = changelog.match(
  new RegExp(`^## \\[${escapedPackageVersion}\\] - (\\d{4}-\\d{2}-\\d{2})$`, "m"),
);
if (!currentReleaseHeading) {
  console.error(`CHANGELOG.md must include a dated heading for version ${pkg.version}`);
  process.exit(1);
}
const releaseDate = currentReleaseHeading[1];
if (new Date(`${releaseDate}T00:00:00Z`).toISOString().slice(0, 10) !== releaseDate) {
  console.error(`CHANGELOG.md has an invalid release date for version ${pkg.version}`);
  process.exit(1);
}

const publishWorkflow = readFileSync(
  join(root, ".github/workflows/publish.yml"),
  "utf8",
);
const publishWorkflowSignals = [
  "workflow_dispatch:",
  "release_tag:",
  "Existing automated release tag to publish",
  "inputs.release_tag != 'v0.1.2'",
  "id-token: write",
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6",
  "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6",
  "Verify GitHub Release",
  'gh release view "$RELEASE_TAG"',
  "npm publish",
];
for (const signal of publishWorkflowSignals) {
  if (!publishWorkflow.includes(signal)) {
    console.error(`npm publish workflow missing signal: ${signal}`);
    process.exit(1);
  }
}
if (/NPM_(TOKEN|AUTH_TOKEN)/.test(publishWorkflow)) {
  console.error("npm publish workflow must use trusted publishing, not a stored npm token");
  process.exit(1);
}
if (/^\s+push:\s*$/m.test(publishWorkflow.slice(0, publishWorkflow.indexOf("jobs:")))) {
  console.error("npm publication must not be triggered by an arbitrary pushed tag");
  process.exit(1);
}
if (publishWorkflow.includes("gh release create")) {
  console.error("The publisher must require an existing GitHub Release");
  process.exit(1);
}

const releaseWorkflow = readFileSync(
  join(root, ".github/workflows/release.yml"),
  "utf8",
);
const releaseWorkflowSignals = [
  "workflow_dispatch:",
  "actions: write",
  "contents: write",
  "pull-requests: read",
  "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0",
  "client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}",
  "private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}",
  "permission-contents: write",
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6",
  "token: ${{ steps.release-app.outputs.token }}",
  "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6",
  "node scripts/prepare-release.mjs --require-merged-prs",
  "npm run check",
  'git config user.name "${RELEASE_APP_SLUG}[bot]"',
  "git push --atomic origin",
  "gh release create",
  "gh workflow run publish.yml",
  'release_tag="$RELEASE_TAG"',
];
for (const signal of releaseWorkflowSignals) {
  if (!releaseWorkflow.includes(signal)) {
    console.error(`Release workflow missing signal: ${signal}`);
    process.exit(1);
  }
}
if (/pull-requests:\s*write|issues:\s*write|release-please-action/.test(releaseWorkflow)) {
  console.error("The release workflow must not create or manage pull requests");
  process.exit(1);
}
if (/(PERSONAL_ACCESS_TOKEN|GH_PAT|NPM_TOKEN|NPM_AUTH_TOKEN)/.test(releaseWorkflow)) {
  console.error("Release preparation must use short-lived GitHub workflow credentials");
  process.exit(1);
}

const actionUses = [publishWorkflow, releaseWorkflow].flatMap((workflow) =>
  [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s]+)/g)],
);
const unpinnedAction = actionUses.find(([, ref]) => !/^[0-9a-f]{40}$/.test(ref));
if (unpinnedAction) {
  console.error(`GitHub Action must be pinned to a commit SHA: ${unpinnedAction[0]}`);
  process.exit(1);
}

const publicTextFiles = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",
  "skills/picm-factory/SKILL.md",
  "skills/picm-factory/references/coding-adoption-guide.md",
  "skills/picm-factory/references/coding-maintenance-rubric.md",
  "docs/layout-fixture-qa.md",
  "docs/picm-new-scenarios.md",
  "docs/release-tagging-actions-research.md",
  "docs/references.md",
  "docs/releasing.md",
  "qa-runner/CONTEXT.md",
];
const forbiddenPrivateSignals = [
  "gitea.donskoy-hops.ts.net",
  "/Users/ipiesh",
  "clief-workspace",
  "bd prime",
];
for (const file of publicTextFiles) {
  const text = readFileSync(join(root, file), "utf8");
  for (const signal of forbiddenPrivateSignals) {
    if (text.includes(signal)) {
      console.error(`Public release file ${file} contains private/internal signal: ${signal}`);
      process.exit(1);
    }
  }
}

const referencesDoc = readFileSync(join(root, "docs/references.md"), "utf8");
if (/Cellar\/pi-coding-agent\/\d+\.\d+\.\d+/.test(referencesDoc)) {
  console.error("docs/references.md must not pin a versioned Homebrew Cellar path");
  process.exit(1);
}

const commandDecisionGuidanceFiles = [
  "README.md",
  "prompts/picm-help.md",
  "skills/picm-factory/SKILL.md",
  "docs/layout-fixture-qa.md",
];
const commandDecisionSignals = [
  "/picm-new",
  "/picm-adopt",
  "/picm-maintain",
  "/picm-maintain trace",
  "mostly empty",
  "existing",
  "project-local",
  ".pi/",
  ".picm/",
  "preview",
  "non-destructive",
];
for (const file of commandDecisionGuidanceFiles) {
  const text = readFileSync(join(root, file), "utf8").toLowerCase();
  for (const signal of commandDecisionSignals) {
    if (!text.includes(signal)) {
      console.error(`Command decision guidance ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
  for (const signal of ["/picm-adopt coding", "coding repository"]) {
    if (!text.includes(signal)) {
      console.error(`Coding command guidance ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
}

const readme = readFileSync(join(root, "README.md"), "utf8").toLowerCase();
if (!readme.includes("you do not need to know")) {
  console.error("README command decision guide must avoid requiring PiCM/ICM jargon");
  process.exit(1);
}

const fixtureRoot = "test/fixtures/layout-profiles";
const codingFixtureRoot = "test/fixtures/coding-repository";
const maintainableFixtures = [
  "stage-pipeline/newsletter-production",
  "stage-pipeline/workshop-planning",
  "stage-pipeline/source-integrity-trace",
  "specialist-folder/product-voice-reviewer",
  "specialist-folder/faq-polisher",
  "team-role-os/event-ops",
  "team-role-os/volunteer-program",
  "custom-existing-structure/adopted-custom-picm",
  "security-red-team/maintain-sensitive-boundaries",
];

for (const fixture of maintainableFixtures) {
  for (const file of ["AGENTS.md", "CONTEXT.md"]) {
    const path = join(root, fixtureRoot, fixture, file);
    if (!existsSync(path)) {
      console.error(`Maintainable fixture missing ${file}: ${fixture}`);
      process.exit(1);
    }
  }
}

const stageContractFiles = [
  "stage-pipeline/newsletter-production/01_intake/CONTEXT.md",
  "stage-pipeline/newsletter-production/02_draft/CONTEXT.md",
  "stage-pipeline/newsletter-production/03_review/CONTEXT.md",
  "stage-pipeline/workshop-planning/stages/01_discovery/CONTEXT.md",
  "stage-pipeline/workshop-planning/stages/02_design/CONTEXT.md",
  "stage-pipeline/workshop-planning/stages/03_followup/CONTEXT.md",
];
const stageContractSignals = [
  "## Purpose",
  "## Inputs",
  "Stable reference",
  "Working artifact",
  "## Process",
  "## Outputs",
  "Downstream consumer",
  "## Verify",
  "## Handoff / review gate",
  "Human review",
];
for (const file of stageContractFiles) {
  const path = join(root, fixtureRoot, file);
  if (!existsSync(path)) {
    console.error(`Stage pipeline fixture missing stage contract: ${file}`);
    process.exit(1);
  }
  const text = readFileSync(path, "utf8");
  for (const signal of stageContractSignals) {
    if (!text.includes(signal)) {
      console.error(`Stage contract ${file} missing signal: ${signal}`);
      process.exit(1);
    }
  }
}

const traceFixture = "stage-pipeline/source-integrity-trace";
const traceFixtureFiles = [
  "AGENTS.md",
  "CONTEXT.md",
  "source/event-request.md",
  "01_approval/CONTEXT.md",
  "01_approval/output/approved-event-brief.md",
  "02_publish/CONTEXT.md",
  "02_publish/output/final-announcement.md",
];
for (const file of traceFixtureFiles) {
  const path = join(root, fixtureRoot, traceFixture, file);
  if (!existsSync(path)) {
    console.error(`Source-integrity trace fixture missing ${file}`);
    process.exit(1);
  }
}

const approvedBrief = readFileSync(
  join(root, fixtureRoot, traceFixture, "01_approval/output/approved-event-brief.md"),
  "utf8",
);
const finalAnnouncement = readFileSync(
  join(root, fixtureRoot, traceFixture, "02_publish/output/final-announcement.md"),
  "utf8",
);
if (!approvedBrief.includes("Status: approved") || !approvedBrief.includes("September 18, 2026")) {
  console.error("Source-integrity trace fixture must contain an approved September 18 brief");
  process.exit(1);
}
if (!finalAnnouncement.includes("September 28, 2026") || finalAnnouncement.includes("September 18, 2026")) {
  console.error("Source-integrity trace fixture final output must contain the intentional September 28 drift");
  process.exit(1);
}

const maintenanceRubric = readFileSync(
  join(root, "skills/picm-factory/references/maintenance-rubric.md"),
  "utf8",
);
const coldWalkGuidance = [skill, maintenanceRubric]
  .join("\n")
  .toLowerCase()
  .replaceAll("*", "");
const coldWalkSignals = [
  "read each named input, output, review, or equivalent visible artifact",
  "report a warning when the local contract does not name",
  "artifact presence separately from correctness and human approval",
  "do not pass a criterion that was not inspected",
];
for (const signal of coldWalkSignals) {
  if (!coldWalkGuidance.includes(signal)) {
    console.error(`Cold-agent walk guidance missing signal: ${signal}`);
    process.exit(1);
  }
}

const traceQaDoc = readFileSync(join(root, "docs/layout-fixture-qa.md"), "utf8");
const codingFixtures = {
  "small-service": [
    ".gitignore",
    ".picm/config.json",
    "AGENTS.md",
    "CONTEXT.md",
    "package.json",
    "src/greeting.js",
    "test/greeting.test.js",
  ],
  "monorepo-distributed": [
    ".gitignore",
    ".picm/config.json",
    "AGENTS.md",
    "CONTEXT.md",
    "CONTEXT-MAP.md",
    "package.json",
    "apps/api/CONTEXT.md",
    "packages/shared/CONTEXT.md",
  ],
  "hybrid-release-code": [
    ".gitignore",
    ".picm/config.json",
    "AGENTS.md",
    "CONTEXT.md",
    "CONTEXT-MAP.md",
    "package.json",
    "packages/core/CONTEXT.md",
    "workflows/release/CONTEXT.md",
  ],
  "existing-doc-duplication": [
    ".gitignore",
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/development.md",
    "package.json",
    "src/main.js",
  ],
  "ignored-secrets-existing": [
    ".gitignore",
    "AGENTS.md",
    "README.md",
    "package.json",
    "src/status.js",
  ],
};
for (const [fixture, files] of Object.entries(codingFixtures)) {
  const fixturePath = join(root, codingFixtureRoot, fixture);
  if (!existsSync(fixturePath)) {
    console.error(`Missing coding-repository fixture: ${fixture}`);
    process.exit(1);
  }
  if (!traceQaDoc.includes(`coding-repository/${fixture}`)) {
    console.error(`Coding-repository fixture missing QA doc reference: ${fixture}`);
    process.exit(1);
  }
  for (const file of files) {
    if (!existsSync(join(fixturePath, file))) {
      console.error(`Coding-repository fixture ${fixture} missing ${file}`);
      process.exit(1);
    }
  }
  try {
    execFileSync("npm", ["test"], {
      cwd: fixturePath,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    console.error(`Coding-repository fixture tests failed: ${fixture}`);
    console.error(error.stdout ?? error.message);
    process.exit(1);
  }
}

const codingMapSignals = {
  "small-service": ["src/greeting.js", "test/greeting.test.js"],
  "monorepo-distributed": [
    "apps/api/src/server.js",
    "apps/api/test/",
    "packages/shared/src/format.js",
    "packages/shared/test/",
  ],
  "hybrid-release-code": [
    "packages/core/src/version.js",
    "packages/core/test/",
    "workflows/release/CONTEXT.md",
  ],
};
for (const [fixture, mapSignals] of Object.entries(codingMapSignals)) {
  const fixturePath = join(root, codingFixtureRoot, fixture);
  const config = JSON.parse(
    readFileSync(join(fixturePath, ".picm/config.json"), "utf8"),
  );
  const codebaseMap = config.capabilities?.codebaseMap;
  if (!codebaseMap) {
    console.error(`Coding-repository fixture missing codebaseMap capability: ${fixture}`);
    process.exit(1);
  }
  if (!["root", "distributed"].includes(codebaseMap.shape)) {
    console.error(`Coding-repository fixture has invalid map shape: ${fixture}`);
    process.exit(1);
  }
  if (!["light", "balanced", "strict"].includes(codebaseMap.maintenancePreset)) {
    console.error(`Coding-repository fixture has invalid maintenance preset: ${fixture}`);
    process.exit(1);
  }
  for (const path of [codebaseMap.map, ...codebaseMap.roots, ...codebaseMap.localContexts]) {
    if (!existsSync(join(fixturePath, path))) {
      console.error(`Coding-repository fixture ${fixture} config points to missing path: ${path}`);
      process.exit(1);
    }
  }
  const mapText = readFileSync(join(fixturePath, codebaseMap.map), "utf8");
  for (const signal of mapSignals) {
    if (!mapText.includes(signal)) {
      console.error(`Coding-repository fixture ${fixture} map missing pointer: ${signal}`);
      process.exit(1);
    }
  }
}

const ignoreBoundary = readFileSync(
  join(root, codingFixtureRoot, "ignored-secrets-existing", ".gitignore"),
  "utf8",
);
for (const signal of [".env", "secrets/", "*.pem"]) {
  if (!ignoreBoundary.includes(signal)) {
    console.error(`Coding ignore-boundary fixture missing pattern: ${signal}`);
    process.exit(1);
  }
}

const ignoreSmokeRoot = mkdtempSync(join(tmpdir(), "picm-ignore-check-"));
try {
  writeFileSync(join(ignoreSmokeRoot, ".gitignore"), ".env\n.env.*\n", "utf8");
  writeFileSync(join(ignoreSmokeRoot, ".env"), "SYNTHETIC_ONLY=do-not-read\n", "utf8");
  writeFileSync(
    join(ignoreSmokeRoot, ".env.tracked"),
    "SYNTHETIC_TRACKED_IGNORED=do-not-read\n",
    "utf8",
  );
  execFileSync("git", ["init", "-q"], { cwd: ignoreSmokeRoot });
  execFileSync("git", ["add", ".gitignore"], { cwd: ignoreSmokeRoot });
  execFileSync("git", ["add", "-f", ".env.tracked"], { cwd: ignoreSmokeRoot });

  if (process.platform !== "win32") {
    symlinkSync(".env", join(ignoreSmokeRoot, "ignored-target-link"));
    execFileSync("git", ["add", "ignored-target-link"], { cwd: ignoreSmokeRoot });
  }

  execFileSync(
    "git",
    [
      "-c",
      "user.name=PiCM Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: ignoreSmokeRoot },
  );

  const ignoreStatus = (path) =>
    spawnSync("git", ["check-ignore", "--no-index", "-q", "--", path], {
      cwd: ignoreSmokeRoot,
    }).status;

  for (const path of [".env", ".env.tracked"]) {
    if (ignoreStatus(path) !== 0) {
      throw new Error(`Git ignore smoke failed to exclude: ${path}`);
    }
  }

  if (process.platform !== "win32") {
    if (ignoreStatus("ignored-target-link") !== 1 || ignoreStatus(".env") !== 0) {
      throw new Error("Git ignore smoke did not reproduce the symlink-target boundary");
    }
  }
} finally {
  rmSync(ignoreSmokeRoot, { recursive: true, force: true });
}

const antiPatternFixtures = {
  "root-brain-dump": ["AGENTS.md", "CONTEXT.md"],
  "no-task-routing": ["AGENTS.md", "CONTEXT.md", "research/CONTEXT.md", "publishing/CONTEXT.md"],
  "missing-stage-outputs": [
    "AGENTS.md",
    "CONTEXT.md",
    "source-notes.md",
    "01_collect/CONTEXT.md",
    "02_summarize/CONTEXT.md",
  ],
  "mixed-reference-working": [
    "AGENTS.md",
    "CONTEXT.md",
    "reference/style-guide.md",
    "reference/current-run-draft.md",
  ],
  "stale-contradictory-context": ["AGENTS.md", "CONTEXT.md", "deliverables/latest-summary.md"],
  "picm-normal-routing": ["AGENTS.md", "CONTEXT.md", ".picm/maintenance-report.md"],
  "incomplete-handoff": [
    "AGENTS.md",
    "CONTEXT.md",
    "intake/CONTEXT.md",
    "delivery/CONTEXT.md",
    "handoffs/request.md",
  ],
};
for (const [fixture, files] of Object.entries(antiPatternFixtures)) {
  const fixturePath = join(root, fixtureRoot, "anti-patterns", fixture);
  if (!existsSync(fixturePath)) {
    console.error(`Missing maintenance anti-pattern fixture: ${fixture}`);
    process.exit(1);
  }
  if (!traceQaDoc.includes(`anti-patterns/${fixture}`)) {
    console.error(`Maintenance anti-pattern fixture missing QA doc reference: ${fixture}`);
    process.exit(1);
  }
  for (const file of files) {
    if (!existsSync(join(fixturePath, file))) {
      console.error(`Maintenance anti-pattern fixture ${fixture} missing ${file}`);
      process.exit(1);
    }
  }
}

const customVariantExpectations = [
  ["existing-claude-only", { agents: false, claude: true }],
  ["existing-agents-only", { agents: true, claude: false }],
  ["existing-both-agent-files", { agents: true, claude: true }],
  ["existing-no-agent-files", { agents: false, claude: false }],
];

for (const [fixture, expected] of customVariantExpectations) {
  const fixturePath = join(root, fixtureRoot, "custom-existing-structure", fixture);
  if (!existsSync(fixturePath)) {
    console.error(`Missing custom adoption fixture: ${fixture}`);
    process.exit(1);
  }
  const hasAgents = existsSync(join(fixturePath, "AGENTS.md"));
  const hasClaude = existsSync(join(fixturePath, "CLAUDE.md"));
  if (hasAgents !== expected.agents || hasClaude !== expected.claude) {
    console.error(
      `Custom adoption fixture has wrong agent-file combination: ${fixture} ` +
        `(AGENTS.md=${hasAgents}, CLAUDE.md=${hasClaude})`,
    );
    process.exit(1);
  }
}

const adoptionGuide = readFileSync(
  join(root, "skills/picm-factory/references/adoption-guide.md"),
  "utf8",
).toLowerCase();
const adoptionRoleSignals = [
  "optional file-role inventory",
  "path-to-role-to-rationale",
  "routing",
  "local contract",
  "reusable context",
  "working artifact",
  "review / handoff",
  "unclear / possible archive candidate",
  "never move, rename, archive, delete, merge, or rewrite files from the inventory",
];
for (const signal of adoptionRoleSignals) {
  if (!adoptionGuide.includes(signal)) {
    console.error(`Adoption file-role guidance missing signal: ${signal}`);
    process.exit(1);
  }
}

const securityRedTeamFixtures = [
  {
    name: "security-red-team/adoption-sensitive-existing",
    files: [
      "CLAUDE.md",
      "synthetic.env",
      "intake/source-notes.md",
      "examples/customer-response.md",
      "reference/private-client-brief.md",
    ],
    requiredSignals: [
      "synthetic fixture only",
      "private/client material",
      "token-looking",
      "sensitive-looking examples",
      "source notes",
      "Do not copy",
    ],
  },
  {
    name: "security-red-team/maintain-sensitive-boundaries",
    files: [
      "AGENTS.md",
      "CONTEXT.md",
      "synthetic.env",
      ".gitignore",
      ".picm/config.json",
      ".picm/adoption-report.md",
      "source/private-source-notes.md",
      "reference/public-style.md",
      "workflows/public-memo.md",
    ],
    requiredSignals: [
      "synthetic fixture only",
      "private/client material",
      "token-looking",
      "source/",
      "reference/",
      "never copy",
    ],
  },
];

for (const fixture of securityRedTeamFixtures) {
  const fixturePath = join(root, fixtureRoot, fixture.name);
  if (!existsSync(fixturePath)) {
    console.error(`Missing security red-team fixture: ${fixture.name}`);
    process.exit(1);
  }
  if (!traceQaDoc.includes(fixture.name)) {
    console.error(`Security red-team fixture missing QA doc reference: ${fixture.name}`);
    process.exit(1);
  }
  const combinedText = [];
  for (const file of fixture.files) {
    const path = join(fixturePath, file);
    if (!existsSync(path)) {
      console.error(`Security red-team fixture missing ${file}: ${fixture.name}`);
      process.exit(1);
    }
    combinedText.push(readFileSync(path, "utf8"));
  }
  const envText = readFileSync(join(fixturePath, "synthetic.env"), "utf8");
  if (!envText.includes("NOT real secrets") && !envText.includes("NOT a real secret")) {
    console.error(`Security red-team synthetic.env must be clearly synthetic: ${fixture.name}`);
    process.exit(1);
  }
  const fixtureText = combinedText.join("\n");
  for (const signal of fixture.requiredSignals) {
    if (!fixtureText.includes(signal)) {
      console.error(`Security red-team fixture missing signal ${JSON.stringify(signal)}: ${fixture.name}`);
      process.exit(1);
    }
  }
}

console.log("PiCM Factory package check passed.");
