# Interview Guide

Use this guide for `/picm-new`.

The goal is not to fill a giant form. The goal is to gather enough context to recommend a strong minimal scaffold.

If the user supplied `/picm-new` arguments, treat them as seed context. Do not make them repeat themselves; ask only the missing critical questions. If no arguments were supplied, run the full core interview.

## Core interview

Ask these in plain language:

1. **Workflow purpose**
   - What repeatable work should this folder-agent help with?
   - Who uses the final output?
   - What business/personal value does it create?

2. **Inputs**
   - What does the user bring into the workflow?
   - Examples: notes, transcripts, briefs, links, screenshots, datasets, client files.
   - Which inputs are stable reusable reference/factory material (rules, examples, style, domain constraints)?
   - Which inputs are per-run working artifacts (source material for this run, prior-stage outputs, drafts)?
   - Are any inputs sensitive or private?

3. **Outputs**
   - What should the workflow produce?
   - Which outputs are final deliverables vs inspectable working drafts?
   - What format should outputs use?
   - Which intermediate outputs will a downstream stage read after human review?

4. **First executable use**
   - What will you run first?
   - What is the shortest useful path from its real input to a reviewed output?
   - Which stages, roles, specialist recipes, references, or examples are required for that run, and which are only future ideas?

5. **Process shape**
   - Is the workflow mostly linear stages?
   - Is it one reusable specialist?
   - Does it involve multiple roles or handoffs?
   - For each active stage, what does it read, what does it do, and what does it write?
   - Where does human review happen before downstream work continues?

6. **Mechanical work boundary**
   - Does the workflow repeatedly fetch data, move files, format output, send messages/files, or call an API?
   - Which of those steps are deterministic enough for a local script or MCP/tool integration instead of repeated AI instructions?
   - Has the user already named an existing or planned script path, MCP server/tool, or other integration? If not, discuss the boundary without inventing one for the scaffold.
   - What inputs/outputs and human approval apply, especially before moving files, sending anything, or changing external systems?

7. **Quality bar**
   - What makes an output good?
   - What mistakes must the agent avoid?
   - What should never be automated without review?

8. **Reference material**
   - What examples, style guides, policies, source docs, or domain rules should be reusable context?
   - What should be background material rather than active instructions?
   - What should stay out of reference/context because it is only a per-run artifact, private source, or output draft?

## Branching follow-ups

Ask only when relevant.

### Operator profile

Use when the user is non-technical, team-based, or unsure how they will operate the workspace.

- Who will run this day to day?
- Are they comfortable editing markdown files?
- Do they need step-by-step prompts?

### Trigger and cadence

Use when workflow timing matters.

- When does this workflow start?
- Is it daily, weekly, per client, per artifact, or ad hoc?
- What tells the user “start here”?

### Boundaries and non-goals

Use for legal, medical, financial, compliance, brand, publishing, or safety-sensitive work.

- What should the agent not do?
- What requires human approval?
- What source claims must never be invented?

### Decision points and branches

Use when the workflow is not linear.

- What happens when input is incomplete?
- Can work move backward to an earlier stage?
- What happens when review fails?

### Golden examples and anti-examples

Use when output quality is style-sensitive.

- Give one good example and why it works.
- Give one bad example and why it fails.

### Sensitive information

Always ask this baseline question before scaffold creation:

- Will this workspace contain credentials, tokens, private keys, client/private data, regulated data, or sensitive personal material?

If the answer is yes or unclear, deepen only as needed:

- Should this repo be private?
- Which paths should stay local-only or be ignored by git?
- Should sensitive source material stay outside reusable context files and examples?
- What requires explicit human approval before being copied into context?

If the answer is no, record that plainly in `CONTEXT.md`. If unknown, record the uncertainty and recommend revisiting during `/picm-maintain`.

### First-run path and maintenance needs

Use near the end.

- What tells the user “start here” for the first real run?
- Where should the first output, draft, review surface, or handoff card land?
- What must a human inspect/edit before the next stage or role consumes it?
- Which gaps, unknowns, blockers, risks, or low-confidence points must remain visible downstream?
- What will change over time?
- What should PiCM help keep fresh?
- When should the user run `/picm-maintain`?

## Scaffold approval gates

Before writing files:

1. Confirm folder classification:
   - empty enough: proceed after normal scaffold approval
   - source-material-only: confirm building around existing material without moving/rewriting it
   - existing architecture: recommend `/picm-adopt`; require explicit override and exact file-action approval to continue with `/picm-new`
2. Confirm git safety:
   - no git repo: recommend `git init`; require explicit confirmation to proceed without git
   - dirty repo: show `git status --short`; require confirmation
   - clean repo: proceed after scaffold approval
3. Preview file actions:
   - create missing files/folders
   - append/update existing safe files only with exact proposed changes
   - no silent overwrites
4. Ensure generated files contain no unresolved bracket placeholders.

## End state

After the interview:

1. Summarize the workflow in 5-10 bullets.
2. Recommend a primary layout profile and explain why.
3. Present alternatives and any secondary pattern worth borrowing.
4. Ask the user to confirm the profile before scaffolding.
5. Preview the minimum viable scaffold plan and explain how every proposed path supports the first real run, required routing/safety, or a known reusable constraint. Remove future-only stages, unused roles, and empty organizational areas.
6. If no real references or examples exist, say to add them after the first real use reveals a durable rule or genuine golden example; do not create placeholder files or folders.
7. For a Stage Pipeline, preview each generated stage contract with concise Purpose, Inputs, Process, Outputs, optional Named scripts/tools, Verify, and Handoff/review-gate sections. Include the scripts/tools section only when the user named a relevant script path, MCP server/tool, or integration during the interview.
8. Ensure any stage output consumed downstream points to an inspectable review surface, usually a named file under that stage's `output/` when the workflow benefits from a dedicated output area.
9. Do not create empty speculative `references/`, `input/`, `output/`, `examples/`, or role folders. A stage contract can name future paths without pre-creating empty directories. Create a directory only when writing a real seed file/reference/first-run artifact or when the user explicitly asks for physical directories now.
10. After creation, end with a layout-tailored first-run checklist. It must name:
   - where to start, using the actual generated folder/file path;
   - what first output, draft, review surface, or handoff artifact to create/update;
   - what the human should inspect/edit/approve before downstream work consumes it;
   - what gaps, unknowns, blockers, risks, unsupported claims, or low-confidence points should remain visible;
   - where the next stage/role/specialist action should read from; and
   - when to run `/picm-maintain`.
11. Use the selected layout's review gate:
    - Stage Pipeline: review/edit each named intermediate output before the downstream stage consumes it. Tell the user to stop between stages, check Verify/Handoff notes, and run the next stage only from the approved edited artifact.
    - Team / Role OS: review the handoff card or agreed handoff artifact before the receiving role acts. The review point should preserve summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action.
    - Specialist Folder: review the first specialist output before promoting lessons into stable rules/examples.
    - Custom / Existing Structure: use the visible review/handoff convention actually present, and mark missing review surfaces as future maintenance suggestions.
12. Recommend `/picm-maintain` after the first real workflow/use/handoff and whenever the process, stages, roles, routing, stable references, or named scripts/tools change. Do not present maintain as a required preflight or guaranteed provenance debugger.
