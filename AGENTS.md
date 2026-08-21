# Agent Instructions

## Identity
You are working on PiCM Factory, a project-local Pi package for creating, adopting, maintaining, and optimizing PiCM / ICM-style folder-agent workspaces and coding-repository context maps.

## Canonical terms
- **Factory**: one-time helper for creating a new baseline workspace.
- **Maintainer**: ongoing helper for checking and improving an existing workspace.
- **Adoption**: non-invasive flow for adding PiCM support to an existing workflow or coding repository.
- **Optimization**: outcome-preserving improvement of agent-facing documentation only.
- **Layout profile**: a recommended primary workspace shape, not a rigid schema.
- **Coding Repository**: first-class profile for code-primary workspaces.
- **Codebase-map capability**: composable coding context mapping that may overlap another primary profile.

## Product rules
- PiCM Factory is project-local by default. Install with `pi install -l ...`.
- Keep the extension thin. Runtime methodology belongs in the skill, references, and templates; backing prompts remain repository-only.
- Do not build a custom TUI or workflow executor without clear evidence it is necessary.
- Be non-destructive by default. Preview file changes before writing.
- Security first: never copy secrets, credentials, tokens, private keys, regulated data, or sensitive client material into context files or examples.
- Explicitly invoked `/picm-new`, `/picm-adopt`, `/picm-maintain`, and `/picm-optimize` workflows must complete privacy preflight/review before scanning. Protected inventory and immediate path checks combine root/nested `.gitignore`, `.git/info/exclude`, global Git excludes, `.picm/config.json` `privacy.excludedPaths`, and session exclusions; never inspect matching contents. Ordinary Pi work and user-typed `!bash` remain unrestricted.
- `.pi/` is for Pi config. `.picm/` is for minimal PiCM metadata/reports, including optional persisted scan exclusions.
- `.picm/` is maintainer-only context; normal workflow routing should skip it.

## Repository structure
- `extensions/picm-factory.ts` — slash-command and guarded-tool registration plus skill dispatch.
- `extensions/runtime/` — privacy, execution, session, scheduling, and maintenance-depth runtime boundaries.
- `prompts/` — backing prompt text only; package prompt discovery stays disabled to avoid duplicating extension commands.
- `skills/picm-factory/SKILL.md` — main behavior contract.
- `skills/picm-factory/references/` — detailed methodology guidance.
- `skills/picm-factory/templates/` — scaffold templates.
- `test/fixtures/` — synthetic QA fixtures; repository-only and excluded from releases.
- `docs/` — QA scenarios and public methodology references.
- `qa-runner/CONTEXT.md` — interactive Pi/Zellij QA guidance.

## Task routing

| Task | Start here | Supporting files |
| --- | --- | --- |
| Change slash-command registration, tool wiring, or dispatch | `extensions/picm-factory.ts` | `extensions/runtime/`, Pi extension documentation |
| Change scan, execution, session, scheduling, or maintenance-depth enforcement | `extensions/runtime/` | `extensions/picm-factory.ts`, focused runtime tests |
| Change scaffold, adoption, maintenance, optimization, or help behavior | `skills/picm-factory/SKILL.md` | The relevant file under `skills/picm-factory/references/` |
| Change coding adoption or context-map behavior | `skills/picm-factory/references/coding-adoption-guide.md` | `coding-maintenance-rubric.md`, `layout-profiles.md`, coding templates |
| Change generated workspace content | `skills/picm-factory/templates/` | `skills/picm-factory/references/layout-profiles.md` |
| Change npm packaging or release validation | `package.json` | `scripts/check-package.mjs`, `README.md`, `CHANGELOG.md` |
| Change automated fixture coverage | `test/fixtures/` | `docs/layout-fixture-qa.md` |
| Run interactive command QA | `qa-runner/CONTEXT.md` | `docs/layout-fixture-qa.md` |
| Change public guidance or attribution | `README.md` | `docs/`, `CONTRIBUTING.md` |

Normal task routing should skip `.picm/`; it contains only maintainer metadata.

## Quality gate
Run before committing package changes:

```bash
npm run check
```

Interactive command QA is intentionally manual. Follow `qa-runner/CONTEXT.md`; do not run write-capable smoke tests without an explicit disposable target and user approval.

## Contributions
Read `CONTRIBUTING.md`. Keep changes small, preserve the safety model, and use GitHub Issues for public work tracking.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
