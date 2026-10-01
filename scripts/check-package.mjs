import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasCurrentPinnedInstallVersions } from "./prepare-release.mjs";

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
  "test/maintenance-policy.test.mjs",
  "test/maintenance-config-store.test.mjs",
  "test/maintenance-controller.test.mjs",
  "test/maintenance-reminder.test.mjs",
  "test/maintenance-extension.test.mjs",
  "test/command-dispatch.test.mjs",
  "test/methodology-fixtures.test.mjs",
  "test/collaborative-contract.test.mjs",
  "test/decision-tool.test.mjs",
  "test/preview-review-contract.test.mjs",
  "test/stage-pipeline-placement-contract.test.mjs",
  "test/optimization-contract.test.mjs",
  "test/specialist-folder-maintenance-contract.test.mjs",
  "test/privacy-policy.test.mjs",
  "extensions/picm-factory.ts",
  "extensions/runtime/coding-maintenance-depth.mjs",
  "extensions/runtime/command-dispatch.mjs",
  "extensions/runtime/maintenance-policy.mjs",
  "extensions/runtime/privacy-policy.mjs",
  "extensions/runtime/maintenance-config-store.mjs",
  "extensions/runtime/maintenance-controller.mjs",
  "extensions/runtime/maintenance-reminder.mjs",
  "skills/picm-factory/SKILL.md",
  "skills/picm-factory/references/optimization-guide.md",
  "skills/picm-factory/references/preview-review-protocol.md",
  "prompts/picm-new.md",
  "prompts/picm-adopt.md",
  "prompts/picm-maintain.md",
  "prompts/picm-optimize.md",
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
if (!pkg.scripts?.check?.includes("test/*.test.mjs")) {
  console.error("npm run check must exercise all test/*.test.mjs files");
  process.exit(1);
}
for (const dependency of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "typebox"]) {
  if (pkg.peerDependencies?.[dependency] !== "*") {
    console.error(`Pi runtime peer dependency must be declared with *: ${dependency}`);
    process.exit(1);
  }
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
  "extensions/runtime/coding-maintenance-depth.mjs",
  "extensions/runtime/command-dispatch.mjs",
  "extensions/runtime/maintenance-policy.mjs",
  "extensions/runtime/privacy-policy.mjs",
  "extensions/runtime/maintenance-config-store.mjs",
  "extensions/runtime/maintenance-controller.mjs",
  "extensions/runtime/maintenance-reminder.mjs",
  "skills/picm-factory/SKILL.md",
  "skills/picm-factory/references/adoption-guide.md",
  "skills/picm-factory/references/coding-adoption-guide.md",
  "skills/picm-factory/references/coding-maintenance-rubric.md",
  "skills/picm-factory/references/interview-guide.md",
  "skills/picm-factory/references/layout-profiles.md",
  "skills/picm-factory/references/maintenance-rubric.md",
  "skills/picm-factory/references/redundancy-review.md",
  "skills/picm-factory/references/optimization-guide.md",
  "skills/picm-factory/references/preview-review-protocol.md",
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

const extension = readFileSync(join(root, "extensions/picm-factory.ts"), "utf8");
const forbiddenExtensionRuntimeSignals = [
  "node:child_process",
  "executePipeline",
  "runPipeline",
  "orchestrateWorkflow",
  'pi.on("tool_call"',
  'pi.on("input"',
  'pi.on("agent_settled"',
  'name: "picm_scan_control"',
  'name: "picm_scaffold_proposal"',
  'name: "picm_proposal_batch"',
];
for (const signal of forbiddenExtensionRuntimeSignals) {
  if (extension.includes(signal)) {
    console.error(`PiCM extension must remain a thin non-authoritative dispatcher; found: ${signal}`);
    process.exit(1);
  }
}
for (const signal of [
  'pi.on("session_start"',
  'name: "picm_settings"',
  'name: "picm_maintenance_policy"',
  'name: "picm_decision"',
  'commandPrompt(',
]) {
  if (!extension.includes(signal)) {
    console.error(`PiCM extension missing retained command utility: ${signal}`);
    process.exit(1);
  }
}

const privacyPolicy = readFileSync(join(root, "extensions/runtime/privacy-policy.mjs"), "utf8");
for (const signal of ["normalizePrivacyExcludedPaths", "privacyPathMatches", "validatePrivacyPolicy"]) {
  if (!privacyPolicy.includes(signal)) {
    console.error(`PiCM privacy policy missing deterministic signal: ${signal}`);
    process.exit(1);
  }
}
const maintenancePolicy = readFileSync(join(root, "extensions/runtime/maintenance-policy.mjs"), "utf8");
for (const signal of ["calculateNextDue", "resetPolicy", "isDue", "INVALID_TIMESTAMP"]) {
  if (!maintenancePolicy.includes(signal)) {
    console.error(`PiCM maintenance policy missing deterministic signal: ${signal}`);
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

for (const [file, text] of [
  ["README.md", readFileSync(join(root, "README.md"), "utf8")],
  ["skills/picm-factory/SKILL.md", skill],
]) {
  if (!hasCurrentPinnedInstallVersions(text, pkg.version)) {
    console.error(`${file} must pin the current package version ${pkg.version}`);
    process.exit(1);
  }
}

const releaseDocs = {
  "README.md": [
    "pi install -l npm:@eyevanovich/picm-factory",
    "https://github.com/eyevanovich/picm-factory/blob/main/docs/references.md",
    "https://github.com/eyevanovich/picm-factory/blob/main/CONTRIBUTING.md",
    "https://github.com/eyevanovich/picm-factory/blob/main/docs/releasing.md",
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
    "`## What Changed`",
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
  "git add package.json package-lock.json CHANGELOG.md README.md skills/picm-factory/SKILL.md",
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
  "CONTEXT.md",
  "skills/picm-factory/SKILL.md",
  "skills/picm-factory/references/coding-adoption-guide.md",
  "skills/picm-factory/references/coding-maintenance-rubric.md",
  "skills/picm-factory/references/optimization-guide.md",
  "skills/picm-factory/references/redundancy-review.md",
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

console.log("PiCM Factory package check passed.");
