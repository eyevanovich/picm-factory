# Contributing

Thanks for helping improve PiCM Factory. Contributions of bug reports, documentation, examples, tests, and focused code changes are welcome.

## Before you start

For bugs and feature proposals, open a [GitHub Issue](https://github.com/eyevanovich/picm-factory/issues) before investing in a large change. Describe the user-facing problem, the expected behavior, and any safety implications. Please do not include credentials, private/client material, or sensitive source data.

For behavior changes, read `AGENTS.md` and `skills/picm-factory/SKILL.md`. The project follows a few important boundaries:

- Keep the extension thin; runtime methodology belongs in the skill's references and templates.
- Preserve preview-before-write, non-destructive adoption, project-local installation, and security-first context handling.
- Treat layout profiles as recommendations rather than rigid schemas.
- Keep fixtures and QA tooling repository-only; they must not be included in the npm package.

## Development setup

Fork the repository, then clone your fork:

```bash
git clone https://github.com/YOUR-USERNAME/picm-factory.git
cd picm-factory
npm run check
```

Create a focused branch and keep unrelated changes separate.

## Making changes

Use the task-routing table in `AGENTS.md` to find the files that own the behavior you want to change.

Keep documentation, examples, templates, and tests synchronized when behavior changes.

## Validation

Run the package check for every change:

```bash
npm run check
```

Interactive `/picm-*` QA is manual because commands may ask questions or request write approval. Follow `qa-runner/CONTEXT.md` and `docs/layout-fixture-qa.md`, use a disposable project, and report exactly which writes were approved.

Avoid brittle assertions against exact model wording. Prefer structural checks and documented interactive observations.

## Pull requests

A pull request should:

- Explain the user-facing behavior and safety impact.
- Link the relevant GitHub Issue when one exists.
- Describe the validation performed and its results.
- Call out any interactive QA and approved writes.
- Stay focused enough to review without unrelated cleanup.

By contributing, you agree that your contribution is provided under this repository's MIT License.

## Maintainers

The npm publication and trusted-publisher procedure is documented separately in [`docs/releasing.md`](docs/releasing.md).
