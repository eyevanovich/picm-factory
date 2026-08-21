# PiCM Factory

PiCM Factory is a project-local [Pi Coding Agent](https://pi.dev) package for creating, adopting, maintaining, and optimizing PiCM / ICM-style folder-agent workspaces and agent-readable coding repositories.

It gives Pi five project-local commands:

- `/picm-new` — create a new folder-agent workspace through an interview-led setup flow
- `/picm-adopt` — inspect an existing workflow or coding repository and add PiCM support non-invasively (`/picm-adopt coding` is an optional shortcut)
- `/picm-maintain` — check routing/context health and suggest improvements
- `/picm-optimize` — offer outcome-preserving improvements to agent-facing documentation
- `/picm-help` — show command syntax, argument examples, setup, and safety guidance

## Which command should I use?

You do not need to know PiCM or ICM terminology. Choose based on what is already in the folder:

| Situation | Command | What it does |
| --- | --- | --- |
| You are starting a new workflow in a new or mostly empty folder. | `/picm-new` | Interviews you, previews a minimal workspace, and writes it only after approval. |
| The folder already contains source code, manifests, agent instructions, workflows, stages, reference material, or a Claude/ICM-style setup. | `/picm-adopt` | Starts read-only, safely detects likely coding repositories, preserves existing structure, and proposes optional PiCM support without converting the project. |
| You want a health check for an existing workflow or coding-repository workspace. | `/picm-maintain` | Reviews routing, local instructions, coding maps, outputs, handoffs, drift, and safety; findings are advisory. |
| One specific result or handoff looks wrong. | `/picm-maintain trace "describe what drifted"` | Runs a focused, heuristic investigation and reports likely causes without promising deterministic provenance. |
| Agent instructions, context maps, prompt/skill guidance, or workflow docs are repetitive, diffuse, or hard to navigate. | `/picm-optimize` | Uses a protected read-only discovery pass, lets you select documentation-only proposals, and preserves unique constraints and intended outcomes. |
| You know this is a repository or monorepo and want to skip the initial classification. | `/picm-adopt coding` | Enters the same coding-adoption flow that regular `/picm-adopt` can offer. |
| You are still unsure. | `/picm-help` | Repeats this guide and the safety/install model. |

When a folder already has workspace architecture, prefer `/picm-adopt` over `/picm-new`. Adoption does not mean conversion: it scans and reports first, then requires an accepted complete summary, any mandatory exact review, and separate approval before writing or restructuring anything.

## Command arguments and autocomplete

Slash commands accept optional text after the command. Bare commands remain valid. In interactive Pi, type a space after `/picm-adopt` or `/picm-maintain` to see registered argument completions.

| Syntax | Argument behavior |
| --- | --- |
| `/picm-new [workflow description]` | Supplies optional free-form seed context for the setup interview. |
| `/picm-adopt [coding | adoption request]` | `coding` skips the initial repository classification; other text describes the adoption focus. |
| `/picm-maintain [strict | balanced | coding | routing | handoffs | stale-context | security | trace "drift symptom"]` | Chooses a one-run depth, focuses the advisory check, or investigates one concrete symptom. |
| `/picm-optimize` | Inspects agent-facing documentation and presents selectable outcome-preserving proposals. |
| `/picm-help` | Shows this command reference together with setup and safety guidance. |

Arguments are conversational input rather than required flags. For example:

```text
/picm-new Create a three-stage publishing workflow
/picm-adopt coding
/picm-adopt Include the optional file-role inventory; preview only
/picm-maintain strict
/picm-maintain balanced routing
/picm-maintain trace "final output drifted from the approved source"
/picm-optimize
```

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
- an automatic Strict initial examination, stored as `capabilities.codebaseMap.maintenancePreset: "strict"` without a depth question;
- hybrid workspaces where codebase mapping overlaps Stage Pipeline, Specialist Folder, Team / Role OS, or custom layouts.

Every later interactive `/picm-maintain` run selects a one-run depth with Strict preselected. `/picm-maintain strict` and `/picm-maintain balanced` bypass the selector. The run choice never silently changes the stored preset.

- Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.
- Balanced: representative coverage of major boundaries and one coding path; lower cost.

Historical stored `light`, `balanced`, and `strict` values remain readable and honored, and a missing value falls back to Balanced. Light is compatibility-only and is not offered in new adoption or interactive selectors.

Every explicit `/picm-new`, `/picm-adopt`, `/picm-maintain`, and `/picm-optimize` workflow starts privacy-pending rather than scan-active. `picm_scan_control preflight` checks Git status plus root `.gitignore` and repository-local `.git/info/exclude` presence without inventorying files or creating temporary Git metadata. PiCM then explains that Git ignore rules and its path protections apply automatically, and asks only for additional sensitive project-relative paths not already covered. This list remains important for sensitive eligible files PiCM cannot infer. Exact exclusions are recorded before `begin` can activate a scan. Approved durable exclusions live in `.picm/config.json` under `privacy.excludedPaths`; session additions are merged, survive same-session resume, and remain enforced until completion or expiry revokes the workflow.

Protected scans combine root/nested `.gitignore`, `.git/info/exclude`, global Git excludes, persisted PiCM exclusions, and current-session exclusions. Any matching source removes the path from inventory and blocks direct access, including tracked Git matches. Active scans also block symlinks, paths outside the worktree, `.git` internals, unguarded recursive traversal, every agent Bash call, and unrecognized agent tools. Identity-bound, protected-descendant-filtered directory traversal is authorized only for `grep`, `find`, `ls`, and automatic `rg`; other tools reject directories. Every admitted `read`, `edit`, `write`, `grep`, `find`, `ls`, or `rg` call remains bound to the exact validated target through execution, so later leaf replacement or parent-symlink retargeting cannot redirect the built-in tool. Regular files with multiple hard-link names are rejected at admission, binding, and immediately before guarded access or mutation. Guarded `grep` and automatic `rg` bound traversal discovery/entries, retained files and aggregate snapshots, match/context rendering work, rendered output, and subprocess records/stdout/stderr. Linux also supports descriptor-relative creation of missing guarded files and parent directories. On macOS and Windows, where the runtime cannot safely create a missing file relative to a retained directory descriptor, that guarded creation is refused; writes to existing files remain supported. Explicitly included submodules receive parent, local Git, and PiCM privacy checks. User-typed `!bash` is never intercepted because it is an explicit human action.

PiCM scans and maintenance may run with or without `.git`. When repository metadata is absent, the extension creates transient bare Git metadata only after privacy review and points it at the workspace for remaining candidate and Git-exclude evaluation. It never creates project `.git` metadata and removes the temporary metadata on session shutdown. This is a deterministic PiCM tool boundary rather than an OS sandbox: it protects the guarded built-ins above, not arbitrary filesystem access outside them. Another process creating a hard link after the final descriptor check remains an external filesystem race outside this boundary.

## Maintenance cadence

During new-workspace or adoption setup, PiCM Factory can record a shared maintenance policy in `.picm/config.json`: manual or scheduled reminders with a cadence in days, weeks, or months. Adoption asks only whether scheduled reminders are desired; it does not offer separate nudge versus automatic choices. Scheduling requires `.picm/config.json` to be non-ignored and a regular, non-symlink file beneath a regular, non-symlink `.picm/` directory. The recommended default offer is a monthly reminder. Skipping or declining leaves maintenance manual and writes no schedule.

The extension stores explicit UTC `lastCycleAt` and `nextDueAt` timestamps. Existing manual, nudge, and automatic config values remain parseable. When maintenance is due in an interactive TUI session, PiCM renders a persistent reminder section above the editor and presents a selector with `Run Now` and `Defer`. `Defer` dismisses the reminder for the current session only and asks again in fresh sessions. `Run Now` invokes the ordinary privacy-reviewed maintenance flow and Strict/Balanced depth selector. `lastCycleAt` and `nextDueAt` advance and the reminder clears only upon successful maintenance completion; cancellation or failure leaves maintenance due. Nothing runs while Pi is closed or in print, JSON, RPC, or other headless execution.

## Safety model

PiCM Factory is intentionally conservative:

- Project-local install by default: use `pi install -l ...`.
- Non-destructive by default: adoption, maintenance, and optimization show a complete concise summary before every proposed project write. It enumerates every file/operation, behavior or configuration change, linked move, preserved behavior, uncertainty, and mandatory exact-review item, using `None` for empty categories.
- Separate approval: option/cadence choices, preview requests, review navigation, and vague assent do not approve writes. Revisions invalidate earlier review and approval. When no mandatory exact review is pending, the current summary can receive a separate explicit write approval.
- Exact review: deletions and changes to safety, permissions, approval boundaries, or required commands must be reviewed exactly before approval. Review offers `View all`, `Select files`, and `Return to summary`; modified files use unified diffs, new/deleted files show complete content, and linked moves are reviewed together. Protected content that cannot be rendered safely is not approved or written.
- Git encouraged, but no automatic commits.
- Secrets-first handling: do not commit `.env`, keys, tokens, credentials, or sensitive client data accidentally.
- Privacy-first protected scans: no inventory or project tool runs before privacy review; Git and PiCM exclusions are checked immediately before access, agent Bash and unknown tools are blocked, and ordinary Pi work plus user-typed `!bash` remain unaffected outside the workflow.
- Outcome-preserving optimization: `/picm-optimize` changes only selected agent-facing documentation, never source/build/runtime paths, `.picm/` policy or configuration, generated artifacts, or unrelated material. It preserves unique safety, privacy, permission, approval, command, behavior, verification, handoff, and domain constraints and makes no semantic-equivalence or guaranteed token-savings claim.
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
