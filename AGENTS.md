# Agent Instructions

## Identity
You are working on PiCM Factory, shared workspace and coding-context guidance with Pi and Claude Code integrations.

## Operating constraints
- PiCM Factory is project-local by default. Install with `pi install -l ...`.
- Keep host integrations thin. Shared behavior, references, templates, and portable settings logic live in `shared/`; backing prompts remain repository-only.
- Do not build a custom TUI or workflow executor without clear evidence it is necessary.
- Be non-destructive by default. Inspect first; for modification commands, present a concise final direction and wait for conversational sign-off before editing.
- Before changing or reviewing write safety, cancellation, approval, or reminders, read [ADR-0002](docs/adr/0002-trusted-methodology-assistant.md) and [the redesign contract](docs/redesign-contract.md). Migrate runtime, guidance, generated content, and tests together.
- Security first: never copy secrets, credentials, tokens, private keys, regulated data, or sensitive client material into context files or examples.
- Honor root/nested Git ignores, repository-local and global excludes, `.picm/config.json` privacy exclusions, session exclusions, and known sensitive paths as discovery defaults. These are agent-followed boundaries: ordinary host tools are not a comprehensive privacy sandbox. A named external location is read scope, not write authority.
- `.pi/` is for Pi config. `.picm/` is for minimal PiCM metadata/reports, including optional persisted scan exclusions.
- Visible files and folders are the source of truth. `.picm/` is maintainer-only context; normal workflow routing should skip it.

## Repository structure
- `pi/extensions/picm-factory.ts` — slash-command registration, small UI/configuration helpers, and composed command prompts.
- `pi/extensions/runtime/` — Pi command dispatch and reminder presentation.
- `pi/HOST.md` — Pi host instructions.
- `claude-code/` — Claude plugin adapter and settings CLI; source alone isn't installable.
- `shared/runtime/` — portable configuration integrity, policy, and maintenance-depth utilities.
- `shared/compose-instructions.ts` — common-contract, host, and selected-procedure assembly; installed-resource link resolution.
- `prompts/` — backing prompt text only; package prompt discovery stays disabled to avoid duplicating extension commands.
- `shared/picm-factory/CONTRACT.md` — main behavior contract.
- `shared/picm-factory/references/` — detailed methodology guidance.
- `shared/picm-factory/templates/` — scaffold templates.
- `test/fixtures/` — synthetic QA fixtures; repository-only and excluded from releases.
- `docs/` — QA scenarios and public methodology references.
- `qa-runner/CONTEXT.md` — interactive Pi/Herdr QA guidance.

## Task routing

| Task | Start here | Supporting files |
| --- | --- | --- |
| Change Pi commands, tool wiring, or reminders | `pi/extensions/picm-factory.ts` | `pi/extensions/runtime/`, `pi/HOST.md`, Pi documentation |
| Change Claude commands or settings access | `claude-code/` | `test/claude-bundle.test.mjs`, Claude plugin documentation |
| Change configuration integrity, policies, or maintenance depth | `shared/runtime/` | Both host adapters, focused runtime tests |
| Change scaffold, adoption, maintenance, optimization, or help behavior | `shared/picm-factory/CONTRACT.md` | The relevant file under `shared/picm-factory/references/` |
| Change coding adoption or context-map behavior | `shared/picm-factory/references/coding-adoption-guide.md` | `coding-maintenance-rubric.md`, `layout-profiles.md`, coding templates |
| Change generated workspace content | `shared/picm-factory/templates/` | `shared/picm-factory/references/layout-profiles.md` |
| Change instruction composition | `shared/compose-instructions.ts` | Host sources, `test/instruction-composition.test.mjs`, packaged-artifact tests |
| Change packaging or release validation | `package.json` | `scripts/check-package.mjs`, `scripts/build-claude-bundle.mjs`, `docs/releasing.md` |
| Change automated fixture coverage | `test/fixtures/` | `docs/layout-fixture-qa.md` |
| Run interactive Pi QA | `qa-runner/CONTEXT.md` | `docs/layout-fixture-qa.md` |
| Run interactive Claude QA | `docs/claude-code-qa.md` | `claude-code/README.md` |
| Change public guidance or attribution | `README.md` | `docs/`, `CONTRIBUTING.md` |

Normal task routing should skip `.picm/`; it contains only maintainer metadata.

## Quality gate
Run before committing package changes:

```bash
npm run check
```

Use Node 24 for checks and the Claude settings helper. `npm run build:claude` generates ignored `dist/claude-code/` with self-contained command skills; Pi composes the same source sections at dispatch without a build. Edit canonical sources, never generated copies. Keep both distributions self-contained and test them outside the checkout.

Interactive command QA is intentionally manual. Follow the host's QA guide above; do not run write-capable smoke tests without an explicit disposable target and user approval.

## Contributions
Read `CONTRIBUTING.md`. Keep changes small, preserve the safety model, and use GitHub Issues for public work tracking.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
