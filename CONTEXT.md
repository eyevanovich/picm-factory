# PiCM Factory Context

## What we are building
PiCM Factory is a project-local Pi Coding Agent package that helps users create, adopt, maintain, and optimize PiCM / ICM-style folder-agent workspaces and agent-readable coding repositories.

Operational routing, safety, and verification rules live in `AGENTS.md`.

## Product terminology
- **Factory**: one-time setup helper that interviews a user and creates a minimal viable folder-agent scaffold.
- **Maintainer**: ongoing helper, exposed as `/picm-maintain`, that checks routing/context health and suggests improvements.
- **Adoption**: non-invasive PiCM support for existing workflow or coding repositories. `/picm-adopt coding` is the coding shortcut.
- **Optimization**: outcome-preserving improvement of agent-facing documentation only.
- **Layout profile**: a recommended primary workspace shape, not a rigid schema.
- **Coding Repository**: first-class profile for code-primary workspaces.
- **Codebase-map capability**: composable coding context mapping that may overlap another primary profile.

## Current commands
- `/picm-new` — interview-led minimal scaffold for new workspaces.
- `/picm-adopt` — non-invasive read-first adoption flow for existing workflow and coding repositories; supports a Coding Repository profile and hybrid codebase-map capability.
- `/picm-maintain` — validation/maintenance rubric with Pass/Warning/Suggestion output.
- `/picm-optimize` — outcome-preserving proposals for agent-facing documentation only.
- `/picm-help` — setup and command help.

## Specialist folders
- `qa-runner/` — project QA specialist for interactive Pi/Zellij command smoke tests. Use it when running visible `/picm-*` sessions; send any Pi chat text and the explicit `Enter` key separately.

## Current release direction
- npm publication and maintainer release procedures are documented in `docs/releasing.md`; a manually dispatched workflow uses a short-lived, repository-only release App token to version files directly on `main`, creates the tag and GitHub Release, and dispatches `publish.yml` as the token-free trusted npm publisher. Package validation must keep the installed payload limited to runtime resources.
- GitHub is the canonical public repository and issue tracker; `CHANGELOG.md` owns release history.

## Deliberately out of scope
- background daemons, wall-clock execution while Pi is closed, and automatic coding-map/report repair
- deterministic validator
- Docker/portable agents
- starter repo
