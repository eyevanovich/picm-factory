# Changelog

All notable changes to PiCM Factory will be documented here.

## [0.1.2] - 2026-07-21

### Added

- Public npm distribution under `@eyevanovich/picm-factory`.
- Token-free GitHub Actions release automation through npm trusted publishing, beginning after the interactive `0.1.2` bootstrap publication.
- npm provenance attestations for automated releases beginning with `0.1.3`.
- Automatic eligibility for the pi.dev package gallery through the `pi-package` keyword.

## [0.1.1] - 2026-07-19

### Fixed

- Prevented duplicate `/picm-*` command entries by keeping the same-named backing prompts out of Pi's prompt-template registry.

## [0.1.0] - 2026-07-19

Initial public release.

### Added

- `/picm-new` interview-led minimum viable workspace scaffolding.
- `/picm-adopt` read-first, non-invasive compatibility guidance.
- `/picm-maintain` advisory health checks and heuristic trace mode.
- `/picm-help` command and installation decision guide.
- Stage Pipeline, Specialist Folder, Team / Role OS, and Custom / Existing Structure profiles.
- Explicit stage contracts, human review gates, and first-run checklists.
- Layout, anti-pattern, source-integrity, and synthetic security fixtures.
- Cold-agent maintenance walk tests and interactive Pi/Zellij QA guidance.
- Optional local-script and MCP/tool boundaries for deterministic mechanical work.

### Safety

- Preview and explicit approval before writes.
- Non-destructive adoption and maintenance defaults.
- Separation of `.pi/` package configuration from maintainer-only `.picm/` metadata.
- Security guidance for secrets, private/client material, and generated context.

### Distribution

- Project-local installation from the public GitHub repository.
