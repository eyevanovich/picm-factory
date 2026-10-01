# Agent-Facing Documentation Optimization Guide

Use this guide for `/picm-optimize`. Optimization is documentation-only and outcome-preserving: improve navigation and maintenance without silently weakening what agents are expected to do. It does not promise semantic equivalence or numeric token savings.

## Maintenance-integrated use

When maintenance includes optimization, use this guide as the optimization contract while retaining the normal maintenance report. Do not repeat questions already answered in that conversation. The documentation-only scope, preservation ledger, five-row audit, and final-direction/sign-off sequence remain the same.

## Scope and non-goals

Inspect eligible agent-facing documentation in the requested workspace scope: root/local `AGENTS.md` or `CLAUDE.md`, maps and contracts, agent-consumed references/workflows/handoffs/roles/stages/rules/examples/identity guidance, skills/prompts, and visible documents reached through relevant routing pointers. Path names are signals, not a schema.

Honor Git ignores, persisted `privacy.excludedPaths`, session exclusions, known sensitive paths, and generated/do-not-edit boundaries. Do not inspect or summarize excluded/private content. These are agent-followed boundaries, not a promise that tools provide a sandbox.

Do not edit source code, tests, manifests, build/runtime paths, executable scripts, `.picm/` policy/configuration/reporting, generated documentation, per-run artifacts, or unrelated workspace material. Do not build an optimization engine, semantic-equivalence system, crawler, orchestration layer, or custom TUI.

## Discovery and preservation ledger

Identify the relevant agent-document set from visible routing and document purpose, then inspect each identified document once. Follow relevant visible pointers, not every reference mechanically. If a likely custom area cannot be classified, ask rather than silently omitting it or opening unrelated material.

For each inspected document, record unique visible constraints in these categories:

- safety and privacy;
- permissions and prohibited actions;
- approval and human-review boundaries;
- required commands, checks, and verification;
- behavioral and routing expectations;
- handoff, output, and uncertainty requirements;
- domain terminology, facts, quality bars, and exceptions; and
- source-of-truth and generated/do-not-edit boundaries.

This qualitative preservation ledger is a review aid, not an equivalence proof. Preserve each unique constraint in place or at a clearly reachable authoritative destination. A stated intentional duplication, transition case, fixture, or compatibility shim is itself a constraint; leave it or ask for a preservation mechanism.

## Redundancy review

After recording the preservation ledger, load and apply `redundancy-review.md` to compare instructions and pointers within and across the discovered agent-facing set. Complete this check before opportunities or a no-op conclusion; include its dispositions and coverage limits in the existing writing-lens audit.

## Finding useful opportunities

An opportunity needs visible evidence and a concrete navigation, maintenance, consistency, or clarity benefit. Suitable changes include tightening prose without dropping qualifiers, removing true duplication after finding a supported canonical home, replacing copied details with a thin reachable pointer, consolidating related guidance while retaining local routing, or separating stable instruction from background/reference.

Apply this writing lens after the ledger:

- **Context pointers:** name target and condition for reading it; do not hide stable prerequisites behind a weak pointer.
- **Information hierarchy:** keep always-needed constraints near execution; progressively disclose conditional background.
- **Canonical home:** consolidate only genuinely equivalent guidance at a visible reachable source.
- **Completion criteria:** clarify an existing procedure's recognizable result without inventing requirements or gates.
- **Pruning:** remove true duplication, stale easy-to-find caches, and behavioral no-ops while retaining intentional safety, review, and local-boundary repetition.

Do not manufacture edits for short, clear, intentionally local, or already well-routed documents. Do not claim semantic equivalence or token savings.

## Required discovery report

Before presenting opportunities, a direction, or a no-op result, begin the first discovery response with `### Writing-lens audit` and include these five ordered rows. Ground each in inspected document-specific evidence; an uninspected category is not Pass or Not applicable.

- **Context pointers** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and evidence.
- **Information hierarchy** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and evidence.
- **Canonical home** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and evidence.
- **Completion criteria** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and evidence.
- **Pruning** — **Pass**, **Opportunity**, or **Not applicable**: inspected path(s) and evidence.

Before a no-op conclusion, compare source-of-truth claims across all inspected agent-facing documents. A contradiction or a repeated claim with no visible canonical home is an opportunity for a canonical home, thin pointer, or user decision.

For each opportunity, state affected paths, visible evidence/problem, qualitative optimization, expected benefit, preserved constraints, uncertainty/risk, and the most useful diff to inspect.

## Selected changes

Let the user select, combine, reject, or revise opportunities. Selection is design input, not sign-off. For selected work, check the proposed edits against the preservation ledger and relevant pointers; if a unique constraint would be lost, unreachable, or uncertain, revise or stop.

Then apply `preview-review-protocol.md`: state one concise final direction, including linked reorganization/deletion and material safety/privacy/command effects, and wait for conversational sign-off. After sign-off, edit with ordinary tools, validate reachable pointers and local routing, and re-read affected documents only when freshness or an operation result is uncertain. A changed direction needs fresh sign-off.

## Verification and completion

After changes, compare edits against the preservation ledger; check that touched pointers remain visible and reachable; confirm no source/build/runtime, `.picm/`, generated, or unrelated files changed; and report qualitative results plus remaining uncertainty. This is not proof of semantic equivalence.

If discovery produces no useful evidence-backed proposal, do not manufacture one. Report exactly:

`No worthwhile optimizations found`
