---
status: accepted
---

# Practical write safety for a local workflow assistant

PiCM helps people maintain project-specific agent instructions and workflows; it is not a transactional database or a sandbox against hostile programs on the same machine. We choose guarded, individually committed changes with honest partial results and user-controlled recovery instead of automatic rollback and race-proof pathname guarantees. This removes failure-prone undo machinery without giving up privacy, project scope, or exact approval.

**Implementation status:** accepted target, not yet implemented. Existing runtime guards and command instructions remain in force until migrated together with their tests. Beads epic `picm-x6c` tracks delivery; accepting this decision does not complete its issues or authorize bypassing current tools.

## Why this decision

[PR #42](https://github.com/eyevanovich/picm-factory/pull/42) exposed the trade-off: attempts to make directory cleanup ownership-safe repeatedly broke ordinary parent creation. At `c6a7e1a`, the branch documents a residual pathname-creation race and retains created directories during rollback, while its original intent still asks for conditional cleanup. We are replacing contradictory requirements, not treating that narrow compromise as proof of race safety elsewhere.

Rollback is another write sequence. It can fail, erase intervening edits, or require further recovery. More checks around ordinary pathname calls do not make the check and operation indivisible. The useful promise is to prevent common mistakes, keep approved completed work, and explain what happened.

## R1 — Preserve privacy and approval protections

Keep explicit workflow activation, privacy review, all ignore/exclusion sources, project and worktree limits, and Git-internal protections. Keep checks for symlinks, hard links, unsupported file types, and expected source content. A denial stops the operation; excluded contents stay out of previews, diagnostics, recovery guidance, and audit entries.

Checkpoint guidance grants no new arbitrary agent-shell access during protected workflows. Separate runtime confirmations for persisted privacy exclusions and standalone maintenance-policy writes remain required.

## R2 — Bound the filesystem guarantee

Authorize and validate paths immediately before operations. Concurrent substitution between that check and the filesystem call remains a documented limitation; do not introduce platform-specific object-identity machinery solely to defeat hostile, precisely timed replacement.

Ordinary concurrency still matters: retain useful settings locks and conflict checks. This is a write-focused simplification, not permission to remove read/privacy enforcement. Review read-specific identity changes separately before changing their coverage.

## R3 — Approve exact changes before starting

Present the exact current proposal and obtain direct approval before initial writes, including explicit deletion, replacement, and linked-move actions. Preview, decline, revision, and vague initial assent remain no-write; a bare initial `continue` cannot create authority.

Prevalidate the entire approved batch before starting, then recheck each operation's protections and expected state before execution. Failed prevalidation means no proposal mutation. These observations neither reserve files nor guarantee later operations will succeed.

## R4 — Commit individually; do not automatically undo

On failure or cancellation, stop issuing further mutations and leave completed changes in place. Keep ordinary per-file safety against unnecessary half-written replacements and unexpected destination overwrites, without promising cross-file transactions.

For a move, validate the source, publish the approved destination, then remove the source only while allowed and expected. If removal fails, retain the destination and report both paths' actual state. Never silently replay a partly completed move.

Create approved missing parents through guarded operations. Retain them after failure rather than attempt ownership-sensitive directory rollback or recursive removal. Do not replace rollback with a journal, backup system, recovery daemon, or Git transaction engine.

## R5 — Report cancellation and partial results honestly

Cancellation stops future work; already-issued I/O may finish. Distinguish completed, not attempted, failed without effect where known, and uncertain outcomes. Report known partial effects inside an operation, including a written move destination or newly created parents. A failed write is not necessarily untouched; inspect uncertainty through protected paths before proposing repair.

A successful config-file replacement is its commit point, not a Git commit. Late cancellation does not restore the prior config. Subsequent directory-sync failure means committed with uncertain crash durability, not no-write or safe to retry. Preserve locks, conditional updates, unrelated fields, and permissions.

Record maintenance completion only for a completed pass. Partial work must not clear a due reminder; a completed pass whose final settings save succeeds is not undone by late cancellation. Handle any existing legacy recovery files conservatively rather than blindly deleting them or building a recovery subsystem.

## R6 — Recommend user-created Git checkpoints

Strongly recommend a commit covering the current contents of affected existing files before changes. A repository or an old commit does not protect uncommitted work. If coverage is absent or uncertain, explain the risk and obtain explicit acknowledgment to proceed without that protection.

Combine this guidance with normal preview; no extra wizard, whole-repository clean-state requirement, or repeated acknowledgment for unchanged scope. Non-Git and new empty workspaces remain supported. A first post-scaffold commit protects that version going forward, not the prior absence of files.

Never automatically initialize, stage, commit, reset, clean, or restore. Never ask users to add sensitive or ignored material to satisfy the recommendation. Use permitted metadata or user confirmation, not new content/history scans or unsupported claims of verified coverage. Explain that uncommitted/untracked content may be unrecoverable through Git and broad restoration can erase later edits.

## R7 — Continue unchanged approved work without another ceremony

An explicit same-session continuation request can reuse original approval only for operations in the same workspace/proposal that are known unattempted, unchanged in paths/actions/contents, still allowed and consistent with expected content, and independent of the failed operation's success. The request itself is sufficient; do not ask for another approval of the same continuation.

Never replay completed work or silently retry failed/uncertain actions. Revised actions and repairs need a revised proposal and approval. Establish independence only when straightforward; otherwise stop for review instead of building dependency inference or reconciliation machinery.

Keep continuation state minimal and session-local. Missing state after teardown/restart cannot be replaced by the agent's conversational memory or justify a persistent recovery engine. This rule never weakens initial approval.

## R8 — Share code, isolate workspace records

Reuse approval logic where it reduces duplication, while keeping each exact proposal's authority isolated by workspace and session. Workspace changes invalidate incompatible approval state. Project-local installation and each project's `.picm/` remain separate; no cross-project approval store is introduced.

Give session state and finalization one owner, preserving active-work ordering, resume behavior, and accurate errors. Keep the extension thin. Evaluate depth by fewer caller obligations and independently mutable facts, not line counts or a universal workflow executor.

## Consequences and delivery

- Users may see partial changes, duplicate move paths, or retained folders after failure. Accurate results and targeted recovery guidance replace automatic restoration.
- Implement config commit semantics and partial proposal results before broad approval/lifecycle refactoring. Use existing state for simple continuation; a short revised proposal is the fallback.
- Migrate runtime behavior, injected tool descriptions, canonical guidance, and tests together. Do not claim the target behavior in shipped instructions before it exists, or leave rollback promises after removing it.
- Runtime procedure belongs in `skills/picm-factory/references/preview-review-protocol.md` and its skill routing. This record preserves the decision and rationale; Beads owns acceptance criteria and work status.
- Test initial no-write, partial operations, issued-I/O cancellation, config durability warnings, retained directories, duplicate continuation, failed dependencies, workspace/session isolation, and checkpoint opt-out. Diagnostics must not reveal excluded contents. Full package checks and independent review remain the final gate; interactive write-capable QA still needs an explicitly approved disposable target.

## Rejected alternatives

- **Automatic rollback with stronger ownership checks:** adds fallible writes and increasingly complex recovery while pathname races remain.
- **Mandatory Git or automatic Git recovery:** excludes legitimate local workflows and does not protect all current content; recovery belongs to the user.
- **Fresh approval for every unchanged continuation:** repeats permission already given. Reapproval is for changed plans or repair, not a ritual for known-unattempted work.
- **Removing privacy/approval to make writes easier:** changes the product's useful protections instead of its disproportionate transaction guarantees.
