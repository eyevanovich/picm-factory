# Component Context

## Purpose and ownership
Describe the responsibility this boundary owns and what belongs elsewhere.

## Read first
- Authoritative design/domain document:
- Manifest or build definition:
- Public API, startup path, or primary entry point:

## Dependencies and coordination
- Allowed or important dependencies:
- Components that commonly change with this one:
- Cross-boundary review or migration requirements:

## Constraints
- Invariants and compatibility requirements:
- Generated/do-not-edit areas:
- Legacy or intentionally frozen surfaces:

## Verification
- Authoritative test/check location:
- Command source (manifest, script, task definition, or CI job):
- Human review focus:

Prefer pointers to authoritative command definitions over copied command lists.

## Known unknowns
- Keep unverified ownership, behavior, coupling, and risks visible for future correction.
