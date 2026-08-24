# PiCM Adoption Report

## Summary

- PiCM compatibility: Ready
- Inferred layout profile: Coding Repository
- Existing routing source: `AGENTS.md`
- Adoption status: Adopted
- Codebase map: root map in `AGENTS.md`
- Initial examination: Strict
- Stored maintenance preset: strict

## Existing structure detected

- `extensions/` contains the thin Pi-facing extension and runtime boundaries.
- `skills/picm-factory/` contains the workflow contract, references, and templates.
- `test/` contains automated tests and repository-only synthetic fixtures.
- `scripts/` contains package validation and release-preparation utilities.
- `docs/` and `qa-runner/` provide public guidance and interactive QA procedure.
- `CLAUDE.md` is a compatibility pointer to `AGENTS.md`.

## Routing readiness

- Source: `AGENTS.md`
- Adequacy: Adequate
- Root context: `CONTEXT.md`
- Local context: `qa-runner/CONTEXT.md`
- Normal routing excludes `.picm/`.

The root instructions provide task-to-owner routing for extension dispatch, runtime enforcement, skill methodology, templates, package validation, fixtures, and interactive QA. `CLAUDE.md` cooperates as a thin pointer and is not a second source of instructions.

## PiCM compatibility

`.picm/config.json` records adoption metadata, the root-map shape, selected code roots, and the Strict maintenance baseline. It supplements visible routing and does not replace it.

Daily maintenance is a TUI reminder only. It does not run background work or automatically modify source files.

## Coding adoption

- Primary profile: Coding Repository
- Mapping approach: Root
- Adoption depth: Curated
- Resulting map shape: Root
- Root-map equivalent: `AGENTS.md`
- Code roots: `extensions/`, `skills/`, `test/`, and `scripts/`
- Selected local contexts: `CONTEXT.md` and `qa-runner/CONTEXT.md`
- Initial examination: Strict
- Stored maintenance preset: strict

## Repository boundaries

| Area | Observed responsibility |
| --- | --- |
| `extensions/` | Pi command registration, guarded tools, and runtime integration |
| `extensions/runtime/` | Privacy, execution, session, scheduling, and maintenance boundaries |
| `skills/picm-factory/` | Runtime methodology, references, and generated-workspace templates |
| `test/` | Automated contract coverage and repository-only synthetic fixtures |
| `scripts/` | Package validation and release preparation |
| `docs/` and `qa-runner/` | Public guidance and interactive QA procedure |

## Evidence and unknowns

The user confirms that this checkout is the extension currently in use. The protected examination verified the visible routing, root context, package metadata, extension entry point, relevant documentation, and representative validation coverage.

No generated or do-not-edit area was identified beyond the documented repository-only fixture boundary. The examination did not attempt exhaustive source comprehension, a full dependency graph, installation-health validation, or Git working-tree-status inspection.

## Documentation consolidation proposal

`AGENTS.md` is the canonical source for agent operating constraints and task routing. `CONTEXT.md` is the canonical source for product terminology and descriptive context. This preserves the existing behavior while removing duplicated terminology and operating guidance.

No merge, move, archive, deletion, or source-code restructuring is proposed.

## Security/privacy notes

No additional session exclusions were requested. Protected scans continue to honor Git ignore rules, repository-local and global excludes, and any future PiCM privacy exclusions. Sensitive material must not be copied into routing, context, examples, or PiCM metadata.

## Preserved as-is

- `AGENTS.md` remains the canonical root routing file.
- `CLAUDE.md` remains the compatibility pointer to `AGENTS.md`.
- Existing extension, runtime, skills, templates, tests, package configuration, QA procedure, and release documentation remain in place.
- `.picm/` remains maintainer-only and outside normal workflow routing.

## Next steps

State a normal coding task. The agent should follow `AGENTS.md` to the owning boundary, confirm the relevant entry point and verification source, make the smallest appropriate change, and present the diff and check result. Review that result and keep cross-boundary effects and unknowns visible.

Run `/picm-maintain` after the first real coding task and whenever repository boundaries, manifests, verification commands, or architecture documentation change.
