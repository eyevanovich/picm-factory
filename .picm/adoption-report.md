# PiCM Adoption Report

## Summary
- PiCM compatibility: Ready
- Inferred layout profile: Coding Repository
- Existing routing source: `AGENTS.md`
- Adoption status: Adopted
- Codebase-map capability: Root map using `AGENTS.md`

## Existing structure detected
- Project-local Pi package configured through `.pi/settings.json`.
- Canonical routing in `AGENTS.md`, with `CLAUDE.md` acting as a compatibility pointer.
- Shared product context in `CONTEXT.md`.
- Extension entry point and runtime implementation under `extensions/`.
- Runtime behavior contracts, references, and templates under `skills/picm-factory/`.
- Automated tests and synthetic fixtures under `test/`.
- Package and release tooling under `scripts/` and `.github/workflows/`.
- Public guidance under `docs/`.
- Interactive QA specialist context in `qa-runner/CONTEXT.md`.

## Routing readiness
- Source: `AGENTS.md`
- Adequacy: Adequate
- Issues: None blocking adoption.
- `AGENTS.md` identifies the project, routes common tasks to their owning files, names verification through `npm run check`, preserves security boundaries, and excludes `.picm/` from normal work.
- `CLAUDE.md` cooperates with the canonical routing file rather than duplicating it.

## PiCM compatibility
- Existing visible routing is sufficient for `/picm-maintain`.
- The repository does not need a separate `CONTEXT-MAP.md`.
- The updated `.picm/config.json` records the root-map shape and Balanced coding-maintenance preset.

## Coding adoption
- Primary profile: Coding Repository
- Mapping approach selected: Scan and recommend
- Resulting map shape: Root
- Adoption depth: Additive
- Maintenance preset: Balanced
- Maintenance cadence: Weekly nudge

## Repository boundaries proposed
- `extensions/` — Pi command registration, scan enforcement, and maintenance runtime.
- `skills/` — runtime behavior contract, methodology references, and generated-content templates.
- `test/` — automated coverage and repository-only synthetic fixtures.
- `scripts/` — package validation and release preparation.
- `docs/` — public methodology, QA, and release guidance.
- `qa-runner/` — interactive command-QA specialist with its own local context.

## Evidence and unknowns
- The scan inspected root routing/context, package metadata, the extension entry point, the runtime coordinator, contribution guidance, release guidance, and interactive QA context.
- This was a bounded topology scan, not exhaustive semantic analysis or dependency-graph generation.
- No ignored file contents were inspected.
- No additional user boundary hints were supplied.

## Security/privacy notes
- The user reported that sensitive material is confined to Git-ignored paths.
- Git-ignored paths remain unreadable during PiCM coding scans.
- No sensitive or ignored content is copied into this report or configuration.

## Preserved as-is
- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.md`
- Existing source, tests, fixtures, scripts, documentation, workflows, and folder names
- Existing project-local Pi installation settings
- All Git-ignored material

## Optional changes requiring approval
- Replace `.picm/config.json` with the previewed Coding Repository metadata and weekly nudge policy.
- Create this adoption report.
- No visible workflow or coding files require changes.

## Next steps
1. Start a Pi session in this repository and state the coding task normally.
2. The agent should use the auto-loaded `AGENTS.md` routing to reach the owning boundary and authoritative context.
3. The agent should confirm the relevant entry point and verification source before editing.
4. The agent should run `npm run check` when appropriate and present the resulting diff and test output.
5. Review the presented results, with cross-boundary effects and unknowns kept visible.
6. Run `/picm-maintain` after meaningful boundary, manifest, command, or architecture changes.
