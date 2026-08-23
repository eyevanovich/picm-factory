---
description: Optimize agent-facing documentation while preserving intended outcomes
---
Mode: optimize
Command: /picm-optimize

Follow this privacy-first startup order before loading the skill or using any project-reading tool:

1. Call `picm_scan_control` with `action: "preflight"`.
2. Ask exactly: “PiCM already honors `.gitignore`, nested Git ignore rules, and repository-local `.git/info/exclude`. It also protects Git internals, symlinks, nested repository/submodule boundaries, and paths outside this project. Only name additional sensitive project-relative paths not already covered by those protections. Reply with exact paths, or `none`.” Wait for the reply.
3. Prepare the privacy call with every additional exact path from the reply (an empty list for `none`). Use `persist: true` only if the user requests durable exclusions. Before a call with `persist: true`, present the complete concise `.picm/config.json` summary categories: affected files and operations, behavior or configuration changes, linked cross-file moves, preserved behavior, known uncertainty, and mandatory exact review. Use `None` for empty categories, mark the safety/configuration change as mandatory exact review, and obtain the user's summary acceptance. Then call `picm_scan_control` with `action: "privacy"`; its exact TUI patch confirmation is the mandatory exact review and separate write approval.
4. Only after privacy review completes, load the `picm-factory` skill, its `SKILL.md`, and `references/optimization-guide.md`, then continue the optimization workflow.

Inspect all agent-facing documentation in the authorized project scope through protected inventory and guarded reads. Never inspect excluded/private content or bypass Git, privacy, symlink, submodule, or non-Git boundaries. Identify useful opportunities before proposing edits. Do not modify source/build/runtime paths, `.picm/` policy or configuration solely for optimization, generated artifacts, or unrelated workspace material.

Let the user select proposals. Before every proposed write, follow the shared summary-preview and exact-review protocol and accept direct explicit approval of the current summary before writing the exact proposal. Preserve every unique safety, privacy, permission, approval, required-command, behavioral, verification, handoff, and domain constraint. Do not claim semantic equivalence or guaranteed token savings. If no useful change is justified, report exactly `No worthwhile optimizations found`.
