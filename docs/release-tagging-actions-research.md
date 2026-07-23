# Research: GitHub Actions for manually triggered Conventional Commit releases

## Summary

PiCM Factory uses a small repository-owned Node.js release preparer inside a manually dispatched GitHub Actions workflow. It finds merged `main` pull requests associated with commits after the latest release tag, maps Conventional Commit markers in their titles and bodies to SemVer, updates `package.json` and `CHANGELOG.md`, commits those files directly to `main`, creates the tag and GitHub Release, and dispatches the separate npm trusted-publishing workflow.

This design keeps the repository setting that prohibits GitHub Actions from creating or approving pull requests. It also works with the selected-actions policy that permits only GitHub-owned actions.

## Requirements

- A maintainer explicitly starts every release from `main`.
- Only pull requests merged into `main` participate; direct commits do not.
- `fix:` produces a patch, `feat:` produces a minor, and `!` or a `BREAKING CHANGE:` marker produces a major.
- Breaking changes before `1.0.0` still produce a major release; `0.1.2` becomes `1.0.0`.
- The workflow updates the package version and changelog without opening a pull request.
- npm publication uses OIDC trusted publishing rather than a stored token.
- A pushed tag alone must not publish a package.

## Findings

1. **Conventional pull-request titles provide the release signal.** A Conventional Commit-style title carries the change type, optional scope, and breaking marker. A qualifying PR body may also carry a `BREAKING CHANGE:` or `BREAKING-CHANGE:` marker. The workflow resolves commits after the latest tag to their associated GitHub pull requests, keeps only PRs merged into the default branch, deduplicates multi-commit PRs, and analyzes those PR records. Direct commits and non-Conventional titles are excluded. For release-note detail, reviewed top-level bullets under `## What Changed` replace the single title-derived bullet; the title remains the fallback. [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)

2. **Literal SemVer requires a major bump for breaking changes under `1.0.0`.** SemVer defines major, minor, and patch increments without substituting a minor bump for a pre-1.0 breaking change. The repository intentionally applies that literal policy. [Semantic Versioning 2.0.0](https://semver.org/)

3. **Manual dispatch is an explicit maintainer gate.** A `workflow_dispatch` workflow is started from the Actions UI, CLI, or API. The workflow guards that the selected ref is the repository default branch and exits when no qualifying unreleased commit exists. [Manually running a workflow](https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow)

4. **Release Please is not compatible with the selected permission model.** Its normal lifecycle opens or updates a release pull request and creates the release after that PR merges. PiCM Factory intentionally keeps the repository-level prohibition on Actions-created pull requests, so the Release Please lifecycle was rejected. The live selected-actions policy also excludes non-GitHub-owned actions. [Release Please](https://github.com/googleapis/release-please) [Release Please Action](https://github.com/googleapis/release-please-action)

5. **A repository-owned script keeps release logic testable and avoids another action dependency.** `scripts/prepare-release.mjs` handles deterministic Git, GitHub PR metadata, and file operations. Unit and temporary-repository tests cover commit parsing, bump precedence, pre-1.0 major behavior, structured `## What Changed` extraction, title fallback, changelog generation, and version updates.

6. **The release commit and tag should move together.** The workflow uses an atomic Git push for the generated commit and tag. A concurrent update to `main` causes the push to fail rather than overwrite newer work. The workflow then creates the GitHub Release from the verified tag.

7. **Trusted publishing remains a separate privilege boundary.** `release.yml` has `contents: write` and `actions: write`, but no OIDC permission. It explicitly dispatches `publish.yml`, whose publish job alone receives `id-token: write`. The publisher requires an existing GitHub Release and validates tag/package alignment before `npm publish`. [npm trusted publishers](https://docs.npmjs.com/trusted-publishers)

8. **A dedicated GitHub App is the narrow bypass actor for the PR-only rule.** The default `GITHUB_TOKEN` cannot push the release commit through a default-branch ruleset that requires pull requests, and the built-in GitHub Actions App is not offered as a bypass actor. A repository-only release App requests a short-lived contents-write installation token for checkout and the atomic push. The App bypasses a separate ruleset containing only the PR requirement; deletion, non-fast-forward, and linear-history protections remain in a non-bypassed ruleset. `GITHUB_TOKEN` still performs pull-request reads, GitHub Release creation, and publisher dispatch. [GitHub App tokens](https://docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) [About rulesets](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)

## Capability comparison

| Option | Version/changelog update | Pull request | Tag/Release | Fits current action policy |
| --- | --- | --- | --- | --- |
| Repository-owned preparer | Direct release commit | None | Workflow creates both | Yes |
| Release Please | Release PR | Action-created | After release PR merge | No |
| semantic-release plus plugins | During release | None by default | Automated | Would add external dependencies and a different 0.x policy |
| Human-prepared release | Human commit | Human-authored | Workflow can create both | Yes, but does not infer/update automatically |

## Decision

Use the repository-owned preparer and a one-stage manual workflow:

1. Merge qualifying Conventional Commit-titled pull requests into `main`.
2. Manually run **Create release** from `main`.
3. Resolve post-tag commits to merged `main` pull requests, then generate and validate `package.json` and `CHANGELOG.md` updates from reviewed `## What Changed` bullets, with PR titles as the fallback and body breaking markers included in bump calculation.
4. Mint a short-lived token from the dedicated release App, commit directly to `main`, and atomically push the matching tag through the App's PR-rule bypass.
5. Create the GitHub Release.
6. Dispatch the trusted npm publisher.

The workflow remains visible even when no release is pending; eligibility is enforced at runtime because GitHub does not conditionally expose manual workflow buttons based on commit history.
