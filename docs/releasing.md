# Release Guide

This guide is for PiCM Factory maintainers with npm and GitHub release access.

PiCM Factory is published as `@eyevanovich/picm-factory`. The pi.dev package gallery automatically indexes public npm packages with the `pi-package` keyword.

## Standard release

npm releases are published by `.github/workflows/publish.yml` through npm trusted publishing.

1. Update `version` in `package.json` and add the matching `CHANGELOG.md` entry.
2. Run `npm run check` and merge the release commit to `main`.
3. Create a non-prerelease GitHub Release tagged `v<package-version>` from that commit.
4. Verify the GitHub Actions publish job.
5. Verify the release on:
   - `https://www.npmjs.com/package/@eyevanovich/picm-factory`
   - `https://pi.dev/packages/@eyevanovich/picm-factory`

The workflow rejects a tag that does not match `package.json`. Do not add an npm token to the repository.

## First npm publication

npm requires a package to exist before trusted publishing can be configured. For version `0.1.2` only, the package owner must run `npm publish` interactively from a clean checkout of the release commit, then push the matching `v0.1.2` tag without creating a GitHub Release. Never commit npm credentials.

After the bootstrap publication, configure the package's trusted publisher on npm with:

- Provider: GitHub Actions
- Organization or user: `eyevanovich`
- Repository: `picm-factory`
- Workflow filename: `publish.yml`
- Allowed action: `npm publish`

Use the standard automated release process starting with the next version. After the workflow publishes successfully, configure npm publishing access to require two-factor authentication and disallow tokens.
