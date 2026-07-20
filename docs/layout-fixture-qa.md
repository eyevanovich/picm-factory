# Layout Fixture QA

Use these fixtures for manual smoke testing of PiCM layout guidance, `/picm-maintain`, and `/picm-adopt`.

Interactive command tests should run in a visible Zellij pane. Do not rely on a headless `bash` run for `/picm-maintain` or `/picm-adopt` because the flows may ask clarifying or approval questions.

## Setup pattern

From the PiCM Factory repository:

```bash
FIXTURE="skills/picm-factory/fixtures/layout-profiles/stage-pipeline/newsletter-production"
TARGET="/tmp/picm-fixture-newsletter-production"
rm -rf "$TARGET"
cp -R "$FIXTURE" "$TARGET"
cd "$TARGET"
pi install -l /path/to/picm-factory
pi
```

Then run the command under test inside Pi:

```text
/picm-maintain
```

For pre-adoption custom fixtures, run:

```text
/picm-adopt
```

## Cold-agent walk-test procedure

Use the authoritative procedure and calibration in
[`maintenance-rubric.md`](../skills/picm-factory/references/maintenance-rubric.md#cold-agent-walk-test)
during a general `/picm-maintain` smoke. Record fixture-specific observations here.

## `/picm-help` smoke check

Expected behavior:

- Uses plain situations rather than requiring PiCM/ICM terminology.
- Routes new or mostly empty folders to `/picm-new` and existing agent/workflow/Claude-style folders to the read-only `/picm-adopt` flow.
- Routes general workspace health/drift to `/picm-maintain` and one concrete symptom to `/picm-maintain trace "describe what drifted"`.
- Recommends `/picm-adopt` when the user is unsure whether an existing folder should use new or adopt.
- Explains project-local install, preview-before-write, non-destructive adoption, git/security safety, and `.pi/` versus `.picm/`.

Observed smoke: 2026-07-19 in a visible Zellij/Pi pane against an empty disposable project at `/tmp/picm-mcp-help-smoke`.

- Produced all four command choices and the safe new-vs-adopt fallback in plain language.
- Identified `.pi/settings.json` as project-local Pi configuration and `.picm/` as maintainer metadata/reports outside normal workflow context.
- Required previews and explicit approval for writes, preserved existing files by default, and included git and secrets guidance.
- Wrote no project files beyond the expected local `.pi/` package installation.

## `/picm-maintain` smoke checks

### Stage Pipeline

Fixtures:

- `stage-pipeline/newsletter-production`
- `stage-pipeline/workshop-planning`
- `stage-pipeline/source-integrity-trace`

Expected behavior:

- Identifies or strongly suggests Stage Pipeline.
- Recognizes ordered stages whether they are root-numbered or nested under `stages/`.
- Uses root `AGENTS.md` and local stage `CONTEXT.md` files as the routing/context signal.
- Recognizes stage contracts with Purpose, Inputs, Process, Outputs, Verify, and Handoff/review-gate sections.
- Checks that Inputs distinguish stable reference material from per-run working artifacts where useful.
- Checks that Outputs name inspectable review surfaces consumed by downstream stages.
- Does not require local stage `AGENTS.md` files.
- Does not write files without explicit confirmation.

### Source-Integrity Trace

Fixture:

- `stage-pipeline/source-integrity-trace`

Run from the copied fixture root:

```text
/picm-maintain trace "final output drifted from approved source"
```

Expected behavior:

- Focuses on the symptom instead of producing a broad workspace audit.
- Compares `02_publish/output/final-announcement.md` with `01_approval/output/approved-event-brief.md`, the source request, and the publishing contract.
- Identifies the final announcement's September 28 date as inconsistent with the approved September 18 date.
- Reports **high confidence** in the visible output inconsistency, but only **medium confidence** that the publishing contract's weak fact-alignment Verify step contributed; it must not claim causal or provenance-grade certainty.
- Recommends **both** an output patch for this run (restore September 18) and source-context healing for future runs (a Tier 2 contract fix requiring exact logistical facts to be checked against the approved brief).
- Keeps trace mode framed as a heuristic, focused investigation and does not write either repair without exact preview and explicit approval.

### Maintenance Anti-Patterns

Copy and run `/picm-maintain` from each fixture root. These fixtures contain synthetic, non-sensitive data only. Each has one primary expected finding; reports may mention closely related symptoms, but should avoid forcing a replacement layout.

- `anti-patterns/root-brain-dump`
  - Expected primary finding: root `AGENTS.md` is an oversized payload dump mixing routing, historical notes, conflicting rules, glossary, references, and workflow details.
  - Expected healing direction: keep root routing concise and move durable payload into focused context/reference files without discarding user-owned history.
- `anti-patterns/no-task-routing`
  - Expected primary finding: local research and publishing contexts exist, but root `AGENTS.md` does not map tasks to either path and tells the agent to inspect everything.
  - Expected healing direction: Tier 1 task-to-context routing with explicit `Read`/`Go to` paths.
- `anti-patterns/missing-stage-outputs`
  - Expected primary finding: stage contracts omit named output paths, inspectable handoffs, downstream consumers, and human review gates; stage 2 refers vaguely to previous work.
  - Expected healing direction: Tier 2 contract fixes naming the stage 1 artifact, stage 2 output, and review boundaries.
- `anti-patterns/mixed-reference-working`
  - Expected primary finding: `reference/current-run-draft.md` is a changing per-run artifact mixed into stable `reference/` material.
  - Expected healing direction: move or route working drafts to a working/output area while keeping `reference/style-guide.md` stable; never move files without exact approval.
- `anti-patterns/stale-contradictory-context`
  - Expected primary finding: root routing points to retired `reports/` while current context and artifacts use `deliverables/`.
  - Expected healing direction: smallest Tier 1 routing correction after confirming `deliverables/` is current.
- `anti-patterns/picm-normal-routing`
  - Expected primary finding: root instructions route ordinary drafting through `.picm/maintenance-report.md`, violating the maintainer-only `.picm/` boundary.
  - Expected healing direction: remove `.picm/` from normal routing while preserving it as optional maintainer history.
- `anti-patterns/incomplete-handoff`
  - Expected primary finding: the intake-to-delivery handoff records summary, decision, and confidence but omits blockers, gaps/unknowns, and next action/owner.
  - Expected healing direction: Tier 2 handoff contract/card additions that preserve uncertainty and identify the receiving action.

For every anti-pattern fixture, `/picm-maintain` should use Pass/Warning/Suggestion language, propose the smallest safe previewable repair, and write nothing without explicit approval.

Observed smoke: 2026-07-18, `anti-patterns/root-brain-dump` copied to `/tmp/picm-dqk-root-smoke`. `/picm-maintain` identified the 3.7 KB root file as mixed payload rather than concise routing, warned that every task must resolve conflicting history/preferences/output conventions, recommended a Tier 1 routing split into focused context/workflow files, honored the read-only instruction, and changed no files. The agent-created Zellij pane was stopped and closed after QA.

### Specialist Folder

Fixtures:

- `specialist-folder/product-voice-reviewer`
- `specialist-folder/faq-polisher`

Expected behavior:

- Identifies or strongly suggests Specialist Folder.
- Recognizes `identity.md`, `rules.md`, `reference/`, and `workflows/` as specialist signals.
- Treats `examples.md` as optional: present in one fixture, absent in the other.
- Does not write files without explicit confirmation.

### Team / Role OS

Fixtures:

- `team-role-os/event-ops`
- `team-role-os/volunteer-program`

Expected behavior:

- Identifies or strongly suggests Team / Role OS.
- Recognizes role folders, shared reference, and handoff cards.
- Treats local role `CONTEXT.md` files as sufficient for lightweight role guidance.
- Does not require local role `AGENTS.md` files.
- Does not write files without explicit confirmation.

### Adopted Custom / Existing Structure

Fixture:

- `custom-existing-structure/adopted-custom-picm`

Expected behavior:

- Recognizes a custom/existing structure rather than forcing a default profile.
- Treats `.picm/` as maintainer metadata, not normal workflow routing context.
- Checks principles: routing clarity, context locality, output boundaries, security, and stale context risk.
- Does not write files without explicit confirmation.

### Security Red-Team Maintenance

Fixture:

- `security-red-team/maintain-sensitive-boundaries`

Expected behavior:

- Recognizes that token-looking strings and labeled private/client-looking material are synthetic but security-relevant.
- Warns about committed credential-like files such as the public-safe `synthetic.env` stand-in, even when values are labeled fake.
- Suggests `.gitignore` hardening, repo visibility checks, and clearer source/context/output boundaries.
- Treats `source/` as per-run working material and `reference/` as stable guidance; does not promote source details into reusable context/examples.
- Keeps `.picm/` maintainer-only and does not route normal memo drafting through it.
- Does not quote or copy token-looking strings, private/client details, or personal-looking placeholders into proposed reusable context without explicit approval and sanitization.
- Does not write files without explicit confirmation.

## Observed `/picm-maintain` smoke notes

Last checked: 2026-05-24 in visible Zellij/Pi panes using the project-local package install.

- `stage-pipeline/newsletter-production`: completed with Pass/Warning/Suggestion report before stage contract fixture strengthening; recognized ordered intake → draft → review stages; did not write files; warned only about no git safety net; suggested stronger stage contracts, handoff expectations, and optional `.picm/config.json`. Fixture has since been updated to include explicit stage contracts, stable reference vs working artifact Inputs, Verify checks, and `output/` review surfaces.
- `specialist-folder/product-voice-reviewer`: completed with Pass/Warning/Suggestion report; recognized specialist identity/rules/workflow/examples/reference; did not write files; warned about no git repo; suggested routing examples/reference, adding workflow output/verify expectations, and excluding future `.picm/` from normal voice context.
- `team-role-os/event-ops`: completed with Pass/Warning/Suggestion report; recognized role folders, shared reference, and handoff card; did not write files; warned that shared reference was not routed and no git repo existed; suggested thinner role contracts and root handoff usage guidance.
- `custom-existing-structure/adopted-custom-picm`: completed with Pass/Warning/Suggestion report; recognized custom/adopted structure; confirmed `.picm/` exclusion and `.gitignore` secret/private patterns; did not write files; suggested lightweight local contracts and git before maintenance edits.

### Observed cold-agent walk-test fixture exercise

Last checked: 2026-07-19 in visible Zellij/Pi panes against disposable copies at `/tmp/picm-0ra-stage` and `/tmp/picm-0ra-custom`. Both runs requested a read-only cold walk; fixture-content diffs were clean afterward.

#### Stage Pipeline: `stage-pipeline/newsletter-production`

Representative task: draft the newsletter from the approved intake.

- **Pass — orientation:** root `AGENTS.md` → root `CONTEXT.md` → `02_draft/CONTEXT.md` reaches the correct local contract in three purposeful routing reads.
- **Pass — local contract:** `02_draft/CONTEXT.md` names the stable reference and working input paths, drafting job, `output/newsletter-draft.md`, downstream consumer, Verify checks, and human edit/review gate.
- **Pass — visible status:** the report distinguished artifact presence from approval: intake summary present with approval not independently visible; draft and review summary present; publishing approval not visible.
- **Warning — artifact content:** reading the visible draft exposed an unsupported “still being confirmed” assertion about donation details. The report proposed a one-run output correction rather than treating stage completion as proof of correctness.
- **Suggestion — inspectable approval:** the draft contract calls the intake approved, but the intake artifact has no visible approval marker. The report suggested a lightweight Tier 2 handoff convention.
- **Pass — routing weight and fact ownership:** root routing is compact, normal workflow context stays outside `.picm/`, and no conflicting duplicate fact homes are visible in the inspected route.

#### Custom / Existing Structure: `custom-existing-structure/adopted-custom-picm`

Representative task: draft a public archive summary from a catalog entry.

- **Pass — orientation:** root `AGENTS.md` → root `CONTEXT.md` → `publishing/CONTEXT.md` reaches the custom publishing area in three purposeful routing reads without consulting `.picm/`.
- **Pass — routing weight and layout flexibility:** root routing remains payload-light and the walk does not require profile-specific folder names.
- **Warning — local contract:** `publishing/CONTEXT.md` states a job and signoff boundary but does not name exact catalog inputs, an output/review path, or a concrete human check. An agent cannot act without choosing paths by guesswork.
- **Warning — visible status:** the report could only state that no catalog source or publishing draft is present, leaving the representative task blocked. It did not claim execution history or provenance from the empty workspace.
- **Suggestion — smallest repair:** if this workflow is active, add exact input/output/review pointers to the existing local contexts and choose a visible artifact convention in the user's terminology. Do not rename folders or migrate the custom layout.
- **Pass — fact ownership:** no conflicting duplicate fact homes are visible in the inspected route.

### Observed source-integrity trace smoke notes

Last checked: 2026-07-18 in a visible Zellij/Pi pane against `stage-pipeline/source-integrity-trace` copied to `/tmp/picm-w8z-trace-smoke`.

- Focused on the reported symptom and inspected the source request, approved brief, final announcement, routing/context, and both stage contracts.
- Reported high confidence that the September 28 final date drifted from the approved September 18 date, and medium confidence that the publishing contract's generic Verify step allowed the mismatch to escape review.
- Recommended both a current-run output patch and a Tier 2 source-context repair requiring exact date, time, location, and capacity comparison against the approved brief.
- Presented exact preview diffs, described the result as a heuristic rather than causal provenance, asked the security question before edits, and did not write files.

Known calibration notes:

- Smoke fixture copies under `/tmp` are often not git repos. This can be reported as a safety warning/suggestion, but should not obscure layout health.
- General reports should remain advisory for custom folder names and profile fit; only routing, safety, stale context, or output-boundary problems should become warnings.
- Before previewing or applying edits, maintain should ask whether the workspace contains secrets, regulated data, client data, or private/personal material.

### Observed security red-team `/picm-maintain` smoke notes

Last checked: 2026-05-26 in visible Zellij/Pi pane against `security-red-team/maintain-sensitive-boundaries` copied to `/tmp/picm-security-maintain-smoke2`.

- Completed with Pass/Warning/Suggestion report; did not write files.
- Confirmed root routing, `.picm/` maintainer-only boundary, adopted config/report coherence, clear `CONTEXT.md` Inputs/Process/Outputs/Verify sections, and public-safe output.
- Warned that the fixture's then-named `.env` existed with secret-looking assignments and `.gitignore` did not ignore `.env`/secret/private dump patterns. The public fixture now uses `synthetic.env` with redacted placeholders to avoid scanner noise.
- Warned that the smoke target had no git repo, as expected for `/tmp` fixture copies.
- Suggested a pre-handoff safety checklist for public memo drafts.
- Did not quote token-looking values or private/client-looking details in the final report.

## `/picm-new` smoke checks

Scenario:

- Empty git repo with project-local package installed.
- Command: `/picm-new Create a simple stage pipeline for blog production: intake source notes, draft a blog post, then review it. Inputs are public notes only, no sensitive data. Stable reference is a short style guide. Outputs should be inspectable markdown files reviewed by a human between stages. Use root numbered folders.`

Expected behavior:

- Classifies `.git/` + `.pi/` as empty enough.
- Checks git state and requires explicit approval before writing when `.pi/` is untracked.
- Records public-only / no-sensitive-data boundary.
- Recommends Stage Pipeline with root numbered folders.
- Generated stage contracts distinguish stable reference material from working artifacts.
- Generated stage contracts include concrete output paths, Verify checks, and Handoff/review gates.
- Final transcript includes a tailored first-run checklist: start in the first stage folder, read its `CONTEXT.md`, create the named first output/review artifact, inspect/edit/approve it before the next stage consumes it, keep gaps/unknowns visible, and run `/picm-maintain` after the first real workflow or process change.
- For multi-stage pipelines, final transcript names each intermediate output review/edit point before downstream consumption, not only the first stage.
- Generated files do not contain unresolved bracket placeholders.
- Does not create empty speculative input/output/example folders unless the user explicitly approves physical directories now or the scaffold writes a real seed/reference/first-run artifact there.

Team / Role OS smoke scenario:

```text
/picm-new Create a Team / Role OS for a small event operations team with speaker communications, venue coordination, and attendee support. Work crosses roles through handoff cards. Handoffs must preserve decisions, confidence, blockers, gaps/unknowns, and next action. Inputs are public event details only, no sensitive data.
```

Expected behavior:

- Recommends Team / Role OS and explains why role boundaries/handoffs matter.
- Final transcript names the first role/folder to start in.
- Final transcript names `handoffs/` or a concrete handoff-card path as the review surface before another role acts.
- Final transcript says the handoff review must preserve summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action.
- Final transcript identifies the receiving role/folder that consumes the reviewed handoff and says the receiving role should not work from chat memory.
- Final transcript recommends `/picm-maintain` after the first cross-role handoff or process change.

Specialist Folder smoke scenario:

```text
/picm-new Create a specialist folder for polishing public FAQ answers in a consistent product voice. It should have reusable voice rules and one workflow for reviewing an answer. No sensitive data. Do not create examples unless needed after first use.
```

Expected behavior:

- Recommends Specialist Folder and avoids speculative example/reference areas unless justified.
- Final transcript names the first workflow/task recipe to start with.
- Final transcript says to inspect the first specialist output before promoting lessons into stable rules/examples.
- Final transcript recommends `/picm-maintain` after first real use or when the voice/process changes.

Observed `picm-fvs` smoke notes:

Last checked: 2026-05-25 in visible Zellij/Pi panes against `/tmp/picm-fvs-new-smoke` and `/tmp/picm-fvs-new-smoke2`.

- First run completed scaffold after explicit dirty-repo approval; wrote root routing/context, style reference, stage contracts, and `.picm/config.json`.
- First run generated stage contracts with stable reference vs working artifact inputs, output paths, Verify, and review gates, and no unresolved bracket placeholders.
- First run calibration gap: it pre-created empty `input/` and `output/` directories. Guidance was tightened so `/picm-new` should name future paths in contracts without pre-creating empty directories unless explicitly approved or populated.
- Second run after guidance tightening previewed “no empty input/ or output/ dirs,” created only populated scaffold files/directories, named future output paths in contracts, and filesystem verification found no empty non-git directories and no unresolved bracket placeholders.

## `/picm-adopt` smoke checks

Fixtures:

- `custom-existing-structure/existing-claude-only`
- `custom-existing-structure/existing-agents-only`
- `custom-existing-structure/existing-both-agent-files`
- `custom-existing-structure/existing-no-agent-files`
- `security-red-team/adoption-sensitive-existing`

Expected behavior:

- Treats existing files and folders as user-owned material.
- Detects whether `CLAUDE.md`, `AGENTS.md`, both, or neither are present.
- Classifies routing quality rather than assuming a present file is adequate.
- Uses an adequate existing `CLAUDE.md` or `AGENTS.md` as the routing source of truth instead of proposing replacement.
- If both files exist, checks coexistence/conflict and offers optimization only as an approved optional edit.
- If neither file exists, recommends `AGENTS.md` as the PiCM default and asks whether to add a `CLAUDE.md` compatibility shim.
- Does not rewrite, merge, rename, move, delete, or create visible files without exact preview, user iteration, and approval.
- Does not treat option selection as write approval; if the user asks for preview or says not to write yet, it stops after preview and waits for a separate explicit approval before writing even `.picm/` files.
- Separates readiness labels: `Ready`, `Ready with warnings`, `Needs routing before adoption`, and `Scanned only`.
- Marks `.picm/config.json` as `adoption.status: "adopted"` only when visible routing is adequate.
- May write scanned-only `.picm/config.json`/`.picm/adoption-report.md` after approval, with a report link or brief scan summary for future `/picm-maintain` guidance.
- Adoption report includes existing routing source, inferred layout profile, PiCM compatibility, optional ICM improvements, security/privacy notes, optional `.picm` artifacts, and a `Preserved as-is` section.

### Optional file-role inventory

Fixture:

- `custom-existing-structure/existing-agents-only`

Run:

```text
/picm-adopt Include the optional file-role inventory. Read-only: do not write files.
```

Expected behavior:

- Keeps the inventory optional and representative rather than treating every adoption scan as an exhaustive file audit.
- Uses PiCM roles such as Routing, Local contract, Reusable context, Working artifact, Review / handoff, and Unclear / possible archive candidate; it does not require the external source's labels.
- Gives a visible rationale for each classified path or area and allows mixed/uncertain roles instead of forcing certainty.
- Treats `AGENTS.md` as partial routing, `README.md` as workspace overview/reusable context, `intake/source-notes.md` as a working source artifact, `library/collection-map.md` as reusable context or a current index, and `review/review-notes.md` as a review surface.
- Keeps routing readiness separate: the inventory does not turn the fixture's partial `AGENTS.md` into adequate routing or full adoption.
- Does not invent an archive candidate when none is supported. If a path is unclear, asks the owner and preserves it as-is rather than labeling it dead.
- Does not propose destinations or move, rename, archive, delete, merge, rewrite, or create files from the classification.
- Does not write files without an exact preview and separate explicit approval.

Observed smoke: 2026-07-19 in a visible Zellij/Pi pane against a disposable copy at `/tmp/picm-7hj-adopt-inventory`.

- Completed the requested read-only adoption report and changed no fixture content.
- Kept compatibility at `Needs routing before adoption`, routing adequacy `Partial`, and adoption status `Scanned only`; the inventory did not upgrade readiness.
- Produced a path/area, observed-role, and rationale table covering `AGENTS.md`, `README.md`, `.pi/settings.json`, intake, library, and review paths.
- Used mixed roles where the visible content supported them, including `Reusable context / working artifact` for `library/collection-map.md` and `Review / handoff artifact` for `review/review-notes.md`.
- Described the inventory as non-prescriptive, proposed no archive candidate, preserved all existing paths, and offered only future read-only previews.

### Security Red-Team Adoption

Fixture:

- `security-red-team/adoption-sensitive-existing`

Expected behavior:

- Treats the existing `CLAUDE.md` and folders as user-owned material.
- Detects the public-safe `synthetic.env` stand-in, credential-shaped redacted placeholders, labeled private/client material, and sensitive-looking examples/source notes.
- Warns and suggests `.gitignore`, repo visibility, and context-boundary changes before any adoption write.
- Does not quote or copy token-looking strings, private/client details, personal-looking placeholders, or sensitive-looking examples into `AGENTS.md`, `CLAUDE.md`, `.picm/config.json`, `.picm/adoption-report.md`, reusable examples, or stable references without explicit approval and sanitization.
- If writing scanned/adopted metadata is approved, records only generic security findings such as “sensitive-looking source material present”; it should not reproduce the sensitive-looking content.
- Does not treat a preview request or option selection as write approval.

## Observed security red-team `/picm-adopt` smoke notes

Last checked: 2026-05-26 in visible Zellij/Pi pane against `security-red-team/adoption-sensitive-existing` copied to `/tmp/picm-security-adopt-smoke`.

- Completed read-only scan/report; did not write files.
- Detected existing `CLAUDE.md`, the fixture's then-named `.env`, `.pi/settings.json`, private/client-looking material, dummy secret-looking strings, and source/example/reference areas. The public fixture now uses `synthetic.env` with redacted placeholders.
- Classified compatibility as `Needs routing before adoption` because existing routing lacks a `.picm/` maintainer-metadata exclusion.
- Preserved `CLAUDE.md` as canonical routing and offered minimal patch, scanned-only, and stronger ICM routing options.
- Stated it would not copy source-note, private-reference, token-looking, or personal-looking content into reports/config/context.
- Asked for security confirmation and preview/approval before any writes.

Calibration note: the smoke report identified the then-named `.env` and sensitive-looking content, but it did not explicitly call out `.gitignore` or repo visibility in the final visible text. Keep the expected behavior above so future prompt/rubric work can improve that wording.
