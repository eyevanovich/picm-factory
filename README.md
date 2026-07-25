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
pi install -l npm:@eyevanovich/picm-factory@0.2.0
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

Coding scans treat Git ignore rules as a hard read boundary. The read gate is inactive during ordinary Pi work and activates only for scan phases inside an explicitly invoked `/picm-new`, `/picm-adopt`, or `/picm-maintain` workflow. PiCM Factory does not activate from natural-language requests; use one of those commands to authorize a workflow. During an active scan phase, the extension derives candidates through Git and checks direct path-tool calls with `git check-ignore --no-index` immediately before execution, including previously tracked ignored files. It conservatively blocks symlinks, paths outside the worktree, `.git` internals, recursive directory traversal, Git content/object commands, literal ignored-path references in agent-initiated Bash, and known ignore-bypass commands. Non-ignored Git candidates remain readable for context-map derivation. Explicitly included submodules are treated as separate worktrees with the same checks. User-typed `!bash` is never intercepted; it is an explicit human action.

PiCM scans and maintenance may run with or without `.git`. When repository metadata is absent, the extension creates transient bare Git metadata in the operating system's temporary directory and points it at the workspace only for candidate and ignore evaluation. This preserves Git's root/nested `.gitignore` and negation semantics without creating `.git` or modifying project files; the temporary metadata is removed on session shutdown.

This deterministic gate covers Pi's built-in path tools and literal or recognized bypasses in agent-initiated Bash; it is not an OS-level sandbox. Shell variables, arbitrary dynamic path construction, unrelated custom filesystem tools, and filesystem time-of-check/time-of-use races remain limitations, so the skill prohibits those bypasses and keeps the privacy check mandatory.

## Maintenance cadence

During new-workspace or adoption setup, PiCM Factory can record a shared maintenance policy in `.picm/config.json`: manual, a nudge, or an automatic advisory cycle. Scheduling requires `.picm/config.json` to be non-ignored and a regular, non-symlink file beneath a regular, non-symlink `.picm/` directory. The recommended default offer is a monthly nudge; positive custom intervals may use days, weeks, or calendar months. Skipping or declining leaves maintenance manual and writes no schedule.

The extension stores explicit UTC `lastCycleAt` and `nextDueAt` timestamps. `/picm-new`, `/picm-adopt`, and `/picm-maintain` reset an existing scheduled cycle; `/picm-help` does not. A due nudge only notifies. Automatic means one read-only advisory maintenance run in the first eligible interactive TUI session after the due time—not wall-clock execution while Pi is closed, and never print, JSON, RPC, or other headless execution. It works in Git and non-Git workspaces while honoring any `.gitignore` through the same Git-backed scan boundary. The scheduled timestamp update is authorized by the user's opt-in; reports, repairs, commits, and all other writes or external side effects still require their own preview and approval.

## Safety model

PiCM Factory is intentionally conservative:

- Project-local install by default: use `pi install -l ...`.
- Non-destructive by default: preview planned edits before writing.
- Git encouraged, but no automatic commits.
- Secrets-first handling: do not commit `.env`, keys, tokens, credentials, or sensitive client data accidentally.
- Git-ignore-gated PiCM scans: during explicitly authorized scan phases, built-in path reads and agent-initiated Bash are checked immediately before execution; ordinary Pi work and user-typed `!bash` are unaffected.
- `.pi/` belongs to Pi package configuration and controls which project-local Pi resources load.
- `.picm/` belongs to small PiCM metadata/reports. It is maintainer-only context, not the normal workflow or source of truth.

When sensitive, private, or local-only paths are identified, PiCM Factory should propose exact `.gitignore` entries for the user to review instead of adding generic patterns.

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
