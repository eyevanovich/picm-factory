# PiCM Factory Context

## What we are building
PiCM Factory provides shared guidance with Pi and Claude Code integrations that help users create, adopt, maintain, and optimize PiCM / ICM-style folder-agent workspaces and agent-readable coding repositories.

Operational routing, safety, and verification rules live in `AGENTS.md`.

## Product terminology
- **Factory**: one-time setup helper that interviews a user and creates a minimal viable folder-agent scaffold.
- **Maintainer**: ongoing helper, exposed as `/picm-maintain`, that keeps guidance aligned with intended behavior and current reality, repairing stale context and drift.
- **Adoption**: non-invasive PiCM support for existing workflow or coding repositories. `/picm-adopt coding` is the coding shortcut.
- **Optimization**: deliberate improvement of agent behavior and workflow efficiency through documentation, preserving required safeguards and recording agreed corrections. Executable tooling changes are separate follow-ups.
- **Session retrospective**: optional session evidence for maintenance or optimization, reused when both are included in one invocation.
- **Layout profile**: a recommended primary workspace shape, not a rigid schema.
- **Coding Repository**: first-class profile for code-primary workspaces.
- **Codebase-map capability**: composable coding context mapping that may overlap another primary profile.

## Current commands
- `/picm-new` — interview-led minimal scaffold for new workspaces.
- `/picm-adopt` — non-invasive read-first adoption flow for existing workflow and coding repositories; supports a Coding Repository profile and hybrid codebase-map capability.
- `/picm-maintain` — alignment and freshness checks with Pass/Warning/Suggestion output and agreed repairs.
- `/picm-optimize` — behavior and efficiency improvements through documentation-only edits; workflow-tooling opportunities can be recommended separately.
- `/picm-help` — setup and command help.

## Specialist folders
- `qa-runner/` — project QA specialist for interactive Pi/Herdr command smoke tests. Use it when running visible `/picm-*` sessions; send any Pi chat text and the explicit `Enter` key separately.

## Current release direction
- npm publication and maintainer release procedures are documented in `docs/releasing.md`; a manually dispatched workflow uses a short-lived, repository-only release App token to version files directly on `main`, creates the tag and GitHub Release, and dispatches `publish.yml` as the token-free trusted npm publisher. Package validation must keep the installed payload limited to runtime resources.
- GitHub is the canonical public repository and issue tracker; `CHANGELOG.md` owns release history.

## Deliberately out of scope
- background daemons, wall-clock execution while Pi is closed, and automatic coding-map/report repair
- deterministic validator
- Docker/portable agents
- starter repo
