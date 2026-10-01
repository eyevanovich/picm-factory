# Coding adoption

Load for `/picm-adopt coding`, selected coding adoption, or hybrid codebase mapping. Apply the [shared contract](../SKILL.md); map useful context without documenting every file or claiming complete architecture knowledge.

## Entry and scope

The shortcut skips classification only. Otherwise orient at path/manifest level: language/workspace manifests, source/tests, build/lint/test/CI definitions, and architecture/developer docs. Offer primary **Coding Repository**, composable codebase mapping alongside another profile, or normal adoption. Overlapping code/workflow scopes are valid; root routing says when to load either or both.

Keep inspection bounded. Avoid unrelated/generated/dependency trees, history, unclear symlink targets, and nested repositories unless explicitly scoped and eligible. External/nested context grants no writes, initialization, or fetching. Ask about specific scope/exclusion conflicts. Private fixtures/local configuration/sensitive findings stay out of maps; other eligible files aren't automatically safe.

## Decisions and initial examination

Ask only decisions not safely recoverable from the repository:

| Decision | Options / evidence |
| --- | --- |
| Mapping approach | **Root map** for small/cohesive repos; **distributed map** at user-confirmed meaningful boundaries; **scan and recommend** for a broader bounded topology assessment before choosing. |
| Adoption depth | **Additive:** preserve docs, add missing routing/maps, report overlap/conflict. **Curated:** inventory eligible agent/developer/architecture docs and propose consolidation. Neither authorizes edits. |
| High-value hints | Meaningful apps/services/packages, local-context/no-context boundaries, legacy/do-not-extend/generated areas, coupled components, public surfaces, and verification gates. Check hints where eligible; retain disagreements/unknowns. |

Scan and recommend is analysis, not a stored shape. Explain evidence, high-value boundaries, context cost, uninspected areas, and uncertain responsibilities; record the result as `root` or `distributed`.

Initial adoption loads [coding maintenance](coding-maintenance-rubric.md) and performs its **Strict** examination. Record `capabilities.codebaseMap.maintenancePreset: "strict"` as legacy baseline metadata, not permission or future depth selection. Historical `light`, `balanced`, and `strict` remain readable; active depth choices exclude Light.

## Map placement and ownership

Keep a genuinely small map in root routing; use `CONTEXT-MAP.md` for a substantial/hybrid map; or reuse adequate `ARCHITECTURE.md`/developer guidance and add missing pointers. Link the chosen map from canonical `AGENTS.md`/`CLAUDE.md`.

Root routing owns behavior/task routes; the map indexes boundaries/responsibilities, authoritative context, entry/public surfaces, and verification sources. Local `CONTEXT.md` holds purpose, read-first files, dependencies/constraints, risks, checks, coordination, and unknowns. Supported maps also expose cross-boundary constraints and generated/do-not-edit areas.

Prefer pointers to manifests, scripts, tests, and decisions over copied commands/dependency lists. Ownership, coupling, and invariants need visible evidence or user confirmation. Add local context only for distinct ownership, independent entry/public/build/test contracts, material safety/operational constraints, frequent independent work, or coordination risk—not every package.

When drafting, adapt [map](../templates/context-map.md) and [boundary](../templates/code-boundary-context.md) templates, omitting unused sections and authoring notes.

## Optional impact and status

Omit by default. Impact notes serve recurring/high-risk non-local effects expensive to recover by navigation: external consumers, generated artifacts, migrations, configuration/reflection registration, deployment, or confirmed coupling. Cite affected surfaces, evidence/confirmation, confidence, and unknowns; avoid copied import graphs. Known exclusions also need evidence.

Navigation-focused status may be **live** (active/authoritative), **leftover** (explicitly superseded/deprecated), **ghost** (planned/stubbed/named but visibly unwired), or **unknown**. Cite evidence or confirmation; ask about ambiguous/consequential labels. Missing imports alone prove neither leftover nor ghost.

## Curated direction and readiness

Keep file-role inventory separate from consolidation. Record each relevant eligible document's path, observed purpose, overlap/conflict, proposed role, and confidence. Distinguish repeated facts from intentional compatibility shims; propose a supported canonical home and thin reachable pointers. Preserve terminology/history; archive/dead status is a user decision. Keep source refactors outside documentation consolidation.

Coding is **Ready** when a cold agent can reach coding/hybrid context, root map/equivalent, relevant boundary, entry point, and verification source without whole-repo scanning, see generated/security boundaries, and skip `.picm/` in normal work.

Minimal metadata may hold profile/routing/path hints, readiness/status, map shape/roots/equivalent/local contexts, and baseline preset. A hybrid preserves its workflow profile and adds the capability. Normalize persisted `privacy.excludedPaths`, preserving other valid privacy fields; load [settings guidance](settings-guide.md) before exclusion/cadence changes.

Before edits, present material consolidation/move/delete effects, preserved routing, and uncertainty; wait for sign-off under the shared contract. Patch evidence-backed drift rather than regenerating an entire map. Finish with the Coding Repository first-run checklist in [layout profiles](layout-profiles.md); recommend maintenance after first real coding use or changes to boundaries, manifests, commands, or architecture docs.
