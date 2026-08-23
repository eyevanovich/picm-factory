# Summary Preview and Exact Review Protocol

Use this protocol for every project write proposed by `/picm-adopt`, `/picm-maintain`, or `/picm-optimize`. It is conversational guidance, not a deterministic plan engine or semantic-equivalence checker.

## Write gate

Before each proposed project write, present one complete concise summary preview. An unambiguous direct approval of that current summary—for example, `accept`, `approve`, `accept and write`, or `proceed`—authorizes writing its exact enumerated changes. Do not require a separate summary-acceptance step or an exact-review menu before writing unless mandatory exact review is pending. Option choice, cadence choice, a preview request, review navigation, or vague assent is not approval.

A proposal revision invalidates all earlier approval and exact-review state. Present a refreshed summary and repeat any mandatory exact review for the revised proposal.

Exact review is mandatory before approval for:

- every deletion;
- every change to safety, permissions, approval boundaries, or required commands.

When no mandatory exact review is pending, the user may approve directly from the summary. Exact review remains available on demand for any affected file or diff. Every persisted `privacy.excludedPaths` or standalone maintenance-policy control write still receives the complete concise summary first, marks its safety/configuration change as mandatory exact review, and obtains summary acceptance. Then use the built-in exact TUI patch confirmation as the mandatory exact review and separate write approval. For a standalone maintenance-policy apply, pass only `action: "apply"` and the accepted preview's `previewId`; direct-apply runtime compatibility remains unchanged but is not agent guidance. Neither control confirmation authorizes other project writes.

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

## Mandatory exact review
- `path` or linked pair: reason
```

The summary must be complete even when concise: include every affected path and operation, behavior/configuration effects, linked cross-file moves, behavior intentionally preserved, known uncertainty, and mandatory exact-review items.

## Exact review interaction

Offer exact review whenever the user asks to inspect files or diffs. Execute recognized direct requests immediately: `view all` renders all affected items, and `show diff for <path>` renders that affected path or linked move pair. A generic request such as `review files` enters the exact-review menu. Enter mandatory exact review before accepting approval only when a mandatory item is pending. At the generic or mandatory exact-review entry, offer exactly these choices and no additional peer choice:

1. **View all**
2. **Select files**
3. **Return to summary**

**View all** renders every affected item in summary order, pairing linked move sources and destinations. In **Select files**, the user conversationally names or checks paths from the current proposal. Selecting either the source or destination of a linked move selects and reviews the whole source-destination pair. **Select files** retains the current selection and which files have been reviewed while the user navigates. Let the user review selected files one at a time with **Previous**, **Next**, **Back to selection**, and **Return to summary**; navigation must not clear selection or review state. **Return to summary** preserves review state but is not approval.

Mandatory items are pending until rendered exactly in the current proposal revision. Approval is unavailable while any mandatory item is pending.

## Exact rendering

- **Modified file:** show a unified diff with path headers and complete proposed hunks.
- **New file:** show the complete proposed content.
- **Deleted file:** show the complete removed content.
- **Linked move:** review source and destination together, including the source removal and complete destination content or destination diff as applicable.

Do not substitute paraphrase for exact rendering. If protected or sensitive content cannot safely be rendered exactly, stop: do not approve or write that item or its linked change set. Never weaken scan/privacy boundaries to construct a preview.

## Approval language

A valid approval clearly authorizes writing the enumerated current proposal. When no mandatory item is pending, accept it directly from the summary without an intervening exact-review ceremony. When mandatory items are pending, render them exactly first, then accept direct approval of the current summary. Any requested change returns to proposal revision; refresh the summary and required reviews before requesting approval again.

This protocol does not authorize crawling, a custom TUI, a workflow executor, or automated semantic-equivalence claims. Use the existing Pi conversation and file tools while preserving all runtime privacy and scan behavior.
