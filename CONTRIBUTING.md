# Contributing

Thanks for helping improve PiCM Factory.

## Before changing behavior

- Read `AGENTS.md` and `skills/picm-factory/SKILL.md`.
- Keep the extension thin; methodology belongs in skills, prompts, references, templates, and fixtures.
- Preserve preview-before-write, non-destructive adoption, project-local installation, and security-first context handling.
- Treat layout profiles as recommendations rather than schemas.

## Development

```bash
git clone git@github.com:eyevanovich/picm-factory.git
cd picm-factory
npm run check
```

Use GitHub Issues for bugs and proposed changes. Do not include credentials, private/client material, or sensitive source data in issues, fixtures, examples, or pull requests.

## Validation

Run the package check for every change:

```bash
npm run check
```

Interactive `/picm-*` QA is manual because commands may ask questions or request write approval. Follow `qa-runner/CONTEXT.md` and `docs/layout-fixture-qa.md`, use disposable projects, and report exactly which writes were approved.

## Pull requests

- Explain the user-facing behavior and safety impact.
- Include the relevant GitHub Issue when one exists.
- Keep documentation and examples synchronized with methodology changes.
- Avoid brittle assertions against exact LLM wording; prefer structural checks and documented interactive observations.
