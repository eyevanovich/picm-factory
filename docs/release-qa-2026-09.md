# Release-candidate fixture QA — September 2026

## Status: in progress, not release approval

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

- Real visible Pi 0.85.1 sessions with the local source package explicitly loaded,
  using `openai-codex/gpt-6-astra`; one subject per controller lane at a time.
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

## Remaining coverage / release blockers

- Retest every second-round product failure at a clean pinned head, including
  successful Specialist final guidance and complete nested scaffold generation.
- Retry mixed-maintenance exact per-path review/navigation after the provider
  `fetch failed` interruption. Earlier access verification failure and this later
  fetch failure are infrastructure outcomes, not product passes.
- Exercise an explicitly included submodule as a separate protected worktree.
- Finish optional paired navigation-note calibration and remaining placement /
  persisted-privacy branches where applicable.
- Preserve per-head evidence: do not relabel baseline passes as final-head runs.
- Rare late-cancellation/partial-mutation timing cases have automated coverage;
  they have not all been injected interactively. No promise of transactional
  rollback or race-proof pathname operations is made.
- First-run business artifact production is outside the completed scaffold
  contract/checklist smoke tests so far.

Update this checkpoint after pinned retests and independent review. Do not tag or
publish while product failures or material unexplained coverage gaps remain.
