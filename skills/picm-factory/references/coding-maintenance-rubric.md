# Coding Repository Maintenance Rubric

Use inside `/picm-maintain` when `.picm/config.json` identifies `profile: "coding-repository"`, `capabilities.codebaseMap` is enabled, or visible routing points to `CONTEXT-MAP.md`.

Apply the general maintenance posture, severity labels, repair tiers, report format, and shared final-direction/sign-off guidance. This adds coding checks; it is not a deterministic validator or automatic rewrite system.

## Scope and privacy

Before coding inspection, use bounded context appropriate to the requested depth. Honor Git ignores, persisted `privacy.excludedPaths`, session exclusions, known sensitive paths, generated/do-not-edit areas, and nested-repository boundaries. Do not open excluded/private paths, follow an unclear symlink target, or claim ordinary tools comprehensively enforce those choices. Keep sensitive findings generic in reports.

## Maintenance depth

Use the supplied one-run depth. A bare interactive command may offer Strict and Balanced with Strict preselected; explicit `strict` or `balanced` bypasses that choice. The selection applies only to the current run and does not mutate `capabilities.codebaseMap.maintenancePreset`.

**Strict** (recommended) provides broader systematic coverage across declared roots and mapped contexts at higher cost. **Balanced** provides representative coverage of major boundaries and one coding path at lower cost.

Stored `maintenancePreset` values, including historical `light`, `balanced`, and `strict`, remain readable legacy metadata; they do not select a run depth. Do not offer Light for new adoption or active run selection.

### Balanced

Check:

- canonical routing and configured map/equivalent paths;
- declared code roots and local-context paths;
- root routing to current map/equivalent;
- map links that target deleted or excluded paths;
- mapped entry-point, manifest, test, and verification pointers;
- `.picm/` exclusion from normal coding routes;
- visible workspace/manifests against mapped major boundaries;
- likely new or removed meaningful components;
- root/local responsibility conflicts;
- verification guidance against authoritative manifests/scripts/tests;
- generated/do-not-edit and cross-boundary constraints for obvious staleness;
- cited evidence for optional impact notes or operational status; and
- one representative coding cold-agent walk.

Keep discovery manifest/documentation-level; do not build a full semantic dependency graph.

### Strict

Run Balanced, plus:

- inventory meaningful boundaries across all declared roots;
- check context coverage for independently operated apps/services/packages;
- compare manifest-level internal dependencies with documented cross-boundary constraints;
- inspect mapped local contexts for stale paths, responsibility conflicts, and duplicated durable facts;
- review relevant agent/developer/architecture documentation for consolidation opportunities; and
- run representative walks across more than one materially different boundary when needed.

Both depths apply the general rubric's redundancy review to their inspected instruction and pointer set. Balanced remains representative; Strict uses its broader coverage. Don't present either as an exhaustive workspace-wide duplicate scan.

Strict does not mean exhaustive source comprehension, provenance, or authority to rewrite.

## Coding cold-agent walk

Choose a representative coding task; ask the user when none is visible.

1. Orient from root to the coding/workflow route and map/equivalent.
2. Locate the component that owns the task without reading the whole repository.
3. Recover supported entry/public surface, constraints, and adjacent dependencies. An optional impact note should expose a non-obvious effect, not restate imports/wiring.
4. Identify authoritative tests/checks and where their commands are defined.
5. Confirm generated/do-not-edit, security, migration, and coordination boundaries before editing.
6. Confirm the review surface is a code diff plus test/check result with cross-boundary effects and unknowns.

Warn when a normal task cannot reach an owner, entry point, or verification source without guesswork. A longer route is acceptable when each read narrows context.

## Drift checks

- **Routing:** removed map/component targets, coding routes through `.picm/`, unclear hybrid routing, or duplicated large maps. Typical repair: Tier 1.
- **Topology:** stale roots/components, unmapped meaningful boundaries, split/merge responsibility drift, or trivial local contexts beside important unmapped boundaries. A new package is a candidate, not proof that it needs context. Typical repair: Tier 1 or Tier 2.
- **Entry point and verification:** moved entry points, dead tests, copied commands that disagree with manifests, missing boundary checks, or generated code presented as ordinary. Prefer pointers to authoritative definitions. Typical repair: Tier 2.
- **Responsibility and dependency:** conflicting ownership, documented dependency rules versus manifests, stale public APIs, or lost user-confirmed coupling. Do not infer architecture from imports alone. Typical repair: Tier 2, or Tier 3 for durable judgment.
- **Impact/status:** unsupported or stale impact notes, unjustified known exclusions, status labels contradicted by evidence, or human-confirmed status presented as inference. Do not infer `leftover`/`ghost` from missing imports. Typical repair: Tier 2 or Tier 3.
- **Documentation:** diverging repeated architecture facts, full compatibility files instead of pointers, or stale setup/history payload crowding routing. Recommend a supported canonical home; consolidation is optional unless routing is unsafe.

## Report additions

In the maintenance summary, state primary/composable codebase mapping, map shape and roots inspected, one-run depth, and areas deliberately not inspected. Coding findings cite evidence and confidence when inferred. Keep map presence, correctness, and human approval separate.

For each proposed map change, name whether it affects root routing, root map/equivalent, local context, maintainer metadata, or existing developer/architecture documentation. Preserve human knowledge and propose the smallest evidence-backed patch; never regenerate an entire map merely because drift exists.

## Automation boundary

This capability is manually invoked. Do not add watchers, scheduled scans, automatic commits, or automatic rewrites.
