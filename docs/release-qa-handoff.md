# Release QA handoff — historical campaign

## Current status

This handoff preserves an earlier QA checkpoint only. Do not resume its old
controllers, subject panes, or approvals. The current disposition is in
[release-qa-2026-09.md](release-qa-2026-09.md): the campaign's named blockers
were resolved and the `picm-x6c` epic is closed. That report is still not a
full `main...HEAD` merge or release sign-off.

For future QA, read the campaign report, [Practical safety contract](adr/0001-practical-write-safety.md), `qa-runner/CONTEXT.md`, and only the relevant
sections of `docs/layout-fixture-qa.md` / `docs/picm-new-scenarios.md`.

## Historical outcome

This historical checkpoint was consumed by the bounded lower-cost continuation
for **`picm-x6c.21`**. The tested runtime/source revision was
`cd4aa07c932e49a57a0db42885d00f70b3953fde`. Preserve the state below only for
evidence; do not treat it as live execution authority.

## Repository and authority

- Repository: `/Users/ipiesh/Desktop/projects/picm-factory`.
- Branch/upstream: `feature/x6c-tickets` / `origin/feature/x6c-tickets`.
- Historical paused-runtime head: `f287796b3aa9d28e3d399e1f1b7969adf6d41198`.
  Focused continuation source head: `cd4aa07c932e49a57a0db42885d00f70b3953fde`.
  Verify actual Git status before any future work.
- Code changes stay in this repository; disposable fixture copies, caches and
  evidence stay in `/tmp`. No global edits, credentials inspection, destructive
  actions elsewhere, or force pushes.
- Operator authorized exact reviewed synthetic test writes, source fixes, normal
  commits and pushes to this branch. No PR creation, merge, tag, or publication.
- Keep ADR-0001's practical checks, exact approval and truthful partial results.
  Do not rebuild rollback, hostile-race defenses, or mandatory Git ceremonies.

## Preserved work

Source fixes already committed and pushed:
- `594df4a`: preserve conversational scan phases, allow active scaffold previews,
  recognize narrow checkpoint coverage reports without approving writes.
- `01867c4`: improve root-overload healing and correct adoption privacy QA wording.
- `a7db36d`: queue busy adoption continuation; explicit workflow cancellation.
- `0c2850f`: nested parent creation, extended preview-only handling, generated-file
  inventory classification, minimal Specialist/receipt validation, ignore offer.
- `f287796`: durable campaign checkpoint.

**346 automated tests passed, package validation passed** at `f287796`.
Log: `/tmp/picm-release-qa-Z1Gdyc/check-f287796.log`.
Independent patch review found no blockers and one cancellation-reporting note,
which was corrected and regression tested. This is not release approval.

Current-head interactive adoption checks passed: exact adopted-status write,
one Run maintenance now → Strict dispatch without the busy-agent error,
confirmed privacy reused, completion-only cadence advancement, later normal
privacy intake, early cancellation without reads/writes/reset, and cancellation
preserving an already completed cycle. The ledger counts five scoped rows, not
five independent sessions.

Earlier heads have broad maintenance/adoption/privacy/scheduling coverage; retain
those SHAs. Do not silently promote baseline passes to final-head validation.

## Remaining reproduced defect — investigate first

At `f287796`, a root Stage `/picm-new` seven-file scaffold remained unchanged
through these user turns:

1. Exact preview registered; expanded preview-only contents request.
2. `continue`, then `.` — both correctly no-write.
3. `Preview only for now. When I subsequently approve, please check the resulting file inventory before finishing so the summary accurately lists what was created.`
4. `approve this exact scaffold`.

The first `AGENTS.md` write was blocked:

> Blocked scaffold mutation: directly approve and apply only the current exact proposal

No files were written; the remaining six writes were unattempted. Subject then
registered an identical refreshed proposal, never approved. This extra
verification-request wording distinguishes the failure from the narrower
review-only regression already fixed. Do not claim the narrow sequence failed
independently at this head.

Likely seam: `extensions/runtime/scaffold-approval.mjs` invalidates unrecognized
non-approval input. Current support recognizes a narrower `preview only. Show…`
form. Add an actual-hook regression for this exact observed sequence before
choosing a fix; preserve no-write review, explicit approval, and genuine
revision/cancellation invalidation. No implementation has been attempted for
this remaining variant.

Evidence beneath `/tmp/picm-release-qa-Z1Gdyc/`:
- `layout-report.md` — final cost checkpoint.
- `layout/retest-f287796/evidence/new-stage-root/` — especially
  `interruption-reconciliation.md`, `full-gate-errors.json`,
  `prepared-operations.json`, `live-transcript.txt`, `resume-changes.json`.
- `layout/retest-f287796/targets/new-stage-root/` — unchanged target.
- `layout/retest-f287796/sessions/new-stage-root/` — full subject transcript.

## Proposed bounded finish, not yet accepted by operator

The prior agent recommended six focused scenarios rather than repeating the
whole baseline matrix. Ivan then requested this handoff, not more testing.

1. Resolve the approval defect above; verify root-stage exact writes and
   post-write inventory/completion without rearming old-architecture intent.
2. Nested Stage: all five operations including multi-level parents succeed.
3. FAQ Specialist: reusable scaffolded CONTEXT/rules inputs and final guidance.
4. Minimal four-file Specialist: no optional-file padding, exact optional ignore
   offer for local-only input, protected input unread, final guidance succeeds.
5. Mixed-maintenance per-path diff and full Previous/Next/Return/re-entry review
   navigation, with relevant negative approval checks.
6. Explicitly included synthetic submodule: separate protected worktree and
   ignore/privacy boundary. No network clone or global Git configuration.

Four scaffold paths need live retesting; two adoption paths are genuine coverage
gaps. Busy dispatch and early cancellation already passed live retests.

Separate optional/unrun branches: negated/conflicting placement seeds,
source-only persisted privacy, new-workflow cancellation before privacy/after
ended discovery, and paired navigation-note calibration. Most of the large
remaining ledger is repeat coverage, not unexplored functionality. No full
baseline refresh is currently authorized to run under this pause. Rare timing
cases have deterministic actual-extension tests; unsafe interactive race
injection is unnecessary. New bugs may expand the bounded plan; report that
rather than quietly restarting a full campaign.

## Stopped execution state

Both controller runs completed their cost checkpoints:
- Layout: `86a82e3c-da1b-45ec-937d-b20b9c90bb06`.
- Adoption: `049bd837-9323-4e44-aeca-4272c7fb8aad`.

Parent closed both owned idle subject panes (`w6Q:p46`, `w6Q:p47`) and verified
only the main pane remained. Herdr close returned a protocol-format warning,
but authoritative inventory confirmed removal; do not retry those IDs.
No test agents or subject tabs remain running. All fixture directories remain.

At closure, the layout subject awaited fresh approval of an identical refreshed
proposal; **that approval was never given and must not be inferred on resume**.
The maintenance subject had `/picm-maintain strict` in its editor but had not
submitted it: Enter had only accepted argument completion. No proposal existed.
Start fresh subjects with fresh privacy/preview/approval, not stale authority.

Retained controller sessions use `gpt-6-astra` and large accumulated contexts.
**Do not blindly resume them for a cheaper run:** native resume retains the old
model/tool contract. Prefer fresh compact context on the operator-selected model;
if delegating, discover available models and explicitly bind the selected one.
Direct execution by the fresh parent is a lower-overhead option. Existing
synthetic approval authority does not require expensive controller fan-out.

## Disposable evidence and practical setup

Evidence root: `/tmp/picm-release-qa-Z1Gdyc` (may vanish after restart).
`QA-CONTRACT.md` contains the exact prior isolation/input protocol; its historical
model choice is not a requirement for the new session. `run.json` points to
latest artifacts. Final `layout-report.md` and `adoption-report.md` are compact
checkpoints; full older reports remain under each lane's baseline/retest paths.
`evidence-review.md` records the independent patch review, not the later defect.

Pi was 0.85.1. Each subject used a project-local source install, offline mode,
explicit package/skill loading, disabled unrelated ambient extensions, and
sandbox-local sessions/cache. Preserve ordinary fixture context discovery.
Review the local Pi docs/CLI if changing model/loading options. Do not copy auth
files or read secret environment variables.

Use visible Herdr sessions: **send text without Enter → inspect editor → send
Enter separately → verify submission**. Do not use bundled agent-prompt calls
for QA; argument completion may consume the first Enter. One subject at a time
per controller. Verify exact approved path/content changes and no-write cases;
never read/hash excluded contents as a privacy check.

When resuming implementation: read ADR, add a failing regression, make the
smallest fix, run `npm run check`, review and commit/push normally. Re-pin before
interactive retests. Finish by updating the evidence report and task with honest
passes, failures and unrun branches—not by tagging or publishing.
