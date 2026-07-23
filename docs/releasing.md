# Release Guide

This guide is for PiCM Factory maintainers with npm and GitHub release access.

PiCM Factory is published as `@eyevanovich/picm-factory`. The pi.dev package gallery automatically indexes public npm packages with the `pi-package` keyword.

## Release model

Releases are created by a manually dispatched GitHub Actions workflow after normal pull requests merge into `main`. The workflow never creates a pull request. Do not run `npm publish`, edit package versions, create release tags, or manually maintain an `[Unreleased]` changelog section.

The release preparer finds pull requests associated with commits after the latest reachable `v<version>` tag and reads their titles:

- `feat!:` or a `BREAKING CHANGE:`/`BREAKING-CHANGE:` marker in a qualifying PR body → major
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
- A dedicated GitHub App installed only on this repository supplies a short-lived, contents-write token for the atomic release push. The token is revoked after the job.
- Store the App client ID as the repository variable `RELEASE_APP_CLIENT_ID` and its private key as the encrypted repository secret `RELEASE_APP_PRIVATE_KEY`. Never copy the private key into source, logs, issues, or chat.
- Keep integrity rules—deletion protection, non-fast-forward protection, and linear history—in `main Law` with no bypass actors.
- Put the pull-request requirement in a separate default-branch ruleset. Allow only the dedicated release App to bypass that ruleset with **Always allow**.
- The release job's `GITHUB_TOKEN` receives `contents: write`, `actions: write`, and `pull-requests: read`. It does not receive `pull-requests: write` or `issues: write`; the App token is requested with only `contents: write`.
- The repository's selected-actions policy can remain limited to GitHub-owned actions because the workflows use `actions/create-github-app-token`, `actions/checkout`, and `actions/setup-node`.
- `publish.yml` is the only npm trusted-publisher workflow and receives `id-token: write` only in its publish job.
- The release workflow explicitly dispatches `publish.yml`; the publisher has no tag-push trigger.
- Pin every referenced action to an immutable commit SHA.

### Dedicated release App setup

1. Register a GitHub App under the repository owner's account with webhooks disabled and repository **Contents: Read and write** as its only non-metadata permission.
2. Install the App only on `eyevanovich/picm-factory`.
3. Store its client ID in `RELEASE_APP_CLIENT_ID` and its generated private key in `RELEASE_APP_PRIVATE_KEY`.
4. Create an active default-branch ruleset containing only the pull-request requirement and add the release App as an **Always allow** bypass actor.
5. Remove the pull-request requirement from `main Law`, leaving its deletion, non-fast-forward, and linear-history rules active with no bypass.
6. Leave `release tags Law` unchanged.

Rotate the private key if exposure is suspected and remove old keys from the App after the replacement secret is installed.

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
