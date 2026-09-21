# Release-candidate fixture QA — September 2026

## Status: historical focused campaign complete; current disposition below

Resume checkpoint: [release-qa-handoff.md](release-qa-handoff.md).
Durable task: `picm-x6c.21`. The paused-controller checkpoint was consumed by
six fresh, bounded lower-cost sessions; no automatic full-matrix rerun started.
The campaign's originally named functional blockers are reconciled in the
current disposition; this document alone is still not release approval.

## Current disposition — `fba8b1f`

The `picm-x6c` epic is closed. Its release-QA blockers are now resolved with
recorded focused validation:

- `picm-x6c.22` — exact local-only Git protection guidance: closed after
  `a33d8cf`; focused contract coverage passed and recorded disposable Specialist
  Folder QA observed the optional entry without automatic `.gitignore` writes.
- `picm-x6c.23` — submodule re-entry lifecycle: closed after `d791766`; focused
  integration coverage passed and recorded disposable coding-adoption QA
  observed fresh inclusion, `begin`, then scoped inventory without a second
  privacy action.
- `picm-2oi` — nested worktree inspection before explicit inclusion: closed
  after `fba8b1f`; 353 automated tests and package validation passed, with
  independent review of the read-only, phase-bound admission repair and
  recorded disposable write-free QA of the repaired flow.

This addendum records current validation at that head; it does not promote the
historical campaign into a full `main...HEAD` merge or release sign-off. Before
a release, review the current branch delta, explicitly dispose of the remaining
coverage questions, and assess open QA Beads `picm-2pv`, `picm-kpw`,
`picm-83c`, and `picm-xw8`. Merge through the normal PR path, then use the
manual `Create release` workflow from `main`; do not tag or publish from this
branch.

Scope: current `feature/x6c-tickets` branch, starting at
`b692cbce5970f3e460506b66ee76deba07092423`. This is a current-code smoke
campaign, not a claim that every change since the last tag was independently
reviewed. No release, tag, merge, or publication is authorized by this report.

The operator authorized autonomous interactive fixture QA, exact reviewed test
writes in disposable `/tmp` targets, source fixes in this repository, and normal
commits/pushes to the existing branch. No global configuration changes, credential
inspection, destructive actions outside the targets, or force pushes are part of
the campaign. Runtime safety follows [ADR-0001](adr/0001-practical-write-safety.md),
not hostile-race-proof filesystem guarantees or automatic rollback.

## Method and evidence

- Real visible Pi 0.85.1 sessions with the local source package explicitly loaded.
  The earlier broad lanes used `openai-codex/gpt-6-astra`; the final six focused
  sessions used fresh `openai-codex/gpt-5.6-terra` subjects, one at a time.
- Chat text was inspected in the editor before a separate Enter submission.
- Fresh disposable copies, local synthetic Git checkpoints where needed, exact
  preview/approval checks, tool/session captures, and final mutation comparisons.
- Subjects used guarded tools, not agent Bash, for protected workflow operations.
  A baseline optimizer ran a fixture's safe test script after workflow completion;
  this was recorded as a harness deviation, not a protected-scan bypass.
- Parent-only source edits; independent read-only evidence/code review.
- Automated checks supplement interactive evidence; they do not replace it.

Ephemeral evidence root: `/tmp/picm-release-qa-Z1Gdyc`. It contains
`layout-report.md`, `adoption-report.md`, `evidence-review.md`, baseline/retest
ledgers, exact previews, final mutation checks, controller/subject sessions, and
check logs. These files may disappear after restart; this document preserves the
campaign status without copying synthetic input contents or raw sessions into the
package. QA reports and fixtures are repository-only, not release payload.

## Completed passes and fixes

### Starting head: `b692cbc`

Package check: **317 tests passed**, package validation passed.

Layout lane completed 26 maintenance/trace executions plus help, spanning all
seven anti-patterns, three Stage fixtures and focused source-integrity trace,
both Specialist fixtures, both Team/Role fixtures, adopted custom, sensitive
boundaries, and all nine small-service/monorepo/hybrid maintenance-depth variants.
It also exercised cold walks and optimization default No, opt-in Yes, and exact
no-op behavior. Root-brain-dump healing was too weak and required correction.

Adoption evidence covered routing variants, preservation, optional inventories,
coding entries, privacy/ignore sources, mixed proposals, selective review,
policy confirmation, due reminders and scheduling lifecycle. Several scaffold
and conversational approval paths failed; provider access failure interrupted
coverage. Baseline results are not presented as later-head retests.

### First fixes: `594df4a`, `01867c4`

- Preserve active scan phases across ordinary questions and approval pauses;
  retain explicit phase-end, restoration, and issued-binding revocation.
- Admit scaffold preview registration during an active protected phase.
- Recognize narrow current-content checkpoint reports without treating them as
  write approval.
- Require root-overload healing to reduce root payload, preserving unique rules.
- Correct QA's adoption privacy expectation: the full adoption question is
  intentional; concise wording is conditional for maintenance/optimization.

Pinned `01867c46a86dce928323f830bcc3e0612240666a` package check:
**321 tests passed**, package validation passed. Independent review found no
blocking issue in that patch, but did not approve overall release coverage.

Interactive corrected-head evidence confirms mixed adoption approval and
negative/review cases, Curated cadence flow, adoption Finish, sanitized non-Git
metadata writes, broader exclusion/resume boundaries, missing coding-entry
variants, and standalone policy decline. The adoption ledger records 31 scoped
passes, two new failures, one provider-blocked case, and seven pending rows;
these row counts are not counts of independent fixture sessions.

The corrected layout lane ran ten fresh cases: six passed and four failed.
All nine documented new-workspace scenarios received some coverage, including
Stage, Specialist, and Team generation. Team, empty-with-setup-noise, all three
existing-architecture choices, and root-brain-dump calibration passed. Successful
writes matched exact proposals; failed/partial cases were not counted as passes.

### Second fixes: `a7db36d`, `0c2850f` — awaiting interactive retest

New regressions reproduced these observed failures before correction:

- Busy post-adoption maintenance dispatch lacked Pi's queued-delivery option.
- Cancellation before privacy review could not cleanly terminate authorization.
- Expanded preview-only review invalidated an unchanged scaffold proposal.
- Post-write inventory classified this workflow's generated architecture as old.
- Ordinary nested scaffold parent creation failed with `ENOENT`.
- Specialist guidance required optional identity/rules files and rejected valid
  reusable context/rules receipt inputs.

The patch uses queued steering for the adoption continuation, explicit terminal
cancellation without maintenance completion, existing approval evidence to
identify generated paths, Pi-compatible recursive parent creation, and minimal
receipt-derived Specialist requirements. It also makes the optional exact
`.gitignore` offer explicit for identified source-only sensitive/local paths.
Privacy exclusions, direct exact approval, no-write review, retained partial
results, and no rollback remain required.

Combined second-fix package check: **346 tests passed**, package validation passed.
Focused checks cover busy dispatch, cancellation across four workflow types and
four lifecycle points, resume and reminder preservation, stale issued writes,
review/revision/cancellation precedence, nested parents, inventory, and minimal
Specialist guidance. Independent review found no patch blockers and one reporting
note: cancellation must not deny an earlier committed maintenance cycle. That
wording was corrected and a completed-maintenance→cancel regression added.
Real affected-scenario retests are still required; green automated checks alone
do not close these findings.

## Historical checkpoint: `f287796`

At `f287796`, adoption-to-maintenance dispatch and early/late cancellation
passed interactive checks (five scoped ledger rows, not five sessions).

One root-stage scaffold case remains failed/partial: after an unchanged exact
preview, the request “Preview only for now. When I subsequently approve, please
check the resulting file inventory before finishing so the summary accurately
lists what was created.” caused later exact approval to be blocked. No files
were written; an identical refreshed proposal was never approved. This broader
wording is not covered by the narrower preview-only fix. The handoff preserves
the exact reproduction and evidence paths; no fix for this variant was attempted.

The last pinned package check still passes 346 tests. The remaining defect
means that green automated checks do not establish release readiness.

## Historical focused addendum: `cd4aa07`

`cd4aa07c932e49a57a0db42885d00f70b3953fde` fixes the broader unchanged
inventory-only preview request with an actual extension-hook regression. Its
focused `npm run check` passed **347 tests** and package validation; the commit
is pushed on `feature/x6c-tickets`.

Six fresh direct sessions, recorded under the ephemeral evidence root, were run
without resuming either earlier controller or replaying the baseline matrix.
The index is `lower-cost-fresh/layout-ledger.md`; individual evidence is in
`sessions/root-stage/`, `sessions/nested-stage/`, `sessions/faq-specialist/`,
`sessions/min-specialist/`, `sessions/mixed-maint/`, and
`sessions/submodule-boundary/` beneath that same root:

- Root seven-file Stage approval now survives full preview, `continue`, `.`, and
  the formerly blocking inventory-only wording; approved writes and post-write
  inventory matched exactly.
- Nested Stage creation produced both multi-level stage parents, and the FAQ
  Specialist receipt/guidance flow passed.
- The minimal four-file Specialist created only its exact scaffold and derived
  guidance successfully, but **failed** to offer the required exact optional
  `/.gitignore` entry or explain commit protection for a named local-only input.
  This is release blocker `picm-x6c.22`.
- Mixed maintenance rendered exact per-path content, linked-move review,
  Previous/Next/Return/re-entry navigation, and kept `continue` no-write until a
  separate risk acknowledgement and direct approval. Its exact four-operation
  result matched the presented proposal.
- An explicitly included, already-present synthetic submodule was protected as a
  separate worktree: parent and nested inventories differed correctly; nested
  Git-ignore and session exclusions stayed unread; only its safe file was read;
  and no clone, fetch, initialization, proposal, or write occurred. A guidance
  ambiguity caused a safely rejected post-`end` privacy-control call before
  recovery; follow-up `picm-x6c.23` tracks the valid re-entry sequence.

## Historical remaining coverage / release blockers (at `cd4aa07`)

- Resolve and independently retest P1 `picm-x6c.22`; do not claim release
  readiness while its local-only commit-protection offer is missing.
- Resolve `picm-x6c.23` or explicitly document the supported submodule
  confirmation sequence, then retest that narrow flow without weakening the
  verified boundary.
- Finish optional paired navigation-note calibration and remaining placement /
  persisted-privacy branches where applicable. These were deliberately not
  replayed as part of the bounded campaign.
- Preserve per-head evidence: baseline passes remain historical and are not
  promoted to `cd4aa07` coverage.
- Rare late-cancellation/partial-mutation timing cases have automated coverage;
  they have not all been injected interactively. No promise of transactional
  rollback or race-proof pathname operations is made.
- First-run business artifact production is outside the completed scaffold
  contract/checklist smoke tests so far.

Historical instruction: do not treat the preceding `cd4aa07` checkpoint as
release approval. The current disposition above supersedes its ticket-specific
blocker list while retaining its historical coverage limits.
