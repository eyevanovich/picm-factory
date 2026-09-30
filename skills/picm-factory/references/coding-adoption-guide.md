# Coding Repository Adoption Guide

Use this guide for `/picm-adopt coding` or when ordinary adoption identifies a likely coding repository and the user selects coding adoption. Map agent-relevant context without documenting every file or claiming complete architecture knowledge.

## Scope and privacy

Use bounded, relevant inspection. Honor Git ignores, persisted `privacy.excludedPaths`, session exclusions, and known sensitive paths; do not open or summarize excluded/private material. Do not claim that ordinary tools enforce those boundaries universally. Avoid broad traversal of unrelated areas, symlink targets, nested repositories, generated/dependency trees, and history unless the user clearly scopes them and they are eligible.

A named external file, folder, or nested repository may be read as conversationally scoped context. It does not authorize writes there, initialization, fetching, or other repository changes. If a needed location is unclear or conflicts with a sensitive exclusion, ask about that specific conflict.

Keep credentials, private fixtures, local configuration, and sensitive findings out of maps and reports. The boundary reduces exposure; it is not proof that every remaining file is safe.

## Entry and profile choice

The explicit shortcut skips only classification. Otherwise use a shallow path-level orientation to identify language/workspace manifests, source/test areas, build/lint/test/CI configuration, and developer/architecture documentation; do not deep-scan merely to classify.

Offer:

1. **Coding Repository** as the primary profile for code-first work;
2. **codebase-map capability** alongside a Stage Pipeline, Specialist Folder, Team / Role OS, or Custom profile for hybrid work; or
3. normal adoption.

Coding and workflow scopes can overlap. Root routing says when to load coding context, workflow context, or both; do not force exclusive directory ownership.

## Interview

Ask only decisions not recoverable safely from the repository.

### Mapping approach

- **Root map** — a bounded scan and concise map for a small/cohesive repository.
- **Distributed map** — root routing plus local context at user-confirmed meaningful boundaries.
- **Scan and recommend** — a broader, still bounded topology assessment before recommending root or distributed shape.

`Scan and recommend` is analysis, not an output shape. Explain the evidence used, likely high-value boundaries, context-cost tradeoff, areas not inspected, and uncertain responsibilities needing confirmation. Record the resulting shape as `root` or `distributed`.

### Adoption depth

- **Additive** — preserve existing documentation and add only missing routing/maps; report repetition or conflicts as optional findings.
- **Curated** — inventory agent/developer/architecture documentation and draft a consolidation or restructure direction.

Curated is permission to analyze and propose, not to apply. Use `preview-review-protocol.md` before changes, and make linked moves or deletions clear in the final direction.

### Initial Strict examination and user hints

Initial coding adoption applies the Strict checks from `coding-maintenance-rubric.md` and records `capabilities.codebaseMap.maintenancePreset: "strict"` as legacy baseline metadata. It does not select later maintenance depth or authorize changes.

Ask for high-value hints only: meaningful apps/services/packages, boundaries that should or should not receive local context, legacy/do-not-extend areas, coupled components, real public surfaces, verification gates, and generated/do-not-edit areas. Treat hints as evidence to check where safely possible; retain disagreement or uncertainty for user correction.

## Map placement and content

Use this order:

1. keep a genuinely small map in existing root routing;
2. use `CONTEXT-MAP.md` for substantial or hybrid maps, linked from canonical `AGENTS.md` or `CLAUDE.md`; or
3. reuse adequate `ARCHITECTURE.md` or developer guidance and add only missing pointers.

Responsibilities:

- root `AGENTS.md`/canonical `CLAUDE.md`: behavior and task-to-context routing;
- `CONTEXT-MAP.md` or equivalent: boundaries, responsibilities, context, entry/verification pointers;
- local `CONTEXT.md`: boundary-specific purpose, read-first files, entry points, dependencies/constraints, risks, verification, coordination, and known unknowns.

A useful map identifies, where supported by evidence: repository purpose and shape; meaningful boundaries; authoritative context/docs; entry points or public surfaces; tests and authoritative verification sources; cross-boundary constraints; generated/do-not-edit areas; and explicit unknowns. Prefer pointers to manifests, scripts, tests, and architecture decisions over copied dependency lists or command definitions. Do not claim ownership, coupling, or invariants unsupported by visible evidence or user confirmation.

Use local context only for meaningful boundaries: distinct ownership, independent entry/public surface, independent build/test contract, material operational/safety constraints, frequent independent work, or cross-boundary coordination risk. Do not add `CONTEXT.md` to every package.

## Optional impact notes and status

Default to omission. An impact note is useful only for a recurring or high-risk change whose important non-local effects are not cheap to recover from ordinary navigation, such as external consumers, generated artifacts, migrations, configuration/reflection registration, deployment, or user-confirmed coupling. Include affected surfaces, cited evidence or confirmation, confidence, and unknowns—not copied import graphs.

Operational status is optional and navigation-focused:

- **live** — active and authoritative by evidence/confirmation;
- **leftover** — present but explicitly superseded or deprecated;
- **ghost** — planned/stubbed/named but visibly not wired;
- **unknown** — evidence cannot support another status.

Ask before changing an ambiguous or consequential classification. Missing imports alone do not prove a status.

## Curated documentation analysis

Keep the optional file-role inventory separate from a curated consolidation direction. For relevant eligible agent/developer/architecture documents, record:

| Path | Observed purpose | Overlap/conflict | Proposed role | Confidence |
| --- | --- | --- | --- | --- |

Distinguish repeated facts from intentional compatibility shims; prefer one supported canonical home and thin pointers. Preserve terminology and useful history. Treat archive/dead status as a user decision. Do not mix source-code refactors into documentation consolidation.

## Readiness and minimal config

Coding adoption is **Ready** only when a cold agent can identify coding/hybrid context, reach a root map/equivalent, find the relevant boundary, entry point, and verification source without scanning the whole repo, see generated/security boundaries, and avoid `.picm/` in normal coding work.

Minimal metadata may record adoption status/readiness, profile, routing source, path hints, and a codebase-map shape, roots, map/equivalent, local contexts, and `maintenancePreset: "strict"`. A hybrid preserves its workflow profile and adds the capability. Existing `light`, `balanced`, and `strict` preset values remain readable legacy metadata; they do not select a run depth. Persisted privacy exclusions stay normalized under `privacy.excludedPaths`, preserving other valid privacy fields.

## Direction and first coding run

Before edits, follow the shared contract: explain the map or documentation outcome, affected areas, material consolidation/move/delete effects, preserved routing, and uncertainty; wait for conversational sign-off; then use ordinary tools and validation. Do not regenerate or overwrite a whole map merely because drift exists.

End with a user-facing checklist:

1. state the coding task normally;
2. the agent follows canonical root routing to the map/equivalent, local boundary, entry point, and verification source;
3. it makes the smallest appropriate change and runs real checks;
4. the user reviews the diff and check result; and
5. cross-boundary effects and unknowns stay visible.

Recommend `/picm-maintain` after the first real coding task and when boundaries, manifests, commands, or architecture documentation change.
