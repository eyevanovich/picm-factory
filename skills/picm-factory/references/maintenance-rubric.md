# Maintenance Rubric

Use this guide for `/picm-maintain`.

Severity levels:

- **Pass** — good as-is.
- **Warning** — likely issue that may hurt output quality, safety, or routing.
- **Suggestion** — optional improvement.

Do not use hard failures unless the project is unreadable or dangerous.

## Maintainer posture

`/picm-maintain` is a heuristic health report and focused drift-investigation helper for folder-agent and coding-repository workspaces. It should keep the workspace aligned over time, but it must not silently rewrite the user's system or imply provenance-grade causal tracing.

When the Coding Repository profile, `capabilities.codebaseMap`, or visible `CONTEXT-MAP.md` is present, load `coding-maintenance-rubric.md`. Its Light/Balanced/Strict checks extend this rubric, and its Git-ignore-safe read boundary applies before any coding scan.

For every non-trivial Warning or Suggestion, include a healing path:

1. **Likely cause** — why this drift or risk exists.
2. **Repair tier** — classify the proposed fix.
3. **Smallest safe repair** — the least invasive change that restores clarity.
4. **Previewable change** — what file(s) could be edited after approval.

Never apply repairs automatically. Offer exact edits only in `Changes I can apply with your approval` and wait for explicit approval before writing.

## Repair tiers

Use these tiers to calibrate risk and approval language:

### Tier 1: Routing fixes

Examples: root routing table edits, task-to-folder routing, `.picm/` exclusion, clearer `Go to` / `Read` paths.

- Usually safest to propose as exact patches.
- Preserve the user's existing file style and terminology.
- Still require preview and explicit approval before writing.

### Tier 2: Contract fixes

Examples: adding or clarifying stage/specialist/role `Purpose`, `Inputs`, `Process`, `Outputs`, named script/tool boundaries, `Verify`, `Quality checks`, or `Handoff` sections.

- Preserve user language wherever possible.
- Prefer adding missing contract boundaries over rewriting full context files.
- Ask a clarification question if the correct contract cannot be inferred from visible files.

### Tier 3: Judgment/source fixes

Examples: tone rules, domain constraints, examples/anti-examples, quality bars, source-grounding rules, repeated output corrections that should become reusable context.

- Highest caution tier.
- Usually ask before drafting the source-level rule.
- Do not promote sensitive/private output into reusable context without explicit user approval and sanitization.

## Trace mode

When user arguments start with `trace` or describe a concrete drift symptom, treat `/picm-maintain` as a focused heuristic drift investigation rather than a full health check.

Examples:

```text
/picm-maintain trace "final output drifted from approved source"
/picm-maintain trace "handoffs are losing uncertainty"
/picm-maintain trace "stage 3 ignores decisions from stage 1" @output/final.md
```

Trace mode process:

1. Restate the symptom in plain language.
2. Identify relevant files from the prompt, `@` mentions, routing files, stage contracts, outputs, handoffs, and references.
3. If the needed output/source files are unclear, ask for paths instead of guessing.
4. Compare final/affected output against prior-stage artifacts, stage contracts, root routing, examples, and stable references.
5. Report likely drift source(s) with confidence: high, medium, or low; avoid claiming guaranteed causal provenance.
6. Recommend whether to patch the output for this run, heal the source context for future runs, or both.
7. Offer previewable repairs using the three repair tiers.

Trace mode should not require rigid syntax. Natural-language symptoms are valid; file mentions are optional direction.

## Cold-agent walk test

Run this bounded, advisory test during a general health check. Choose one representative task or ask the user which task to test, then approach the workspace from its root as if you have no prior conversation or memory. Do not require a specific folder name, numbering scheme, or contract heading.

1. **Orient from root.** Starting with the root routing file, can you identify the workspace and reach the relevant local contract within a few purposeful reads? For coding tasks, the route may be root instructions → `CONTEXT-MAP.md`/equivalent → owning boundary. Count the routing chain, not the task inputs and references the contract intentionally names.
2. **Recover the local contract.** Can you identify the task's exact input paths, its job, its named output or review surface, and the concrete human check before downstream use?
3. **Read visible status.** From the named outputs or equivalent visible artifacts, can you state what is present, missing, blocked, or awaiting review? Read artifact content when needed; existence alone does not prove correctness, approval, execution history, or causal provenance.
4. **Check routing weight.** Do root and intermediate routing files mainly point to local context instead of carrying task payload, history, or large reference material?
5. **Check fact ownership.** Does each durable fact or rule have one clear source of truth, with links or pointers elsewhere instead of drifting copies?

Read each named input, output, review, or equivalent visible artifact needed to evaluate those criteria; inspect artifact content when it can reveal unsupported assertions or an unmet review gate. Report a **Warning** when the local contract does not name exact inputs, its job, an output/review surface, or a concrete human check. Report artifact presence separately from correctness and human approval. Do not pass a criterion that was not inspected; say what could not be determined instead.

Classify each result with the existing severity levels:

- **Pass** — the cold walk reaches enough visible context to orient, act, and report bounded status.
- **Warning** — an active task cannot be routed, its operational boundary is materially ambiguous, visible status cannot be determined, or duplicated sources conflict.
- **Suggestion** — the walk works, but a shorter route, more exact path, clearer human check, lighter router, or single fact home would reduce future drift.

Calibration:

- “A few reads” is a diagnostic target, not a hard read-count law. Complex or custom workspaces may need an extra router when each read narrows context intentionally.
- `Purpose`, `Inputs`, `Outputs`, `Verify`, and `Handoff` are useful labels, not required names. Equivalent visible contracts pass.
- Report only status supported by current artifacts, such as “draft present; human approval not visible.” Never infer deterministic workflow state or provenance merely from file presence.
- Keep custom layouts and naming valid. Recommend the smallest routing or contract repair; do not propose migration solely to make the walk resemble a profile.
- Do not read `.picm/` as part of the normal task route. It may be consulted separately for maintenance metadata.

## 1. Routing clarity

Checks:

- Is there a root routing file (`AGENTS.md` or `CLAUDE.md`)?
- Is it clear which files/folders to read for common tasks?
- Are normal workflow tasks separated from PiCM maintenance tasks?
- Is `.picm/` excluded from normal workflow routing?

Typical findings:

- Missing routing file: Warning.
- Routing file too long: Warning or Suggestion depending severity.
- No task-to-context routing: Warning.
- `.picm/` read during normal tasks: Warning.

## 2. Context locality and contracts

Checks:

- Does each stage/specialist/role or meaningful coding boundary have nearby instructions when local context is actually needed?
- Do local context files explain purpose, inputs, process, outputs, and constraints?
- For stage pipelines, do stage contracts distinguish stable reference material from per-run working artifacts where useful?
- Is there a `Verify`, `Quality checks`, or equivalent section for cross-stage alignment when output quality depends on prior decisions?
- Can the agent act without reading the entire repo?
- For coding repositories, can it locate the owning component, supported entry point, and authoritative verification source without guessing?

Typical findings:

- No local context for major folder: Warning.
- Context exists but lacks outputs/constraints: Suggestion.
- Stage context has no clear inputs or outputs: Warning for active pipelines, Suggestion for lightweight helpers.
- Multi-stage output has no verification/alignment check against prior stage decisions: Suggestion or Warning depending risk.

Healing paths:

- Tier 2 contract fix: add missing `Inputs`, `Outputs`, `Verify`, or `Handoff` lines using visible folder paths.
- Tier 3 judgment/source fix: add quality-bar or source-grounding guidance only after user confirmation.

## 3. Folder legibility

Checks are advisory. Users may organize how they wish.

Look for:

- folders that map to stages, roles, specialists, references, inputs, outputs, or workflows
- unclear buckets like `misc`, `stuff`, `old`
- giant flat directories
- custom layout with no explanation

Typical findings:

- Better name would improve routing: Suggestion.
- Too many files at one level causing confusion: Suggestion, Warning only if routing is broken.

## 4. Context size and mechanical-work discipline

Checks:

- root routing file is concise
- context files are not giant brain dumps
- background references are separated from active instructions
- examples are separated from rules
- repeated deterministic instructions are not inflating prompts unnecessarily
- fetching, moving files, formatting, sending, or API work has been considered for a local script or MCP/tool integration when that would be simpler and more reliable
- any referenced script/tool was actually named by the user or already exists visibly, with clear inputs, outputs, side effects, and human review boundaries

Typical findings:

- huge root file: Warning.
- references mixed into instructions: Suggestion or Warning.
- long repeated mechanical procedure could be extracted to a script/tool: Suggestion; Warning only when prompt bloat or inconsistent execution is materially harming the workflow.
- context invents or ambiguously references a script/tool that the user did not name and the workspace does not contain: Warning.

Healing paths:

- Tier 2 contract fix: replace repeated mechanical steps with a concise pointer to a user-confirmed script path or MCP/tool name, plus expected inputs/outputs and review requirements.
- If no script/tool has been named, ask whether the user wants an extraction proposal; do not invent, implement, or execute an integration as part of maintenance approval.
- Preserve preview and explicit approval before file moves, sends, external API effects, or edits to context files.

## 5. Living system hygiene and drift

Checks:

- stale context risk
- missing update notes where useful
- context contradicts current folder structure or generated/adopted `.picm/config.json`
- coding maps contradict current manifests, component paths, entry points, or verification sources
- stage/role handoffs no longer match current folders or outputs
- learnings from real use not captured
- repeated human corrections that should become source-level context
- repeated deterministic mechanics that should become a local script or named MCP/tool boundary rather than more prompt instructions
- prior recommendations unresolved, if a prior `.picm/maintenance-report.md` exists

Typical findings:

- context contradicts current folder structure: Warning.
- routing and local context disagree about who owns a task: Warning.
- repeated output correction appears source-level but is not captured in rules/examples/context: Suggestion; Warning only if it causes repeated bad output.
- repeated deterministic instructions bloat context or drift between stages: Suggestion to consider script/tool extraction.
- useful update opportunity: Suggestion.

Healing paths:

- Tier 1 routing fix: align root routing with current folders.
- Tier 2 contract fix: update local contracts/handoffs to match actual workflow.
- Tier 3 judgment/source fix: propose a new rule, example, anti-example, or quality-bar note for human approval.

## 6. Output boundaries and handoffs

Checks:

- final outputs have a clear home
- intermediate outputs are inspectable before the next stage/role consumes them
- working artifacts are not mixed into reusable context
- source material is not accidentally treated as generated output
- handoffs preserve facts, decisions, confidence, gaps/unknowns, and next action when work crosses a meaningful boundary
- final outputs can be traced back to the prior stage or source material well enough for a human to debug drift

Typical findings:

- outputs pollute reference folders: Suggestion or Warning.
- sensitive outputs in public/shared area: Warning.
- handoff exists but lacks gaps/unknowns or next action: Suggestion.
- no clear handoff between stages/roles where downstream work depends on prior decisions: Warning if quality or safety is affected, otherwise Suggestion.

Healing paths:

- Tier 2 contract fix: add handoff expectations to stage/role context.
- Tier 3 judgment/source fix: add confidence/gaps prompts or examples when the handoff requires domain judgment.

## 7. Security/privacy

Checks:

- coding scans derive candidates through Git and run `git check-ignore --no-index` before every read; ignored paths are never opened, even when tracked
- `.gitignore` covers obvious secrets
- context/examples do not contain credentials or sensitive data by accident
- private/client material is handled intentionally
- repo visibility matches sensitivity

Typical findings:

- committed `.env`/keys/tokens: Warning.
- sensitive client data copied into examples without need: Warning.
- missing `.env.example`: Suggestion.
- coding scan reads or bypasses a Git-ignored path: Warning; stop the scan, disclose the boundary failure without quoting content, and do not continue until the user confirms a safe recovery path.

## Output format

Use this format for general health checks:

```markdown
# PiCM Maintenance Report

## Summary

## Pass

## Warnings

### [Finding title]
- Path(s):
- Problem:
- Likely cause:
- Repair tier:
- Suggested healing path:

## Suggestions

### [Finding title]
- Path(s):
- Opportunity:
- Repair tier:
- Suggested healing path:

Place cold-agent walk findings in the Pass, Warnings, or Suggestions sections above. Identify them in the finding title; for non-trivial Warnings and Suggestions, keep the same likely cause, repair tier, and healing-path fields.

## Recommended next actions

## Changes I can apply with your approval

## Need to trace a specific symptom?
Run `/picm-maintain trace "describe what drifted"` and mention files with `@path` if useful.
```

Use this format for trace mode:

```markdown
# PiCM Trace Report

## Symptom

## Files inspected

## Likely drift source

## Confidence

## Output patch vs source healing

## Suggested healing path

## Changes I can apply with your approval
```
