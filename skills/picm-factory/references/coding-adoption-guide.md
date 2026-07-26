# Coding Repository Adoption Guide

Use this guide when `/picm-adopt coding` is invoked or normal `/picm-adopt` identifies a likely coding repository and the user chooses coding adoption.

Coding adoption maps agent-relevant repository context without trying to document every file or infer a complete architecture. It can be the primary **Coding Repository** profile or a composable codebase-map capability alongside another primary layout.

## Security boundary: Git ignored means unreadable

Coding repositories commonly store credentials, local configuration, private fixtures, generated artifacts, and large dependency trees behind Git ignore rules. Treat those rules as a hard read boundary. The PiCM extension enforces this boundary only during scan phases inside a workflow explicitly authorized by `/picm-new`, `/picm-adopt`, or `/picm-maintain`; it is inactive during ordinary Pi work. User-typed `!bash` is never intercepted. The first command turn is already scan-active. On later interview turns, use `picm_scan_control` with `begin` before scanning, `end` after the scan phase, and `complete` when the workflow finishes.

Before inspecting repository contents:

1. Determine whether the current folder is inside a Git worktree. A missing `.git` directory does not block maintenance or adoption: the extension uses transient isolated Git metadata outside the workspace with the current folder as its work tree, without initializing or modifying the user's folder.
2. Ask whether visible files contain secrets, regulated data, client data, private material, or other paths that should not be inspected.
3. Build candidate paths with Git-aware listing such as `git ls-files --cached --others --exclude-standard`, using either the real worktree or the extension's isolated Git view. Do not begin with broad `find`, unrestricted recursive listings, `rg --no-ignore`, or equivalent traversal.
4. Before opening any candidate path—including a user-mentioned path—the extension runs the equivalent of:

   ```bash
   git check-ignore --no-index -q -- "path/to/candidate"
   ```

   - Exit `0`: the path is ignored and the tool call is blocked.
   - Exit `1`: Git does not consider it ignored; an existing read must still be a Git-derived candidate in the approved scan scope.
   - Any other result: the gate fails closed and blocks the tool call.

`--no-index` is required so ignore rules are honored even when an ignored path was previously committed. Use `picm_scan_control inventory` for candidate discovery; the extension blocks every agent Bash tool call during an active scan. It is not an OS-level sandbox: dynamically constructed agent shell paths are unavailable during guarded scans, while unrelated custom filesystem tools and filesystem time-of-check/time-of-use races remain limitations. Never use those mechanisms, another worktree, or direct filesystem reads to bypass this boundary. User-typed `!bash` is outside the agent scan boundary and remains unrestricted.

Do not follow symlinks during automatic scans. A non-ignored symlink can resolve to ignored or out-of-repository content, so the extension blocks direct built-in path-tool access to symlinks. Record only the link path/type; if its content is genuinely needed, ask the user for a non-symlink, non-ignored copy inside the approved worktree rather than bypassing the gate.

Treat each submodule as a separate repository boundary. Do not initialize, fetch, or enter it automatically. If the user explicitly includes an already available submodule, repeat the security/privacy check, Git-derived candidate listing, and per-path ignore checks from that submodule's worktree root before reading anything.

Maintenance and coding scans may run with or without repository metadata. When `.git` is absent, the extension creates temporary bare Git metadata under the operating system's temporary directory, points it at the workspace only for Git ignore/candidate evaluation, and removes it on session shutdown. It never runs `git init` in the user's workspace. Existing root and nested `.gitignore` rules, including negation, remain authoritative. If the Git executable itself is unavailable, stop rather than silently bypassing ignore enforcement.

The ignore boundary reduces exposure but does not prove the remaining files are safe. Keep the explicit privacy check and avoid quoting credential-shaped or sensitive content in maps and reports.

## Entry paths

### Explicit shortcut

`/picm-adopt coding` enters coding adoption directly.

### Detection through normal adoption

Normal `/picm-adopt` may use a shallow, path-only check for signals such as these. In a Git worktree, derive this sample from Git candidates rather than directory traversal; outside Git, use only a shallow non-recursive listing:

- language or workspace manifests;
- app, service, package, library, source, and test areas;
- build, lint, test, or CI configuration;
- existing architecture or developer documentation.

Do not perform a deep content scan merely to classify the repo. When signals are present, offer:

1. adopt as a **Coding Repository**;
2. add codebase mapping to the existing/inferred workflow profile;
3. continue with normal non-coding adoption.

The explicit shortcut skips only this classification question. It does not change safety, preview, or approval requirements.

## Profile and capability model

- **Coding Repository profile**: use when software development is the workspace's primary operating shape.
- **Codebase-map capability**: enable alongside Stage Pipeline, Specialist Folder, Team / Role OS, or Custom / Existing Structure when coding is one part of a hybrid workspace.

Coding and workflow scopes may overlap. Root routing should tell the agent when to read coding context, workflow context, or both; do not force every directory into exclusive ownership.

## Interview

Ask only decisions that cannot be recovered safely from the repository.

### 1. Mapping approach

Offer three choices:

- **Root map** — a bounded scan and one concise map. Best for a small or cohesive repository.
- **Distributed map** — root routing plus local context at user-confirmed meaningful boundaries.
- **Scan and recommend** — a broader read-only topology scan followed by a root/distributed recommendation. Explain that this uses more context and does not write anything.

`scan and recommend` is an analysis method. After the user accepts a proposed shape, record the resulting shape as `root` or `distributed`.

### 2. Adoption depth

Offer:

- **Additive** — preserve existing documentation and add only missing routing/maps. Report repetition or conflicts as optional findings.
- **Curated** — inventory agent and architecture documentation, identify repetition/conflict/stale pointers, and draft a consolidation/restructure proposal.

Curated mode is permission to analyze and propose—not permission to apply. Preview exact rewrites, merges, moves, compatibility pointers, archive candidates, and deletions. Highlight moves/deletions separately and require explicit approval for the complete change set.

### 3. Maintenance preset

Offer:

- **Light**
- **Balanced** (recommended default)
- **Strict**

Explain the tradeoff using `coding-maintenance-rubric.md`. Keep configuration preset-first; do not present a matrix of per-check toggles.

### 4. Optional user hints

Ask for only high-value knowledge, such as:

- important apps/services/packages;
- boundaries that should or should not receive local context;
- legacy or do-not-extend areas;
- components that must change together;
- real public APIs or entry points;
- meaningful verification gates;
- generated code or files that should not be edited.

Treat hints as strong evidence, then verify what can be checked safely. Preserve disagreements or unknowns for user correction.

## Scan depth

### Root map

Inspect the smallest evidence set that can establish:

- repository purpose;
- major source/test areas;
- authoritative manifests and developer docs;
- primary entry points;
- repository-wide verification sources;
- existing agent routing.

Do not inspect every package merely because it exists.

### Distributed map

Start from user hints and visible workspace/build boundaries. Propose local context only for meaningful areas with one or more of:

- distinct responsibility or domain ownership;
- independent entry points or public API;
- independent build/test/verification contract;
- important operational or safety constraints;
- frequent independent agent work;
- material cross-boundary coordination risk.

Do not place `CONTEXT.md` in every package by default. Preview the proposed boundaries and rationale, and let the user add/remove boundaries before drafting files.

### Scan and recommend

Perform a bounded manifest/documentation-level topology scan. Recommend root or distributed mapping and explain:

- evidence used;
- likely high-value boundaries;
- token/context tradeoff;
- areas not inspected;
- uncertain responsibilities requiring user confirmation.

Do not attempt full semantic code analysis or generate a complete dependency graph.

## Map placement

Use this order:

1. If a small map fits cleanly in the existing root routing file, propose a concise section there.
2. If the map is substantial or the workspace is hybrid, prefer root `CONTEXT-MAP.md` linked from the canonical `AGENTS.md` or `CLAUDE.md`.
3. If an existing `ARCHITECTURE.md`, developer guide, or equivalent already provides an adequate map, reuse it and add only the missing route/pointers.

Responsibilities:

- `AGENTS.md` or canonical `CLAUDE.md` — behavioral rules and task-to-context routing.
- `CONTEXT-MAP.md` — repository areas, responsibilities, entry/verification pointers, and what context to load.
- local `CONTEXT.md` — detailed boundary-specific context.

Do not let `CONTEXT-MAP.md` become a duplicated instruction file or exhaustive code catalog.

## Map content rules

A useful root map should identify, where supported by evidence:

- repository purpose and shape;
- meaningful boundaries and what they own;
- authoritative local context or docs;
- important entry points/public surfaces;
- test and verification locations or authoritative command sources;
- cross-boundary constraints;
- generated/do-not-edit areas;
- explicit unknowns and low-confidence inferences.

Prefer pointers to manifests, scripts, tests, and architecture decisions over copied dependency lists or command definitions. Do not claim ownership, coupling, or invariants that cannot be supported by visible evidence or user confirmation.

A local coding context should remain concise and cover only the boundary's purpose, read-first files, entry points, dependencies/constraints, change risks, verification, coordination boundaries, and known unknowns.

## Curated documentation analysis

Keep the existing optional file-role inventory separate from a curated consolidation proposal. For relevant non-ignored agent/developer/architecture documents, record:

| Path | Observed purpose | Overlap/conflict | Proposed role | Confidence |
| --- | --- | --- | --- | --- |

Rules:

- Distinguish repeated facts from intentional compatibility shims.
- Propose one canonical fact home with pointers elsewhere when supported.
- Preserve user terminology and useful history.
- Label dead/archive status as a user decision, not an inferred fact.
- Do not mix source-code refactors into documentation consolidation.
- Keep every proposed action previewable and reversible through Git.

## Coding readiness

Coding adoption is **Ready** only when visible routing enables a cold agent to:

1. identify that the workspace is a coding repository or hybrid;
2. find the root map or equivalent authoritative architecture map;
3. reach the relevant component context or source boundary;
4. locate entry points and verification sources without scanning the whole repo;
5. understand security and generated/do-not-edit boundaries;
6. avoid `.picm/` during normal coding work.

Use existing adoption readiness labels. A generated `.picm/config.json` never substitutes for visible routing.

## Minimal config

Record only what maintenance needs. Example coding-primary config:

```json
{
  "version": 1,
  "generatedBy": "picm-factory",
  "adoption": {
    "status": "adopted",
    "readiness": "ready"
  },
  "profile": "coding-repository",
  "routing": {
    "source": "AGENTS.md",
    "status": "updated-existing",
    "coexistence": "single-routing-file"
  },
  "paths": {
    "rootInstructions": "AGENTS.md",
    "rootContext": null,
    "workflowFolders": []
  },
  "capabilities": {
    "codebaseMap": {
      "shape": "distributed",
      "roots": ["apps", "packages"],
      "map": "CONTEXT-MAP.md",
      "localContexts": ["apps/web/CONTEXT.md"],
      "maintenancePreset": "balanced"
    }
  }
}
```

For a hybrid, preserve the primary workflow profile and use the same optional `capabilities.codebaseMap` object. Roots may overlap `paths.workflowFolders`. If the map lives in the routing file or an existing architecture document, record that path instead of manufacturing `CONTEXT-MAP.md`.

## Report additions

Add these sections to the normal adoption report when coding adoption is selected:

```markdown
## Coding adoption
- Primary profile or added capability:
- Mapping approach selected:
- Resulting map shape:
- Adoption depth:
- Maintenance preset:

## Repository boundaries proposed

## Evidence and unknowns

## Documentation consolidation proposal
```

Omit the consolidation section in additive mode unless there is a safety/routing conflict that must be surfaced.

## First coding run

End with a path-specific, user-facing checklist that separates the user's actions from expected agent behavior:

1. Tell the user to state the coding task normally; do not tell them to manually open or read an auto-loaded `AGENTS.md` or `CLAUDE.md`.
2. Describe as expected agent behavior that the agent uses the canonical root routing file and follows it to `CONTEXT-MAP.md` or the reused architecture map.
3. The agent should reach the relevant local context/source boundary and confirm the named entry point and verification source before editing.
4. The agent should make the smallest appropriate change, run the repository's real checks, and present the diff/test result.
5. Tell the user to review that presented diff/test result and any approval boundary that actually requires human judgment.
6. Require the agent to keep cross-boundary effects and unknowns visible.
7. Recommend `/picm-maintain` after the first real coding task and whenever repository boundaries, manifests, commands, or architecture docs change.
