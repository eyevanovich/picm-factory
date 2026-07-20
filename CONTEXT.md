# PiCM Factory Context

## What we are building
PiCM Factory is a project-local Pi Coding Agent package that helps users create, adopt, and maintain PiCM / ICM-style folder-agent workspaces.

## Product shape
- **Factory**: one-time setup helper that interviews a user and creates a minimal viable folder-agent scaffold.
- **Maintainer**: ongoing helper, exposed as `/picm-maintain`, that checks routing/context health and suggests improvements.
- **Adoption flow**: `/picm-adopt` adds PiCM support to existing ICM-style projects without restructuring them.

## Core principles
- Install project-locally with `pi install -l ...`; do not bloat unrelated Pi projects.
- Keep methodology in skills/prompts; keep the extension thin.
- Be non-destructive by default. Preview writes before applying them.
- Treat security as a first-class requirement: secrets, client data, and private material must not be copied into context files or committed without explicit user approval.
- Use `.pi/` for Pi config and `.picm/` for minimal PiCM metadata/reports.
- The visible folder structure and context files remain the source of truth.
- `.picm/` is maintainer-only context and should not be read during normal workflow execution.

## Initial release commands
- `/picm-new` — interview-led minimal scaffold for new workspaces.
- `/picm-adopt` — non-invasive read-first adoption flow for existing ICM projects.
- `/picm-maintain` — validation/maintenance rubric with Pass/Warning/Suggestion output.
- `/picm-help` — setup and command help.

## Specialist folders
- `qa-runner/` — project QA specialist for interactive Pi/Zellij command smoke tests. Use it when running visible `/picm-*` sessions; send any Pi chat text and the explicit `Enter` key separately.

## Outside the initial release
- npm publishing or package-registry distribution
- custom TUI wizard
- deterministic validator
- Docker/portable agents
- starter repo
