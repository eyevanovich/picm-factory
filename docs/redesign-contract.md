# PiCM redesign: one collaborative behavior model

**Decision:** accepted in [ADR-0002](adr/0002-trusted-methodology-assistant.md).
**Delivery:** this document defines behavior, not a runtime bypass. The current implementation has switched commands and removed the old gates; previously installed or already-running versions may still enforce them. Interactive QA on an approved disposable workspace has exercised the five commands and due reminders; this does not prove every environment or publication path. Follow the controls of the version actually running.

## Product intent

PiCM helps a trusted agent and human curate, adopt, maintain, and improve ICM workflows/workspaces and coding-repository context. The methodology is the product; the extension provides convenient entry points and small configuration/reminder utilities. It is not an execution sandbox, transaction engine, or consent parser.

All commands share one behavior model. Their task differs, not their permission machinery:

- `/picm-new`: create or extend a workspace or workflow, reusing suitable existing material.
- `/picm-adopt`: organize existing material without unnecessary replacement or restructuring.
- `/picm-maintain`: find and repair drift, stale context, and broken handoffs.
- `/picm-optimize`: simplify agent-facing context while preserving intended outcomes.
- `/picm-help`: explain commands, methodology, configuration, and actual limitations; it does not initiate repository changes.

## Shared interaction contract

### Intent and scope

The user's request establishes intent. Interpret clear selections with explanatory text naturally. Ask when ambiguity materially affects the result; do not require standalone phrases or an intake questionnaire when the request already answers it. A request to inspect or report is not a request to edit.

Start with the current workspace and the context needed for the task. Do not broadly traverse unrelated directories. A named external file/folder supplied as context, or a clear user request to include it, establishes that read scope without an additional phrase ceremony. If the necessary location is unclear, ask. External read scope does not grant external write authority. A nested repository can be included conversationally on the same basis; do not initialize or fetch it automatically.

Honor Git ignores, persisted `privacy.excludedPaths`, session exclusions, and known sensitive paths as discovery defaults. Configured privacy exclusions remain meaningful; do not discard them during migration. Inclusion of a directory does not silently override its sensitive-content exclusions. Ask about a specific conflict when needed rather than forcing a privacy round trip for every command. Never copy secrets, credentials, regulated/private data, or sensitive client material into reusable context, examples, summaries, or diagnostics.

These are agent-followed boundaries, not universal tool enforcement. Ordinary read/search tools may not apply every exclusion automatically; the agent must choose eligible paths and bounded output deliberately. Shell, consultation context collection, and custom tools can access additional material. Do not promise comprehensive interception or classify those tools as privacy-safe merely because they are useful. Any future optional discovery helper must remain a convenience, not a prerequisite or a recreated scan-state machine.

### Alignment and changes

Briefly explain consequential changes before making them: intended outcome, affected areas, meaningful replacement/deletion/move effects, and important uncertainty. Offer exact diffs or file review when useful or requested. Match detail to the change; do not force fixed summary categories, proposal IDs, digests, or review dialogs.

For modification commands, inspect first, present a concise final direction, and wait for the user's conversational sign-off before edits. The initiating request establishes intent but does not replace that sign-off. Approval concerns the direction, not every individual edit; proceed through routine implementation and validation without repeated questions. Seek renewed alignment only for material departures, including destructive or external-write actions outside the approved direction. Inspection-only requests and help need no modification approval. Agent instructions own this discipline; runtime tools do not parse consent or store approval authority. Never interpret cancellation, vague assent to a different question, or generated continuation text as sign-off.

Recommend a user-created Git checkpoint for substantial existing-content changes where useful. It is advice, not a prerequisite, spelling test, or clean-tree requirement. Do not automatically initialize, stage, commit, reset, clean, or restore. Any Git inspection remains subject to the user's instructions; do not claim verified checkpoint coverage from a report alone.

Perform the agreed work using ordinary tools. Preserve unrelated content and settings; re-read affected files when concurrent changes are apparent. Keep layout profiles as recommendations, preserve existing routing where suitable, and avoid adding architecture simply to satisfy a template.

### Validation and completion

Use available documentation, consultation, syntax checks, tests, and bounded local validation as appropriate. Do not introduce a PiCM-specific blanket ban on those tools. Respect their actual scope and side effects: permission to validate a local script is not permission for a production deployment, authenticated provider operation, or external publication.

Finish with what changed, what was checked, and what remains uncertain or unfinished. A report-only result is appropriate when requested or when a real blocker prevents implementation; it is not the default substitute for an authorized repair. A calculated reminder policy is not a saved policy. A closed session is not proof that changes succeeded.

### Recovery and redirection

If an operation fails, report known effects, inspect relevant state if necessary, and adjust with the user. Do not automatically roll back completed changes or blindly replay failed/uncertain work. No frozen proposal or approval token is needed to make an ordinary, aligned repair.

Cancellation stops future work; already-issued operations may finish. Retain and report completed changes. The user can stop, redirect, or start an ordinary coding task without a lingering PiCM lock. Stopping does not itself authorize new reads or edits, erase stated privacy constraints, or make a previous plan current.

## Generated workflow behavior

Preserve existing profiles, recipes, stage structure, evidence conventions, and meaningful methodological review/handoff decisions during this refactor. Remove extension-specific scan/authorization instructions from generated content and reduce redundant questions, but do not redesign stage flow or blanket-remove artifact review. Revisit broader flow simplification after exercising the refactored commands. Respect deployment/setup already completed by the user rather than repeating intake unnecessarily.

## Small runtime responsibilities

Retain project-local installation, slash-command registration/argument conveniences, skill dispatch, and useful reminder/configuration support. Use native decision modals when they help the user choose, with conversational fallback; modal responses are information for the agent, not approval tokens. Nothing should require a custom TUI or general workflow executor.

Configuration writes still need validated values, preservation of unrelated fields, conflict checks, appropriate file handling, and truthful commit/partial-effect results. These are local integrity safeguards, not general agent-write authority; check-before-publication does not eliminate a precisely timed external edit between the last check and rename. Do not read excluded opaque configuration merely to produce a diagnostic.

Reminder cadence remains explicit and optional. No autonomous agent work occurs because a reminder is due, while Pi is closed, or outside an eligible interactive session. Offer the user a maintenance request; record completion only when the agreed pass is actually complete. Report-only completion can count when that was the agreed task, not when a requested repair is still unfinished.

Preserve existing layout/profile information, privacy exclusions, and cadence settings where usable. Keep minimal `.picm/` metadata maintainer-oriented; visible workspace files remain the routing source of truth. Contract compatibility for the gate tools is not a goal. No strict mode or legacy permission engine ships alongside the replacement.

## Responsibility-level migration map

The map names inspected repository owners; it is not an instruction to delete files wholesale. Mixed modules must shed obsolete authority while preserving useful behavior in a smaller owner.

### Extension and runtime

- `extensions/picm-factory.ts`: keep five command entry points and useful argument completions. Replace protocol-heavy prompts with shared behavior and task-specific routing. Remove built-in tool interception, blanket tool-call blocking, direct-reply consent capture, injected approval continuations, and scan/proposal authority restoration. Rebuild reminder hooks only around optional prompting and honest completion.
- `extensions/runtime/runtime-coordinator.mjs`: remove scan admission, write authorization, checkpoint recognition, phase transitions, and frozen proposal orchestration. Extract only responsibilities still needed for command dispatch, config utilities, or reminders; do not rename the coordinator into another universal executor.
- `extensions/runtime/workflow-lifecycle.mjs`: remove permission phases and exact-choice authority. Preserve only genuinely necessary reminder/task bookkeeping, if any; task cancellation must not become an access lock.
- `extensions/runtime/scaffold-approval.mjs`, `approval-runtime.mjs`, `proposal-batch.mjs`: retire machine consent, frozen operation approval, and approval continuation. Preserve useful review formatting or partial-effect principles only if ordinary tools do not already provide them. No replacement proposal engine.
- `extensions/runtime/git-read-gate.mjs`, `path-execution-binding.mjs`: retire comprehensive read interception, admitted-candidate binding, and protected replacement search execution. Reassess any reusable ignore/path-discovery utilities independently; do not require them before ordinary reads. Search should use host tools, eliminating the extension-owned runtime dependency-resolution path implicated in the reports.
- `extensions/runtime/privacy-policy.mjs`: preserve useful validation/normalization of stored exclusions. Separate that configuration responsibility from universal enforcement claims; explicit external context is scope, not a rewrite of project-relative stored exclusions.
- `extensions/runtime/maintenance-config-store.mjs`, `maintenance-policy.mjs`, `maintenance-controller.mjs`: retain optional cadence and narrowly scoped config integrity. Simplify gate coupling and stacked confirmations. Preserve conflict handling, unrelated settings, permissions, honest commit semantics, and non-autonomous reminders.
- `extensions/runtime/coding-maintenance-depth.mjs`, `layout-profile.mjs`: retain useful recommendations and focus/depth vocabulary; no permission implications.
- `extensions/runtime/specialist-first-run-guidance.mjs`: retain useful route-aware first-run guidance if needed. Remove any mandatory receipt/approval dependency that makes ordinary completion brittle; generated instructions must match visible files.
- Registered `picm_scan_control`, `picm_scaffold_proposal`, and `picm_proposal_batch` tools: retire rather than emulate. Reassess maintenance-policy and first-run helpers on usefulness alone; neither may impose the old workflow protocol.

### Methodology and distribution

- `skills/picm-factory/SKILL.md`: replace shared protected-tool choreography with this interaction contract; retain mode routing and substantive methodology. Load the runtime skill only through its explicit command entry points, not because someone discusses PiCM implementation.
- `skills/picm-factory/references/preview-review-protocol.md`: rewrite as lightweight conversational change/review guidance, not an execution protocol.
- Adoption, coding-adoption, maintenance, coding-maintenance, optimization, interview, and layout references: keep domain substance; remove phase/tool prerequisites, exact phrases, checkpoint blocking, redundant intake, and stage-by-stage approval rituals.
- `skills/picm-factory/templates/`: preserve profiles, output contracts, and meaningful existing review/handoff stages. Remove extension permission-protocol references, not methodological stages. Audit actual generated instructions, not only the runtime skill.
- `prompts/`: update repository-only backing text to the same model; keep package prompt discovery disabled so extension commands are not duplicated.
- `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, QA/release guidance, and changelog: update safety claims and routing when implementation lands. Do not describe the target as current shipped behavior before then.
- `package.json` and `scripts/check-package.mjs`: preserve project-local package shape and repository-only QA assets; remove dependencies and shipped runtime files made unnecessary by the redesign.

### Tests and QA

- Retire tests whose purpose is preserving the removed scan/approval protocol: scaffold/proposal authority, continuation-token grammar, admission lifecycle, and guarded tool binding. Review mixed tests for surviving config, scope, or partial-result behavior before removal.
- Keep useful layout, routing, config integrity, cadence, packaging, and privacy-configuration tests. Rewrite wording contracts that encode mandatory ceremony.
- Replace protocol assertions with focused extension tests and disposable interactive task-completion scenarios. Automated unit tests cannot establish agent conversational behavior; report interactive evidence separately.

## Delivery and acceptance

The ordered file-level work packages and their completion checks are in [the implementation plan](redesign-implementation-plan.md). This contract owns behavior; that plan owns delivery order.

Before substantial implementation, create the public tracking issue required by `CONTRIBUTING.md` with maintainer authorization. Do not publish private session content or credentials. Implement one shared foundation and migrate all commands to it; do not ship competing old/new interaction models or a strict fallback. Changes can be developed incrementally without claiming an intermediate gate deletion is a finished redesign.

Acceptance requires:

1. All five commands dispatch with the shared contract and appropriate task methodology, without scan phases, special approval phrases, or proposal authority tools in shipped instructions.
2. A new workflow can reuse existing architecture, accept a selection with explanatory text, present a final direction, wait for sign-off, write aligned changes, validate them, and save an agreed cadence. Checkpoint advice cannot block it.
3. Optimization can search and update eligible references using ordinary host tools in a project-local install, with no extension-owned coding-agent import needed for search execution.
4. Adoption and maintenance can perform agreed repairs rather than stop at an obligatory inspection/report boundary. Report-only intent remains supported.
5. Named external context and nested repository context work conversationally; neither grants implicit external writes. Agent guidance honors exclusions and protects sensitive material, without claiming arbitrary-tool enforcement.
6. Advisor/documentation and appropriate local validation are available. Scope and external side effects remain explicit; a tool exemption is not a privacy guarantee.
7. Cancellation/redirection leaves honest partial results and permits a freshly scoped ordinary task. Concurrent file/config changes are not silently overwritten by stale assumptions.
8. Existing methodology, meaningful review/handoff decisions, outcomes, routing, and requested stage placement remain intact. Generated content contains no obsolete extension permission protocol; broader stage-flow redesign is deferred.
9. Cadence/config changes preserve unrelated values and exclusions, surface conflicts and committed effects accurately, and never start autonomous edits. Unfinished repairs do not silently clear reminders.
10. Runtime, references, backing prompts, templates, public guidance, and tests agree. `npm run check` passes; manual interactive QA is reported separately and runs only on explicitly approved disposable targets.

The two supplied failure reports motivate these scenarios; they are not independent reproductions or proof of a particular approval-parser defect. No reported scaffold should be replayed from memory as part of this redesign.
