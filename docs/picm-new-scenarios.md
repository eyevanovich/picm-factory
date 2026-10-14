# `/picm-new` Manual Scenario Checklist

Use these scenarios to smoke-test the `/picm-new` flow. The flow is intentionally interview-led and opinionated, so these are manual/evaluation checks rather than unit tests.

## General expectations

For every scenario, `/picm-new` should:

- load the `picm-factory` skill and relevant references
- inspect the current folder lightly and ask about sensitive or excluded material when needed
- honor Git ignores, configured/session exclusions, and known sensitive paths as discovery defaults without claiming host-tool enforcement
- recommend a user-created Git checkpoint for substantial existing-content changes when useful; it never blocks the flow
- recommend one primary layout profile and explain alternatives
- present a concise final direction covering affected file/folder actions and material uncertainty, then wait for conversational sign-off before writing
- avoid unresolved bracket placeholders in generated files
- ask or infer “What will you run first?” before proposing extra stages, roles, folders, references, or examples
- write minimal, useful context instead of one-time artifact scatter
- include only paths that support the first real run, required routing/safety, or a known reusable constraint
- recommend adding references/examples after the first real use when none exist instead of creating placeholders
- never auto-commit, auto-run `git init`, move, rename, delete, or silently overwrite files

## Scenario 1: empty-enough folder

Setup examples:

```bash
mkdir /tmp/picm-new-empty
cd /tmp/picm-new-empty
git init
touch README.md .gitignore
mkdir -p .pi .vscode
npm init -y
```

Expected behavior:

- classifies the folder as empty enough
- accepts common package/editor noise such as `package.json`, lockfiles, `.pi/`, `.vscode/`, `.idea/`, and `.DS_Store`
- runs or seeds the core interview
- creates a minimal scaffold after conversational sign-off on the final direction, normally including `AGENTS.md`, `CONTEXT.md`, `.picm/config.json`, and layout-specific folders/files
- explains that `.picm/config.json` resolves `createdAt` at write time and writes a canonical ISO 8601 UTC timestamp without adding a separate sign-off step
- creates references/examples/input/output folders only when the interview justifies them

## Scenario 2: source-material-only folder

Setup examples:

```bash
mkdir /tmp/picm-new-source
cd /tmp/picm-new-source
git init
mkdir docs notes assets data
printf 'raw notes\n' > notes/interview-notes.md
```

Expected behavior:

- classifies the folder as source-material-only, not existing architecture
- asks whether to build the PiCM scaffold around existing material without moving or rewriting it
- recommends `/picm-adopt` only if the current structure appears to encode an existing workspace architecture
- when sensitive/private/local-only material is identified, offers exact optional `.gitignore` entries for commit protection even when root `.gitignore` is absent
- for a named local-only session exclusion such as `notes/local-only.md`, explains that the agent should avoid it during discovery but that this does not protect future Git commits; separately offers `/notes/local-only.md` as an optional root `/.gitignore` entry without writing it
- persists agreed PiCM exclusions in `.picm/config.json` as part of the signed-off direction or keeps them session-only

## Scenario 3: existing architecture folder

Setup examples:

```bash
mkdir /tmp/picm-new-architecture
cd /tmp/picm-new-architecture
git init
mkdir workflows reference 01_discovery
printf '# Existing instructions\n' > AGENTS.md
printf '# Existing context\n' > CONTEXT.md
```

Expected behavior:

- detects existing architecture from files/folders such as `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `REFERENCES.md`, `identity.md`, `rules.md`, `examples.md`, `workflows/`, `reference/`, numbered stage folders, `stages/`, or `.picm/`
- recommends `/picm-adopt` and asks the user to choose adoption, an add/replace scaffold direction, or cancellation
- after a clear add/replace direction, inspects only the needed architecture and drafts a concise final direction
- waits for conversational sign-off on that final direction before any create, update, or overwrite action
- treats cancellation or ambiguous input as a reason to clarify rather than permission to overwrite architecture

## Scenario 4: no git or dirty git

Setup examples:

```bash
mkdir /tmp/picm-new-no-git
cd /tmp/picm-new-no-git
```

or:

```bash
mkdir /tmp/picm-new-dirty
cd /tmp/picm-new-dirty
git init
touch changed.md
```

Expected behavior:

- for substantial existing-content changes, strongly recommends a user-created Git checkpoint covering current contents of affected existing files; it does not inspect Git status, history, or file contents to verify coverage, or initialize, stage, commit, reset, clean, or restore Git automatically
- keeps non-Git and new/empty workspaces supported; a first post-scaffold commit protects future contents only

## Scenario 5: seeded command arguments

Example prompt:

```text
/picm-new customer research pipeline for turning interview transcripts into product insights
```

Expected behavior:

- uses the argument text as seed context
- asks only missing critical questions instead of restarting the whole interview
- still performs folder safety, advisory Git checkpoint guidance, security/privacy handling, layout confirmation, and final-direction planning

## Scenario 6: stage pipeline layout choice

Expected behavior when Stage Pipeline is confirmed:

- follows the Stage Pipeline **Placement decision** in `../skills/picm-factory/references/layout-profiles.md`
- uses the selected placement consistently in the final direction, generated paths, config path hints, and first-run checklist
- uses local `CONTEXT.md` files for stage-specific context
- creates local `AGENTS.md` only if a stage needs hard local behavior rules or independent Pi/subagent cwd execution
- after the complete Stage Pipeline final direction, waits for conversational sign-off before writing
- writes the aligned scaffold without repeated approval, while seeking renewed alignment for a material departure

## Scenario 7: generated file quality

Inspect generated files after creation.

Expected behavior:

- no unresolved bracket placeholders such as `[WORKFLOW NAME]`
- unknowns are written as explicit notes like “To define after the first real run”
- `.picm/config.json` contains minimal metadata only, such as version, profile, generatedBy, createdAt, and key paths
- no `.picm/scaffold-report.md` by default

## Scenario 8: minimum viable specialist scaffold

Example prompt:

```text
/picm-new Create a reusable specialist that turns one public meeting note into a concise action summary. The first run should use notes/meeting.md and produce review/action-summary.md. We do not have stable references or golden examples yet. No sensitive data.
```

Expected behavior:

- asks or confirms that converting the named meeting note is what the user will run first
- recommends Specialist Folder but creates only root routing/context plus one real specialist workflow or local context needed for that run
- does not create unused roles, future workflow recipes, `examples.md`, or empty `reference/`, `input/`, or `output/` areas
- points to the first real input and review output without moving or rewriting the source note
- recommends adding references/examples after the first real use reveals durable rules or a genuine golden example
- preserves security, advisory Git guidance, profile confirmation, final-direction sign-off, and meaningful review gates

## Scenario 9: tailored first-run checklist

Inspect the final `/picm-new` transcript after scaffold creation.

Expected behavior for every selected layout:

- names the actual generated folder/file where the first real run starts
- names the first output, draft, review surface, or handoff artifact to create/update
- says what a human should inspect/edit/approve before downstream work consumes it
- says what gaps, unknowns, blockers, risks, unsupported claims, or low-confidence points should remain visible
- names where the next stage, role, or specialist action reads from
- recommends `/picm-maintain` after the first real workflow/use/handoff and whenever the process changes

Stage Pipeline specifics:

- final guidance tells the user to stop between stages and review/edit each named intermediate output before the downstream stage consumes it
- if a contract names a future `output/...` path without creating an empty directory, final guidance says the first run should create the artifact there

Team / Role OS specifics:

- final guidance names the first role/folder, the handoff review point, and the receiving role/folder
- handoff review preserves summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action
- downstream roles work from the reviewed handoff, not chat memory

Specialist Folder specifics:

- final guidance derives every detail from approved generated routes; it names the exact first workflow/task recipe path, its inputs, and expected artifact
- it requires an explicit human inspect/edit/approve gate, keeps recipe-named uncertainty visible, and names the approved artifact as where the next specialist action reads from
- it tells the user to promote lessons into an approved existing stable rules/examples/reference route only after review shows they should affect future runs; it does not invent optional folders, recipes, or operations
- it recommends `/picm-maintain` after the first real use or a specialist workflow, routing, or stable-guidance change
