# PiCM Factory Context

## What we are building
PiCM Factory is a project-local Pi Coding Agent package that helps users create, adopt, and maintain PiCM / ICM-style folder-agent workspaces and agent-readable coding repositories.

## Product shape
- **Factory**: one-time setup helper that interviews a user and creates a minimal viable folder-agent scaffold.
- **Maintainer**: ongoing helper, exposed as `/picm-maintain`, that checks routing/context health and suggests improvements.
- **Adoption flow**: `/picm-adopt` adds PiCM support to existing workflow or coding repositories without restructuring them. `/picm-adopt coding` is an optional shortcut to the same coding-adoption branch.

## Core principles
- Install project-locally with `pi install -l ...`; do not bloat unrelated Pi projects.
- Keep runtime methodology in the skill's references and templates; keep the extension thin.
- Be non-destructive by default. Preview writes before applying them.
- Treat security as a first-class requirement: secrets, client data, and private material must not be copied into context files or committed without explicit user approval.
- During scan phases explicitly authorized by `/picm-new`, `/picm-adopt`, or `/picm-maintain`, Git ignored files are unreadable; outside those PiCM workflows, the extension must not affect ordinary Pi tools. User-typed `!bash` is never intercepted. When `.git` is absent, transient isolated Git metadata outside the workspace preserves `.gitignore` semantics without modifying the project.
- Use `.pi/` for Pi config and `.picm/` for minimal PiCM metadata/reports.
- The visible folder structure and context files remain the source of truth.
- `.picm/` is maintainer-only context and should not be read during normal workflow execution.
- Optional maintenance cadence is stored in `.picm/config.json`; automatic means one read-only advisory run in the first eligible interactive TUI session after due, never a daemon or headless mutation.

## Current commands
- `/picm-new` — interview-led minimal scaffold for new workspaces.
- `/picm-adopt` — non-invasive read-first adoption flow for existing workflow and coding repositories; supports a Coding Repository profile and hybrid codebase-map capability.
- `/picm-maintain` — validation/maintenance rubric with Pass/Warning/Suggestion output.
- `/picm-help` — setup and command help.

## Specialist folders
- `qa-runner/` — project QA specialist for interactive Pi/Zellij command smoke tests. Use it when running visible `/picm-*` sessions; send any Pi chat text and the explicit `Enter` key separately.

## Current release direction
- npm publication and maintainer release procedures are documented in `docs/releasing.md`; a manually dispatched workflow uses a short-lived, repository-only release App token to version files directly on `main`, creates the tag and GitHub Release, and dispatches `publish.yml` as the token-free trusted npm publisher. Package validation must keep the installed payload limited to runtime resources.
- GitHub is the canonical public repository and issue tracker; `CHANGELOG.md` owns release history.

## Deliberately out of scope
- custom TUI wizard
- workflow executor or orchestrator
- background daemons, wall-clock execution while Pi is closed, and automatic coding-map/report repair
- deterministic validator
- Docker/portable agents
- starter repo
