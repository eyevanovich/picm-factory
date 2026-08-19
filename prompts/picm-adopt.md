---
description: Analyze an existing workflow or coding repository and add PiCM support non-invasively
argument-hint: "[coding | adoption request]"
---
Mode: adopt
Command: /picm-adopt

User arguments:
$ARGUMENTS

Follow this privacy-first startup order before loading the skill or using any project-reading tool:

1. Call `picm_scan_control` with `action: "preflight"`.
2. Ask exactly: “PiCM already honors `.gitignore`, nested Git ignore rules, and repository-local `.git/info/exclude`. It also protects Git internals, symlinks, nested repository/submodule boundaries, and paths outside this project. Only name additional sensitive project-relative paths not already covered by those protections. Reply with exact paths, or `none`.” Wait for the reply.
3. Prepare the privacy call with every additional exact path from the reply (an empty list for `none`). Use `persist: true` only if the user requests durable exclusions. Before a call with `persist: true`, present the complete concise `.picm/config.json` summary categories: affected files and operations, behavior or configuration changes, linked cross-file moves, preserved behavior, known uncertainty, and mandatory exact review. Use `None` for empty categories, mark the safety/configuration change as mandatory exact review, and obtain the user's summary acceptance. Then call `picm_scan_control` with `action: "privacy"`; its exact TUI patch confirmation is the mandatory exact review and separate write approval.
4. Only after privacy review completes, load the `picm-factory` skill and its `SKILL.md`, then continue normal adoption.

When arguments begin with `coding`, enter the coding-adoption branch directly. Otherwise, treat arguments as requested adoption focus and safely offer coding adoption when shallow protected-inventory repository signals support it. Initial Coding Repository adoption does not ask for maintenance depth: automatically perform the Strict examination and include `capabilities.codebaseMap.maintenancePreset: "strict"` in the exact config preview. Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost. In both paths, metadata-only preflight and the exact automatic-protections question precede privacy review, skill loading, and scanning. Arguments never authorize writes.

Before every proposed project write, follow the skill's shipped summary-preview and exact-review protocol; require a separate explicit approval for the current proposal.
