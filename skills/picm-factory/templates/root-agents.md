# Project Instructions

## Identity
You are helping with [WORKFLOW NAME], a PiCM folder-agent workspace for [AUDIENCE / USER].

## Folder Structure
- `CONTEXT.md` — project/workflow context and constraints.
- `REFERENCES.md` or `reference/` — reusable background material.
- `[LAYOUT FOLDERS]` — stages, specialists, roles, or workflows.
- `.picm/` — PiCM metadata/reports; read only for maintenance/adoption tasks.

## Routing

| Task | Read | Skip |
|------|------|------|
| Normal workflow execution | `CONTEXT.md`, relevant local context/workflow file | `.picm/`, unrelated outputs |
| Add or update reusable context | `CONTEXT.md`, relevant references/examples | final outputs unless needed |
| Coding task, only for Coding Repository/codebase-map workspaces | `CONTEXT-MAP.md` or the reused architecture map, then the relevant local context/entry point | unrelated components, Git-ignored paths |
| PiCM maintenance | `.picm/config.json` if present, root routing file, relevant context files | large source/output files unless relevant |
| [User-named mechanical task, only if applicable] | [Exact local script path or MCP/tool name supplied by the user] | [AI recreation of deterministic mechanics] |

Omit the coding-task row unless coding mapping is enabled. If the map is small and embedded here or an existing architecture document is reused, replace `CONTEXT-MAP.md` with that authoritative location. Omit the mechanical-task row unless the user has named the relevant script or tool. State required human approval for file moves, sends, or external side effects.

## Rules
- Keep context files concise and useful.
- Do not copy secrets or sensitive source material into instructions/examples unless explicitly approved.
- During coding scans, derive candidates through Git, check each path with `git check-ignore --no-index`, and never read ignored file contents.
- Ask before overwriting, moving, renaming, or deleting files.
- Prefer small iterative improvements over rebuilding the whole system.
- Use only user-named scripts/tools for deterministic mechanics; keep judgment, side-effect approval, and review visible.
