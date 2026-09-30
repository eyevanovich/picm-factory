# Adoption Guide

Use this guide for `/picm-adopt`. Adoption enables compatibility without automatic conversion: inspect existing material, preserve what works, and make the smallest signed-off changes that improve routing or maintainability.

## Read-first scope and privacy

Start with the workspace and the paths needed to understand its visible routing and structure. Honor Git ignores, persisted `privacy.excludedPaths`, session exclusions, and known sensitive paths; do not copy sensitive/private content into reports or config. A named external path is read scope, not write authority. These are deliberate agent practices, not a claim that tools form a sandbox.

Look for routing and context such as `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `REFERENCES.md`, identity/rules/examples, references, workflows, handoffs, numbered stages, `.pi/settings.json`, and `.picm/config.json`. For a complex or unfamiliar workspace, offer a representative path-to-role-to-rationale inventory. It is orientation only: classification never authorizes a move, archive, merge, deletion, or rewrite.

If sensitive material appears in a non-Git workspace, recommend appropriate storage/sharing review and, when future commits are plausible, exact `.gitignore` patterns. Session or persisted exclusions protect discovery, not commits. Never initialize Git or edit `.gitignore` without sign-off.

## Status model

Keep these outcomes distinct:

- **Scanned only** — findings or optional `.picm/` metadata, but no full adoption.
- **Needs routing before adoption** — root routing is absent, placeholder-only, partial, conflicting, or unsafe.
- **Ready** — adequate visible routing exists or was added, with minimal adoption metadata if useful.
- **Ready with warnings** — routing is adequate while non-blocking improvements remain.

`adoption.status: "adopted"` requires adequate visible routing. `.picm/config.json` supports maintenance; it never replaces the human/agent-facing route map.

## Routing readiness

Adequate visible routing identifies the workspace, tells the agent what core context to read, maps common tasks to a starting place, identifies meaningful local context boundaries, excludes `.picm/` from normal workflow routing, and carries relevant safety/privacy and coding boundaries.

Classify routing as **adequate**, **partial**, **placeholder/unrelated**, or **conflicting/risky**.

- If only `CLAUDE.md` or only `AGENTS.md` is adequate, preserve it as the source of truth.
- If both exist, preserve both and identify cooperation or conflict; a canonical file plus compatibility pointer is an optional improvement.
- If neither exists, recommend a minimal `AGENTS.md`; ask whether a small `CLAUDE.md` compatibility shim is useful, rather than creating either by default.

When routing needs work, offer choices: minimal PiCM compatibility, stronger ICM routing, or scanned-only reporting. For coding work, use the coding guide's additive/curated choices too.

## Coding adoption branch

`/picm-adopt coding` enters this branch directly; ordinary adoption may offer it after a shallow, bounded classification. Offer a primary **Coding Repository** profile for code-first work, or a codebase-map capability alongside a workflow profile for hybrid work.

Ask only the decisions not recoverable safely from the repository:

1. **Mapping approach:** root map, distributed map, or scan and recommend.
2. **Adoption depth:** additive (preserve docs and add missing routing/maps) or curated (analyze documentation and propose consolidation).
3. **High-value hints:** meaningful boundaries, do-not-extend areas, public surfaces, generated files, components that change together, and verification gates.

Initial coding adoption uses the Strict examination from `coding-maintenance-rubric.md`; it records `maintenancePreset: "strict"` as legacy baseline metadata, not permission or a future run choice. Curated analysis may recommend canonical documents, pointers, merges, moves, archives, rewrites, or deletions, but every material effect belongs in the final direction.

## Adoption direction and result

Prepare an adoption report with the inferred profile, routing source/readiness, coding shape where relevant, evidence/unknowns, preserved-as-is material, optional improvements, and next steps. A representative inventory may remain separate from readiness and proposals.

Typical optional metadata is `.picm/config.json` and `.picm/adoption-report.md`. Keep config minimal: profile, routing, useful path hints, adoption status/readiness, optional codebase-map shape/roots/map/local contexts, optional cadence, and normalized privacy exclusions. Preserve unrelated fields. Do not expose sensitive content in metadata.

For all changes, apply `preview-review-protocol.md`: state a concise final direction and wait for conversational sign-off before ordinary edits. Option, mapping, cadence, or scanned-only selection is design input, not write authority. A selected curated direction must explicitly name material consolidation or deletion effects. After an adopted result, offer an initial maintenance pass; it is optional.

## Optional ICM improvements

Suggest, rather than impose, concise root routing, local contracts, stable reference versus working-artifact separation, reviewable outputs, handoffs that retain gaps/unknowns/next actions, and safety boundaries. Custom layouts remain valid when they route work clearly.

## Report shape

```markdown
# PiCM Adoption Report

## Summary
- PiCM compatibility: Ready / Ready with warnings / Needs routing before adoption / Scanned only
- Inferred layout profile:
- Existing routing source:
- Adoption status:

## Existing structure detected
## Routing readiness
## PiCM compatibility
## Coding adoption
## Evidence and unknowns
## Optional file-role inventory
## Security/privacy notes
## Preserved as-is
## Optional changes requiring sign-off
## Next steps
```

Do not rewrite routing files, rename/move/delete content, mark inadequate routing adopted, label unclear material dead, or copy sensitive source into reusable context unless the signed-off final direction explicitly supports it.
