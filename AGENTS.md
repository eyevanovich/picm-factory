# Agent Instructions

## Identity
You are working on PiCM Factory, a project-local Pi package for creating, adopting, and maintaining PiCM / ICM-style folder-agent workspaces.

## Canonical terms
- **Factory**: one-time helper for creating a new baseline workspace.
- **Maintainer**: ongoing helper for checking and improving an existing workspace.
- **Adoption**: non-invasive flow for adding PiCM support to an existing ICM-style project.
- **Layout profile**: a recommended workspace shape, not a rigid schema.

## Product rules
- PiCM Factory is project-local by default. Install with `pi install -l ...`.
- Keep the extension thin. Methodology belongs in skills, prompts, references, and templates.
- Do not build a custom TUI or workflow executor without clear evidence it is necessary.
- Be non-destructive by default. Preview file changes before writing.
- Security first: never copy secrets, credentials, tokens, private keys, regulated data, or sensitive client material into context files or examples.
- `.pi/` is for Pi config. `.picm/` is for minimal PiCM metadata/reports.
- `.picm/` is maintainer-only context; normal workflow routing should skip it.

## Repository structure
- `extensions/picm-factory.ts` — slash-command registration and skill dispatch only.
- `prompts/` — backing prompt text only; package prompt discovery stays disabled to avoid duplicating extension commands.
- `skills/picm-factory/SKILL.md` — main behavior contract.
- `skills/picm-factory/references/` — detailed methodology guidance.
- `skills/picm-factory/templates/` — scaffold templates.
- `test/fixtures/` — synthetic QA fixtures; repository-only and excluded from releases.
- `docs/` — QA scenarios and public methodology references.
- `qa-runner/CONTEXT.md` — interactive Pi/Zellij QA guidance.

## Quality gate
Run before committing package changes:

```bash
npm run check
```

Interactive command QA is intentionally manual. Follow `qa-runner/CONTEXT.md`; do not run write-capable smoke tests without an explicit disposable target and user approval.

## Contributions
Read `CONTRIBUTING.md`. Keep changes small, preserve the safety model, and use GitHub Issues for public work tracking.
