# Adoption Guide

Use this guide for `/picm-adopt`.

Adoption is for existing ICM/folder-agent and coding repositories. It is a compatibility-enablement flow, not an automatic conversion flow: first scan read-only, then propose the smallest user-approved changes that make the repo usable by PiCM and `/picm-maintain` while preserving existing conventions.

## Goals

- Make the project PiCM-compatible so PiCM can understand and maintain it.
- Preserve existing `CLAUDE.md`, `AGENTS.md`, folder names, workflow files, examples, references, and local conventions unless exact edits are approved.
- Use existing routing files as the source of truth when they are adequate.
- Suggest stronger ICM compatibility carefully and optionally.
- Add minimal `.picm/` metadata/reports only after confirmation.
- Offer a first-class Coding Repository profile for code-primary repos and a composable codebase-map capability for hybrid workspaces.

## Status model

Do not collapse scanning, reporting, and adoption into one state.

- **Scanned only**: PiCM inspected the repo and may have written `.picm/adoption-report.md` and/or `.picm/config.json` after approval, but the repo is not yet fully adopted.
- **Needs routing before adoption**: root routing is absent, placeholder-only, partial, conflicting, or unsafe. Offer routing proposals before marking the repo adopted.
- **Ready**: adequate visible routing exists or was approved and written, and `.picm/config.json` records adoption metadata.
- **Ready with warnings**: adequate visible routing exists, but non-blocking ICM improvements remain.

Full `adoption.status: "adopted"` requires adequate visible routing. `.picm/config.json` supports maintenance but does not replace the human/agent-facing route map.

## Read-only scan

Start read-only. Look for:

- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.md`
- `REFERENCES.md`
- `identity.md`
- `rules.md`
- `examples.md`
- `reference/`
- `references/`
- `workflows/`
- `handoff.md` or `handoffs/`
- numbered folders such as `01_*`
- `stages/`
- `.pi/settings.json`
- `.picm/config.json`

Also note likely stable-reference areas vs per-run working artifacts or outputs. Do not copy sensitive/private source content into the report or config.

If a shallow Git-ignore-aware path check suggests a coding repository, offer coding adoption without reading source merely to classify it. When selected, load `coding-adoption-guide.md` before further scanning. Its Git-ignore boundary is mandatory: require a Git worktree for automatic scans, derive candidate paths through Git, and run `git check-ignore --no-index` before every read. Never inspect ignored file contents, even when tracked.

## Optional file-role inventory

For a complex, cluttered, or unfamiliar workspace—or when the user asks—add a compact path-to-role-to-rationale table to the read-only adoption report. This is an orientation aid, not a migration map, and should cover representative files or areas rather than mechanically listing every file.

Use PiCM's existing vocabulary:

- **Routing** — directs an agent to the right context or task area.
- **Local contract** — explains what work happens in a folder, including boundaries or handoffs.
- **Reusable context** — stable rules, references, examples, schemas, or background used across runs.
- **Working artifact** — per-run source, draft, intermediate output, or final deliverable.
- **Review / handoff** — an inspectable surface used to approve, question, or transfer work.
- **Unclear / possible archive candidate** — purpose, ownership, duplication, or current use cannot be established from visible evidence.

Format:

```markdown
## Optional file-role inventory

| Path or area | Observed role | Rationale |
| --- | --- | --- |
| `path/` | Reusable context | Referenced as stable guidance by the visible workflow. |
```

Rules:

- Classify from visible evidence and say when confidence is limited. A file may have more than one observed role; do not force a false single category.
- Keep routing readiness and adoption status separate. An inventory classification does not make inadequate routing adoptable and does not make a custom layout wrong.
- Treat **Unclear / possible archive candidate** as a question for the owner, never a declaration that content is dead. State the evidence, preserve the path as-is, and recommend archive/delete consideration only after owner confirmation.
- Do not turn the inventory into proposed destinations, renamed paths, or a conversion plan unless the user separately asks for options.
- Never move, rename, archive, delete, merge, or rewrite files from the inventory. Any later file action requires an exact preview and separate explicit approval.
- Keep sensitive material generic. Do not quote contents, and avoid reproducing filenames or paths that themselves reveal protected information; use a safe area label such as “private source area” when needed.
- Omit the table when it would add noise to a small, already legible workspace.

## Coding adoption branch

`/picm-adopt coding` enters this branch directly; normal `/picm-adopt` reaches the same branch after the user accepts a safe shallow coding-repository classification.

Offer:

- **Primary Coding Repository profile** when software development is the repo's main operating shape.
- **Codebase-map capability** alongside the inferred Stage Pipeline, Specialist Folder, Team / Role OS, or Custom / Existing Structure profile for a hybrid workspace.

Then ask for:

1. root map, distributed map, or scan and recommend;
2. additive or curated adoption;
3. Light, Balanced, or Strict maintenance (Balanced default);
4. optional user hints about meaningful boundaries and hidden constraints.

Root/distributed describes the resulting map. Scan and recommend is only the analysis path. Coding and workflow scopes may overlap.

Additive mode preserves existing documentation and adds only missing routing/map context. Curated mode may produce a full documentation consolidation/restructure proposal, but every merge, move, rewrite, archive candidate, or deletion remains a separately previewed, explicitly approved action.

Use `CONTEXT-MAP.md` for a substantial dedicated map; keep a small map in root routing or reuse adequate existing architecture docs when that avoids duplication. Root instructions own behavior/task routing, the map indexes repository context, and local `CONTEXT.md` files provide selected boundary detail.

## Routing readiness

Pi can load `AGENTS.md` and/or `CLAUDE.md` from the current directory and parent directories. A file existing is not the same as adequate routing.

Adequate visible routing should at least:

1. Name what the workspace/project is.
2. Tell the agent which file(s) to read for core context.
3. Map common task types to folders/files, or give a clear “where to start.”
4. Identify important local context boundaries if folders have their own contracts.
5. Exclude `.picm/` from normal workflow context.
6. Include safety/privacy boundaries if sensitive material is present or likely.
7. For coding adoption, route to the repository map/equivalent, meaningful component context, entry/verification sources, and generated/do-not-edit boundaries without requiring a whole-repo scan.

Classify routing quality:

- **Adequate**: enough for normal agent workflow and PiCM maintenance.
- **Partial**: useful identity/general instructions, but weak task/folder routing.
- **Placeholder/unrelated**: file exists but does not route this workspace.
- **Conflicting/risky**: contradicts visible structure or routes agents into unsafe/sensitive areas.

## Routing file policy

1. **Only `CLAUDE.md` exists**
   - Treat `CLAUDE.md` as the source of truth if adequate.
   - Do not propose replacing it with `AGENTS.md` by default.
   - If partial, offer exact patch options while preserving it as user-owned.

2. **Only `AGENTS.md` exists**
   - Treat `AGENTS.md` as the source of truth if adequate.
   - Do not suggest `CLAUDE.md` unless the user wants Claude Code compatibility.

3. **Both exist**
   - Check whether they cooperate or conflict.
   - If they duplicate or conflict, offer coexistence optimization: one canonical file and the other a compatibility pointer, using this repo’s pattern as an example.
   - Do not choose the canonical file or edit either file without approval.

4. **Neither exists**
   - Recommend creating `AGENTS.md` as the PiCM default.
   - Ask whether to also add a small `CLAUDE.md` compatibility shim for future Claude Code use.
   - Preview exact contents before writing.

Suggested `CLAUDE.md` shim:

```markdown
# Project Instructions

Read `AGENTS.md` for canonical project instructions. This file exists for Claude Code compatibility.
```

## Routing proposal options

When routing is missing, partial, or conflicting, offer alternatives rather than one forced conversion:

- **Option 1 — Minimal PiCM compatibility**: smallest patch/create proposal that gives adequate root routing, points to existing context/workflow files, and excludes `.picm/`.
- **Option 2 — Stronger ICM routing**: more opinionated route map inferred from the visible workflow, such as stage/role/specialist paths, local contracts, handoffs, stable references, and outputs.
- **Option 3 — Scanned only for now**: write only report/scanned metadata after approval; do not mark adopted.

For coding adoption, present Additive and Curated as proposal-depth choices in addition to readiness options. Curated mode can recommend canonical docs and compatibility pointers, but it does not weaken exact preview/write approval.

Never write routing/context edits until the user is satisfied with the proposal and explicitly approves exact changes. Treat option selection as design intent, not write approval. If the user says “preview,” “show exact files,” or “do not write yet,” stop after the preview and ask for a separate explicit approval such as “approve writing these files.”

## PiCM config

Default approved adoption writes are minimal and live under `.picm/`:

```text
.picm/config.json
.picm/adoption-report.md
```

Use config to preserve compatibility metadata and provenance, not workflow instructions.

Adopted example:

```json
{
  "version": 1,
  "generatedBy": "picm-factory",
  "adoption": {
    "status": "adopted",
    "readiness": "ready",
    "adoptedAt": "2026-05-24",
    "report": ".picm/adoption-report.md"
  },
  "profile": "custom-existing",
  "routing": {
    "source": "CLAUDE.md",
    "status": "preserved-existing",
    "coexistence": "single-routing-file"
  },
  "paths": {
    "rootInstructions": "CLAUDE.md",
    "rootContext": null,
    "workflowFolders": []
  }
}
```

Scanned-only example:

```json
{
  "version": 1,
  "generatedBy": "picm-factory",
  "adoption": {
    "status": "scanned",
    "readiness": "needs-routing-before-adoption",
    "report": ".picm/adoption-report.md"
  },
  "profile": "custom-existing",
  "routing": {
    "source": "CLAUDE.md",
    "status": "partial-existing",
    "coexistence": "single-routing-file"
  },
  "scanSummary": {
    "routing": "CLAUDE.md exists but has incomplete task/folder routing.",
    "recommendedNextStep": "Approve a minimal routing patch or stronger ICM routing proposal."
  }
}
```

Keep `scanSummary` brief. Put detailed findings in `.picm/adoption-report.md`.

When coding mapping is enabled, preserve one primary `profile` and add a minimal optional `capabilities.codebaseMap` object with the resulting `shape` (`root` or `distributed`), approved `roots`, map/equivalent path, selected local contexts, and maintenance preset. A Coding Repository profile implies this capability; a hybrid retains its workflow profile and adds the same capability. Roots may overlap workflow folders.

Even `.picm/` writes require the same two-step gate as visible routing edits:

1. user chooses a path or asks for a preview;
2. agent shows exact planned files/changes;
3. user gives separate explicit approval to write.

Do not treat “choose option 3 scanned only” as approval to write if the user also asked to preview first or said not to write yet.

## Optional ICM improvements

After compatibility findings, suggest stronger ICM alignment carefully. These are subjective unless routing or safety is actually broken.

Look for:

- concise root routing that points to local context;
- clear workspace purpose and workflow flow;
- local stage/role/specialist contracts;
- Inputs / Process / Outputs for sequential workflows;
- stable references separated from per-run working artifacts;
- reviewable/editable outputs before downstream use;
- handoffs that preserve gaps, unknowns, and next actions;
- explicit safety boundaries for secrets, regulated data, client data, and private/personal material.

Use language such as “consider,” “could be clearer,” and “if this workflow is sequential...” Do not mark custom structure wrong merely because it does not match a template.

## Report format

Use this structure:

```markdown
# PiCM Adoption Report

## Summary
- PiCM compatibility: Ready / Ready with warnings / Needs routing before adoption / Scanned only
- Inferred layout profile:
- Existing routing source:
- Adoption status:
- Coding Repository profile or codebase-map capability, if selected:

## Existing structure detected

## Routing readiness
- Source:
- Adequacy:
- Issues:
- Proposed routing options, if needed:

## PiCM compatibility
- What is enough for `/picm-maintain`
- `.picm/config.json` status

## Optional ICM improvements

## Coding adoption
- Mapping approach and resulting shape
- Approved code roots and local-context boundaries
- Maintenance preset
- Evidence, confidence, and unknowns

## Documentation consolidation proposal

## Optional file-role inventory

## Security/privacy notes

## Preserved as-is

## Optional changes requiring approval

## Next steps
```

The **Preserved as-is** section should name existing routing files, folder names, workflow/context files, examples/references, source/output/data folders, sensitive/private material not copied, and visible conventions PiCM will respect.

## Forbidden by default

Do not do these without explicit user approval for the exact action:

- rewrite `CLAUDE.md`
- rewrite `AGENTS.md`
- create `AGENTS.md` or `CLAUDE.md`
- rename folders
- move files
- delete files
- flatten/nest existing stages
- copy sensitive source content into context/example/report/config files
- mark `adoption.status: "adopted"` when visible routing is inadequate
- treat an inventory classification as permission to move, rename, archive, delete, merge, or rewrite a file
- label a file dead or obsolete when visible evidence only supports “unclear”
- treat an option choice or preview request as write approval
- read a Git-ignored file during coding detection, adoption, or maintenance
- bypass ignore rules through direct reads, `git show`, broad traversal, another worktree, or tracked-file status
