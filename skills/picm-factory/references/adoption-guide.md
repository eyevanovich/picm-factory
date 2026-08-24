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

Before any shallow path check, run `picm_scan_control preflight`, ask the privacy question using the automatic-protections reassurance and additional-path wording in `coding-adoption-guide.md`, record exact exclusions with `privacy`, and call `begin`. If the root has no `.gitignore`, offer an exact Git-ignore proposal but retain PiCM protection through persisted config or session exclusions when the user declines. Then offer coding adoption without reading source merely to classify it, deriving the shallow sample from protected inventory rather than directory traversal. When coding adoption is selected, load `coding-adoption-guide.md` before further scanning. Its complete exclusion boundary is mandatory: root/nested `.gitignore`, `.git/info/exclude`, global Git excludes, persisted `privacy.excludedPaths`, and current-session exclusions are cumulative, and matching contents are unreadable even when tracked.

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
- Never move, rename, archive, delete, merge, or rewrite files from the inventory. Any later file action requires a current complete concise summary, clear impact flags where applicable, and direct explicit approval under `preview-review-protocol.md`.
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
3. optional user hints about meaningful boundaries and hidden constraints.

Do not ask for maintenance depth. Initial coding adoption automatically performs the Strict examination and the exact config preview stores `capabilities.codebaseMap.maintenancePreset: "strict"`. Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.

Root/distributed describes the resulting map. Scan and recommend is only the analysis path. Coding and workflow scopes may overlap.

Additive mode preserves existing documentation and adds only missing routing/map context. Curated mode may produce a full documentation consolidation/restructure proposal, but every merge, move, rewrite, archive candidate, or deletion must be separately highlighted with its intent and impact in the complete proposal summary; one direct approval authorizes the whole enumerated batch.

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
   - Apply `preview-review-protocol.md` before writing.

Suggested `CLAUDE.md` shim:

```markdown
<!-- Points Claude at AGENTS.md via import; edit AGENTS.md, not this file. -->
@AGENTS.md
```

## Routing proposal options

When routing is missing, partial, or conflicting, offer alternatives rather than one forced conversion:

- **Option 1 — Minimal PiCM compatibility**: smallest patch/create proposal that gives adequate root routing, points to existing context/workflow files, and excludes `.picm/`.
- **Option 2 — Stronger ICM routing**: more opinionated route map inferred from the visible workflow, such as stage/role/specialist paths, local contracts, handoffs, stable references, and outputs.
- **Option 3 — Scanned only for now**: write only report/scanned metadata after approval; do not mark adopted.

For coding adoption, present Additive and Curated as proposal-depth choices in addition to readiness options. Curated mode can recommend canonical docs and compatibility pointers, but it does not weaken the summary-preview or direct-approval gate.

Never write routing/context edits until the user is satisfied with the proposal and explicitly approves exact changes. Apply `preview-review-protocol.md` before every proposal batch. Treat option selection as design intent, not write approval. A preview request, review navigation, cadence choice, or vague assent is also not approval; a draft adjustment supersedes pending write approval, preserves applicable unchanged-path review state, and requires a refreshed summary before approval.

## PiCM config

Default approved adoption writes are minimal and live under `.picm/`:

```text
.picm/config.json
.picm/adoption-report.md
```

Use config to preserve compatibility metadata, provenance, maintenance policy, and approved PiCM scan exclusions—not workflow instructions.

During the initial adoption write pass, ordinary `.picm/config.json` and `.picm/adoption-report.md` are maintainer metadata that appear in the complete summary and remain available for on-demand inspection. Persisted privacy exclusions and standalone maintenance-policy controls retain their separate runtime confirmations.

Near the final config preview, ask whether the user wants scheduled maintenance reminders: No configures manual maintenance; Yes asks for cadence in days, weeks, or months (such as the recommended monthly reminder). Do not present separate nudge versus automatic choices. Explain that scheduling requires `.picm/config.json` to remain non-ignored and a regular non-symlink file beneath a regular non-symlink `.picm/` directory. Accept positive integer day/week/month intervals. Skipped or declined leaves no policy object. Use `picm_maintenance_policy` preview for deterministic `lastCycleAt` and `nextDueAt`, then include the exact object in the same adoption preview. Cadence selection does not approve the config write. When maintenance is due in an interactive session, PiCM displays a persistent reminder above the editor offering Run Now and Defer. Cycle timestamp advance occurs only upon successful maintenance completion; reports, repairs, commits, and all other writes still require direct approval of their current summary.

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

When coding mapping is enabled, preserve one primary `profile` and add a minimal optional `capabilities.codebaseMap` object with the resulting `shape` (`root` or `distributed`), approved `roots`, map/equivalent path, selected local contexts, and `maintenancePreset: "strict"`. A Coding Repository profile implies this capability; a hybrid retains its workflow profile and adds the same capability. Roots may overlap workflow folders. Approved durable scan exclusions live separately under `privacy.excludedPaths` and remain effective even when `.gitignore` is absent or later changes.

Every `.picm/` write uses `preview-review-protocol.md`: a complete concise summary and direct explicit approval of the current proposal. Flag material configuration impact in the summary and keep exact review available on request. Do not treat “choose option 3 scanned only” as approval to write. The deterministic exact TUI confirmation for persisted privacy exclusions remains intact and does not authorize other writes.

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
- Automatic Strict examination and stored `maintenancePreset: "strict"`
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
- read a Git-ignored or PiCM-excluded file during coding detection, adoption, or maintenance
- bypass Git or PiCM exclusion rules through direct reads, `git show`, broad traversal, another worktree, or tracked-file status
