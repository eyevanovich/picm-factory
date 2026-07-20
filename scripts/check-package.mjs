import { existsSync, readFileSync } from "node:fs";
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
  "extensions/picm-factory.ts",
  "skills/picm-factory/SKILL.md",
  "prompts/picm-new.md",
  "prompts/picm-adopt.md",
  "prompts/picm-maintain.md",
  "prompts/picm-help.md",
  "docs/layout-fixture-qa.md",
  "skills/picm-factory/fixtures/layout-profiles/README.md",
];

const missing = required.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  console.error("Missing required files:\n" + missing.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
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

const releaseDocs = {
  "README.md": [
    "current public release",
    "git:github.com/eyevanovich/picm-factory@v0.1.1",
    "GitHub Issues",
  ],
  "CHANGELOG.md": ["## [0.1.0] - 2026-07-19", "Initial public release"],
  "CONTRIBUTING.md": ["GitHub Issues", "npm run check", "Interactive `/picm-*` QA is manual"],
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

const publicTextFiles = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",
  "skills/picm-factory/SKILL.md",
  "docs/layout-fixture-qa.md",
  "docs/picm-new-scenarios.md",
  "docs/references.md",
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
}

const readme = readFileSync(join(root, "README.md"), "utf8").toLowerCase();
if (!readme.includes("you do not need to know")) {
  console.error("README command decision guide must avoid requiring PiCM/ICM jargon");
  process.exit(1);
}

const fixtureRoot = "skills/picm-factory/fixtures/layout-profiles";
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

const traceQaDoc = readFileSync(join(root, "docs/layout-fixture-qa.md"), "utf8");
const traceQaSignals = [
  '/picm-maintain trace "final output drifted from approved source"',
  "high confidence",
  "medium confidence",
  "output patch",
  "source-context healing",
  "heuristic, focused investigation",
  "provenance-grade",
];
for (const signal of traceQaSignals) {
  if (!traceQaDoc.includes(signal)) {
    console.error(`Source-integrity trace QA guidance missing signal: ${signal}`);
    process.exit(1);
  }
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

const coldWalkFixtureSignals = [
  "unsupported “still being confirmed” assertion",
  "does not name exact catalog inputs, an output/review path, or a concrete human check",
  "no catalog source or publishing draft is present",
];
for (const signal of coldWalkFixtureSignals) {
  if (!traceQaDoc.includes(signal)) {
    console.error(`Cold-agent walk fixture QA missing expected result: ${signal}`);
    process.exit(1);
  }
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

const adoptionRoleQaSignals = [
  "custom-existing-structure/existing-agents-only",
  "keeps routing readiness separate",
  "does not invent an archive candidate",
  "separate explicit approval",
];
for (const signal of adoptionRoleQaSignals) {
  if (!traceQaDoc.toLowerCase().includes(signal)) {
    console.error(`Adoption file-role QA missing signal: ${signal}`);
    process.exit(1);
  }
}

const securityQaDoc = readFileSync(join(root, "docs/layout-fixture-qa.md"), "utf8");
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
  if (!securityQaDoc.includes(fixture.name)) {
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

const securityQaSignals = [
  "warn",
  ".gitignore",
  "repo visibility",
  "context-boundary",
  "without explicit approval",
  "approval",
  "/picm-adopt",
  "/picm-maintain",
];
for (const signal of securityQaSignals) {
  if (!securityQaDoc.includes(signal)) {
    console.error(`Security QA doc missing expected signal: ${signal}`);
    process.exit(1);
  }
}

console.log("PiCM Factory package check passed.");
