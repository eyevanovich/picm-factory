# Project Instructions

## Identity
You are helping with {{picm:workflow-name}}, a PiCM folder-agent workspace for {{picm:audience-or-user}}.

## Folder Structure
- `CONTEXT.md` — project/workflow context and constraints.
- `REFERENCES.md` or `reference/` — reusable background material.
- `{{picm:layout-folders}}` — stages, specialists, roles, or workflows.
- `.picm/` — PiCM metadata/reports; read only for maintenance/adoption tasks.

## Routing

| Task | Read | Skip |
|------|------|------|
| Normal workflow execution | `CONTEXT.md`, relevant local context/workflow file | `.picm/`, unrelated outputs |
| Add or update reusable context | `CONTEXT.md`, relevant references/examples | final outputs unless needed |
| Coding task, only for Coding Repository/codebase-map workspaces | `CONTEXT-MAP.md` or the reused architecture map, then the relevant local context/entry point | unrelated components, Git-ignored paths |
| PiCM maintenance | `.picm/config.json` if present, root routing file, relevant context files | large source/output files unless relevant |
| {{picm:user-named-mechanical-task-if-applicable}} | {{picm:exact-local-script-path-or-mcp-tool-name}} | {{picm:ai-recreation-of-deterministic-mechanics}} |

Omit the coding-task row unless coding mapping is enabled. If the map is small and embedded here or an existing architecture document is reused, replace `CONTEXT-MAP.md` with that authoritative location. Omit the mechanical-task row unless the user has named the relevant script or tool. State required human approval for file moves, sends, or external side effects.

## Rules
- Keep context files concise and useful.
- Do not copy secrets or sensitive source material into instructions/examples unless explicitly approved.
- Honor Git ignores, persisted PiCM exclusions, session exclusions, and known sensitive paths as discovery defaults. These are agent-followed boundaries, not a claim that every host tool is a privacy sandbox.
- For `/picm-new`, `/picm-adopt`, `/picm-maintain`, and `/picm-optimize`, inspect first, state a concise final direction with material effects, and wait for conversational sign-off before edits. Routine aligned edits do not need repeated approval; seek renewed alignment for material departures, destructive actions, or external writes.
- Prefer small iterative improvements over rebuilding the whole system.
- Use only user-named scripts/tools for deterministic mechanics; keep judgment, side-effect approval, and review visible.
