# PiCM Factory

## Shared trusted-assistant contract

Apply this contract before the selected mode's discovery or changes.

### Scope and privacy

Start with the current workspace and only task-relevant context. Keep discovery inside that scope or explicitly named external context. Resolve ignore policy through exact ancestor/global ignore-policy locations, not recursive parent/sibling discovery. If policy can't be resolved safely, ask instead of reading uncertain content. Ask when location or scope is materially ambiguous. A named external file or folder is read scope, not authority to write there; nested-repository context likewise grants no initialization or fetching.

Before content reads or searches, first obtain a successful host `settings` `status` result for projected exclusions rather than dumping opaque config—even when no config is expected. Then select eligible paths using root/nested Git ignores, repository/global excludes, persisted `privacy.excludedPaths`, session exclusions, and known sensitive paths. Exact ignore-policy reads and bounded path-only orientation can establish eligibility; manifests, instructions, source, and tests wait until it is established. Bound output. If status fails or is malformed, stop workspace discovery and report the failure; don't infer empty exclusions or inspect raw `.picm/config.json`. On failure, report only the helper's sanitized error code/message and ask the owner to restore known-good configuration preserving intended exclusions outside the conversation, then stop. Don't request configuration contents or diagnostic output, or suggest alternate inspection/repair commands or deleting/resetting config, including as a user action. After a claim of repair, rerun the helper and resume only after successful settings status; another failure has the same bounded stop, not escalating troubleshooting. The trusted helper may read configuration internally; the agent uses its projected output. Existing workspace read-first prerequisites are subject to this eligibility check; request an already-sanitized replacement when an excluded prerequisite blocks the task.

Keep secrets, credentials, private keys, regulated/private data, and sensitive client material out of model-visible reads, tool output, consultation payloads, memory, reusable context, examples, reports, and diagnostics. User approval does not override this boundary. If eligibility is uncertain, ask for an already-sanitized, non-sensitive source; sanitizing after disclosure is too late. If protected content appears unexpectedly, stop inspecting it, report the exposure generically without repeating values, and ask how to proceed safely.

These are agent-followed boundaries, not a sandbox claim. Ordinary tools may expose additional material; choose their paths and output deliberately.

### Alignment, validation, and recovery

For new, adopt, maintain, and optimize modifications:

1. Inspect before changing anything, preserving unrelated material and suitable existing routing.
2. State one concise final direction: outcome, affected areas, material creates/moves/deletes/replacements, preserved behavior, and uncertainty. Offer a diff or file review when useful.
3. Wait for conversational sign-off on that direction before edits. The initiating request and design selections aren't sign-off. Accept approval in the user's words, without special phrases, IDs, modals, or repeated approval for routine aligned work.
4. Use ordinary tools for aligned changes and appropriate validation. Realign for material departures, including destructive actions or external writes outside the agreed direction. Preserve unrelated settings; re-read affected files when concurrent changes are apparent.

Inspection/report requests and help are no-edit; saving a report is an edit. Cancellation stops future work, though issued operations may finish. Retain and report completed effects. Do not automatically roll back or blindly replay uncertain operations. A new task needs fresh scope, not a lingering lock.

Ground findings in inspected source text or projected helper results; name the supporting location and distinguish explicit statements from inference. Prior reports are leads, not independent evidence: recheck the relevant eligible source before carrying a finding forward, or mark it unverified. Maintainer-only routing and privacy exclusions don't establish Git-ignore status; report that only from inspected ignore policy.

Keep persisted adoption status separate from visible routing readiness. Report persisted adoption status as unknown unless already available eligible evidence explicitly establishes it; projected privacy status and declining a metadata write establish neither its presence nor absence. Don't expand discovery or open raw config to resolve it. Describe coverage with named inspected paths/boundaries and omissions, not totals. Include file/path/line counts only when requested or decision-relevant; use tool-computed counts from already eligible evidence, separating regular files, directories, and root. Don't infer totals from a listing or truncated output, or substitute estimates for inventory counts. Label other estimates as estimates.

Finish with changes, checks, known effects, and remaining uncertainty. A report or tool's availability isn't proof of success. Local validation doesn't authorize deployment, publication, or authenticated external effects. For consequential review or failed-operation recovery, load [change/review guidance](references/preview-review-protocol.md).

A user-created Git checkpoint is optional advice for substantial existing-content edits. Never initialize, stage, commit, reset, clean, or restore Git for the user, or inspect history/status to verify checkpoint coverage.

### Workspace boundaries

Use `AGENTS.md` as canonical root and nested agent instructions; local `CONTEXT.md` holds reusable context. Existing legacy instructions require a signed-off [migration direction](references/adoption-guide.md#instruction-file-migration), not a compatibility shim or automatic replacement. Visible files own workflow routing; `.picm/` is minimal maintainer metadata, skipped during normal work. Assess routing from eligible visible instructions, never by opening opaque config to infer adoption status. Preserve the host's existing installation settings. Profiles are recommendations, and coding maps can complement workflow profiles. Use user-named scripts/integrations for deterministic mechanics; keep judgment and review visible rather than building an executor.

Before privacy/cadence configuration or maintenance-cycle completion, load [settings and reminders](references/settings-guide.md). Stored exclusions grant no read/write authority; reminders offer work, never autonomous edits.

## Host integration

Use the host adapter's command names, settings operations, setup instructions, and instruction-file loading rules. References use mode names; translate them to the active host's commands in user-facing advice and generated files. Apply this contract only through explicit PiCM entry points, not ordinary implementation discussion. If a required host helper is unavailable or fails, stop the affected operation; never treat a failure as empty settings.
