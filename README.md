# PiCM Factory

PiCM Factory is a project-local [Pi Coding Agent](https://pi.dev) package for creating, adopting, and maintaining PiCM / ICM-style folder-agent workspaces and agent-readable coding repositories.

It gives Pi four project-local commands:

- `/picm-new` — create a new folder-agent workspace through an interview-led setup flow
- `/picm-adopt` — inspect an existing workflow or coding repository and add PiCM support non-invasively (`/picm-adopt coding` is an optional shortcut)
- `/picm-maintain` — check routing/context health and suggest improvements
- `/picm-help` — show setup and command guidance

## Which command should I use?

You do not need to know PiCM or ICM terminology. Choose based on what is already in the folder:

| Situation | Command | What it does |
| --- | --- | --- |
| You are starting a new workflow in a new or mostly empty folder. | `/picm-new` | Interviews you, previews a minimal workspace, and writes it only after approval. |
| The folder already contains source code, manifests, agent instructions, workflows, stages, reference material, or a Claude/ICM-style setup. | `/picm-adopt` | Starts read-only, safely detects likely coding repositories, preserves existing structure, and proposes optional PiCM support without converting the project. |
| You want a health check for an existing folder-agent workspace. | `/picm-maintain` | Reviews routing, local instructions, outputs, handoffs, drift, and safety; findings are advisory. |
| One specific result or handoff looks wrong. | `/picm-maintain trace "describe what drifted"` | Runs a focused, heuristic investigation and reports likely causes without promising deterministic provenance. |
| You know this is a repository or monorepo and want to skip the initial classification. | `/picm-adopt coding` | Enters the same coding-adoption flow that regular `/picm-adopt` can offer. |
| You are still unsure. | `/picm-help` | Repeats this guide and the safety/install model. |

When a folder already has workspace architecture, prefer `/picm-adopt` over `/picm-new`. Adoption does not mean conversion: it scans and reports first, then requires an exact preview and separate approval before writing or restructuring anything.

## Install Pi

Pi is distributed through npm:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Then authenticate inside Pi with:

```text
/login
```

## Install PiCM Factory into a new project

PiCM Factory should be installed **project-locally** so PiCM resources only load inside that workspace.

```bash
mkdir my-workflow
cd my-workflow
pi install -l npm:@eyevanovich/picm-factory
pi
```

To pin a reproducible version, append `@0.1.2` to the npm package name.

Inside Pi:

```text
/picm-new
```

For local development from your own checkout:

```bash
mkdir my-workflow
cd my-workflow
pi install -l /path/to/picm-factory
pi
```

## Add PiCM to an existing ICM project

```bash
cd existing-icm-project
pi install -l npm:@eyevanovich/picm-factory
pi
```

Inside Pi:

```text
/picm-adopt
```

`/picm-adopt` is non-invasive by default. It scans, reports, and suggests. It should not rename, move, rewrite, or restructure existing files unless you explicitly approve the exact action.

For coding repositories, regular `/picm-adopt` can safely detect repository signals and offer a first-class **Coding Repository** profile. `/picm-adopt coding` is only a shortcut. Coding adoption supports:

- root, distributed, or scan-and-recommend mapping;
- additive adoption or a curated documentation-consolidation proposal;
- `CONTEXT-MAP.md` for substantial maps and selected local `CONTEXT.md` files for meaningful boundaries;
- Light, Balanced, or Strict manual maintenance;
- hybrid workspaces where codebase mapping overlaps Stage Pipeline, Specialist Folder, Team / Role OS, or custom layouts.

Coding scans treat Git ignore rules as a hard read boundary. PiCM derives scan candidates through Git, checks each candidate with `git check-ignore --no-index`, and does not inspect ignored file contents—even when an ignored file was previously tracked. Automatic scans do not follow symlinks; explicitly included submodules are treated as separate worktrees with the same checks. Automatic coding scans require a Git worktree.

## Safety model

PiCM Factory is intentionally conservative:

- Project-local install by default: use `pi install -l ...`.
- Non-destructive by default: preview planned edits before writing.
- Git encouraged, but no automatic commits.
- Secrets-first handling: do not commit `.env`, keys, tokens, credentials, or sensitive client data accidentally.
- Git-ignore-safe coding scans: ignored file contents are never read during coding adoption or maintenance.
- `.pi/` belongs to Pi package configuration and controls which project-local Pi resources load.
- `.picm/` belongs to small PiCM metadata/reports. It is maintainer-only context, not the normal workflow or source of truth.

Recommended `.gitignore` entries for sensitive material are included in this repo and should be suggested to generated/adopted projects when relevant.

## Acknowledgments

PiCM Factory is an independent adaptation for Pi, built on ideas and work shared by others:

- **Jake Van Clief and David McDermott** — their paper, [*Interpretable Context Methodology: Folder Structure as Agentic Architecture*](https://arxiv.org/abs/2603.16021), is the primary methodology source for the folder-based stages, scoped context, inspectable intermediate outputs, and human review gates used here.
- **Jake Van Clief and the [Clief Notes community](https://www.skool.com/cliefnotes)** — a place to learn more about Jake's ICM methodology and follow the ongoing discussion around it.
- **[`RinDig/icm-architect`](https://github.com/RinDig/icm-architect)** — its cold-agent walk test and file-role inventory concepts informed independently adapted parts of PiCM Factory's maintenance and adoption guidance.
- **[Pi Coding Agent](https://github.com/earendil-works/pi)** by Mario Zechner — the extensible coding-agent platform and package system that PiCM Factory runs on.

See [`docs/references.md`](docs/references.md) for more detail about how these sources informed the project.

## Repository layout

```text
picm-factory/
├── extensions/              # Thin Pi command extension
├── prompts/                 # Repository-only backing prompts
├── skills/picm-factory/     # Runtime skill, workflow/coding references, and templates
├── test/fixtures/           # Repository-only synthetic QA fixtures
├── docs/                    # QA scenarios and public methodology references
├── qa-runner/               # Interactive Pi/Zellij QA specialist context
└── scripts/                 # Development checks
```

## Development

Run checks:

```bash
npm run check
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development, validation, and pull-request guidance. Use [GitHub Issues](https://github.com/eyevanovich/picm-factory/issues) for public work tracking.
