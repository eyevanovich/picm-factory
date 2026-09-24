# Agent-Facing Documentation Optimization Guide

Use this guide for `/picm-optimize`.

Optimization is a documentation-only, outcome-preserving flow. It looks for useful ways to make agent guidance easier to navigate and maintain without weakening or silently changing what agents are expected to do. It does not promise semantic equivalence or guaranteed context/token savings.

## Maintenance-integrated use

When `/picm-maintain` intake includes optimization, this guide remains the sole optimization contract. Reuse that maintenance run's already-confirmed privacy exclusions and protected scan lifecycle; do not repeat preflight or privacy review. Perform the normal maintenance work as well, while applying this guide's documentation-only edit scope, preservation ledger, proposal selection, no-worthwhile-change result, and shared summary/selective-exact preview unchanged. If intake selects No, do not load or apply this guide and run standard maintenance unchanged.

## Scope and non-goals

Inspect agent-facing documentation in the authorized project scope, including:

- root and local agent instructions such as `AGENTS.md` and `CLAUDE.md`;
- repository/context maps and local contracts such as `CONTEXT.md`, `CONTEXT-MAP.md`, and equivalents;
- agent-consumed reference, workflow, handoff, role, stage, rules, examples, and identity guidance;
- prompt and skill guidance, including `SKILL.md`, prompt files, and their referenced agent-facing docs;
- other visible documentation that routing files or local contracts identify as agent inputs.

Path names are signals, not a rigid schema. Use visible routing and document purpose to recognize equivalents.

Do not inspect or modify excluded/private content. Do not edit:

- source code, tests, manifests, build files, runtime code paths, or executable scripts solely for optimization;
- `.picm/` policy, configuration, metadata, or reports as optimization output (the existing user-requested privacy-exclusion control write is a safety bootstrap, not an optimization proposal);
- generated artifacts or generated documentation—propose changing the authoritative source instead when visible;
- per-run inputs, drafts, outputs, logs, data, or unrelated workspace material.

Do not add strict token counting or numeric savings claims. Do not build a deterministic plan engine, semantic-equivalence system, reference crawler, orchestration layer, custom TUI, or other optimization infrastructure.

## Protected discovery

1. Call `picm_scan_control preflight`.
2. Ask the shipped privacy question and wait. Record every exact additional project-relative exclusion with `privacy`; persist only when the user explicitly requests it and only through the existing control-write summary and confirmation gate.
3. Call `begin`, then `inventory`. Use only the protected Git-derived candidates and guarded reads. Never use agent Bash, broad directory traversal, a second worktree, symlink following, Git-history reads, or another tool to bypass Git/privacy/submodule/non-Git boundaries.
4. From candidate paths, identify the complete agent-facing documentation set for the authorized scope. Start with root/local instructions, maps, context contracts, prompt/skill areas, and conventional agent-facing folders; then follow only visible, relevant pointers from those documents. Do not mechanically crawl every reference.
5. Inspect every identified agent-facing document once and retain its successful read as a session-only source snapshot. If a likely custom agent-doc area cannot be classified from visible evidence, ask the user rather than silently omitting or opening unrelated material.
6. Before `end`, use the source snapshots to record what was inspected and what remained excluded, protected, generated, unrelated, or uncertain; make the preservation ledger, complete the agent-document writing-lens audit, and draft exact candidate edits. Call `end` only after this one-pass discovery and drafting work is finished.

A file may be inspected because it is agent-facing while still being ineligible for edits because it is generated. Excluded/private content remains unreadable and must not be named or summarized beyond a safe generic boundary description.

## Preservation ledger

Before proposing edits, make a qualitative preservation ledger for each inspected document. Capture every unique visible constraint in these categories:

- safety and privacy;
- permissions and prohibited actions;
- approval and human-review boundaries;
- required commands, checks, and verification;
- behavioral and routing expectations;
- handoff, output, and uncertainty requirements;
- domain terminology, facts, quality bars, and exceptions;
- source-of-truth and generated/do-not-edit boundaries.

Use the ledger as a review aid, not an automated equivalence proof. Build it from the initial source snapshots before ending discovery, and retain those snapshots only in the current session context. Preserve every unique constraint in place or at a clearly reachable authoritative destination. If intent is ambiguous, ask the user or leave the text unchanged.

A visible statement that duplication, a contradiction, a stale-looking instruction, or an example is intentional—such as a fixture, compatibility test, or transition case—is itself a unique constraint. Do not erase it in an outcome-preserving proposal; ask the user for an alternate preservation mechanism or leave the affected text unchanged.

## Finding useful opportunities

Identify opportunities before drafting edits. A useful opportunity needs visible evidence and a concrete maintenance, navigation, consistency, or clarity benefit. Allowed proposal types include:

- tightening prose without dropping qualifiers or changing obligations;
- removing true duplication after identifying the authoritative source;
- replacing copied details with a concise pointer to an authoritative visible source;
- consolidating related guidance while preserving local routing and independent-working-directory needs;
- reorganizing guidance across files when the expected agent outcome is preserved or improved and every moved constraint remains reachable;
- separating stable instructions from background reference or examples when this clarifies use.

### Agent-document writing lens

Apply this lens after the preservation ledger to find evidence-backed opportunities. It is a required diagnostic pass, not a house style or a source of new obligations. Preserve scope, precedence, exceptions, and independently necessary local guidance.

- **Context pointers:** when a document directs an agent elsewhere, make the target and the condition for reading it clear. Do not hide stable prerequisites behind a pointer.
- **Information hierarchy:** keep instructions and constraints needed for every relevant task near their execution point; progressively disclose only conditional background, reference, or examples behind a reachable pointer.
- **Canonical home:** consolidate genuinely equivalent guidance only when a visible authoritative home is supported. Replace copies with thin pointers only when the target is visible, reachable, and sufficient for the local task.
- **Completion criteria:** clarify how an existing procedure's intended result can be recognized. Do not invent requirements, verification, or human gates that the visible guidance does not support.
- **Pruning:** remove true duplication, stale caches of easy-to-find facts, and instructions that do not change the expected agent behavior. Keep deliberately repeated safety, review, and local-boundary guidance.

Do not treat repeated safety, approval, command, verification, or local-boundary reminders as redundant merely because wording overlaps. Repetition may be intentional at an independent working-directory or handoff boundary. Do not manufacture edits for short, clear, intentionally local, or already well-routed docs.

Build a compact **Pass**, **Opportunity**, or **Not applicable** result for every writing-lens category from the source snapshots before ending discovery. Each proposal must name the category that supports it and the ledger constraints it preserves.

### Required discovery report

The writing-lens audit is user-visible discovery output, not private scratch work. After calling `end` and before presenting selectable opportunities, an exact preview, or a no-op result, the first post-discovery findings response must begin with `### Writing-lens audit` and include these five ordered rows:

- **Context pointers** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and visible evidence.
- **Information hierarchy** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and visible evidence.
- **Canonical home** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and visible evidence.
- **Completion criteria** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and visible evidence.
- **Pruning** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and visible evidence.

Do not imply a row through a proposal summary, omit a category because it has no opportunity, or turn every category into a finding. Keep the audit concise, but name the document-specific evidence and any preservation constraint that explains an intentional repetition or local boundary. Ground every status in an inspected source snapshot; do not label missing or uninspected evidence **Pass** or **Not applicable**. If there is no useful opportunity, show this audit as an interim discovery result before calling `complete`; after completion, the separate final report remains exactly `No worthwhile optimizations found`.

Before concluding that no useful opportunity exists, compare the visible source-of-truth claims across every inspected agent-facing document. A contradiction, or a repeated claim with no visible canonical home, is evidence for a proposal: identify the canonical home when supported, or propose a thin pointer or a user decision when it is not. Do not call the flow a no-op merely because the evidence spans multiple documents.

For each opportunity, report:

- affected paths;
- the visible evidence and problem;
- the proposed optimization at a qualitative level;
- expected navigation, maintenance, or clarity benefit;
- constraints and outcomes that must be preserved;
- uncertainty, risks, and which diff would be most useful to inspect.

Do not claim semantic equivalence. Say what visible evidence supports and what remains uncertain. Do not claim token savings unless the runtime provides reliable evidence; numeric savings are out of scope for this flow.

## Proposal selection

Present useful opportunities as independently selectable proposals or clearly linked proposal groups. Let the user choose, combine, reject, or revise them. Selection is design intent only and never write approval.

For the selected set:

1. Assemble the exact current proposal from the initial source snapshots and candidate edits; do not request another agent-visible `inventory` or `read` merely to draft or select it.
2. Check it against the preservation ledger and all source/destination pointers. If any unique constraint is lost, unreachable, or uncertain, revise or stop.
3. Apply `preview-review-protocol.md`: present the complete concise summary, offer `View all`, `Select files`, and `Return to summary` on demand, and accept direct explicit approval of this current summary.
4. Flag deletions, linked cross-file reorganizations, and material changes to safety, privacy, permissions, approval boundaries, or required commands with their intent and impact. Suggest the most useful linked diff without making review a gate.
5. If the proposal changes, invalidate prior approval, preserve applicable unchanged-path review state, regenerate the summary, and refresh review suggestions.
6. Begin a protected execution phase only for approved writes. Do not request another agent-visible `inventory` or `read` as routine preparation or verification: guarded edits revalidate their current path eligibility, and exact replacements use the source snapshot's `oldText`. Compare each successful edit's returned patch with the snapshot and ledger; use unchanged snapshots to check related pointers. Do not re-read untouched canonical sources. If a source is known or reasonably suspected to be stale, an exact replacement fails, or an edit result is failed or uncertain, read only the affected documents through the guard, regenerate the proposal, and obtain a refreshed approval. A successful exact replacement does not prove unrelated text stayed fresh. Call `end` afterward.

Never infer approval from proposal selection, a request to preview, review navigation, or vague assent.

## Verification and completion

After an approved write:

- compare each successful edit's returned patch against the source snapshot and preservation ledger; this is not independent verification of the final on-disk document;
- verify pointers from the source snapshots and returned patches resolve only to visible protected candidates and preserve local routing;
- re-read only affected documents when source freshness is uncertain or an edit result is failed or uncertain;
- verify no source/build/runtime, `.picm/`, generated, or unrelated files changed;
- report qualitative results and unresolved uncertainty without claiming proof of equivalence or numeric savings;
- call `picm_scan_control complete` when the workflow is finished.

If discovery produces no useful evidence-backed proposal, do not manufacture one. Call `picm_scan_control complete`, then report exactly:

`No worthwhile optimizations found`
