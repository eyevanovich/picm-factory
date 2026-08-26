# Layout Fixture QA

Use these fixtures for manual smoke testing of PiCM layout guidance, `/picm-maintain`, `/picm-adopt`, and `/picm-optimize`.

Interactive command tests should run in a visible Zellij pane. Do not rely on a headless `bash` run for `/picm-maintain`, `/picm-adopt`, or `/picm-optimize` because the flows may ask clarifying or approval questions.

## Setup pattern

From the PiCM Factory repository:

```bash
FIXTURE="test/fixtures/layout-profiles/stage-pipeline/newsletter-production"
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

- Starts with a compact command-syntax and argument reference, says bare commands remain valid, and explains: type a space after `/picm-adopt` or `/picm-maintain` to show registered argument completions.
- Shows `/picm-new [workflow description]`, `/picm-adopt [coding | adoption request]`, `/picm-maintain [strict | balanced | coding | routing | handoffs | stale-context | security | trace "drift symptom"]`, and `/picm-optimize` as optional conversational arguments rather than required flags.
- Uses plain situations rather than requiring PiCM/ICM terminology.
- Routes new or mostly empty folders to `/picm-new` and existing source-code, agent/workflow, or Claude-style folders to the read-only `/picm-adopt` flow.
- Presents `/picm-adopt coding` as an optional shortcut for a known repository or monorepo while explaining that regular `/picm-adopt` can offer the same Coding Repository profile.
- Routes general workspace health/drift to `/picm-maintain` and one concrete symptom to `/picm-maintain trace "describe what drifted"`.
- Explains the Strict-first one-run selector, `/picm-maintain strict`, `/picm-maintain balanced`, no stored-preset mutation, and the exact Strict/Balanced behavior-and-cost guidance.
- Routes repetitive or diffuse agent-facing documentation to `/picm-optimize`.
- Recommends `/picm-adopt` when the user is unsure whether an existing folder should use new or adopt.
- Explains project-local install, preview-before-write, non-destructive adoption, git/security safety, and `.pi/` versus `.picm/`.

Baseline observed smoke before `/picm-optimize` was added: 2026-07-19 in a visible Zellij/Pi pane against an empty disposable project at `/tmp/picm-mcp-help-smoke`.

- Produced all four command choices and the safe new-vs-adopt fallback in plain language.
- Identified `.pi/settings.json` as project-local Pi configuration and `.picm/` as maintainer metadata/reports outside normal workflow context.
- Required previews and explicit approval for writes, preserved existing files by default, and included git and secrets guidance.
- Wrote no project files beyond the expected local `.pi/` package installation.

## `/picm-optimize` smoke check

Run against a disposable copy of `test/fixtures/coding-repository/existing-doc-duplication`.

Expected behavior:

- Completes `preflight`, the additional-path privacy question, `privacy`, `begin`, protected `inventory`, guarded reads, `end`, and final `complete`; it never uses agent Bash, broad traversal, Git history, symlink following, or another worktree to discover documentation.
- For an adopted or newly scaffolded workspace, asks exactly: "Name any additional project-relative files or directory that should be excluded from reads, or reply `none` to continue." An unknown or incomplete workspace uses the full privacy explanation.
- Inspects all agent-facing documentation in scope, including root/local instructions, context maps/contracts, routed reference/workflow docs, and prompt/skill guidance when present. It records protected, generated, unrelated, and uncertain omissions without opening excluded/private content.
- Identifies evidence-backed opportunities before drafting edits, distinguishes true duplication from intentional local safety or approval reminders, and builds a qualitative preservation ledger for unique safety, privacy, permission, approval, command, behavior, verification, handoff, and domain constraints.
- Treats conflicting agent-facing claims or duplicated guidance without a visible canonical home as a useful opportunity; it must offer a canonical-home, thin-pointer, or user-decision proposal rather than reporting a no-op solely because the evidence spans multiple documents.
- Offers independently selectable proposals, makes no semantic-equivalence or guaranteed token-savings claim, and does not manufacture a proposal when the current docs are already clear.
- Never proposes source/build/runtime, `.picm/`, generated-artifact, per-run output, or unrelated-workspace edits.
- Treats proposal selection as design intent only. Every selected write uses the complete concise summary, non-blocking review suggestions for material or uncertain changes, optional `View all` / `Select files` / `Return to summary` review, and direct explicit approval of the current summary. Draft adjustments supersede pending write approval while preserving applicable review state for unchanged paths.
- If no useful change is justified, reports exactly `No worthwhile optimizations found`.

## Coding Repository smoke checks

Fixtures:

- `test/fixtures/coding-repository/small-service`
- `test/fixtures/coding-repository/monorepo-distributed`
- `test/fixtures/coding-repository/hybrid-release-code`
- `test/fixtures/coding-repository/existing-doc-duplication`
- `test/fixtures/coding-repository/ignored-secrets-existing`

### Coding adoption entry paths

Run both regular and explicit entry paths against disposable Git copies:

```text
/picm-adopt
/picm-adopt coding
```

Expected behavior:

- After privacy review, regular `/picm-adopt` uses only shallow protected-inventory path signals before offering the Coding Repository profile; it does not require the shortcut.
- `/picm-adopt coding` skips the initial classification question but preserves the same security, scan, preview, and approval rules.
- The flow offers root, distributed, and scan-and-recommend mapping plus additive and curated adoption. It does not ask for maintenance depth: it automatically performs the Strict examination and previews `capabilities.codebaseMap.maintenancePreset: "strict"`.
- The user can choose Coding Repository as the primary profile or add codebase mapping to another primary profile.
- No files are written without a complete concise summary and direct explicit approval.

### Root and distributed maps

Expected behavior:

- `small-service` recognizes that the concise map can remain in `AGENTS.md`; it does not manufacture `CONTEXT-MAP.md` or local context for every folder.
- `monorepo-distributed` routes through `AGENTS.md` → `CONTEXT-MAP.md` → the selected app/package `CONTEXT.md`.
- Distributed mapping treats `apps/api` and `packages/shared` as meaningful boundaries because they have distinct responsibilities, entry points, and tests—not merely because they are workspace members.
- The map points to authoritative manifests/tests rather than copying large command or dependency inventories.
- It does not add impact notes merely to restate the visible `apps/api` → `packages/shared` import relationship.
- It omits operational status when status would not change navigation, and uses `unknown` rather than guessing when evidence is insufficient.
- Completion guidance separates user actions from agent behavior: it tells the user to state a normal coding task and review the presented diff/check result, while routing and verification remain expected agent behavior. It does not tell the user to open or read `AGENTS.md` or manually follow the repository map.

### Hybrid composition

Expected behavior for `hybrid-release-code`:

- Keeps Stage Pipeline as the primary profile and recognizes `capabilities.codebaseMap` as composable support.
- Allows `workflows/release` and coding scope to overlap.
- Routes ordinary code work through `CONTEXT-MAP.md`, release work through `workflows/release/CONTEXT.md`, and release-related code changes through both.
- Does not force every directory into exclusive coding or workflow ownership.

### Optional navigation-note calibration

Use disposable copies of `monorepo-distributed` and `hybrid-release-code` to test whether optional notes narrow context rather than add prose.

1. Run a representative change against `monorepo-distributed` without extra hints. Record purposeful files opened, searches performed, missed dependencies, and whether the plan is correct. The agent should follow imports and existing routing without proposing an expanded impact map.
2. Run coding adoption against a fresh `hybrid-release-code` copy with one explicit user hint about a non-local consumer or operational step that is not represented by imports. Ask the flow to preview guidance only; do not approve writes.
3. Repeat the representative change with that concise, source- or user-cited note present in the disposable copy. Record the same observations. Capture exact token usage only when the runtime exposes a reliable measure.

Expected behavior:

- The optional note names only the non-obvious potentially affected surface, evidence/confirmation, confidence, and unresolved uncertainty.
- A known exclusion appears only when the user or visible evidence explicitly supports it.
- The agent does not copy the import graph or create a complete dependency catalog.
- `live`, `leftover`, or `ghost` is proposed only with cited evidence; ambiguous or consequential status is presented for user confirmation, and otherwise remains `unknown` or omitted.
- Maintenance recommends trimming a note that does not reduce searches, prevent a missed dependency, or improve the resulting plan.
- The comparison reports observed navigation and correctness rather than assuming context savings.

### Curated documentation adoption

Run read-only against `existing-doc-duplication` and choose Curated.

Expected behavior:

- Ends the initial protected scan before mapping/depth choices, then begins a new protected inspection phase before reading Curated documentation or other project resources. The normal path produces no PiCM gate-blocked warning; it ends that phase before reporting the proposal and calls `complete` after a declined proposal.
- Identifies `AGENTS.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, and `docs/development.md` as overlapping/conflicting guidance.
- Treats `src/main.js` as the evidence-backed entry point and calls the `src/index.js` references stale/uncertain without rewriting anything.
- Proposes canonical fact homes and thin compatibility pointers.
- Separately highlights proposed rewrites, merges, moves, archive candidates, or deletions.
- Treats choosing Curated as permission to draft a proposal, not permission to apply it; declining the proposal leaves the fixture unchanged.

### Protected privacy and Git-exclude boundary

Prepare the ignored-file fixture in a disposable Git repository:

```bash
FIXTURE="test/fixtures/coding-repository/ignored-secrets-existing"
TARGET="/tmp/picm-coding-ignore-smoke"
rm -rf "$TARGET"
cp -R "$FIXTURE" "$TARGET"
cd "$TARGET"
git init
printf 'SYNTHETIC_TRACKED_IGNORED=do-not-read\n' > .env.tracked
git add .
git add -f .env.tracked
ln -s .env ignored-target-link
git add ignored-target-link
git -c user.name="PiCM Fixture" -c user.email="fixture@example.invalid" commit -m "fixture"
printf 'SYNTHETIC_ONLY=do-not-read\n' > .env
mkdir -p secrets
printf 'SYNTHETIC FAKE KEY - DO NOT READ\n' > secrets/fake-key.pem
printf 'LOCAL_EXCLUDE=do-not-read\n' > local-excluded.txt
printf 'local-excluded.txt\n' >> .git/info/exclude
printf 'CONFIG_EXCLUDE=do-not-read\n' > config-excluded.txt
pi install -l /path/to/picm-factory
pi
```

Expected behavior:

- Before an explicit PiCM command, the extension leaves ordinary Pi reads, user-level skills, screenshots/outside paths, Git inspection, and agent tools untouched; use only the synthetic fixture when demonstrating that pass-through.
- User-typed `!bash` is never intercepted, including during an active PiCM scan.
- `/picm-new`, `/picm-adopt`, `/picm-maintain`, and `/picm-optimize` authorize a privacy-pending workflow; `/picm-help` and natural-language requests do not. Before privacy review, every agent tool except `picm_scan_control` is blocked.
- `picm_scan_control preflight` reports whether the target is a Git repository and the file kind of root `.gitignore` and `.git/info/exclude`, without candidate inventory or temporary Git metadata. Immediately afterward, both `/picm-adopt` classified as coding and `/picm-adopt coding` reassure the user that Git ignore rules, Git internals, symlinks, repository/submodule boundaries, and outside-project paths are already protected, then ask only for additional sensitive project-relative paths or `none`.
- The additional-path question does not claim every secret is inferred or treat ignore rules as sufficient for sensitive eligible files. The workflow records `config-excluded.txt`, previews `privacy.excludedPaths`, and persists it only after exact confirmation.
- After privacy review but before `begin`, only canonical packaged resources under `skills/` and `prompts/`, plus the package README and metadata, succeed; project-local lookalikes and other project resource reads remain blocked.
- `begin` is refused before privacy review. After review, `inventory` combines root/nested `.gitignore`, `.git/info/exclude`, global Git excludes, persisted PiCM config, and session additions. After every `end`, invoke only `begin` for the next phase or terminal `complete` before ordinary project tools; a later scan phase calls `begin` again and `end` afterward.
- Session shutdown clears authorization; workflow completion steps the runtime down without blocking later agent tools. A valid saved same-session authorization can be restored with its reviewed exclusions inactive, and elapsed time alone does not revoke it.
- Uses `picm_scan_control inventory` to derive candidates without agent Bash and checks Git plus PiCM exclusions immediately before each path-tool execution. Admitted ordinary reads, edits, and writes revalidate the canonical target during execution, and direct creation works on macOS, Linux, and Windows. Unknown agent tools are blocked during active scans; confirmed privacy paths remain blocked between scan phases.
- In a second disposable fixture, omit `.git` but keep `.gitignore`; verify preflight creates no temporary metadata, then privacy review allows explicit maintenance scans to block excluded reads, allow safe candidates, create no project `.git`, and remove post-review transient metadata on shutdown.
- In a third disposable fixture, omit both `.git` and `.gitignore`; verify preflight asks privacy before creating transient metadata and persisted/session exclusions protect the scan.
- Does not open, quote, summarize, hash, or otherwise inspect untracked ignored `.env`, tracked ignored `.env.tracked`, `secrets/fake-key.pem`, `.git/info/exclude`-matched `local-excluded.txt`, or config-excluded `config-excluded.txt`, including through `git show`, broad traversal, or another worktree.
- Does not follow `ignored-target-link` to the ignored `.env` target.
- Visible Pi tool logs contain no read of any ignored file or symlink target.
- Still asks whether tracked files or other approved paths contain secrets; ignore rules are not treated as proof that every remaining path is safe.
- If a submodule is explicitly included, treats it as a separate worktree and repeats privacy confirmation, Git candidate listing, and per-path ignore checks without initializing/fetching it automatically.

Observed smoke: 2026-07-22 in visible Zellij/Pi panes against `/tmp/picm-coding-ignore-smoke`.

- The earlier observed adoption smoke predates Strict-first behavior. Rerun it before recording a current observation; the regression expectation is no maintenance-depth choice and a Strict examination.
- Regular `/picm-adopt` first performed path-only Git-aware classification from `package.json`, `src/`, and `test/`, offered/selected Coding Repository without needing the shortcut, and asked the tracked-data security question before content inspection.
- The regular flow recognized the repo was small enough to keep its root map in `AGENTS.md` rather than manufacture `CONTEXT-MAP.md`.
- It reported `.env.tracked` as ignored and unread, did not follow `ignored-target-link`, did not list or quote ignored contents, created no `.picm/` metadata, and left the Git diff empty. Only the expected project-local `.pi/settings.json` from package installation remained untracked.

## Maintenance cadence smoke check

In a disposable fixture, preview a one-day reminder with `picm_maintenance_policy` and verify the preview writes nothing. Before apply, verify PiCM presents every standalone-policy summary category required by `skills/picm-factory/references/preview-review-protocol.md`, explains the durable and advisory scheduling impact, and obtains explicit no-write summary acceptance. Confirm the separate exact `.picm/config.json` patch, then make `nextDueAt` due and restart an interactive Pi session. Verify the persistent reminder section renders above the editor and presents a selector with `Run Now` and `Defer`. Test `Defer`: verify the reminder is dismissed for the current session, notification states PiCM will ask again in a new session, timestamps are not changed, and reload/resume in the same session does not prompt again while a fresh session prompts again. Test `Run Now`: verify it invokes the Strict/Balanced depth selector, starts privacy review, and advances `lastCycleAt`/`nextDueAt` and clears the reminder only after successful completion. Verify cancellation or escape leaves the reminder visible and maintenance due. Repeat with legacy `automatic` and `nudge` configs to verify both use the approval prompt. Print, JSON, and RPC sessions must neither prompt nor mutate the schedule. Decline an apply confirmation and verify no file changes. Do not run write-capable smoke tests outside an explicitly disposable target.

## `/picm-maintain` smoke checks

At intake, verify PiCM asks whether to include agent-document optimization and defaults to No. No must preserve the standard maintenance flow. Yes must retain the standalone optimizer's agent-document-only scope, preservation ledger, selectable proposals, `No worthwhile optimizations found` result, privacy boundary, and shared summary/selective-exact preview without proposing source/build/runtime, `.picm/`, generated, or unrelated edits.

### Coding Repository

Run `/picm-maintain` against the three adopted coding fixtures.

Expected behavior:

- A bare interactive command displays exactly two run-depth choices with Strict preselected:
  - Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.
  - Balanced: representative coverage of major boundaries and one coding path; lower cost.
- `/picm-maintain strict` and `/picm-maintain balanced` bypass the selector. Every choice applies only to that run and leaves the stored preset unchanged.
- Historical stored Light/Balanced/Strict values remain readable. Scheduled `Run Now` presents the ordinary Strict/Balanced selector instead of using the stored preset, and Light never appears in that selector.
- Uses coding cold walks: root routing → map/equivalent → owning boundary → entry point → authoritative tests/checks.
- `small-service` accepts the root map in `AGENTS.md`.
- `monorepo-distributed` checks root/local responsibility agreement and manifest-level workspace coverage without attempting a full semantic dependency graph.
- `hybrid-release-code` checks both coding and workflow routes for mixed release-related changes.
- Preserves human-authored map content and proposes the smallest evidence-backed patch rather than regenerating whole files.
- Applies the privacy-first Git and PiCM exclusion boundary before every coding scan.

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
- Keeps trace mode framed as a heuristic, focused investigation and does not write either repair without a complete concise summary and direct explicit approval.

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

- Explicitly identifies Specialist Folder because all four defining signals are present.
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
- Final transcript derives its checklist from the approved generated routes: it names the exact first workflow/task recipe, its inputs, and expected artifact.
- Final transcript requires an explicit inspect/edit/approve gate, keeps recipe-named uncertainty visible, and names the approved artifact as where the next specialist action reads from.
- Final transcript says to promote lessons into an approved existing stable rules/examples/reference route only after review proves they affect future runs; it does not invent optional folders, recipes, or operations.
- Final transcript recommends `/picm-maintain` after first real use or when the specialist workflow, routing, or stable guidance changes.

Focused fixture reproduction: `test/fixtures/layout-profiles/specialist-folder/faq-polisher/workflows/polish-faq.md` is the reported Specialist route. Its first run uses the rough FAQ answer and `reference/faq-style.md`, creates `review/polished-faq.md`, requires human inspect/edit/approval with unsupported claims and unresolved questions visible, and routes a subsequent action through the approved edited draft.

Observed `picm-fvs` smoke notes:

Last checked: 2026-05-25 in visible Zellij/Pi panes against `/tmp/picm-fvs-new-smoke` and `/tmp/picm-fvs-new-smoke2`.

- First run completed scaffold after explicit dirty-repo approval; wrote root routing/context, style reference, stage contracts, and `.picm/config.json`.
- First run generated stage contracts with stable reference vs working artifact inputs, output paths, Verify, and review gates, and no unresolved bracket placeholders.
- First run calibration gap: it pre-created empty `input/` and `output/` directories. Guidance was tightened so `/picm-new` should name future paths in contracts without pre-creating empty directories unless explicitly approved or populated.
- Second run after guidance tightening previewed “no empty input/ or output/ dirs,” created only populated scaffold files/directories, named future output paths in contracts, and filesystem verification found no empty non-git directories and no unresolved bracket placeholders.

## `/picm-adopt` smoke checks

Fixtures:

- `../coding-repository/existing-doc-duplication`
- `../coding-repository/ignored-secrets-existing`
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
- For `custom-existing-structure/existing-no-agent-files`, recommends `AGENTS.md` as the default routing source and, before making the final proposal, explicitly asks whether to draft a `CLAUDE.md` compatibility shim.
- If the shim is accepted, it appears only in the draft; declining it leaves the remaining proposal unchanged. Neither choice writes a file.
- Does not rewrite, merge, rename, move, delete, or create visible files without a complete concise summary, clear impact flags where applicable, user iteration, and direct explicit approval.
- Does not treat option selection as write approval; if the user asks for preview or says not to write yet, it stops after preview and waits for direct explicit approval of the current summary before writing even `.picm/` files.
- Separates readiness labels: `Ready`, `Ready with warnings`, `Needs routing before adoption`, and `Scanned only`.
- Marks `.picm/config.json` as `adoption.status: "adopted"` only when visible routing is adequate.
- May write scanned-only `.picm/config.json`/`.picm/adoption-report.md` after approval, with a report link or brief scan summary for future `/picm-maintain` guidance.
- Adoption report includes existing routing source, inferred layout profile, PiCM compatibility, optional ICM improvements, security/privacy notes, optional `.picm` artifacts, and a `Preserved as-is` section.
- Coding adoption reports whether Coding Repository is primary or codebase mapping is composable, the selected mapping/adoption modes, resulting root/distributed shape, automatic Strict examination and stored strict preset, proposed boundaries, evidence, and unknowns.
- After every successful adopted-status write, asks exactly “Would you like to run an initial maintenance pass now (recommended)?” with `Run maintenance now` and `Finish`. Run reuses the conversation's confirmed exclusions, opens the ordinary Strict/Balanced selector with Strict preselected, and continues profile-appropriate maintenance through the shared summary/selective-exact preview. Finish, cancellation, or failure does not record a maintenance run or change configured reminders; later maintenance starts with normal privacy review.

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
- Does not write files without a complete concise summary and direct explicit approval.

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
- Before any adoption write in this non-Git fixture, proposes exact `.gitignore` patterns for future commit protection (or PiCM exclusions when Git is not planned), asks the owner to confirm workspace/repository visibility, and keeps sensitive source outside reusable context and adoption metadata. It does not initialize Git or change `.gitignore` without direct approval.
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

The sensitive non-Git safeguard is covered by `test/security-adoption-contract.test.mjs`; keep this fixture's expected guidance and the no-write path aligned with that contract.

## Summary preview and optional-diff-review interaction

Do not run this write-capable interaction against a real project. When interactive QA is explicitly approved, use disposable copies and test both `/picm-adopt` and `/picm-maintain` with `test/fixtures/layout-profiles/custom-existing-structure/mixed-proposal-batch`.

For each command, use the fixture's exact batch: modify `AGENTS.md` to route through `routing/current-route.md` and require `npm run check`; create `reference/approval-notes.md`; delete `reference/obsolete.md`; and move `routing/legacy-route.md` to `routing/current-route.md`. Verify:

- Before every proposal batch, one complete concise summary enumerates every affected file and operation, behavior/configuration changes, linked cross-file moves, preserved behavior, known uncertainty, and review suggestions; every empty category says `None`.
- Flag every deletion before acceptance, with its intent and impact. Also suggest review for linked moves, material safety/privacy/permission/approval/required-command changes, and unusually large or uncertain change sets; suggestions never block approval.
- Option choice, cadence choice, preview request, review navigation, and vague assent produce no write. Prepare this exact batch with `picm_proposal_batch`, then verify cancellation, decline, vague assent, and a requested revision remain no-write. An unambiguous direct approval from the current summary writes exactly the enumerated proposal as one auditable batch without opening a review menu or using agent Bash.
- An initial adoption proposal that creates ordinary `.picm/config.json` and/or `.picm/adoption-report.md` follows the same summary-and-direct-approval flow as every other ordinary proposal; metadata remains optional to inspect.
- Standalone maintenance-policy previews, including a one-day cadence, write nothing; the complete summary and its acceptance also write nothing, and only the following exact runtime confirmation controls the policy write. Persisted privacy-exclusion writes retain their exact runtime confirmation. Neither confirmation authorizes any other write.
- Direct `view all` and `show diff for <path>` requests render the requested review immediately without opening a menu; a generic `review files` request offers `View all`, `Select files`, and `Return to summary`.
- `View all` renders every affected item in summary order. In `Select files`, the user conversationally names or checks paths from the current proposal; selecting either source or destination of a linked move selects and reviews the whole source-destination pair. Selection and reviewed state persist while navigating one file at a time through `Previous`, `Next`, `Back to selection`, and `Return to summary`. Returning to the summary and re-entering review does not lose state.
- A modified file renders as a unified diff; a new file renders complete proposed content; a deleted file renders complete removed content; and a linked move renders source and destination together.
- `Return to summary` never counts as approval. If the proposal is revised, pending write approval is superseded while applicable selection and exact-review state for unchanged paths remains valid; a refreshed complete summary precedes a new approval.
- If protected or sensitive content cannot safely be rendered exactly, the flow stops and neither approves nor writes that item or linked change set.
- Before final explicit approval, inspect `git diff --exit-code` in the disposable target to confirm no project write occurred. After approval, verify only the currently summarized files and operations were written, and inspect the `picm-proposal-batch` session audit entry. Repeat the no-write check after a revision but before renewed approval. After `picm_scan_control end`, verify ordinary project tools remain blocked until the next `begin` or terminal `complete`.
