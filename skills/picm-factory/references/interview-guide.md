# Interview Guide

Use this guide for `/picm-new`. Gather enough context for a strong minimal scaffold, not a giant form. Treat command arguments as seed context and ask only missing critical questions.

## Core interview

Ask in plain language, combining related questions when the answer is already clear.

1. **Purpose and first run** — What repeatable work should this workspace support, who uses the result, and what will run first? Identify the shortest useful path from real input to a reviewed output.
2. **Inputs and outputs** — What material arrives, what is stable reusable reference versus per-run working material, and what deliverables or inspectable drafts should result? Which intermediate outputs are read downstream after review?
3. **Process shape** — Is the work mainly sequential stages, one reusable specialist, or multiple roles and handoffs? For each active stage, what does it read, do, write, and send to review?
4. **Quality and boundaries** — What makes the output good, what mistakes or invented claims must be avoided, and what requires human judgment? Ask about sensitive/private material when it affects scope or generated context.
5. **Mechanical work** — Is repeated fetching, movement, formatting, sending, or API work better handled by a user-named local script or integration? Record its input/output and review boundary; do not invent one.
6. **References and maintenance** — Which examples, policies, style guides, or domain rules are durable context, and what should remain outside reusable files? Ask when the user wants `/picm-maintain` and whether an optional reminder cadence is useful.

## Branching follow-ups

Ask only when relevant:

- **Stage Pipeline placement:** after that profile is chosen, use the **Placement decision** in `layout-profiles.md` before choosing paths.
- **Operator profile:** for a non-technical or team operator, identify the day-to-day user and the needed level of guidance.
- **Timing:** identify the real trigger when cadence or start conditions matter.
- **Sensitive work:** identify local-only paths, whether repository visibility fits the material, and what must not be copied into context. Recommend exact `.gitignore` entries only when commit protection is useful; do not change Git configuration without sign-off.
- **Branches and decisions:** establish how incomplete input, failed review, and backward flow work.
- **Examples:** collect real golden examples or anti-examples only when available or requested.

## Scaffold direction

Before editing:

1. Summarize the workflow in 5–10 bullets and recommend a primary layout, with alternatives or a secondary pattern only when useful.
2. For an existing architecture, explain whether adoption is safer; do not move, overwrite, or replace existing material unless the final direction says so.
3. Draft the smallest path set that supports the first real run, routing/safety, or an identified reusable constraint. Explain why each path exists.
4. For a Stage Pipeline, show the chosen root-numbered or nested placement and each active contract's Purpose, Inputs, Process, Outputs, optional named script/tool, Verify, and Handoff/review sections.
5. Do not create future-only stages, unused roles, or empty `references/`, `input/`, `output/`, or `examples/` areas. A contract can name a future artifact without creating its parent today.
6. If reminders are requested, include the interval and `.picm/config.json` effect in the direction. Reminders offer work only; they do not authorize repairs or external effects.
7. Present the concise final direction under `preview-review-protocol.md` and wait for conversational sign-off. Then write with ordinary tools. Ensure no unresolved `{{picm:...}}` token remains.

## First-run checklist

After creation, give a path-specific user-facing checklist that names where work starts, the first output/review/handoff artifact, what the human checks before downstream use, which gaps or uncertainty remain visible, and when to run `/picm-maintain`.

- **Stage Pipeline:** start in the first stage's `CONTEXT.md`; create the named output; stop for review before the next stage; keep gaps and unsupported claims visible; start the downstream stage from the reviewed artifact.
- **Team / Role OS:** name the first role and handoff artifact. Human review checks summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action; the receiving role uses that reviewed handoff rather than chat memory.
- **Specialist Folder:** use the visible recipe receipt in `layout-profiles.md` to name inputs, expected artifact, review, and next action. Keep its stated uncertainty visible. Distinguish one-off artifact edits from durable lessons for an existing approved `rules.md`, `examples.md`, or `reference/` route.
- **Coding Repository:** the user states a normal coding task. The agent follows root routing to the map/equivalent, owning boundary, entry point, and authoritative checks; the user reviews the diff and check result while cross-boundary effects and unknowns remain visible.
- **Custom / Existing Structure:** follow the visible routing and review/handoff convention. Mark a missing review surface as a maintenance suggestion rather than forcing a rewrite.

Recommend maintenance after the first real use and when stages, roles, routing, stable references, scripts/integrations, repository boundaries, manifests, or verification sources change. It is advisory, not a required preflight or provenance debugger.
