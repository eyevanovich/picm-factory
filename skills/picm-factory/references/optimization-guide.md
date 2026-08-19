# Agent-Facing Documentation Optimization Guide

Use this guide for `/picm-optimize`.

Optimization is a documentation-only, outcome-preserving flow. It looks for useful ways to make agent guidance easier to navigate and maintain without weakening or silently changing what agents are expected to do. It does not promise semantic equivalence or guaranteed context/token savings.

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
5. Inspect every identified agent-facing document. If a likely custom agent-doc area cannot be classified from visible evidence, ask the user rather than silently omitting or opening unrelated material.
6. Record what was inspected and what remained excluded, protected, generated, unrelated, or uncertain. Call `end` when discovery is finished.

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

Use the ledger as a review aid, not an automated equivalence proof. Preserve every unique constraint in place or at a clearly reachable authoritative destination. If intent is ambiguous, ask the user or leave the text unchanged.

## Finding useful opportunities

Identify opportunities before drafting edits. A useful opportunity needs visible evidence and a concrete maintenance, navigation, consistency, or clarity benefit. Allowed proposal types include:

- tightening prose without dropping qualifiers or changing obligations;
- removing true duplication after identifying the authoritative source;
- replacing copied details with a concise pointer to an authoritative visible source;
- consolidating related guidance while preserving local routing and independent-working-directory needs;
- reorganizing guidance across files when the expected agent outcome is preserved or improved and every moved constraint remains reachable;
- separating stable instructions from background reference or examples when this clarifies use.

Do not treat repeated safety, approval, command, verification, or local-boundary reminders as redundant merely because wording overlaps. Repetition may be intentional at an independent working-directory or handoff boundary. Do not manufacture edits for short, clear, intentionally local, or already well-routed docs.

For each opportunity, report:

- affected paths;
- the visible evidence and problem;
- the proposed optimization at a qualitative level;
- expected navigation, maintenance, or clarity benefit;
- constraints and outcomes that must be preserved;
- uncertainty, risks, and whether exact review will be mandatory.

Do not claim semantic equivalence. Say what visible evidence supports and what remains uncertain. Do not claim token savings unless the runtime provides reliable evidence; numeric savings are out of scope for this flow.

## Proposal selection

Present useful opportunities as independently selectable proposals or clearly linked proposal groups. Let the user choose, combine, reject, or revise them. Selection is design intent only and never write approval.

For the selected set:

1. Draft the exact current proposal without writing.
2. Check it against the preservation ledger and all source/destination pointers. If any unique constraint is lost, unreachable, or uncertain, revise or stop.
3. Apply `preview-review-protocol.md`: present the complete concise summary, offer `View all`, `Select files`, and `Return to summary`, complete every mandatory exact review, and obtain separate explicit approval for this current proposal.
4. Treat deletions and any change to safety, privacy, permissions, approval boundaries, or required commands as mandatory exact-review items. Review linked cross-file reorganizations together.
5. If the proposal changes, invalidate prior summary acceptance, exact-review state, and approval; regenerate the summary and repeat required review.
6. Begin a protected scan phase before guarded re-reads or writes, refresh inventory when needed, write only the approved agent-facing documentation changes, re-read the changed docs through the guard, and call `end` afterward.

Never infer approval from proposal selection, a request to preview, review navigation, or vague assent.

## Verification and completion

After an approved write:

- re-check the changed files against the preservation ledger;
- verify pointers resolve only to visible protected candidates and preserve local routing;
- verify no source/build/runtime, `.picm/`, generated, or unrelated files changed;
- report qualitative results and unresolved uncertainty without claiming proof of equivalence or numeric savings;
- call `picm_scan_control complete` when the workflow is finished.

If discovery produces no useful evidence-backed proposal, do not manufacture one. Call `picm_scan_control complete`, then report exactly:

`No worthwhile optimizations found`
