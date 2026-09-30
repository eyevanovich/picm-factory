# Layout Profiles

Layout profiles are recommendations, not validation laws. Choose one primary profile for a mixed workspace and borrow a secondary pattern sparingly. **Coding Repository** can be primary or a composable codebase-map capability alongside another profile.

## Stage Pipeline

Best for repeatable ordered work with different inputs/outputs and human review between steps.

```text
01_discovery/
  CONTEXT.md
  output/        # only for real reviewable artifacts
02_mapping/
  CONTEXT.md
03_production/
  CONTEXT.md
04_validation/
  CONTEXT.md
```

A nested `stages/01_discovery/` shape is equally valid. Each active stage has a local `CONTEXT.md` stating Purpose, Inputs, Process, Outputs, optional Verify checks, and Handoff/review. Distinguish stable reference from per-run working artifacts when it affects what the agent should trust. Outputs consumed downstream name an inspectable artifact or review surface.

First-run guidance is path-specific: start in the first stage, create its named output, stop for human review/editing, keep gaps or unsupported claims visible, then continue from the reviewed artifact. Name every meaningful intermediate review point.

### Placement decision

After Stage Pipeline is confirmed and before choosing paths:

- honor an explicit seeded placement (`01_intake/` or `stages/01_intake/`);
- otherwise ask whether stages should be root-numbered or nested under `stages/`;
- choose root-numbered only when the user has no preference, especially when immediate visibility helps; and
- prefer nesting when the root already has many persistent folders or the user wants a cleaner root.

Use the selected shape consistently in generated paths, config hints, and first-run guidance.

## Specialist Folder

Best for one reusable expert/helper where domain rules and examples matter more than ordered stages.

```text
identity.md
rules.md
examples.md
reference/
workflows/
```

`identity.md`, `rules.md`, and `examples.md` are optional. Create them only for identified reusable guidance or real examples; otherwise add them after real use reveals a need.

### Visible first-run receipt

A specialist recipe should begin with one visible receipt that makes first-run routing inspectable. This is methodology for the generated workspace, not a mandatory runtime tool or authorization mechanism. Use a concise fenced JSON object such as:

````markdown
```picm-specialist-first-run
{"version":1,"inputs":[{"path":"reference/style.md","availability":"scaffolded","description":"Reusable style guidance"},{"path":"source/request.md","availability":"per-run","description":"Material supplied for this run"}],"expectedArtifact":"review/result.md","review":{"requiresInspectEditApprove":true,"visibleUncertainty":["unsupported claims"]},"nextAction":{"source":"review/result.md"}}
```
````

The receipt names unique local inputs, the expected artifact, visible uncertainty, required human review, and the source for the next action. Require `nextAction.source` to equal `expectedArtifact` so downstream work uses the reviewed artifact. `scaffolded` means the input is created in this scaffold, `pre-existing` means it already exists, and `per-run` means the user supplies it for each run; create every `scaffolded` input and do not invent an unavailable `pre-existing` route. Keep any retained `paths.firstRecipe`, generated-input, or runtime-input hints aligned with it. Use it—not loose recipe prose—to derive the first-run checklist. An older prose-only recipe can gain a receipt through an agreed edit; do not silently rewrite it.

Before a subsequent specialist action, the expected artifact receives the review its receipt describes. Keep uncertainty visible in the artifact or review notes. After review, distinguish one-off edits from durable lessons that belong in an existing approved `rules.md`, `examples.md`, or `reference/` route; never invent optional folders or operations merely to fill a layout.

## Team / Role OS

Best for multiple roles passing work between boundaries.

```text
market-intel/
client-comms/
transaction-coordination/
shared-reference/
handoffs/
```

Use when role ownership and handoff context matter. Consider local `AGENTS.md` only for independent Pi/subagent working directories; otherwise local `CONTEXT.md` keeps routing lighter.

First-run guidance names the first role, the handoff artifact, and the receiving role. Human review checks summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action. Keep uncertainty visible and have the receiving role use the reviewed handoff rather than chat memory.

## Coding Repository

Best for source repositories and monorepos where an agent must find the architectural boundary, entry point, constraints, and verification source without loading the whole repository.

Small repositories can keep a concise map in root `AGENTS.md`. Larger or hybrid repositories commonly use:

```text
AGENTS.md              # behavior and task routing
CONTEXT-MAP.md         # repository boundary/context index
apps/
  web/CONTEXT.md       # only at meaningful boundaries
packages/
  shared/
workflows/             # optional overlapping workflow layout
```

Use a **root map** for a small/cohesive repository, **distributed map** for user-confirmed meaningful boundaries, and **scan and recommend** for a bounded topology assessment before choosing. Reuse adequate `ARCHITECTURE.md` or equivalent rather than duplicating it.

Root routing owns behavior and task-to-context routing. A map indexes areas, responsibility, authoritative context, entry points, and verification sources. Local `CONTEXT.md` holds boundary detail. Keep one fact home; do not duplicate instructions across all three.

A useful map identifies repository purpose, meaningful boundaries, local context/docs, entry/public surfaces, tests or authoritative verification sources, cross-boundary constraints, generated/do-not-edit areas, and explicit unknowns. Prefer pointers to manifests, scripts, tests, and decisions over copied command lists or dependency graphs. Optional impact notes or `live`/`leftover`/`ghost`/`unknown` status belong only when they reduce navigation uncertainty and are supported by evidence or user confirmation.

The first-run checklist tells the user to state a normal coding task. The agent follows root routing to the map/equivalent, owning boundary, entry point, and authoritative checks; the user reviews the diff and check result while cross-boundary effects and unknowns remain visible.

## Custom / Existing Structure

Use when existing organization works or the workspace does not fit a standard profile. Validate routing clarity, context locality, security, output boundaries, and stale-context risk; do not fail it because paths differ from defaults. Follow the visible route and review/handoff convention in first-run guidance, and mark a missing review surface as a maintenance suggestion rather than forcing a profile rewrite.

## Local context vs local instructions

Default scaffolds use root `AGENTS.md` plus local `CONTEXT.md`. Root instructions tell the agent when to load `CONTEXT.md` or `CONTEXT-MAP.md`; local/buried `AGENTS.md` is for hard local behavior rules or an independent working directory. Visible workspace files are the routing source of truth, while `.picm/` remains maintainer metadata and normal workflow routing skips it.
