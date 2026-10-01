# Layout profiles and first runs

Profiles are recommendations, not validation laws. Choose one primary profile; borrow secondary patterns only where useful. Coding Repository can be primary or a codebase-map capability alongside a workflow profile. Custom layouts remain valid when they route clearly.

Default to root `AGENTS.md` plus local `CONTEXT.md`. Root routing names when to load local context/maps; local `AGENTS.md` is for hard local behavior or an independent Pi/subagent working directory. Visible files own routing; normal work skips `.picm/` metadata.

## Stage Pipeline

Use for ordered work with distinct inputs/outputs and human review between stages. Root-numbered `01_discovery/CONTEXT.md` and nested `stages/01_discovery/CONTEXT.md` are equally valid. Each active contract states Purpose, Inputs, Process, Outputs, optional Verify, and Handoff/review. Distinguish stable references from per-run artifacts where trust depends on it; downstream inputs name inspectable outputs/review surfaces.

### Placement decision

After the profile is confirmed, before choosing paths:

- honor an explicit seeded placement;
- otherwise ask whether stages should be root-numbered or nested under `stages/`;
- choose root-numbered only when the user has no preference, especially for immediate visibility;
- prefer nesting for a crowded root or requested cleaner root.

Use the selected shape consistently in generated paths, config hints, and first-run guidance.

### First run

Name the first stage's `CONTEXT.md` and output. Stop for human review/editing at every meaningful intermediate review point, preserve gaps/unsupported claims, then start each downstream stage from the reviewed artifact.

## Specialist Folder

Use for one reusable helper where domain rules/examples matter more than ordered stages. `identity.md`, `rules.md`, `examples.md`, `reference/`, and `workflows/` are possible homes, not required scaffolding. Create each only for identified guidance, a real example, or an active recipe.

For a specialist recipe or its first-run checklist, load [specialist receipt and review](specialist-guide.md). It owns the visible input/artifact/review/next-action contract; derive the checklist from that receipt rather than loose prose.

## Team / Role OS

Use for roles passing work across boundaries, such as recruiting, scheduling, and shift support. Local role context, justified shared reference, and handoff artifacts expose ownership and coordination.

### First run

Name the first role, handoff artifact, and receiving role. Human review checks summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action. The receiving role uses the reviewed artifact, not chat memory.

## Coding Repository

Use for source repositories/monorepos where an agent needs a boundary, entry point, constraints, and verification source without loading the whole repository.

A small/cohesive repository can embed its map in root routing. Larger/hybrid repositories may use `CONTEXT-MAP.md` and local context at meaningful boundaries. Reuse adequate architecture/developer guidance instead of duplicating it. Root routing owns behavior/task routes, the map indexes boundaries, and local context holds boundary detail. For mapping choices and evidence requirements, load [coding adoption](coding-adoption-guide.md).

### First run

The user states a normal coding task. Follow root routing to the map/equivalent, owning boundary, supported entry point, and authoritative checks; make the smallest appropriate change. Human review covers the diff/check result with cross-boundary effects and unknowns visible.

## Custom / Existing Structure

Use when existing organization works or standard profiles don't fit. Evaluate routing, context locality, security, output boundaries, and stale-context risk rather than preferred path names.

### First run

Follow visible routing and the existing review/handoff convention. A missing review surface is a maintenance suggestion, not authority to impose a layout rewrite.
