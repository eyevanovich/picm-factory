# Release Guide

This guide is for PiCM Factory maintainers with npm and GitHub release access.

PiCM Factory is published as `@eyevanovich/picm-factory`. The pi.dev package gallery automatically indexes public npm packages with the `pi-package` keyword.

## Release model

Releases are created by a manually dispatched GitHub Actions workflow after normal pull requests merge into `main`. The workflow never creates a pull request. Do not run `npm publish`, edit package versions, create release tags, or manually maintain an `[Unreleased]` changelog section.

The release preparer finds pull requests associated with commits after the latest reachable `v<version>` tag and reads their titles:

- `feat!:` or another breaking-change marker → major
- `feat:` → minor
- `fix:` → patch
- other commit types do not trigger a release

Breaking changes always increment the SemVer major version, including before `1.0.0`. From `0.1.2`, a breaking change produces `1.0.0`.

Use a Conventional Commit pull-request title. Direct commits and pull requests merged into branches other than `main` are excluded from release calculation. The manual workflow remains visible when no release is pending, but fails safely without writing when there are no qualifying unreleased pull requests.

## Standard release

1. Merge normal feature/fix pull requests with Conventional Commit titles.
2. Open **Actions → Create release → Run workflow** and select `main`.
3. The workflow finds the merged `main` pull requests associated with commits after the latest release tag and selects the highest required SemVer bump from their titles.
4. It updates `package.json` and prepends the generated entry to `CHANGELOG.md`.
5. It runs `npm run check`, creates a `chore: release v<version>` commit directly on `main`, and atomically pushes that commit with the matching tag.
6. It creates the GitHub Release and explicitly dispatches `publish.yml`.
7. `publish.yml` requires that GitHub Release, checks that its tag matches `package.json`, runs package validation through `prepublishOnly`, and publishes through npm trusted publishing. Pushing a tag alone cannot invoke publication.
8. Verify the release on:
   - `https://www.npmjs.com/package/@eyevanovich/picm-factory`
   - `https://github.com/eyevanovich/picm-factory/releases`
   - `https://pi.dev/packages/@eyevanovich/picm-factory`

If `main` advances while the workflow is running, the atomic push fails instead of overwriting newer work. Re-run the workflow from the new `main` after reviewing the additional commits.

## Security and permissions

- Repository Actions settings must continue to prohibit GitHub Actions from creating or approving pull requests.
- `release.yml` uses only the repository's short-lived `GITHUB_TOKEN`; no PAT, GitHub App credential, or npm token is required.
- The release job receives `contents: write`, `actions: write`, and `pull-requests: read`. It does not receive `pull-requests: write` or `issues: write`.
- The repository must allow the release workflow to push its generated release commit and tag directly to `main`.
- The repository's selected-actions policy can remain limited to GitHub-owned actions because both workflows use only `actions/checkout` and `actions/setup-node`.
- `publish.yml` is the only npm trusted-publisher workflow and receives `id-token: write` only in its publish job.
- The release workflow explicitly dispatches `publish.yml`; the publisher has no tag-push trigger.
- Pin every referenced action to an immutable commit SHA.

npm trusted publishing must remain configured with:

- Provider: GitHub Actions
- Organization or user: `eyevanovich`
- Repository: `picm-factory`
- Workflow filename: `publish.yml`
- Allowed action: `npm publish`

## Recovery

If the GitHub Release exists but publication was not dispatched or failed, use the publisher's manual dispatch as a recovery path only:

1. Open **Actions → Publish package → Run workflow**.
2. Select `main` and enter the existing tag, such as `v0.2.0`.
3. Re-run publication.

The publisher refuses tags without an existing GitHub Release and never creates tags or releases itself. npm rejects republishing an already published version, so verify npm before retrying a run that may have completed publication.

If the release commit and tag were pushed but GitHub Release creation failed, create the GitHub Release for that existing tag before using the publisher recovery path. Do not run **Create release** again: `package.json` already matches the latest tag, so there is no new release to prepare.

## Bootstrap release history

Version `0.1.2` was the one-time interactive bootstrap publication required before npm trusted publishing could be configured. The publisher intentionally skips `v0.1.2`. Standard CI-controlled releases begin after that version.
