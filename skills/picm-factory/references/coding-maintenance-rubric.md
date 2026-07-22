# Coding Repository Maintenance Rubric

Use this guide when `.picm/config.json` identifies `profile: "coding-repository"`, when `capabilities.codebaseMap` is enabled, when visible routing points to `CONTEXT-MAP.md`, or when the user explicitly requests coding-map maintenance.

Apply the general `maintenance-rubric.md` posture, severity labels, repair tiers, preview requirements, and report format. This guide adds coding-specific checks; it does not create a deterministic validator or automatic rewrite system.

## Security before maintenance

Apply the coding adoption guide's **Git ignored means unreadable** boundary before any scan:

- require a Git worktree for automatic scans;
- derive candidates through Git-aware listing;
- run `git check-ignore --no-index` before reading every candidate;
- skip ignored paths even if tracked;
- prohibit broad ignore-bypassing traversal;
- do not follow symlinks during automatic scans; a separately approved link requires checking both the link and canonical in-worktree target, and out-of-repository targets remain unreadable;
- treat an explicitly included submodule as a separate worktree and repeat candidate listing, privacy confirmation, and per-path ignore checks there; never initialize or fetch it automatically;
- ask about tracked secrets/private areas before content inspection.

Never quote sensitive findings into a maintenance report. Record generic risk descriptions and safe paths only when path disclosure itself is acceptable.

## Preset selection

Use `capabilities.codebaseMap.maintenancePreset` when present. If absent, ask once or recommend **Balanced**. A one-run user instruction may request another preset without silently changing config.

### Light

Use for stable repositories or low-cost frequent checks.

Check:

- canonical routing and configured map paths exist;
- declared code roots and local-context paths exist;
- root routing points to the current map/equivalent;
- map links do not target deleted or ignored paths;
- mapped entry-point, manifest, test, and verification pointers still exist;
- `.picm/` remains outside normal coding routes.

Do not search broadly for new components.

### Balanced

Recommended default. Run all Light checks, plus:

- compare visible workspace/manifests with mapped major boundaries;
- identify likely new or removed meaningful components;
- compare root and local responsibility descriptions for conflict;
- check that verification guidance still points to authoritative manifests/scripts/tests;
- inspect generated/do-not-edit and cross-boundary constraints for obvious staleness;
- run one representative coding cold-agent walk.

Keep discovery manifest/documentation-level. Do not build a full semantic dependency graph.

### Strict

Use for fast-moving or high-risk repositories when the user accepts higher token cost. Run all Balanced checks, plus:

- inventory meaningful boundaries across all declared roots;
- check context coverage for independently operated apps/services/packages;
- compare manifest-level internal dependency relationships with documented cross-boundary constraints;
- inspect all mapped local contexts for stale paths, responsibility conflicts, and duplicated durable facts;
- review relevant agent/developer/architecture documentation for consolidation opportunities;
- run representative walks across more than one materially different boundary when needed.

Strict does not mean exhaustive source-code comprehension, provenance, or permission to rewrite.

## Coding cold-agent walk

Choose one representative coding task. If none is visible, ask the user for one rather than inventing a risky change.

Walk:

1. **Orient from root.** Can the agent identify coding versus workflow routes and find the repository map/equivalent?
2. **Choose the boundary.** Can it locate the component that owns the task without reading the whole repository?
3. **Recover the change surface.** Can it find the supported entry point/public surface, important constraints, and adjacent dependencies?
4. **Recover verification.** Can it identify the authoritative tests/checks and where their commands are defined?
5. **Respect boundaries.** Are generated/do-not-edit, security, migration, or cross-component coordination rules visible before editing?
6. **Review outcome.** Is the expected review surface a code diff plus test/check result, with cross-boundary effects and unknowns reported?

Report a Warning when a normal task cannot reach an owner, entry point, or verification source without guesswork. A longer route is not automatically wrong if every read narrows context.

## Drift checks

### Routing drift

Look for:

- root route points to a removed map or old component;
- coding tasks route through `.picm/`;
- hybrid routing fails to say when both workflow and coding context apply;
- a large map is duplicated in `AGENTS.md` and `CONTEXT-MAP.md`.

Typical repair: Tier 1 routing patch.

### Topology drift

Look for:

- mapped roots/components no longer exist;
- new workspace members are absent from a distributed map;
- a component split/merge left stale responsibility descriptions;
- local context exists for trivial leaves while an important independent boundary is unmapped.

Treat a new package as a mapping candidate, not proof that it needs local context. Ask for user input before creating/removing boundary maps.

Typical repair: Tier 1 map update or Tier 2 local-context adjustment.

### Entry-point and verification drift

Look for:

- deleted or moved entry points;
- test paths that no longer exist;
- copied commands that disagree with authoritative manifests/scripts;
- verification guidance that omits a visible boundary-specific check;
- generated code presented as a normal edit surface.

Prefer pointers to authoritative command definitions over copied command lists.

Typical repair: Tier 2 context fix.

### Responsibility and dependency drift

Look for:

- root and local maps disagree about ownership;
- documented allowed dependencies conflict with manifest-level relationships;
- a public API moved but old consumers are still routed to it;
- user-confirmed coupling or do-not-extend constraints disappeared.

Do not infer semantic architecture from imports alone. Mark confidence and ask when intent is unclear.

Typical repair: Tier 2 contract fix; Tier 3 only when changing durable architectural judgment.

### Documentation drift

Look for:

- repeated architecture facts with diverging values;
- `AGENTS.md`, `CLAUDE.md`, map, and developer docs duplicating the same instructions;
- compatibility shims that have become full conflicting instruction files;
- stale setup/history payload crowding active routing.

Recommend one canonical fact home and thin pointers. Consolidation remains optional unless conflict makes routing unsafe.

## Maintenance output additions

In the normal maintenance report Summary, state:

- primary profile;
- whether codebase mapping is primary or composable;
- map shape and roots inspected;
- maintenance preset;
- areas deliberately not inspected.

Coding findings should include evidence and confidence when they rely on inferred boundaries. Keep map presence, map correctness, and human approval separate.

For each proposed map change, identify whether it edits:

- root routing;
- root context map/equivalent;
- local boundary context;
- maintainer-only config/report metadata;
- existing developer/architecture documentation.

Never regenerate or overwrite the whole map merely because drift exists. Preserve human knowledge and propose the smallest evidence-backed patch.

## Future automation boundary

The current capability is manually invoked. Do not add watchers, scheduled scans, automatic commits, or automatic rewrites. Keep detection, proposal, and approved application conceptually separate so a future opt-in automation design can reuse them after its own security and consent review.
