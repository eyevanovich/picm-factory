# Layout Profiles

Layout profiles are recommendations, not validation laws. Users can organize differently if the structure remains legible and routable.

When a workflow has mixed signals, recommend one primary profile for legibility and borrow a secondary pattern sparingly. Do not default to Custom just because the workflow has both stages and a specialist or both roles and reference material.

## Stage Pipeline

Best for repeatable workflows with ordered steps.

Common shapes:

```text
01_discovery/
  CONTEXT.md
  output/        # only when this stage produces reviewable artifacts for downstream use
02_mapping/
  CONTEXT.md
03_production/
  CONTEXT.md
04_validation/
  CONTEXT.md
```

or:

```text
stages/
├── 01_discovery/
│   ├── CONTEXT.md
│   └── output/  # optional review/edit surface for produced artifacts
├── 02_mapping/
│   └── CONTEXT.md
├── 03_production/
│   └── CONTEXT.md
└── 04_validation/
    └── CONTEXT.md
```

Use when:

- work usually moves in a sequence
- each step has different inputs/outputs
- human review happens between steps
- the user wants to see process order at a glance

For each active stage, generate a local `CONTEXT.md` contract that states its Purpose, Inputs, Process, Outputs, optional Verify checks, and Handoff/review gate. Inputs should distinguish stable reference material from per-run working artifacts when that distinction affects what the agent should load or trust. Outputs should point to a named inspectable artifact or review surface when another stage consumes the result.

First-run ending guidance for this profile should be path-specific: tell the user to start in the first stage folder and read its `CONTEXT.md`; produce the first named output/review artifact; stop before the downstream stage; inspect/edit/approve the artifact and record gaps or unsupported claims visibly; then run the next stage from that approved edited artifact. When the scaffold has multiple handoffs, name each intermediate output review/edit point before the downstream stage consumes it. If the contract names a future `output/...` path but no physical empty directory was created, explain that the first run should create the artifact at that path.

Ask follow-up:

- Root numbered folders or nested `stages/`?

Default recommendation:

- Root numbered folders when the user has no preference, and especially for non-technical users who benefit from seeing the workflow immediately.
- Nested `stages/` when the root already has many persistent folders or the user prefers cleaner root organization.

## Specialist Folder

Best for one reusable expert/helper.

Common shape:

```text
identity.md
rules.md
examples.md
reference/
workflows/
```

Use when:

- the value is a narrow expert role
- domain rules and examples matter more than ordered stages
- the workflow may have several task recipes under `workflows/`

Only create `examples.md` when real golden examples or anti-examples are available or the user explicitly wants an example area. Otherwise mention that examples should be added after the first real run.

First-run ending guidance for this profile should name the first workflow/task recipe to run, the first result/draft to inspect, and the decision point after review: keep corrections as one-off output edits, or promote stable lessons into `rules.md`, `examples.md`, or `reference/` when they should affect future runs.

Examples from references:

- Voiceprint-style writing specialist
- Customs tool development specialist

## Team / Role OS

Best for multiple roles passing work between each other.

Common shape:

```text
market-intel/
client-comms/
transaction-coordination/
shared-reference/
handoffs/
```

Use when:

- the workspace represents a team or service operation
- work crosses role boundaries
- handoff context matters
- each role needs its own local rules/context

Recommend handoff cards when:

- downstream roles need context, not just a command
- unknowns and gaps must stay visible
- work can move backward after review

For roles likely to run as independent Pi/subagent working directories, consider local `AGENTS.md` files. Otherwise prefer local `CONTEXT.md` files to avoid stale routing instructions.

First-run ending guidance for this profile should name the first role/folder to use, the handoff card or agreed handoff artifact to create/update before another role acts, and the receiving role/folder that consumes it. The handoff review point should require a human to check summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action. Tell the user to keep uncertainty visible instead of smoothing it into confident instructions; downstream roles should work from the reviewed handoff, not chat memory.

## Custom / Existing Structure

Best when the user already has a working organization or the workflow does not match a standard profile.

Use when:

- adopting an existing ICM project
- user has strong folder preferences
- project has mixed stage/specialist/role behavior

Maintenance should validate principles:

- routing clarity
- context locality
- security
- output boundaries
- stale context risk

Do not fail because paths differ from defaults.

First-run ending guidance for this profile should follow the visible routing source and name the generated or existing folder/file where first work begins. Use the review/handoff convention that actually exists. If no inspectable output or handoff surface exists yet, mention it as a `/picm-maintain` follow-up rather than forcing a stage/role rewrite during `/picm-new`.

## Local context vs local instructions

Default scaffolds should use one root `AGENTS.md` plus local `CONTEXT.md` files. Pi auto-loads `AGENTS.md`/`CLAUDE.md` from the current directory and parent directories, while `CONTEXT.md` is read because the root routing file tells the agent when to read it.

Create local/buried `AGENTS.md` only when a folder needs hard local behavior rules or is likely to be used as an independent Pi/subagent working directory. Examples:

- a review folder where the agent must never produce final approval
- a publishing folder where the agent must prepare a checklist but never publish
- a data folder where raw inputs must never be modified in place
