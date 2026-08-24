# Coding Repository Maintenance Rubric

Use this guide inside an explicitly invoked `/picm-maintain` workflow when `.picm/config.json` identifies `profile: "coding-repository"`, when `capabilities.codebaseMap` is enabled, or when visible routing points to `CONTEXT-MAP.md`.

Apply the general `maintenance-rubric.md` posture, severity labels, repair tiers, preview requirements, scheduled-reminder consent boundary, and report format. Coding repairs use the shared complete concise summary and may receive direct explicit approval from that summary when no mandatory exact review is pending. This guide adds coding-specific checks; it does not create a deterministic validator or automatic rewrite system. Choosing `Run Now` authorizes the ordinary maintenance flow, not an automatic map or report update.

## Security before maintenance

Apply the coding adoption guide's **excluded means unreadable** boundary before any scan:

- call `preflight` before inventory or content inspection; when it loads persisted exclusions and reports `privacyReviewed: true`, ask only for additional sensitive project-relative paths without repeating the full privacy boilerplate, call `privacy` with those additions, and retain all persisted exclusions; otherwise ask the full privacy question and record exact exclusions with `privacy`; then call `begin`;
- derive candidates through protected inventory, using the real Git repository when present or isolated transient Git metadata only after privacy review when `.git` is absent;
- honor root/nested `.gitignore`, `.git/info/exclude`, global Git excludes, persisted `privacy.excludedPaths`, and session additions as cumulative rules;
- skip matching paths even if tracked;
- use `picm_scan_control inventory` instead of agent Bash for candidate discovery; active scans block broad traversal, agent Bash, and unrecognized agent tools, while user-typed `!bash` remains unrestricted;
- do not follow symlinks; out-of-repository targets remain unreadable;
- treat an explicitly included submodule as a separate Git worktree and apply parent, local Git, and PiCM exclusions without initializing or fetching it automatically.

Never quote sensitive findings into a maintenance report. Record generic risk descriptions and safe paths only when path disclosure itself is acceptable.

## Maintenance depth

For every later interactive `/picm-maintain` run, use the one-run depth supplied by the command prompt. A bare interactive command presents Strict and Balanced with Strict preselected; `/picm-maintain strict` and `/picm-maintain balanced` bypass that selector. The choice applies only to the current run and must not silently mutate `capabilities.codebaseMap.maintenancePreset`.

Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.

Balanced: representative coverage of major boundaries and one coding path; lower cost.

Stored presets remain backward compatible. Explicit `light`, `balanced`, and `strict` values are readable. Scheduled `Run Now` uses the same Strict/Balanced selector as an ordinary interactive maintenance run rather than selecting a stored preset. Light is compatibility-only: never offer it in a new-user selector or use it for new adoption.

### Light (compatibility only)

Honor an existing explicit Light preset only when a compatibility path explicitly requests that stored depth.

Check:

- canonical routing and configured map paths exist;
- declared code roots and local-context paths exist;
- root routing points to the current map/equivalent;
- map links do not target deleted or ignored paths;
- mapped entry-point, manifest, test, and verification pointers still exist;
- `.picm/` remains outside normal coding routes.

Do not search broadly for new components.

### Balanced

Run all Light checks, plus:

- compare visible workspace/manifests with mapped major boundaries;
- identify likely new or removed meaningful components;
- compare root and local responsibility descriptions for conflict;
- check that verification guidance still points to authoritative manifests/scripts/tests;
- inspect generated/do-not-edit and cross-boundary constraints for obvious staleness;
- when optional impact notes or operational status are present, check their cited evidence and flag unsupported or stale claims;
- run one representative coding cold-agent walk.

Keep discovery manifest/documentation-level. Do not build a full semantic dependency graph.

### Strict

Run all Balanced checks, plus:

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
3. **Recover the change surface.** Can it find the supported entry point/public surface, important constraints, and adjacent dependencies? When an optional impact note exists, does it expose a non-obvious effect instead of restating imports or wiring?
4. **Recover verification.** Can it identify the authoritative tests/checks and where their commands are defined?
5. **Respect boundaries.** Are generated/do-not-edit, security, migration, or cross-component coordination rules visible before editing?
6. **Review outcome.** Is the expected review surface a code diff plus test/check result, with cross-boundary effects and unknowns reported?

Report a Warning when a normal task cannot reach an owner, entry point, or verification source without guesswork. A longer route is not automatically wrong if every read narrows context.

When evaluating an optional impact note, record whether it prevented broad searching, exposed a missed non-local dependency, or merely duplicated facts already obvious from code. Recommend trimming or removing notes that do not narrow the route. Do not claim context savings unless the comparison measured them.

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

### Optional impact and operational-status drift

Check these only when the map or local context uses them. Look for:

- impact notes that restate imports or wiring without adding non-local guidance;
- potentially affected surfaces whose cited evidence moved or disappeared;
- known exclusions stated without explicit evidence;
- a `live`, `leftover`, or `ghost` label contradicted by current entry points, registration, deprecation guidance, or a replacement path;
- an agent-inferred status presented as human-confirmed;
- ambiguity that should be downgraded to `unknown` pending user confirmation.

Do not infer `leftover` or `ghost` from missing imports alone. Propose the smallest evidence-backed correction, preserve recorded user judgment, and ask before changing a consequential or ambiguous classification.

Typical repair: Tier 2 context fix; Tier 3 when the classification records durable user or architectural judgment.

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
- one-run maintenance depth (or stored preset for a scheduled compatibility run);
- areas deliberately not inspected.

Coding findings should include evidence and confidence when they rely on inferred boundaries. Keep map presence, map correctness, and human approval separate. When comparing context efficiency, report purposeful files opened, searches performed, missed dependencies, and task correctness; report exact token savings only when the runtime exposes a reliable measurement.

For each proposed map change, identify whether it edits:

- root routing;
- root context map/equivalent;
- local boundary context;
- maintainer-only config/report metadata;
- existing developer/architecture documentation.

Never regenerate or overwrite the whole map merely because drift exists. Preserve human knowledge and propose the smallest evidence-backed patch.

## Future automation boundary

The current capability is manually invoked. Do not add watchers, scheduled scans, automatic commits, or automatic rewrites. Keep detection, proposal, and approved application conceptually separate so a future opt-in automation design can reuse them after its own security and consent review.
