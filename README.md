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
| You want a health check for an existing workflow or coding-repository workspace. | `/picm-maintain` | Reviews routing, local instructions, coding maps, outputs, handoffs, drift, and safety; findings are advisory. |
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

To pin a reproducible version, use:

```bash
pi install -l npm:@eyevanovich/picm-factory@0.3.1
```

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

## Add PiCM to an existing workflow or coding repository

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

Every explicit PiCM workflow starts privacy-pending rather than scan-active. `picm_scan_control preflight` checks Git status plus root `.gitignore` and repository-local `.git/info/exclude` presence without inventorying files or creating temporary Git metadata. PiCM then asks the privacy question and records exact project-relative exclusions before `begin` can activate a scan. Approved durable exclusions live in `.picm/config.json` under `privacy.excludedPaths`; session additions are merged and remain enforced through completion, expiry, or same-session resume.

Protected scans combine root/nested `.gitignore`, `.git/info/exclude`, global Git excludes, persisted PiCM exclusions, and current-session exclusions. Any matching source removes the path from inventory and blocks direct access, including tracked Git matches. Active scans also block symlinks, paths outside the worktree, `.git` internals, recursive traversal, every agent Bash call, and unrecognized agent tools. Explicitly included submodules receive parent, local Git, and PiCM privacy checks. User-typed `!bash` is never intercepted because it is an explicit human action.

PiCM scans and maintenance may run with or without `.git`. When repository metadata is absent, the extension creates transient bare Git metadata only after privacy review and points it at the workspace for remaining candidate and Git-exclude evaluation. It never creates project `.git` metadata and removes the temporary metadata on session shutdown. This is a deterministic PiCM tool boundary rather than an OS sandbox; filesystem time-of-check/time-of-use races remain a limitation.

## Maintenance cadence

During new-workspace or adoption setup, PiCM Factory can record a shared maintenance policy in `.picm/config.json`: manual, a nudge, or an automatic advisory cycle. Scheduling requires `.picm/config.json` to be non-ignored and a regular, non-symlink file beneath a regular, non-symlink `.picm/` directory. The recommended default offer is a monthly nudge; positive custom intervals may use days, weeks, or calendar months. Skipping or declining leaves maintenance manual and writes no schedule.

The extension stores explicit UTC `lastCycleAt` and `nextDueAt` timestamps. `/picm-new`, `/picm-adopt`, and `/picm-maintain` reset an existing scheduled cycle; `/picm-help` does not. A due nudge only notifies. Automatic means one read-only advisory maintenance run in the first eligible interactive TUI session after the due time—not wall-clock execution while Pi is closed, and never print, JSON, RPC, or other headless execution. It works in Git and non-Git workspaces while honoring Git and persisted PiCM exclusions through the same protected-scan boundary. The scheduled timestamp update is authorized by the user's opt-in; reports, repairs, commits, and all other writes or external side effects still require their own preview and approval.

## Safety model

PiCM Factory is intentionally conservative:

- Project-local install by default: use `pi install -l ...`.
- Non-destructive by default: preview planned edits before writing.
- Git encouraged, but no automatic commits.
- Secrets-first handling: do not commit `.env`, keys, tokens, credentials, or sensitive client data accidentally.
- Privacy-first protected scans: no inventory or project tool runs before privacy review; Git and PiCM exclusions are checked immediately before access, agent Bash and unknown tools are blocked, and ordinary Pi work plus user-typed `!bash` remain unaffected outside the workflow.
- `.pi/` belongs to Pi package configuration and controls which project-local Pi resources load.
- `.picm/` belongs to small PiCM metadata/reports and optional `privacy.excludedPaths`. It is maintainer-only context, not the normal workflow or source of truth.

When sensitive, private, or local-only paths are identified, PiCM Factory can persist them for scans in `.picm/config.json`. If the repository lacks root `.gitignore`, it separately offers exact Git-ignore entries for commit protection instead of adding generic patterns.

## Acknowledgments

PiCM Factory is an independent adaptation for Pi, built on ideas and work shared by others:

- **Jake Van Clief and David McDermott** — their paper, [*Interpretable Context Methodology: Folder Structure as Agentic Architecture*](https://arxiv.org/abs/2603.16021), is the primary methodology source for the folder-based stages, scoped context, inspectable intermediate outputs, and human review gates used here.
- **Jake Van Clief and the [Clief Notes community](https://www.skool.com/cliefnotes)** — a place to learn more about Jake's ICM methodology and follow the ongoing discussion around it.
- **[`RinDig/icm-architect`](https://github.com/RinDig/icm-architect)** — its cold-agent walk test and file-role inventory concepts informed independently adapted parts of PiCM Factory's maintenance and adoption guidance.
- **[Pi Coding Agent](https://github.com/earendil-works/pi)** by Mario Zechner — the extensible coding-agent platform and package system that PiCM Factory runs on.

See [`docs/references.md`](https://github.com/eyevanovich/picm-factory/blob/main/docs/references.md) for more detail about how these sources informed the project.

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

See [`CONTRIBUTING.md`](https://github.com/eyevanovich/picm-factory/blob/main/CONTRIBUTING.md) for development, validation, and pull-request guidance. Releases are prepared and finalized through the manually triggered GitHub Actions flow documented in [`docs/releasing.md`](https://github.com/eyevanovich/picm-factory/blob/main/docs/releasing.md). Use [GitHub Issues](https://github.com/eyevanovich/picm-factory/issues) for public work tracking.
