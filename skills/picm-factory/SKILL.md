---
name: picm-factory
description: Load for explicit registered /picm-new, /picm-adopt, /picm-maintain, /picm-optimize, or /picm-help command prompts requesting this skill. Natural-language PiCM discussion does not invoke it.
license: MIT
---

# PiCM Factory

## Shared trusted-assistant contract

Apply this contract before the selected mode's discovery or changes.

### Scope and privacy

Start with the current workspace and only task-relevant context. Keep discovery inside that scope or explicitly named external context. Resolve ignore policy through exact ancestor/global ignore-policy locations, not recursive parent/sibling discovery. If policy can't be resolved safely, ask instead of reading uncertain content. Ask when location or scope is materially ambiguous. A named external file or folder is read scope, not authority to write there; nested-repository context likewise grants no initialization or fetching.

Before content reads or searches, select eligible paths using root/nested Git ignores, repository/global excludes, persisted `privacy.excludedPaths`, session exclusions, and known sensitive paths. Bound output. Use `picm_settings` `status` for projected exclusions rather than dumping opaque config. Existing workspace read-first prerequisites are subject to this eligibility check; request an already-sanitized replacement when an excluded prerequisite blocks the task.

Keep secrets, credentials, private keys, regulated/private data, and sensitive client material out of model-visible reads, tool output, consultation payloads, memory, reusable context, examples, reports, and diagnostics. User approval does not override this boundary. If eligibility is uncertain, ask for an already-sanitized, non-sensitive source; sanitizing after disclosure is too late. If protected content appears unexpectedly, stop inspecting it, report the exposure generically without repeating values, and ask how to proceed safely.

These are agent-followed boundaries, not a sandbox claim. Ordinary tools may expose additional material; choose their paths and output deliberately.

### Alignment, validation, and recovery

For new, adopt, maintain, and optimize modifications:

1. Inspect before changing anything, preserving unrelated material and suitable existing routing.
2. State one concise final direction: outcome, affected areas, material creates/moves/deletes/replacements, preserved behavior, and uncertainty. Offer a diff or file review when useful.
3. Wait for conversational sign-off on that direction before edits. The initiating request and design selections aren't sign-off. Accept approval in the user's words, without special phrases, IDs, modals, or repeated approval for routine aligned work.
4. Use ordinary tools for aligned changes and appropriate validation. Realign for material departures, including destructive actions or external writes outside the agreed direction. Preserve unrelated settings; re-read affected files when concurrent changes are apparent.

Inspection/report requests and help are no-edit; saving a report is an edit. Cancellation stops future work, though issued operations may finish. Retain and report completed effects. Do not automatically roll back or blindly replay uncertain operations. A new task needs fresh scope, not a lingering lock.

Finish with changes, checks, known effects, and remaining uncertainty. A report or tool's availability isn't proof of success. Local validation doesn't authorize deployment, publication, or authenticated external effects. For consequential review or failed-operation recovery, load [change/review guidance](references/preview-review-protocol.md).

A user-created Git checkpoint is optional advice for substantial existing-content edits. Never initialize, stage, commit, reset, clean, or restore Git for the user, or inspect history/status to verify checkpoint coverage.

### Workspace boundaries

Visible files own workflow routing; `.picm/` is minimal maintainer metadata, skipped during normal work. `.pi/` holds Pi installation settings; preserve existing setup. Profiles are recommendations, and coding maps can complement workflow profiles. Use user-named scripts/integrations for deterministic mechanics; keep judgment and review visible rather than building an executor.

Before privacy/cadence configuration or maintenance-cycle completion, load [settings and reminders](references/settings-guide.md). Stored exclusions grant no read/write authority; reminders offer work, never autonomous edits.

## Mode routing

Load the selected guide and its required branch references; complete its procedure under the shared contract.

| Mode | Required guide | Additional branch |
| --- | --- | --- |
| new | [interview and creation](references/interview-guide.md) | Layout selection, templates, and first-run guidance are routed there. |
| adopt | [adoption](references/adoption-guide.md) | `coding` or selected hybrid mapping also loads [coding adoption](references/coding-adoption-guide.md). |
| maintain | [maintenance](references/maintenance-rubric.md) | Coding depth, trace, required redundancy review, and optional optimization are routed there. |
| optimize | [documentation optimization](references/optimization-guide.md) | Required preservation ledger, redundancy review, and writing-lens audit are routed there. |
| help | [help](references/help-guide.md) | Explain without inspecting or editing the workspace. |

For help/setup only, the release-managed project-local install example is `pi install -l npm:@eyevanovich/picm-factory@0.5.1`. Load this skill only through its explicit command entry points, not during ordinary PiCM implementation discussion.
