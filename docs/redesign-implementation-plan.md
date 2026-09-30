# Trusted-assistant redesign implementation plan

**Status:** P0–P3 implemented and reviewed. P4 interactive QA has run on the approved disposable target `/tmp/picm-factory-redesign-qa-20260930`; automated checks and package dry-run pass. Text fallback and config-conflict edge cases remain test-only, not manual demonstrations. Real-user replay, deployment, and release/publication remain separate decisions.
**Behavior authority:** [redesign contract](redesign-contract.md), accepted in [ADR-0002](adr/0002-trusted-methodology-assistant.md).

This plan follows the short design interview: plan before edits, user sign-off on the final direction, instructional boundaries, preserved methodology, less chatter, useful nudges, and selective native modals. Approval is an agent responsibility; this plan does not reintroduce a consent state machine.

## Scope and success

Replace PiCM's execution-authority layer, not its ICM methodology. All modification commands inspect, propose a concise direction, wait for conversational sign-off, edit using ordinary tools, validate, and report. Routine work within that direction proceeds without repeated approval. Report-only and help remain no-edit paths.

Success is a completed useful task, not merely a gate rejection or a closed scan. Preserve profiles, context-map practices, recipe semantics, stage placement, evidence conventions, meaningful review/handoff decisions, existing configuration values, and optional reminders. Broader methodological flow changes are out of scope.

No strict mode, compatibility authority stubs, custom TUI, replacement workflow executor, automated rollback, or speculative discovery framework. Do not repair the extension-owned search binding merely to keep it alive: ordinary host search replaces it.

## Inspected seams that determine the order

- `extensions/picm-factory.ts` both dispatches commands and replaces built-in tools. Its input/start/tool hooks capture authority and inject continuation context; session hooks restore scan state and coordinate nudges.
- `extensions/runtime/runtime-coordinator.mjs` mixes authorization, config policy tools, completion, startup reminders, and specialist route receipts. Removing command gates alone leaves many consumers behind.
- `extensions/runtime/maintenance-config-store.mjs` requires a Git read gate in its constructor and calls it for configuration access. Its field updates, locks, conflict checks, permissions, and commit reporting are separately useful.
- `extensions/runtime/maintenance-controller.mjs` already isolates policy calculation, status, due probing, and conditional cycle reset. `maintenance-policy.mjs` validates existing manual/nudge/automatic settings and calendar arithmetic.
- `scripts/check-package.mjs` explicitly requires the old authority files, hooks, tools, and exact privacy wording. It must change with their removal, not after it.
- Existing tests mix obsolete protocol assertions with useful configuration, methodology, layout, and packaging coverage. Tests must be classified by responsibility before deletion.
- Pi native dialogs support decisions without custom rendering. Commands have `waitForIdle`; idle/session hooks do not have the same command-only contract. Reminder dispatch must respect that distinction.

## Target ownership

All tool interfaces below are proposed implementation contracts, not currently available runtime behavior.

### Thin extension

`extensions/picm-factory.ts` owns registration, argument conveniences, native dialog rendering, and sending a short command prompt. It does not replace built-in tools, observe consent, restore approvals, block tools, or inject hidden continuation instructions.

A small new `extensions/runtime/command-dispatch.mjs` owns pure mode/argument-to-prompt mapping, making command routing testable without duplicating methodology. Prompts point to the runtime skill and relevant mode; the skill owns the shared interaction sequence. Retain `coding-maintenance-depth.mjs` for strict/balanced recommendations, not security modes.

### Local utilities, not permissions

- Keep `maintenance-policy.mjs`, `maintenance-controller.mjs`, `maintenance-config-store.mjs`, and `privacy-policy.mjs` for narrow configuration responsibilities.
- New `extensions/runtime/maintenance-reminder.mjs` owns due-offer deduplication and reminder presentation outcomes. State is session/workspace scoped and non-authoritative.
- Simplify `picm_maintenance_policy` to `status`, `configure`, and `complete`. `configure` accepts requested cadence directly after conversational plan sign-off; no preview ID, expiry, or parsed acknowledgment. `complete` conditionally advances an existing scheduled cycle after the agent reports the agreed maintenance/optimization task complete. No cycle is created implicitly.
- Status results expose only useful policy/privacy settings, not the whole opaque config. Config writes preserve unrelated fields. Cadence tools do not grant permission to ordinary edits.
- Register `picm_settings` with `status` and `set-exclusions` actions for the current workspace's fixed `.picm/config.json`. `status` projects stored privacy settings; `set-exclusions` accepts normalized project-relative exclusions and the previously observed exclusion value for a conditional update. Reuse the existing projected privacy/config integrity behavior, not scan admission or a frozen proposal. Session-only exclusions live in conversation. A persisted exclusion update is part of a signed-off direction, not a second runtime approval ritual. This helper has no arbitrary path parameter and does not expose opaque config members. A stale exclusion observation returns a conflict without writing; malformed config or linked/escaping config paths return a specific error without mutation. Preserve unrelated fields and unknown privacy members.
- Provide a small optional `picm_decision` tool in the extension: question plus labeled choices, returning selected/dismissed/unavailable. Use native `ctx.ui.select` where supported; return to conversation when unavailable. It stores no workflow or approval state. Useful cases include profile, placement, and maintenance depth. The agent can ask in text instead; do not stack a modal after an equivalent answer.
- Keep `specialist-first-run-guidance.mjs` as a pure formatter only if its output remains useful. Retire its mandatory model tool and route-receipt authority: methodology guides the agent from actual generated files. Keep `layout-profile.mjs` only where a retained caller benefits from it.

### Reminder rules

Preserve legacy `automatic` policies for reading without launching automatic agent work: both scheduled modes offer a due reminder, and Run Now remains a direct user choice. New setup favors nudge/manual; explain legacy behavior honestly rather than silently rewriting settings.

A due offer can use a widget and native Run Now/Later choice, without a new scheduler. Run Now sends the ordinary maintenance request, which still plans and seeks sign-off before edits. It neither approves repairs nor advances timestamps. During an active turn, queue dispatch using Pi's supported message-delivery contract; never use command-only waiting from session hooks. Deduplicate per workspace/session/due timestamp, handle dismissal, and reset presentation state on session changes. Shutdown only cleans UI/state; it does not mark maintenance complete.

Completion is an explicit agent-called utility, instructed only after agreed repairs/validation are finished or an agreed inspection-only pass finishes. Cancellation, partial repairs, unresolved requested work, incidental replies, and `agent_settled` do not reset cadence. This is an instructional completion discipline, not runtime certification that work occurred. A reset conflict is reported without erasing changed settings or claiming success.

## Ordered work packages

Work sequentially through the dependencies. Update focused tests in each package. P1 can land while existing commands remain coherent; P2 is the breaking switch and must not be released half-complete. No live or disposable write-capable QA is authorized by this planning document.

### P0 — Lock the design and tracking

**Files:** this plan, `docs/redesign-contract.md`, `docs/adr/0001-practical-write-safety.md`, `docs/adr/0002-trusted-methodology-assistant.md`.

**Work:** reconcile earlier initiating-request approval language with required final-direction sign-off; preserve methodological reviews; record target/current-runtime distinction. Obtain plan acceptance. With maintainer authorization, open the GitHub tracking issue required by `CONTRIBUTING.md` before substantial implementation; publish only synthetic/minimal evidence.

**Done:** these documents agree; maintainer accepts the ordered implementation scope; tracking exists or the maintainer explicitly changes that contribution requirement. No runtime edits in P0.

### P1 — Isolate retained utilities

**Depends on:** P0 approval.

**Files:** `extensions/runtime/maintenance-config-store.mjs`, `maintenance-controller.mjs`, `maintenance-policy.mjs`, `privacy-policy.mjs`; new `maintenance-reminder.mjs`; `test/maintenance-config-store.test.mjs`, `maintenance-controller.test.mjs`, `maintenance-policy.test.mjs`, `privacy-policy.test.mjs`; new `test/maintenance-reminder.test.mjs`; `scripts/check-package.mjs` if a new runtime file is packaged.

**Work:** separate fixed-path config integrity from global Git-gate authorization. Keep a temporary injected access adapter for existing callers so current dispatch does not silently lose its contract before P2; it is not a shipped compatibility mode. Prepare projected settings operations, cycle completion, and session-local due-offer logic independently of scan lifecycle. Keep cancellation/commit semantics, locks, permission preservation, and field-conflict behavior. Derive reminder behavior from policy/controller rather than another policy model.

**Checks:** invalid/missing/linked config; preserved opaque fields/privacy; cadence arithmetic; concurrent updates; cancellation before mutation and honest issued-I/O/committed outcomes; legacy scheduled modes only yield offers; duplicate offers/session changes; no implicit reset. Existing tests still pass with current command behavior intact.

**Done:** utility tests pass without requiring scan authority in the new utility path; old extension behavior remains coherent; adapter removal is explicitly assigned to P2.

### P2 — One coherent breaking command switch

**Depends on:** P1.

**Runtime files:** `extensions/picm-factory.ts`; new `extensions/runtime/command-dispatch.mjs`; retained utility modules; `coding-maintenance-depth.mjs`, `layout-profile.mjs`, `specialist-first-run-guidance.mjs` as needed.

**Remove after last consumer is migrated:** `extensions/runtime/runtime-coordinator.mjs`, `workflow-lifecycle.mjs`, `scaffold-approval.mjs`, `approval-runtime.mjs`, `proposal-batch.mjs`, `git-read-gate.mjs`, `path-execution-binding.mjs`. Delete the P1 temporary adapter and gate constructor dependency. Retire `picm_scan_control`, `picm_scaffold_proposal`, `picm_proposal_batch`, and the authority-bound first-run tool.

**Guidance files, same package:** `skills/picm-factory/SKILL.md`; `references/preview-review-protocol.md`, `interview-guide.md`, `layout-profiles.md`, `adoption-guide.md`, `coding-adoption-guide.md`, `maintenance-rubric.md`, `coding-maintenance-rubric.md`, `optimization-guide.md`; all five `prompts/picm-*.md`; `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `qa-runner/CONTEXT.md`, `docs/layout-fixture-qa.md`, `docs/picm-new-scenarios.md`. Inspect templates and change any extension-protocol promises here, retaining methodological review sections. Documentation of removed behavior cannot wait for P3.

**Work:** register all five commands using pure dispatch; preserve supported syntax and clear user arguments. Remove built-in replacements, input/consent observers, hidden continuity, tool gates, scan restoration, and approval audits. Wire optional decisions and narrow configuration utilities. Use native modal/text fallback without a separate authorization path. Replace startup/shutdown hooks with reminder-only responsibilities. Ignore legacy authority session entries; neither revive them nor delete user settings. Instruct agents to inspect ordinary workspace context, honor exclusions, include authorized external context, propose final direction, wait for sign-off, and use ordinary edits/search/validation. Keep higher-priority user constraints in force.

**Command acceptance:**

- New reuses existing architecture and requested placement; conversational intent plus explanatory text works; signed-off changes and cadence can be saved.
- Adopt preserves user material and meaningful adoption choices; no mandatory initial-maintenance chain.
- Maintain preserves strict/balanced methodology and focus/trace inputs; already supplied depth is not asked again. Native choices are useful, not prerequisite intake.
- Optimize can search references and implement the agreed migration with host tools; no protected-search dependency resolver.
- Help explains syntax, shared behavior, settings, and non-sandbox limitations without requesting privacy or edit approval.

**Test files:** add `test/command-dispatch.test.mjs`, `test/collaborative-contract.test.mjs`, `test/decision-tool.test.mjs`; rewrite `maintenance-extension.test.mjs`, `maintenance-policy-extension-integration.test.mjs`, `maintenance-dialogs.test.mjs`, `preview-review-contract.test.mjs`, `optimization-contract.test.mjs`, `security-adoption-contract.test.mjs`, `source-material-local-only-contract.test.mjs`, and mixed specialist/maintenance integration tests around surviving behavior. Keep test assertions structural; textual tests check instruction presence, not that the agent obeys them.

Retire authority-only tests after retained assertions move: `git-read-gate.test.mjs`, `path-execution-binding-integration.test.mjs`, `proposal-batch-integration.test.mjs`, `proposal-review-text.test.mjs`, `interactive-approval-lifecycle.test.mjs`, `runtime-coordinator-admission-integration.test.mjs`, `runtime-coordinator-scan-integration.test.mjs`, `workflow-lifecycle-authority-integration.test.mjs`, `workflow-lifecycle.test.mjs`. Rewrite cancellation/completion tests for narrow helper outcomes rather than carrying forward a workflow lock. Review all remaining `maintenance-*.test.mjs` and `specialist-*.test.mjs` consumers before removing APIs.

**Packaging:** update `scripts/check-package.mjs` required/packed lists and obsolete gate-copy assertions in the same change. Update `package.json`/`package-lock.json` only for actual dependency/manifest changes; preserve project-local install, peer-dependency conventions, no backing-prompt autoload, and QA exclusion. Do not change release automation architecture or manually invent changelog entries outside its documented process.

**Checks:** registration tests show no built-in replacement or tool-call blocking; no authority tools or hidden consent context; helpers work without workflow activation; modal dismissal/unavailability stores no authority; nudges require Run Now and cannot reset on incidental settle/shutdown; projected config outputs do not expose opaque members. `npm run check` passes against the updated package contract. Search current shipped resources for removed tool/API names and resolve every active reference; historical ADR/test migration notes may name them.

**Done:** every command uses the same new contract; all consumers and package assertions migrate; deleted machinery has no active import; no strict/old-new switch. Do not report agent behavior proven until P4.

### P3 — Preservation and simplicity audit

**Depends on:** coherent P2.

**Files:** `skills/picm-factory/templates/{root-agents,root-context,stage-context,specialist-context,context-map,code-boundary-context,handoff-card}.md`; substantive references; retained `specialist-first-run-guidance.mjs`/`layout-profile.mjs`; `test/stage-pipeline-placement-contract.test.mjs`, specialist contract tests, `test/fixtures/`, scenario docs and package checker as needed.

**Work:** compare resulting methodology with pre-refactor profiles and synthetic fixtures. Verify first-run guidance reflects actual files without a receipt tool. Preserve stage contracts and meaningful human reviews. Remove repetition or now-unused helper code only where the same responsibility is already covered. Keep prompts as pointers rather than copies of skill procedure. Record remaining broader flow ideas as deferred, not implementation tasks.

**Checks:** root/nested placement, routing, working-versus-reference separation, unknowns, handoffs, cold-agent walk/trace, codebase-map shape, and specialist input semantics survive. No added mandatory intake, generic executor, receipt choreography, or new architecture for its own sake. `npm run check` passes.

**Done:** no methodological regression or dead helper consumer found; surviving runtime owners are named and narrowly scoped. This package is an audit/cleanup, not a place to defer correctness needed by P2.

### P4 — Task-completion QA and release readiness

**Depends on:** P3; explicit approval of named disposable write targets and QA actions.

**Files:** `qa-runner/CONTEXT.md`, `docs/layout-fixture-qa.md`, `docs/picm-new-scenarios.md`, synthetic scenarios under `test/fixtures/`; concise evidence in the authorized tracking issue. Release metadata follows `docs/releasing.md` only when separately requested.

**Manual scenarios:**

1. Project-local install with host coding-agent outside PiCM's dependency tree: optimize CLAUDE/AGENTS references with ordinary search, sign-off, edits, and validation.
2. Existing coding workspace plus nested Stage Pipeline: new reuses architecture, accepts explanatory choices, handles manually relocated helpers, presents final direction, waits for sign-off, then saves agreed two-week cadence. No secret config read or replay of the reported proposal.
3. Adopt and maintain on representative fixtures: preserve context/routing; trace/focus/depth stay useful; report-only performs no edits; repairs finish after one direction approval.
4. External synthetic context and private exclusions: inspect named external material without implicit external writes; agent avoids excluded sentinel content. Record this as observed instruction-following, not proof of a sandbox.
5. Modal and text paths: supplied answers suppress redundant questions; dismissed modals do not imply consent; non-UI dispatch remains usable.
6. Due nudge: Later does nothing, Run Now starts planning rather than approving edits, legacy automatic never self-launches; completion/reset conflict reported accurately.
7. Cancel before edits, then request an ordinary task: no lingering lock. Inject a local edit/config conflict or operation failure; completed effects are reported, no automatic rollback, no blind stale overwrite or automatic cadence reset.
8. Help and documentation/Advisor/local-validation tools work without PiCM blocking; validation permission does not trigger production or publication.

**Evidence:** scenario/target, command, final-direction sign-off, actual changes, checks run, prompts/modals encountered, final result, and defects. Count extra turns qualitatively; do not optimize away meaningful clarification just to meet a turn count. Use visible Herdr QA guidance, synthetic data, and no real deployment/network side effects.

**Done:** all five commands demonstrated; reported failure scenarios complete through the intended ordinary-tool paths; config/nudges verified; no gate dance or methodological loss; final `npm run check` and package dry-run pass. Manual evidence is separate from unit/package results. Any unresolved task-completion failure blocks declaring the redesign complete.

## Stop and report boundaries

An implementing agent completes one package at a time and reports files changed, checks, retained responsibilities, and unfinished work. A new consequential architectural choice outside this plan returns to the maintainer; ordinary implementation choices do not require repeated sign-off. No public issue, commit, publication, real-user replay, or write-capable interactive QA is implied by plan acceptance alone.

If P2 reveals an inseparable retained responsibility, extract it narrowly rather than restoring the coordinator. If migration cannot stay coherent, stop and revise the package boundary instead of adding a feature flag. The maintainer reviews the implementation direction and completion evidence, not an unrestricted rewrite.
