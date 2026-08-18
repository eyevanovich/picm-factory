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

Include only meaningful boundaries. Point to authoritative files rather than copying large command lists or dependency inventories. Do not restate relationships an agent can recover cheaply from ordinary imports, manifests, or wiring.

## Non-obvious change impact (optional)
Use this only for high-friction boundaries where important effects are not cheap to recover from code navigation. Omit it when imports and wiring already answer the question.

| Boundary | Potentially affected | Known exclusions | Evidence / confidence |
| --- | --- | --- | --- |
| `path/` | External contract, generated artifact, migration, deployment step, or other non-local surface | Explicitly confirmed unaffected surface, if any | Source path, architecture decision, user confirmation, and confidence |

Treat an exclusion as known only when visible evidence or the user supports it. Put unsupported effects and exclusions in **Unknowns**.

## Operational status (optional)
Use status only when it changes how an agent should navigate or edit an area. Omit this section by default.

| Area | Status | Evidence / confirmation |
| --- | --- | --- |
| `path/` | `live`, `leftover`, `ghost`, or `unknown` | Entry point, registration, deprecation notice, replacement path, user confirmation, or unresolved uncertainty |

An agent may propose a status from cited evidence, but should request user confirmation when the classification is ambiguous or consequential. Absence of imports alone does not prove that an area is leftover or ghost.

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
