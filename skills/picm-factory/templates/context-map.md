# Repository Context Map

## Purpose
Explain how this map helps an agent locate the smallest authoritative context needed for a coding task. Keep behavioral rules in the canonical root `AGENTS.md` or `CLAUDE.md`.

## Repository shape
- Primary product/runtime areas:
- Shared libraries or infrastructure:
- Workflow/operations areas, if applicable:

## Context boundaries

| Area | Responsibility | Read next | Entry point / authority | Verification source |
| --- | --- | --- | --- | --- |
| `path/` | What this boundary owns | Local context or authoritative docs | Public surface, manifest, or startup path | Test folder, manifest script, or check definition |

Include only meaningful boundaries. Point to authoritative files rather than copying large command lists or dependency inventories.

## Cross-boundary constraints
- Note confirmed coupling, dependency direction, shared schemas, migration order, or review requirements.
- Keep unsupported inferences in **Unknowns** instead of presenting them as rules.

## Generated and restricted areas
- Generated/do-not-edit paths:
- Security/private handling rules:
- Submodule or external-repository boundaries:

Never list ignored-file contents or secret details.

## Unknowns
- Record responsibilities, entry points, ownership, or constraints that still require confirmation.
