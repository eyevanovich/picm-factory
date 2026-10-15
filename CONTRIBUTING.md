# Contributing

Thanks for helping improve PiCM Factory. Contributions of bug reports, documentation, examples, tests, and focused code changes are welcome.

## Before you start

For bugs and feature proposals, open a [GitHub Issue](https://github.com/eyevanovich/picm-factory/issues) before investing in a large change. Describe the user-facing problem, the expected behavior, and any safety implications. Please do not include credentials, private/client material, or sensitive source data.

For behavior changes, read `AGENTS.md` and `shared/picm-factory/CONTRACT.md`. The project follows a few important boundaries:

- Keep the extension thin; shared behavior belongs in the common contract, mode procedures, and templates.
- Preserve final-direction conversational sign-off for modifications, non-destructive adoption, project-local installation, and security-first context handling. Git checkpoints are advice, not a gate; privacy exclusions are agent-followed boundaries, not a sandbox claim.
- Treat layout profiles as recommendations rather than rigid schemas.
- Keep fixtures and QA tooling repository-only; they must not be included in the npm package.

## Development setup

Fork the repository, then clone your fork:

```bash
git clone https://github.com/YOUR-USERNAME/picm-factory.git
cd picm-factory
npm ci
npm run check
```

Use Node 24 for development. The project is tested with Node 24.19.0 and npm 11.17.0. Artifact checks also use Git, tar, zip, and unzip; the release workflow runs on Ubuntu.

The extension and runtime modules use TypeScript. `npm run check` includes strict type checking; run `npm run typecheck` for that check alone. Keep syntax compatible with Node’s type stripping: use explicit `.ts` imports and avoid enums and parameter properties. Pi loads the packaged TypeScript through its extension loader. Claude's Node 24 helper uses native type stripping. Shared code must use Node built-ins and local imports, not Pi APIs.

Tests, release scripts, and sample repository fixtures remain JavaScript.

Create a focused branch and keep unrelated changes separate.

## Host integrations and bundles

`pi/` and `claude-code/` own host-specific entry points. `shared/` owns the behavior contract, references, templates, and portable settings runtime. The root npm package remains Pi's installation entry point.

`shared/compose-instructions.ts` combines the common contract, host instructions, and selected primary procedure in that order. Detailed branch references and templates stay on demand. Pi sends the composed text directly from its slash dispatcher; it needs no skill router or build step.

Run `npm run build:claude` to generate `dist/claude-code/` with the same sections embedded in each command's `SKILL.md`. This self-contained directory is the plugin root; the source adapter alone lacks shared resources. Edit canonical sources only. Entry skill sources hold only Claude frontmatter and request placement; edit the common contract or mode procedure to change behavior. Relative supporting links are rebased for installed resources. The bundle version comes from `package.json`, so there is no second release version to synchronize. Tests extract the release-format zip outside the source checkout and exercise its helper.

## Making changes

Use the task-routing table in `AGENTS.md` to find the files that own the behavior you want to change.

Keep documentation, examples, templates, and tests synchronized when behavior changes.

## Validation

Run the package check for every change:

```bash
npm run check
```

Interactive `/picm-*` QA is manual because commands may ask questions and modification commands require conversational sign-off on a final direction. Follow `qa-runner/CONTEXT.md` and `docs/layout-fixture-qa.md`, use an explicitly approved disposable project, and report the sign-off, writes, and validation.

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
