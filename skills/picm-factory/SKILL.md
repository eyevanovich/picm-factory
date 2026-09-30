---
name: picm-factory
description: Runtime contract for the registered /picm-new, /picm-adopt, /picm-maintain, /picm-optimize, and /picm-help commands. Load only when an explicit registered command prompt requests picm-factory; do not activate from natural-language requests.
license: MIT
---

# PiCM Factory

PiCM Factory helps users create, adopt, maintain, and optimize folder-agent workflows and coding-repository context maps.

## Shared trusted-assistant contract

Use the user's request to establish intent and scope. Start with the current workspace and only the context needed for the task; ask when a missing or ambiguous location materially affects the result. A named external file or folder is read scope, not authority to write there.

Honor Git ignores, persisted `privacy.excludedPaths`, session exclusions, and known sensitive paths as discovery defaults. Keep secrets, credentials, regulated/private data, and sensitive client material out of reusable context, examples, summaries, and diagnostics. These are agent-followed boundaries, not a sandbox claim: choose eligible paths and bounded output deliberately, and do not imply that ordinary tools comprehensively enforce exclusions.

For **new**, **adopt**, **maintain**, and **optimize**:

1. Inspect before changing anything, preserving unrelated material and existing routing where suitable.
2. State one concise final direction: outcome, affected areas, material move/delete/replace effects, and meaningful uncertainty. Offer a diff or file review when useful or requested.
3. **Wait for conversational sign-off on that direction before edits.** The initiating request establishes intent but does not replace sign-off. Do not require a special phrase, proposal ID, digest, modal, or repeated approval for routine work within the agreed direction.
4. Use ordinary tools to make the aligned changes and validate appropriately. Seek renewed alignment only for a material departure, destructive action, or external write outside the signed-off direction.

An inspection or report request is no-edit. `/picm-help` is no-edit. Cancellation stops future work; retain and report completed effects without automatic rollback. A user-created Git checkpoint can be useful for substantial edits to existing content, but is advice only: never initialize, stage, commit, reset, clean, or restore Git for the user.

Finish with what changed, what was checked, and remaining uncertainty. Do not claim a report, closed conversation, or available tool proves that changes succeeded.

## Shared workspace principles

- **Security first:** preserve sensitive material in place; do not copy it into agent context.
- **Non-destructive default:** preserve existing files, folder names, routing, and settings unless the signed-off direction changes them.
- **Project-local install:** use project-local `.pi/settings.json` installed through `pi install -l ...` when relevant; do not recreate package configuration during normal work.
- **`.picm/` is small maintainer metadata:** visible workspace files are the routing source of truth; normal workflow routing skips `.picm/`.
- **Profiles are recommendations:** Coding Repository may be primary, and codebase mapping can complement another profile.
- **Mechanical work boundary:** recommend user-named scripts or integrations for deterministic work where useful; keep judgment and review in visible context rather than building an executor.
- **Maintenance reminders are optional:** a due reminder offers an ordinary maintenance request; it never launches autonomous work. Use `picm_maintenance_policy` `status` to inspect cadence, `configure` after sign-off with the last observed `expectedMaintenance` (omit it only when no policy was observed), and `complete` only after the agreed maintenance/optimization repair and validation—or an agreed inspection-only pass—finish. A selected unfinished repair must not clear the reminder. Preserve unrelated settings and report conflicts or partial effects honestly.
- **Privacy configuration:** use `picm_settings` `status` to see stored exclusions and `set-exclusions` with the last observed `expectedExcludedPaths` only after sign-off to persist them. Session-only exclusions stay in conversation; a stored exclusion update does not grant read or write authority.

## References

Load only the reference needed for the branch:

- `references/interview-guide.md` — `/picm-new` interview and first-run checklist.
- `references/layout-profiles.md` — profile definitions, stage placement, and specialist first-run receipt methodology.
- `references/adoption-guide.md` — `/picm-adopt` read-first adoption and readiness.
- `references/coding-adoption-guide.md` — coding-map detection, mapping choices, and curated/additive adoption.
- `references/maintenance-rubric.md` — `/picm-maintain` health and trace rubric.
- `references/coding-maintenance-rubric.md` — Strict/Balanced coding-map checks.
- `references/optimization-guide.md` — documentation-only preservation and five-row audit.
- `references/preview-review-protocol.md` — concise direction, optional review, and change completion guidance.

Templates under `templates/` are examples to adapt, not schemas to copy blindly.

## Mode: new (`/picm-new`)

Create the smallest scaffold useful for the first real run.

1. Inspect lightly and classify the folder as empty enough, source-material-only, or an existing workspace architecture. Treat `.git/`, `.pi/`, README/license/ignore files, manifests, editor folders, and OS noise as compatible with an otherwise empty workspace.
2. For source material, ask whether to build around it without moving or rewriting it. For existing architecture, recommend adoption; only scaffold over it when the user clearly chooses that direction.
3. Run the core interview in `references/interview-guide.md`, using command arguments as seed context and asking only missing critical questions. Establish **what will run first** before proposing structure.
4. Recommend a primary layout from `references/layout-profiles.md`, explain alternatives, and resolve Stage Pipeline placement before choosing stage paths.
5. Draft only routing, context, active stages/roles/recipes, real references/examples, artifact paths, and user-named scripts or integrations needed now. Stage contracts state what they read, do, write, and where human review occurs. Do not create speculative empty folders or placeholders.
6. If reminders are useful, ask whether to keep maintenance manual or configure an interval; include the configuration effect in the final direction.
7. Present the final direction and wait for sign-off. Then create the agreed scaffold with ordinary tools, resolving `createdAt` at write time and leaving no unresolved `{{picm:...}}` tokens. For an agreed cadence, use `picm_maintenance_policy` `configure` after the scaffold's config exists; do not overwrite unrelated config fields.
8. End with the layout-specific first-run checklist from the interview guide.

Typical files are root `AGENTS.md`, `CONTEXT.md`, necessary local `CONTEXT.md` files, and only justified reference/workflow content. `.picm/config.json` may hold minimal profile, path, cadence, and privacy metadata; it is not normal workflow context.

## Mode: adopt (`/picm-adopt`)

Make an existing workspace PiCM-compatible without disrupting what already works. Load `references/adoption-guide.md`; load `references/coding-adoption-guide.md` for `coding`, a selected coding branch, or codebase mapping in a hybrid workspace.

Inspect read-first and classify visible routing as adequate, partial, placeholder/unrelated, or conflicting/risky. Preserve `AGENTS.md`, `CLAUDE.md`, existing context, folder names, examples, and conventions unless the agreed direction changes them. For complex workspaces, an optional representative file-role inventory is orientation, never a migration authority.

Use the adoption report's readiness labels: **Ready**, **Ready with warnings**, **Needs routing before adoption**, or **Scanned only**. Offer minimal compatibility routing, stronger ICM routing, or scanned-only reporting as appropriate. Coding adoption chooses root/distributed/scan-and-recommend mapping and additive/curated depth, performs the Strict baseline, and records only useful map metadata.

Before any write, follow the shared contract and `preview-review-protocol.md`. A selected option or cadence is design input, not sign-off. In a curated direction, make merge, move, archive, rewrite, and deletion effects explicit. After successful adoption, offer—not require—an initial maintenance pass.

## Mode: maintain (`/picm-maintain`)

Maintain is a heuristic health report and focused drift investigation, not provenance tracing or automatic repair.

- `/picm-maintain` and focused arguments perform a read-first health check.
- `/picm-maintain trace "drift symptom"` investigates likely drift sources with confidence, not causal certainty.
- Load `references/coding-maintenance-rubric.md` for a Coding Repository profile, codebase-map capability, or visible `CONTEXT-MAP.md`. Apply the supplied one-run Strict or Balanced depth; do not change stored metadata merely because of that selection.
- At intake, offer optional agent-document optimization with **No** as the default; when included, load `references/optimization-guide.md` and keep its documentation-only scope and preservation checks. An already supplied answer needs no repeat question.
- Apply `references/maintenance-rubric.md`, including profile identification, repair tiers, and the cold-agent walk for general checks. Trace mode need not run the broad walk.

Report Pass, Warning, and Suggestion findings with likely cause, repair tier, and smallest safe healing path. Report-only is complete with no edits. If the user asks to repair findings, inspect the affected scope as needed, present one concise final direction, wait for sign-off, then implement and validate it. A maintenance report file is an edit and follows the same contract.

## Mode: optimize (`/picm-optimize`)

Load `references/optimization-guide.md` and follow it completely. Optimize only eligible agent-facing documentation: do not change source code, tests, manifests, runtime paths, generated artifacts, `.picm/` configuration, per-run artifacts, or unrelated material.

Inspect the relevant agent documents, preserve every unique visible constraint, and show the required five-row writing-lens audit before opportunities or a no-op result. Use the shared final-direction/sign-off sequence for selected improvements. If no evidence-backed improvement exists, report exactly:

`No worthwhile optimizations found`

## Mode: help (`/picm-help`)

Explain plainly; do not inspect or edit the workspace.

- `/picm-new [workflow description]` — optional free-form seed context for a minimal scaffold interview.
- `/picm-adopt [coding | adoption request]` — `coding` enters coding adoption; other text describes adoption focus.
- `/picm-maintain [strict | balanced | coding | routing | handoffs | stale-context | security | trace "drift symptom"]` — selects one-run depth, focuses a health check, or investigates a symptom.
- `/picm-optimize` — reviews agent-facing documentation for outcome-preserving improvements.
- `/picm-help` — shows syntax, setup, and behavior.

Arguments are optional; bare commands remain valid. In interactive Pi, a space after `/picm-adopt` or `/picm-maintain` shows available completions. Give one concrete example, such as `/picm-maintain trace "the final draft differs from the approved brief"`.

Choose `/picm-new` for a new or mostly empty workflow; `/picm-adopt` for existing source, instructions, or workspace architecture; `/picm-maintain` for health, routing, handoff, or drift checks; and `/picm-optimize` for agent-facing documentation that is repetitive, diffuse, or difficult to navigate. `/picm-adopt coding` is a shortcut for known coding repositories.

Install Pi project-locally with a pinned public package, for example `pi install -l npm:@eyevanovich/picm-factory@0.4.0`, or with a local checkout: `pi install -l /path/to/picm-factory`.

Strict is broader systematic coding-map coverage; Balanced is representative coverage of major boundaries and one coding path. Both are recommendations for one run, not persistent security modes.

Explain that modification commands inspect and propose a final direction, then wait for conversational sign-off before edits; they preserve existing files by default, with a Git checkpoint as optional advice. `.pi/` holds Pi installation settings; `.picm/` holds small maintainer metadata outside normal routing.

Include a short **Settings and reminders** explanation in the help answer: `picm_settings` can report or conditionally save project scan exclusions; `picm_maintenance_policy` can report or configure an optional cadence and record a completed pass. Both affect only the current project's `.picm/config.json` and preserve unrelated fields. When due, a reminder offers **Run Now** or **Later**; Run Now starts ordinary maintenance planning, not edits or automatic completion. Legacy automatic policies also only offer this choice. PiCM uses ordinary tools and agent-followed scope/privacy discipline; it is not an execution sandbox.
