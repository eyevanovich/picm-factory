# Summary Preview and Optional Diff Review Protocol

Use this protocol for every proposal batch from `/picm-adopt`, `/picm-maintain`, or `/picm-optimize`. It is conversational guidance, not a deterministic plan engine or semantic-equivalence checker.

## Write gate

Before applying a proposal batch, present one complete concise summary preview. An unambiguous direct approval of that current summary—for example, `accept`, `approve`, `accept and write`, or `proceed`—authorizes all and only its enumerated changes. Do not require a separate summary-acceptance step or a review menu. Option choice, cadence choice, a preview request, review navigation, or vague assent is not approval.

For `/picm-adopt` and `/picm-maintain`, prepare the exact create, modify, delete, and linked-move operations with `picm_proposal_batch` during an active protected scan before rendering the summary. Its `apply` action accepts only the prepared current proposal after direct approval, rechecks each allowed path and expected source content, rolls back a failed mutation, and records a session audit entry without creating an audit file in the workspace. Cancellation, decline, vague assent, or a requested revision remains no-write. Use `cancel` for a cancellation and prepare a replacement batch after a revision; never use agent Bash for these operations.

A request to adjust a draft creates a revised current proposal without restarting the protocol. It supersedes pending write approval, but preserves applicable selection and review state for unchanged paths. Re-evaluate review suggestions for changed paths, present a refreshed summary, then invite direct approval or diff inspection.

Add a non-blocking review suggestion for deletions, linked moves, material changes to safety, privacy, permissions, approval boundaries, or required commands, and unusually large or uncertain change sets. Explain the change's intent and impact, group related paths, and suggest the most useful diff to inspect. Review suggestions never block approval.

Exact review remains available on demand for every affected file or diff. Every persisted `privacy.excludedPaths` or standalone maintenance-policy control write still receives the complete concise summary and direct acceptance first. Then use the built-in exact TUI patch confirmation as the separate runtime write confirmation. For a standalone maintenance-policy apply, pass only `action: "apply"` and the accepted preview's `previewId`; direct-apply runtime compatibility remains unchanged but is not agent guidance. Neither control confirmation authorizes other project writes.

## Standalone maintenance-policy control write

Treat every maintenance-policy preview, including a one-day cadence, as no-write. Before applying its `previewId`, present the complete concise summary with every category below, using literal `None` for an empty category:

- affected files and operations;
- behavior or configuration changes;
- linked moves;
- preserved behavior;
- known uncertainty;
- review suggestions; and
- privacy/configuration impact.

For the privacy/configuration impact, explain that the accepted policy would durably record reminder timestamps in a non-ignored, regular, non-symlink `.picm/config.json` beneath a regular `.picm/` directory. Explain that it is advisory: nothing runs while Pi is closed or outside an eligible interactive TUI session; when due, it presents Run Now and Defer, and Run Now still enters the ordinary privacy-reviewed maintenance flow with normal write approvals. Explicit summary acceptance is no-write. Only after that acceptance may the agent call `apply` using exactly the preview's `previewId`; the tool's exact TUI patch confirmation, not summary acceptance, controls whether the policy is applied.

## Summary preview template

Enumerate every affected file once and keep linked actions visibly connected. Use the literal `None` for every empty category.

```markdown
# Proposed write summary

## Affected files and operations
- `path`: Create / Modify / Delete / Move source / Move destination

## Behavior or configuration changes
- ...

## Linked cross-file moves
- `source` → `destination`: ...

## Preserved behavior
- ...

## Known uncertainty
- ...

## Review suggestions
- `path` or linked group: intent, impact, and optional diff to inspect
```

The summary must be complete even when concise: include every affected path and operation, behavior/configuration effects, linked cross-file moves, behavior intentionally preserved, known uncertainty, and review suggestions.

End every proposed-write summary with: “Approve this proposal to write it, or ask to inspect a diff (for example, `show diff for <path>`). You can also request an adjustment.”

## Optional diff review interaction

Offer exact review whenever the user asks to inspect files or diffs. Execute recognized direct requests immediately: `view all` renders all affected items, and `show diff for <path>` renders that affected path or linked move pair. A generic request such as `review files` offers exactly these choices and no additional peer choice:

1. **View all**
2. **Select files**
3. **Return to summary**

**View all** renders every affected item in summary order, pairing linked move sources and destinations. In **Select files**, the user conversationally names or checks paths from the current proposal. Selecting either the source or destination of a linked move selects and reviews the whole source-destination pair. **Select files** retains the current selection and which files have been reviewed while the user navigates. Let the user review selected files one at a time with **Previous**, **Next**, **Back to selection**, and **Return to summary**; navigation must not clear selection or review state. **Return to summary** preserves review state but is not approval.

## Exact rendering

- **Modified file:** show a unified diff with path headers and complete proposed hunks.
- **New file:** show the complete proposed content.
- **Deleted file:** show the complete removed content.
- **Linked move:** review source and destination together, including the source removal and complete destination content or destination diff as applicable.

Do not substitute paraphrase for exact rendering. If protected or sensitive content cannot safely be rendered exactly, do not reveal it or weaken scan/privacy boundaries. Mark the item as unresolved and require a safer revised proposal before writing it.

## Approval language

A valid approval clearly authorizes writing the enumerated current proposal. Exact review is optional and never creates a separate approval ceremony. A requested change supersedes pending approval; retain applicable unchanged-path review state, refresh the summary, and invite direct approval or diff inspection of the revised proposal.

This protocol does not authorize crawling, a custom TUI, a workflow executor, or automated semantic-equivalence claims. Use the existing Pi conversation and file tools while preserving all runtime privacy and scan behavior.
