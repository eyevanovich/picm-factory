<!-- PiCM authoring: replace tokens with justified existing/scaffolded/per-run paths; omit unused rows. Preserve the complete pre-read and disclosure boundaries, including consultation and memory. Remove this comment from generated output. -->
# Project instructions

## Purpose
Help {{picm:audience-or-user}} with {{picm:workflow-name}}.

## Routing

| Task | Read first | Skip |
| --- | --- | --- |
| Normal workflow | `CONTEXT.md`, {{picm:local-contract-or-recipe}} | `.picm/`, unrelated artifacts |
| Reusable-context change | {{picm:authoritative-rules-reference-or-examples}} | per-run outputs unless relevant |
| {{picm:coding-task-if-enabled}} | {{picm:authoritative-map-and-local-entry-route}} | unrelated components |
| PiCM adoption/maintenance | Root routing, relevant context, projected settings when available | unrelated source/output and opaque config |
| {{picm:named-mechanical-task-if-applicable}} | {{picm:exact-script-or-tool-name}} | recreating its deterministic mechanics |

## Boundaries

Apply these boundaries before every read-first route, including an explicitly named prerequisite. Keep discovery inside the workspace or named external context; resolve ancestor/global ignore policy through exact locations. Ask if policy can't be resolved safely.

Before reads/searches, select task-relevant eligible paths using root/nested Git ignores, repository/global excludes, persisted PiCM exclusions, session exclusions, and known sensitive paths. Bound tool output; ordinary tools aren't a privacy sandbox.

Keep secrets, credentials, private keys, regulated/private data, and sensitive client material out of model-visible reads, tool output, consultation, memory, instructions, examples, reports, and diagnostics—even with approval. If eligibility is unclear, request an already-sanitized, non-sensitive source. Unexpected exposure: stop inspecting, describe it generically without repeating values, and ask how to proceed safely.

For PiCM modifications, inspect, state a concise final direction with material effects, and wait for conversational sign-off. Routine aligned edits need no repeated approval; realign for material departures, including destructive actions or external writes outside the direction. Preserve unrelated files/settings and existing routing. Reports/help are no-edit; saving a report is an edit. Cancellation stops future work; report known completed effects without automatic rollback.

Use only user-named scripts/integrations for deterministic mechanics. Keep judgment, human review, and approval for moves/sends/external side effects visible. Stable references aren't per-run working artifacts; retain gaps and uncertainty through handoffs. `.picm/` is maintainer metadata, outside normal workflow routing.
