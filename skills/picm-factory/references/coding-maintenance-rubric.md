# Coding maintenance

Load for initial coding adoption, or maintenance with a Coding Repository profile, `capabilities.codebaseMap`, or visible `CONTEXT-MAP.md`. Apply the [shared contract](../SKILL.md) and the general [maintenance rubric](maintenance-rubric.md) for severity, repair tiers, and reporting. During adoption, use those definitions plus the checks here; no separate broad workflow audit or optimization interview is required.

Use bounded eligible inspection. Respect generated/do-not-edit and nested-repository boundaries; ask before following unclear symlink targets. Keep sensitive findings generic.

## One-run depth

Use the supplied Strict/Balanced depth; initial adoption uses Strict. Strict gives broader systematic coverage across declared roots/mapped contexts at higher cost. Balanced samples major boundaries and one coding path at lower cost. Neither implies exhaustive source understanding, provenance, security authority, or automatic rewrite.

Interactive maintenance offers Strict first; explicit depth bypasses the selector, and non-TUI commands default to Strict. Preserve `capabilities.codebaseMap.maintenancePreset`: legacy `light`, `balanced`, and `strict` values don't select later depth. Don't offer Light for adoption or active selection.

### Balanced

At manifest/documentation level, check:

- canonical routing, configured map/equivalent, declared roots, and local-context paths;
- map links to deleted/excluded paths and entry/manifest/test/verification targets;
- `.picm/` exclusion and visible topology against mapped major boundaries;
- likely new/removed meaningful components and root/local responsibility conflicts;
- verification pointers against authoritative manifests/scripts/tests;
- generated/do-not-edit and cross-boundary constraints for obvious staleness;
- evidence for optional impact/status notes;
- one representative coding cold-agent walk.

Avoid a full semantic dependency graph.

### Strict

Run Balanced, then inventory meaningful boundaries across all declared roots; check independent apps/services/packages for context coverage; compare manifest-level internal dependencies with documented constraints; inspect mapped local contexts for stale paths, conflicting responsibilities, and duplicated facts; review relevant agent/developer/architecture docs for consolidation; and walk more than one materially different boundary when needed.

Both depths apply the general rubric's redundancy review to inspected instructions/pointers. Balanced remains representative; Strict uses broader coverage. Neither is an exhaustive workspace-wide duplicate scan. During initial adoption, load and apply [redundancy review](redundancy-review.md) directly after inventorying the inspected documents.

## Coding cold-agent walk

Choose a visible representative task or ask the user. From root:

1. Reach coding/workflow routing and the map/equivalent, then locate the owner without whole-repo reading.
2. Recover a supported entry/public surface, constraints, and adjacent dependencies. Impact notes expose non-obvious effects, not imports/wiring.
3. Locate authoritative tests/checks and command definitions; identify generated, security, migration, and coordination boundaries.
4. Confirm the review surface: code diff plus check result, with cross-boundary effects and unknowns.

Warn when owner, entry, or checks require guesswork. A longer chain is acceptable when each read narrows context.

## Drift and repair

| Finding | Typical repair |
| --- | --- |
| Removed map/component targets, `.picm/` coding routes, unclear hybrid routing, duplicated large maps | Tier 1 routing |
| Stale roots, meaningful unmapped boundaries, split/merge drift, trivial context beside important gaps | Tier 1/2; a new package alone doesn't justify context |
| Moved entry points, dead tests, stale copied commands, missing checks, generated code presented as ordinary | Tier 2; point to authoritative definitions |
| Conflicting ownership/dependency rules, stale APIs, lost confirmed coupling | Tier 2, or Tier 3 for durable judgment; imports alone don't establish architecture |
| Unsupported/stale impact, exclusions, or status; human confirmation disguised as inference | Tier 2/3; missing imports don't establish leftover/ghost |
| Diverging architecture facts, full compatibility copies, setup/history crowding routing | Supported canonical home; consolidation optional unless routing is unsafe |

## Report and completion

Add mapping profile/capability, shape/roots, one-run depth, inspected areas, and omissions to the general report. Cite evidence and confidence for inferred findings. Keep map presence, correctness, and human approval separate.

Name whether each proposed patch affects root routing, map/equivalent, local context, metadata, or developer/architecture docs. Preserve human knowledge and use the smallest evidence-backed repair, not whole-map regeneration. No watchers, scheduled scans, automatic commits, or rewrites. Before cycle completion/configuration, load [settings guidance](settings-guide.md) and follow the calling workflow.
