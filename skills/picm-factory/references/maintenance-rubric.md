# Maintenance rubric

Use for `/picm-maintain` under the [shared contract](../SKILL.md). Maintain is a heuristic health check or focused drift investigation, not provenance tracing or automatic repair.

## Intake and discovery

1. Establish general health, focused check, or trace scope from supplied arguments. Identify the visible profile before the summary; custom layouts remain valid. Identity/rules/reference/workflows suggesting one helper indicate **Specialist Folder**; examples are optional. Check its actual routes, not a mandatory file set.
2. Offer optional agent-document optimization with **No** as the default. Reuse an already supplied answer. When included, load [optimization](optimization-guide.md); keep its documentation-only scope, preservation checks, and audit within the normal maintenance report.
3. Inspect eligible task-relevant context. Load [coding maintenance](coding-maintenance-rubric.md) for a Coding Repository profile, codebase-map capability, or visible `CONTEXT-MAP.md`; apply supplied one-run depth without mutating stored metadata.
4. Load and apply [redundancy review](redundancy-review.md) to compare instructions/pointers within and across inspected files. This is required even when optional optimization is declined. Focused checks/trace keep it relevant to the requested scope; report dispositions and coverage before repair proposals.

General health runs the rubric and a cold-agent walk. Focused checks limit both to relevant criteria; trace uses the symptom procedure below rather than forcing a broad walk. Report unknowns instead of passing uninspected criteria.

## Severity and repair tiers

**Pass** means good as inspected; **Warning** means a likely output-quality, safety, or routing issue; **Suggestion** means optional improvement. Reserve hard failures for unreadable/dangerous workspaces.

For every non-trivial Warning/Suggestion, state likely cause, repair tier, smallest safe healing path, and files that could change.

| Tier | Scope and caution |
| --- | --- |
| **1: Routing** | Task/folder/read-first paths, `.picm/` exclusion, root weight. Preserve language/style and unique history/constraints when splitting payload into reachable homes. |
| **2: Contracts** | Purpose, inputs, process, outputs, named tool, verification/quality, handoff. Repair missing boundaries before rewriting; ask when the contract isn't inferable. |
| **3: Judgment/source** | Tone/domain rules, examples, quality/source-grounding, durable corrections. Use highest caution; retain only already-sanitized, non-sensitive lessons through agreement. |

## Cold-agent walk

Choose a representative task or ask. Start from root without chat memory. Coding tasks use the coding guide's walk instead of workflow-artifact requirements.

1. Reach relevant local context through purposeful reads.
2. Recover inputs, job, named output/review surface, and human check before downstream use.
3. Inspect named artifacts enough to distinguish present, missing, blocked, or awaiting review. Read relevant eligible content to check unsupported claims or unmet review gates; report presence, correctness, and human approval separately. Presence doesn't establish execution history or causality.
4. Check routing weight and fact ownership: focused reachable context, not payload/history in routers or diverging copies.

Report unknowns for unavailable evidence. Short chains are a diagnostic target, not a law; equivalent headings/custom layouts are valid.

## Rubric checks

| Check | Look for / response |
| --- | --- |
| Routing | Root/task/local routes and separation from `.picm/` maintenance. Missing/unclear routes or normal work through metadata are Warnings; root overload depends on impact. |
| Locality and contracts | Context near meaningful stages/roles/specialists/code boundaries; inputs/job/output/constraints/review; stable versus per-run trust; coding owner/entry/checks. Missing operational boundaries are Warnings; lighter clarity is a Suggestion. |
| Folder legibility | Clear stage/role/reference/input/output/recipe homes; unclear buckets/flat directories/custom shapes. Naming is advisory unless routing breaks. |
| Context weight and mechanics | Active instruction separate from background/examples; deterministic user-named scripts/integrations specify inputs, outputs, side effects, and review. Don't invent, implement, or execute integrations. Ask which conflicting rules are current. |
| Living-system drift | Stale/contradictory context/config/maps, broken handoffs, uncaptured lessons, repeated corrections/mechanics, unresolved recommendations. Use the smallest evidence-backed tier. |
| Outputs and handoffs | Final/intermediate review surfaces, working versus reusable material, intentional source handling, facts/decisions/confidence/gaps/next action. Missing handoffs are Warnings when quality/safety depends on them, otherwise Suggestions. |
| Privacy | Intentional storage/sharing and commit protection; reusable context free of secrets/private/client data. Report suspected exposure generically, without quoting protected content. |

## Trace

For `trace` or a concrete symptom, restate it; identify relevant prompt/routing/contract/output/handoff/reference paths; compare eligible affected output against prior artifacts and stable guidance; report likely sources with high/medium/low confidence, not causal certainty. Recommend this-run output patch, future source healing, or both, using repair tiers. Natural-language symptoms and `@path` mentions are valid.

## Report and repairs

Use `# PiCM Maintenance Report` with Summary (profile/signals, inspected/omitted scope), Pass, Warnings, Suggestions, redundancy dispositions, and recommended actions. Each finding names paths, problem/opportunity, evidence, likely cause, tier, and healing path. Offer `/picm-maintain trace "describe what drifted"` when useful.

Trace uses `# PiCM Trace Report`: Symptom, Files inspected, Likely drift source, Confidence, Output patch vs source healing, Suggested healing path, and Changes I can apply with your sign-off.

Report-only is complete without edits. Requested repairs need a final direction and sign-off; saving a report also needs approval. Implement and validate aligned repairs, then load [settings and reminders](settings-guide.md) before recording any cycle completion. An agreed inspection-only pass may count; unfinished requested repair may not.
