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
- During coding adoption/maintenance, Git ignored files are unreadable; derive candidates through Git and check each path before reading.
- Use `.pi/` for Pi config and `.picm/` for minimal PiCM metadata/reports.
- The visible folder structure and context files remain the source of truth.
- `.picm/` is maintainer-only context and should not be read during normal workflow execution.

## Current commands
- `/picm-new` — interview-led minimal scaffold for new workspaces.
- `/picm-adopt` — non-invasive read-first adoption flow for existing workflow and coding repositories; supports a Coding Repository profile and hybrid codebase-map capability.
- `/picm-maintain` — validation/maintenance rubric with Pass/Warning/Suggestion output.
- `/picm-help` — setup and command help.

## Specialist folders
- `qa-runner/` — project QA specialist for interactive Pi/Zellij command smoke tests. Use it when running visible `/picm-*` sessions; send any Pi chat text and the explicit `Enter` key separately.

## Current release direction
- npm publication and maintainer release procedures are documented in `docs/releasing.md`; package validation must keep the installed payload limited to runtime resources.
- GitHub is the canonical public repository and issue tracker; `CHANGELOG.md` owns release history.

## Deliberately out of scope
- custom TUI wizard
- workflow executor or orchestrator
- background/automatic coding-map maintenance in the initial release
- deterministic validator
- Docker/portable agents
- starter repo
