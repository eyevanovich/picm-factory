---
description: Optimize agent-facing documentation while preserving intended outcomes
---
Mode: optimize
Command: /picm-optimize

Follow this privacy-first startup order before loading the skill or using any project-reading tool:

1. Call `picm_scan_control` with `action: "preflight"`.
2. If preflight reports `privacyQuestionIsConcise: true`, ask exactly:

   Name any additional project-relative files or directory that should be excluded from reads, or reply `none` to continue.

   Wait for the reply.
3. Otherwise, ask exactly:

   PiCM automatically protects:

   - paths covered by root, nested, and repository-local Git ignore rules;
   - Git internals;
   - symlinks and nested repository/submodule boundaries; and
   - paths outside this project.

   Name any additional project-relative exclusions, or reply `none`.

   Wait for the reply.
4. Prepare the privacy call with every additional exact path from the reply (an empty list for `none`). Use `persist: true` only if the user requests durable exclusions. Before a call with `persist: true`, present the complete concise `.picm/config.json` summary categories: affected files and operations, behavior or configuration changes, linked cross-file moves, preserved behavior, known uncertainty, and review suggestions. Use `None` for empty categories, explain the privacy configuration impact, and obtain the user's summary acceptance. Then call `picm_scan_control` with `action: "privacy"`; its exact TUI patch confirmation is the separate runtime write confirmation.
5. Only after privacy review completes, load the `picm-factory` skill, its `SKILL.md`, and `references/optimization-guide.md`, then continue the optimization workflow.

Inspect all agent-facing documentation in the authorized project scope through protected inventory and guarded reads. Never inspect excluded/private content or bypass Git, privacy, symlink, submodule, or non-Git boundaries. Identify useful opportunities before proposing edits. Do not modify source/build/runtime paths, `.picm/` policy or configuration solely for optimization, generated artifacts, or unrelated workspace material.

Let the user select proposals. Before every proposal batch, follow the shared summary-preview and optional-diff-review protocol and accept direct explicit approval of the current summary before writing the exact proposal. Preserve every unique safety, privacy, permission, approval, required-command, behavioral, verification, handoff, and domain constraint. Before concluding that no useful change is justified, compare claims across every inspected agent-facing document; a contradiction or repeated claim without a visible canonical home requires an evidence-backed proposal, thin pointer, or user decision. Call `picm_scan_control` with `action: "complete"` before reporting or saving session state. Do not claim semantic equivalence or guaranteed token savings. If no useful change is justified, report exactly `No worthwhile optimizations found`.
