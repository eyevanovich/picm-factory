# Coding adoption detail

Optional elaboration for mapping, curation, impact/status notes, metadata, and templates. The active [coding onboarding procedure](adoption-guide.md#coding-onboarding) contains all required adoption inspection and readiness criteria. This reference adds no prerequisite or separate examination. Apply the [shared contract](../CONTRACT.md).

## Mapping choices

Use these choices when they help a concrete proposal, not as an upfront questionnaire:

| Choice | Options / evidence |
| --- | --- |
| Mapping approach | **Root map** for small/cohesive repos; **distributed map** at user-confirmed meaningful boundaries; **scan and recommend** for a broader bounded topology assessment before choosing. |
| Adoption depth | **Additive:** preserve docs, add missing routing/maps, report overlap/conflict. **Curated:** inventory eligible agent/developer/architecture docs and propose consolidation. Neither authorizes edits. |
| High-value hints | Meaningful apps/services/packages, local-context/no-context boundaries, legacy/do-not-extend/generated areas, coupled components, public surfaces, and verification gates. Check hints where eligible; retain disagreements/unknowns. |

Scan and recommend is analysis, not a stored shape. Explain evidence, high-value boundaries, context cost, uninspected areas, and uncertain responsibilities; record the result as `root` or `distributed`.

Templates for a [map](../templates/context-map.md) or [boundary context](../templates/code-boundary-context.md) are optional drafting aids. Omit unused sections and authoring notes. Keep private fixtures/local configuration/sensitive findings out of maps; eligibility alone doesn't establish safe reusable content.

## Impact and status notes

Omit by default. Impact notes serve recurring/high-risk non-local effects expensive to recover by navigation: external consumers, generated artifacts, migrations, configuration/reflection registration, deployment, or confirmed coupling. Cite affected surfaces, evidence/confirmation, confidence, and unknowns; avoid copied import graphs. Known exclusions also need evidence.

Navigation-focused status may be **live** (active/authoritative), **leftover** (explicitly superseded/deprecated), **ghost** (planned/stubbed/named but visibly unwired), or **unknown**. Cite evidence or confirmation; ask about ambiguous/consequential labels. Missing imports alone prove neither leftover nor ghost.

## Curated documentation

Keep file-role inventory separate from consolidation. Record each relevant eligible document's path, observed purpose, overlap/conflict, proposed role, and confidence. Distinguish repeated facts from intentional compatibility shims; propose a supported canonical home and thin reachable pointers. Preserve terminology/history; archive/dead status is a user decision. Keep source refactors outside documentation consolidation. Patch evidence-backed drift rather than regenerating an entire map.

## Optional metadata

Minimal metadata may hold profile/routing/path hints, readiness/status, map shape/roots/equivalent/local contexts, and baseline preset. When metadata is agreed, record `capabilities.codebaseMap.maintenancePreset: "strict"` as legacy baseline metadata, not permission or future depth selection. Historical `light`, `balanced`, and `strict` remain readable; active depth choices exclude Light.

A hybrid preserves its workflow profile and adds the capability. Normalize persisted `privacy.excludedPaths`, preserving other valid privacy fields; load [settings guidance](settings-guide.md) before exclusion/cadence changes. Metadata writes still require sign-off and configuration integrity safeguards; metadata doesn't establish readiness.
