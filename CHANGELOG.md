# Changelog

All notable changes to PiCM Factory will be documented here.

## [0.4.0] - 2026-09-24

### Added

- Prepare v0.4.0 release.
- Generate Specialist Folder first-run guidance from approved scaffold routes, including recipe inputs, expected artifact, approval gate, visible uncertainty, downstream source, and maintenance timing.
- Validate Specialist recipe semantics, local route safety, complete input classification, approved writes, and resolved scaffold content before rendering guidance.
- Reproduce the FAQ-polisher fixture and add focused contract and runtime-route coverage while preserving Stage Pipeline placement behavior.
- Detect Specialist Folder workspaces during protected inventory when `identity.md`, `rules.md`, `reference/`, and `workflows/` are present, while treating `examples.md` as optional.
- Require maintenance summaries to explicitly identify complete Specialist Folder profiles while preserving existing routing and custom layouts.
- Add focused, write-cancelling coverage for both Specialist Folder fixtures and include the new runtime module and test in package checks.
- Add an auditable, fail-closed proposal batch boundary for approved `/picm-adopt` and `/picm-maintain` create, modify, delete, and linked-move operations.
- Revalidate protected paths and expected contents before applying exact batches, with transactional rollback and strict post-scan lifecycle enforcement.
- Add mixed-operation fixtures, behavioral coverage, and concise workflow documentation for approval, cancellation, revision, and failure cases.
- Resolve Stage Pipeline placement before previewing paths, preserving explicit root-numbered or nested seeds and defaulting to root-numbered only when the user has no preference.
- Apply the selected placement consistently across scaffold previews, generated paths, config hints, and first-run guidance while preserving privacy-first dispatch ordering.
- Add focused placement contract coverage and include it in package validation.
- Expand full privacy-bootstrap prompts to explicitly ask about secrets, regulated data, client data, and personal/private material, request exact project-relative exclusions, and retain a clear `none` response.
- Apply the updated prompt across new, adoption, incomplete maintenance, and optimization flows while preserving concise completed-workspace prompts and non-TUI new-workspace dispatch.
- Update workflow guidance, documentation, package checks, and extension/runtime interface tests for the revised privacy question.
- Offer an initial maintenance pass after successful adoption, reusing confirmed privacy exclusions and the standard Strict-preselected depth flow.
- Add optional agent-document optimization to maintenance intake while preserving the standalone optimizer’s scope, safeguards, and default-No behavior.
- Advance maintenance schedules only after successful maintenance, with synchronized documentation and automated coverage for completion, decline, and cancellation paths.
- Harden PiCM workflow safety and QA.
- Replace interactive scan TTL expiry with authorization that remains active until completion, reset, or session closure.
- Clarify privacy prompts and automatically load persisted maintenance exclusions before requesting any additional run-specific paths.
- Preserve applicable review state during conversational proposal revisions and invite optional diff inspection before approval.
- Allow unambiguous approval directly from the complete current summary when no mandatory exact review is pending.
- Keep exact review available on demand and mandatory for deletions or changes to safety, permissions, approval boundaries, and required commands.
- Align dispatch prompts, workflow guidance, public documentation, QA scenarios, and contract tests with the streamlined approval flow while preserving separate control-write confirmations.
- Replace descriptor leasing and `/proc/self/fd` operations with canonical path revalidation, enabling guarded file creation on macOS, Linux, and Windows.
- Simplify workflow completion so the runtime steps down without locking out subsequent tools, while retaining Git-ignore and privacy-exclusion enforcement.
- Expand trusted package-resource reads, resolve ripgrep from the extension package root, and refocus runtime tests and documentation on the portable path-boundary contract.
- Replaces due-maintenance notifications and automatic dispatch with a persistent TUI reminder offering `Run Now` and `Defer`.
- Routes `Run Now` through the standard privacy review and Strict/Balanced depth selection, clearing the reminder and advancing timestamps only after successful completion.
- Keeps legacy manual, nudge, and automatic policies parseable while updating setup guidance, documentation, and regression coverage for reminder-based scheduling.
- Make coding adoption and interactive maintenance Strict-first while preserving Balanced selection and historical Light compatibility.
- Bind guarded read, edit, write, grep, rg, find, and ls operations to validated paths, with fail-closed lifecycle, hard-link, resource, and retarget protections.
- Filter protected traversal across privacy and nested Git boundaries, and harden guarded search termination against late child or stream errors.
- Add `/picm-optimize` as a privacy-first, documentation-only workflow for evidence-backed, outcome-preserving improvements to agent-facing guidance.
- Enforce protected discovery, selectable proposals, preservation checks, exact review requirements, and separate write approval while excluding source, runtime, generated, private, and `.picm/` content.
- Synchronize command registration, help and reference documentation, package validation, QA guidance, and regression coverage for the new flow.
- Add summary-first previews for every adoption and maintenance write, with separate approval and mandatory exact review for deletions and sensitive control changes.
- Define selective exact-review navigation and rendering for modified, new, deleted, and linked-move files while preserving review state across navigation.
- Synchronize command guidance and documentation, and add contract tests and package validation for the shipped preview-review protocol.
- Add slash-command arguments and autocomplete, plus evidence-backed navigation guidance for non-obvious change impacts and operational status.
- Enforce privacy-first workflow bootstrap with metadata-only preflight, exact exclusions, canonical packaged-resource reads, protected scans, and legacy privacy-config preservation.
- Serialize scan controls and preserve completed workflows through settlement, with focused concurrency, restoration, resource-boundary, and config regressions.

### Fixed

- Restore release preparation inputs.
- Reauthorize every proposal source and destination against current Git and PiCM protections before starting any mutation.
- Reload persisted and session privacy exclusions at apply time while preserving content validation, cancellation precedence, and existing audit semantics.
- Add coverage for newly protected root, nested, local, global, session, and persisted paths, ensuring blocked batches remain no-write.
- Pin `@earendil-works/pi-server` 0.85.0 as a development dependency and commit the npm lockfile for reproducible Pi integration validation.
- Switch release and publish workflows to locked `npm ci` installs, and document the Node/npm contributor setup.
- Synchronize and stage the lockfile’s package versions during release preparation while preserving its dependency graph, with focused release-preparer coverage.
- Reopen a protected scan phase after coding mapping and adoption-depth choices, keeping Curated inspection active through proposal resolution before ending and completing the workflow.
- Preserve gate enforcement between phases and ensure declined Curated proposals complete without writes or blocked-read retries.
- Add focused lifecycle coverage and update the coding-adoption guidance and fixture QA expectations.
- Preserve the initiating `/picm-new` request and directly observed architecture choice across follow-up phases and session restoration.
- Require an explicit adopt, add/replace, or cancel choice before further protected scans; vague continuations remain non-writing and cancellation completes without writes.
- Refine workspace-local architecture detection and document and test the resulting workflow behavior.
- Add a `/picm-new` approval runtime that binds explicit approval to the current exact scaffold operation set and blocks vague assent, stale proposals, and unregistered mutations.
- Preserve the scaffold approval gate for new and existing-architecture paths, invalidating approval when revisions or session changes occur.
- Document the explicit approval grammar and add focused coverage for strict no-write replies, exact-proposal application, revision invalidation, and mutation enforcement.
- Make `/picm-adopt` recommend `AGENTS.md` when routing files are absent and explicitly ask whether to include a `CLAUDE.md` compatibility shim in the final draft.
- Preserve the proposal when the shim is declined and require direct approval before either choice writes files.
- Route adoption proposals through the adoption guide and add contract coverage and fixture QA expectations for the flow.
- Gate the initial-maintenance selector on a newly written `adoption.status: "adopted"`, skipping already-adopted and other non-successful adoption outcomes.
- Persist the one-time offer state across session restoration, reuse confirmed privacy exclusions, and preserve maintenance reminders when the offer is not completed.
- Update adoption guidance and add focused coverage for coding fixtures, restored workflows, repeated privacy review, and declined, cancelled, or failed outcomes.
- Require actionable `.gitignore` or PiCM exclusion guidance, repository visibility confirmation, and sensitive-context boundaries before adoption writes in non-Git workspaces.
- Document the safeguard across adoption guidance and fixture QA expectations without authorizing Git initialization or `.gitignore` changes.
- Add contract coverage confirming safeguard ordering, protected fixture inventory, and the unchanged no-write path.
- Resolve the new-scaffold `.picm/config.json` `{{createdAt}}` marker to a canonical ISO 8601 UTC timestamp at write time while preserving the approved content and existing timestamps.
- Document the runtime-resolved preview behavior and add focused coverage for written config output and legacy compatibility.
- Require standalone maintenance-policy previews—including one-day cadences—to present and accept the complete maintenance summary without writing.
- Clarify durable scheduling, privacy/configuration impact, and the advisory Run Now/Defer behavior before apply.
- Preserve the separate exact TUI patch confirmation as the sole control for applying the accepted policy preview, with updated guidance and coverage.
- Skip the unavailable idle wait when starting overdue maintenance from the session reminder, while preserving idle waiting for direct `/picm-maintain` commands.
- Add regression coverage confirming Run Now opens depth selection and completes the privacy-reviewed maintenance flow without `waitForIdle`.
- Keep maintenance workflows incomplete and cadence timestamps unchanged when completion is cancelled before or during cycle reset.
- Roll back conditional config writes on mid-commit cancellation, preserving recovery data when rollback itself fails.
- Return structured conflict/error guidance so maintenance completion can be retried after resolving the underlying reset failure.
- Gate the post-adoption maintenance offer and continuation on an exact `adoption.status: "adopted"` configuration value.
- Complete scanned-only, needs-routing, missing-status, and malformed-status outcomes without starting maintenance or advancing its schedule.
- Add extension/runtime regression coverage and align adoption guidance with the corrected behavior.

## [0.3.1] - 2026-07-27

### Fixed

- Persist explicit PiCM scan authorization across same-session resumes, restoring it inactive while keeping completed, cleared, failed, or expired workflows revoked.
- Clarify Coding Repository completion guidance so users state tasks normally and review results while agents handle routing, boundaries, edits, and verification.
- Record this repository’s approved Coding Repository adoption with a root codebase map, Balanced maintenance preset, and weekly nudge.

## [0.3.0] - 2026-07-25

### Added

- Install declared peers before `npm run check` in `release.yml`.
- Install the same peers before `npm publish` triggers `prepublishOnly` in `publish.yml`.
- Disable dependency lifecycle scripts and package-lock generation during both installs.
- Add regression coverage requiring installation to precede validation and publication.
- Document the clean-runner dependency setup.
- Add deterministic Git-backed scan inventories and guarded reads for explicit PiCM command scans, including ignored-path, symlink, submodule, and non-Git workspace protections while leaving ordinary Pi usage unrestricted.
- Add configurable maintenance cadence with monthly nudges, optional read-only automatic TUI advisory cycles, concurrency control, and atomic schedule bookkeeping.
- Synchronize pinned install versions during release preparation and expand package validation, documentation, and automated coverage for the new runtime modules.

### Fixed

- Restore the detailed v0.2.0 changelog with all six coding-profile additions and both coding-scan safety boundaries.
- Generate release notes from valid top-level `## What Changed` bullets, falling back to the Conventional PR title when no usable bullets exist while preserving existing SemVer qualification.
- Document and validate the release-note contract, with regression coverage for structured extraction and malformed blank bullets.

## [0.2.0] - 2026-07-23

### Added

- First-class Coding Repository profile for repository and monorepo onboarding.
- Composable codebase-map capability for hybrid workflow-and-code workspaces.
- Root, distributed, and scan-and-recommend mapping with additive or curated adoption.
- `CONTEXT-MAP.md` and local coding-boundary templates.
- Light, Balanced, and Strict manual coding-map maintenance presets.
- `/picm-adopt coding` shortcut while preserving automatic discovery through regular `/picm-adopt`.
- One-click, manually triggered releases with Conventional Commit versioning and npm trusted publishing.

### Fixed

- Kept direct release commits compatible with PR-only branch rules through a dedicated, repository-scoped GitHub App.

### Safety

- Git-ignore-aware coding scans that never read ignored file contents, including ignored tracked files.
- Exact preview and approval boundaries for curated documentation consolidation.

## [0.1.2] - 2026-07-21

### Added

- Public npm distribution under `@eyevanovich/picm-factory`.
- Token-free GitHub Actions release automation through npm trusted publishing, beginning after the interactive `0.1.2` bootstrap publication.
- npm provenance attestations for automated releases beginning with `0.1.3`.
- Automatic eligibility for the pi.dev package gallery through the `pi-package` keyword.

## [0.1.1] - 2026-07-19

### Fixed

- Prevented duplicate `/picm-*` command entries by keeping the same-named backing prompts out of Pi's prompt-template registry.

## [0.1.0] - 2026-07-19

Initial public release.

### Added

- `/picm-new` interview-led minimum viable workspace scaffolding.
- `/picm-adopt` read-first, non-invasive compatibility guidance.
- `/picm-maintain` advisory health checks and heuristic trace mode.
- `/picm-help` command and installation decision guide.
- Stage Pipeline, Specialist Folder, Team / Role OS, and Custom / Existing Structure profiles.
- Explicit stage contracts, human review gates, and first-run checklists.
- Layout, anti-pattern, source-integrity, and synthetic security fixtures.
- Cold-agent maintenance walk tests and interactive Pi/Zellij QA guidance.
- Optional local-script and MCP/tool boundaries for deterministic mechanical work.

### Safety

- Preview and explicit approval before writes.
- Non-destructive adoption and maintenance defaults.
- Separation of `.pi/` package configuration from maintainer-only `.picm/` metadata.
- Security guidance for secrets, private/client material, and generated context.

### Distribution

- Project-local installation from the public GitHub repository.
