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
2. Ask exactly:

   PiCM automatically protects:

   - paths covered by root, nested, and repository-local Git ignore rules;
   - Git internals;
   - symlinks and nested repository/submodule boundaries; and
   - paths outside this project.

   Name any additional project-relative exclusions, or reply `none`.

   Wait for the reply.
3. Prepare the privacy call with every additional exact path from the reply (an empty list for `none`). Use `persist: true` only if the user requests durable exclusions. Before a call with `persist: true`, present the complete concise `.picm/config.json` summary categories: affected files and operations, behavior or configuration changes, linked cross-file moves, preserved behavior, known uncertainty, and review suggestions. Use `None` for empty categories, explain the privacy configuration impact, and obtain the user's summary acceptance. Then call `picm_scan_control` with `action: "privacy"`; its exact TUI patch confirmation is the separate runtime write confirmation.
4. Only after privacy review completes, load the `picm-factory` skill and its `SKILL.md`, then continue normal adoption.

When arguments begin with `coding`, enter the coding-adoption branch directly. Otherwise, treat arguments as requested adoption focus and safely offer coding adoption when shallow protected-inventory repository signals support it. Initial Coding Repository adoption does not ask for maintenance depth: automatically perform the Strict examination and include `capabilities.codebaseMap.maintenancePreset: "strict"` in the exact config preview. Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost. In both paths, metadata-only preflight and the exact automatic-protections question precede privacy review, skill loading, and scanning. Arguments never authorize writes.

Before every proposal batch, follow the skill's shipped summary-preview and optional-diff-review protocol; accept direct explicit approval of the current summary before writing the exact proposal. After a successful adopted-status write (not Scanned only or Needs routing before adoption), call `picm_scan_control` with `action: "adoption-complete"` before ordinary completion. It presents exactly “Would you like to run an initial maintenance pass now (recommended)?” with `Run maintenance now` and `Finish`. A same-conversation run reuses confirmed exclusions and enters the normal Strict-preselected maintenance-depth selector; Finish, cancellation, or failure does not record maintenance or change configured reminders.
