# Maintenance Rubric

Use this guide for `/picm-maintain`.

- **Pass** — good as-is.
- **Warning** — likely issue that may hurt output quality, safety, or routing.
- **Suggestion** — optional improvement.

Use hard failures only when the project is unreadable or dangerous.

## Maintainer posture

Maintain is a heuristic health report and focused drift-investigation helper for folder-agent and coding-repository workspaces. It must not silently rewrite a user's system or imply provenance-grade causal tracing.

Inspect a sensible, eligible scope. Honor Git ignores, persisted `privacy.excludedPaths`, session exclusions, and known sensitive paths; keep sensitive findings out of reports. These are agent-followed boundaries, not a sandbox claim. Load `coding-maintenance-rubric.md` when the Coding Repository profile, `capabilities.codebaseMap`, or visible `CONTEXT-MAP.md` is present.

For every non-trivial Warning or Suggestion, include likely cause, repair tier, smallest safe repair, and files that could change. Report-only remains no-edit. If the user requests repair, use `preview-review-protocol.md`: inspect the affected scope, state one concise final direction, wait for conversational sign-off, then make ordinary-tool edits and validate them.

Maintenance reminders are optional and advisory. A due reminder offers a maintenance request; it does not start work or approve a report, repair, commit, or external effect. Only record completion when the agreed inspection or repairs are actually complete; report a conflict or partial result honestly.

## Redundancy review

During discovery, load and apply `redundancy-review.md` to compare instructions and pointers within and across the inspected agent-facing files. This check is required even when optional optimization is declined. For focused checks or trace, keep the comparison relevant to the requested scope. Include dispositions and coverage limits in the report before proposing repairs.

## Repair tiers

### Tier 1: Routing fixes

Root routing tables, task-to-folder routes, `.picm/` exclusion, and clearer `Go to`/`Read` paths. Preserve user language and style.

### Tier 2: Contract fixes

Purpose, Inputs, Process, Outputs, named script/tool boundaries, Verify, Quality checks, or Handoff sections. Prefer missing boundaries over a whole-file rewrite; ask when the correct contract cannot be inferred.

### Tier 3: Judgment/source fixes

Tone rules, domain constraints, examples, quality bars, source-grounding rules, or repeated corrections that should become durable context. Use highest caution and do not promote sensitive/private output without explicit approval and sanitization.

## Trace mode

For `trace` arguments or a concrete symptom, investigate likely drift sources rather than force a broad audit.

1. Restate the symptom plainly.
2. Identify relevant paths from the prompt, routing, contracts, outputs, handoffs, and references; ask when needed paths are unclear.
3. Compare affected output with prior-stage artifacts, contracts, root routing, examples, and stable references.
4. Report likely source(s) with high/medium/low confidence, not causal certainty.
5. Recommend an output patch for this run, source healing for future runs, or both, using repair tiers.

Natural-language symptoms and optional `@path` mentions are valid.

## Profile identification

Identify the visible profile before the report summary, but keep custom layouts valid. When `identity.md`, `rules.md`, `reference/`, and `workflows/` indicate one reusable helper, identify or strongly suggest **Specialist Folder**; `examples.md` is optional. Evaluate its route to identity, rules, reference, and workflow; recommend only the smallest repair needed for actual ambiguity.

## Cold-agent walk test

For a general health check, choose one representative task or ask the user. Approach from root without relying on chat memory:

1. **Orient from root:** reach relevant local context in a few purposeful reads. Coding may route through a map/equivalent to an owning boundary.
2. **Recover the contract:** identify exact inputs, job, named output/review surface, and human check before downstream use.
3. **Read visible status:** inspect named outputs or equivalent artifacts enough to state present, missing, blocked, or awaiting review. Read relevant artifact content when needed to spot unsupported assertions or an unmet review gate; report presence, correctness, and human approval separately. Presence does not prove correctness, approval, execution history, or causality.
4. **Check routing weight:** routers point to focused context rather than carrying payload/history/reference material.
5. **Check fact ownership:** durable facts have one clear source with pointers instead of drifting copies.

Read the artifacts needed for these judgments. Report unknowns rather than passing an uninspected criterion. A short routing chain is a diagnostic target, not a law; equivalent headings and custom layouts are valid.

## Rubric checks

### 1. Routing clarity

Check for root routing, task-to-context paths, separation of normal work from PiCM maintenance, and `.picm/` exclusion from normal routing. Missing routing, materially unclear task paths, or routing into maintainer metadata are Warnings; excessive root payload is a Warning or Suggestion by impact.

### 2. Context locality and contracts

Check that meaningful stages, roles, specialists, or coding boundaries have nearby context when needed; contracts identify purpose, inputs, process, outputs, constraints, and review; sequential workflows distinguish stable reference from per-run material where useful; and coding tasks can locate owner, entry point, and verification source. Missing operational boundaries are Warnings; lighter clarity improvements are Suggestions.

### 3. Folder legibility

Look for understandable stage/role/specialist/reference/input/output/workflow areas, unclear buckets, giant flat directories, and unexplained custom shapes. Naming and organization are advisory unless routing breaks.

### 4. Context size and mechanical-work discipline

Check that root routing remains concise, background/reference is distinct from active instruction, examples are distinct from rules, and repeated deterministic work has a clear user-named script/integration boundary when appropriate. A referenced mechanism needs clear inputs, outputs, side effects, and review boundary. Do not invent, implement, or execute an integration.

For root overload, prefer a Tier 1 split that preserves history and unique constraints while moving durable reference or task payload to focused reachable homes. Ask which conflicting rules are current before proposing substantive changes.

### 5. Living-system hygiene and drift

Check stale context risk, contradicting folders/config/maps, broken handoffs, uncaptured learnings, repeated corrections, repeated mechanical instructions, and unresolved prior recommendations. Suggest the smallest Tier 1 routing, Tier 2 contract, or Tier 3 judgment repair supported by evidence.

### 6. Output boundaries and handoffs

Check clear final-output homes, inspectable intermediate artifacts before downstream use, separation of working artifacts from reusable context, intentional treatment of source material, and handoffs that retain facts, decisions, confidence, gaps/unknowns, and next action. Missing handoffs are a Warning when quality or safety depends on them; otherwise a Suggestion.

### 7. Security and privacy

Check that sensitive material is handled intentionally, obvious secrets are protected from accidental commits where appropriate, and reusable context/examples do not unnecessarily contain credentials or private/client data. A suspected boundary failure is reported generically; do not quote protected content.

## Output format

```markdown
# PiCM Maintenance Report

## Summary
- Primary profile:
- Profile signals:
- Scope inspected and deliberately not inspected:

## Pass
## Warnings
### [Finding]
- Path(s):
- Problem:
- Likely cause:
- Repair tier:
- Suggested healing path:

## Suggestions
### [Finding]
- Path(s):
- Opportunity:
- Repair tier:
- Suggested healing path:

## Recommended next actions
## Changes I can apply with your sign-off
## Need to trace a specific symptom?
Run `/picm-maintain trace "describe what drifted"` and mention `@path` if useful.
```

For trace mode use `# PiCM Trace Report` with Symptom, Files inspected, Likely drift source, Confidence, Output patch vs source healing, Suggested healing path, and Changes I can apply with your sign-off.
