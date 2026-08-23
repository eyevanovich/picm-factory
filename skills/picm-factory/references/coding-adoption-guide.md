# Coding Repository Adoption Guide

Use this guide when `/picm-adopt coding` is invoked or normal `/picm-adopt` identifies a likely coding repository and the user chooses coding adoption.

Coding adoption maps agent-relevant repository context without trying to document every file or infer a complete architecture. It can be the primary **Coding Repository** profile or a composable codebase-map capability alongside another primary layout.

## Security boundary: excluded means unreadable

Coding repositories commonly store credentials, local configuration, private fixtures, generated artifacts, and large dependency trees behind Git or project privacy rules. Treat every exclusion source as a hard read boundary. The PiCM extension enforces this boundary only inside a workflow explicitly authorized by `/picm-new`, `/picm-adopt`, `/picm-maintain`, or `/picm-optimize`; outside that workflow ordinary Pi tools behave normally. User-typed `!bash` is an explicit human action and is never intercepted.

Before inspecting repository contents:

1. Call `picm_scan_control preflight`. It checks Git-repository status plus root `.gitignore` and repository-local `.git/info/exclude` presence without inventorying files or creating temporary Git metadata.
2. Ask the privacy question with this concise reassurance: “PiCM already honors `.gitignore`, nested Git ignore rules, and repository-local `.git/info/exclude`. It also protects Git internals, symlinks, nested repository/submodule boundaries, and paths outside this project. Only name additional sensitive project-relative paths not already covered by those protections. Reply with exact paths, or `none`.” These protections are automatic; the reply adds exclusions for sensitive eligible paths PiCM cannot infer. No other agent tool is available until this privacy review completes.
3. Call `picm_scan_control privacy` with every exact project-relative exclusion. When the user chooses durable PiCM exclusions, use `persist: true`; the action shows the exact `privacy.excludedPaths` patch and writes `.picm/config.json` only after TUI confirmation. Otherwise exclusions remain session-only. Existing persisted exclusions are merged automatically and exclusions can only be added during the workflow.
4. When the Git repository has no root `.gitignore`, offer an exact `.gitignore` proposal for paths the user also wants excluded from commits. Declining it does not weaken PiCM protection because config and session exclusions remain enforced.
5. Call `begin`, then use `inventory` for candidate discovery. Never begin with broad traversal or direct filesystem tools.

Protected inventory combines these sources as a union:

- root and nested `.gitignore`;
- repository-local `.git/info/exclude`;
- the user's global Git excludes;
- `.picm/config.json` `privacy.excludedPaths`;
- current-session privacy exclusions.

A match from any source blocks the path. Git's `--exclude-standard` inventory and immediate `git check-ignore --no-index` check honor Git sources, including tracked matches. PiCM filters config/session exclusions from inventory and checks them immediately before every guarded path-tool execution. Unguarded recursive traversal is blocked; canonical-path-bound, protected-descendant-filtered directory traversal is authorized only for `grep`, `find`, `ls`, and automatic `rg`. Each admitted ordinary `read`, `edit`, `write`, `grep`, `find`, `ls`, or `rg` call revalidates its canonical target during built-in execution, so replacing the leaf or retargeting a parent symlink fails closed. Regular files with multiple hard-link names are rejected at admission and immediately before guarded access or mutation. Guarded `grep` and automatic `rg` bound traversal discovery/entries, retained files and aggregate snapshots, match/context rendering work, rendered output, and subprocess records/stdout/stderr. Direct creation of missing guarded files and parent directories uses the same canonical path boundary on macOS, Linux, and Windows. During active scans PiCM blocks every agent Bash command and unrecognized agent tool; confirmed privacy paths remain blocked between scan phases and after same-session resume. Trusted packaged resources under `skills/` and `prompts/`, plus package README and metadata, require declared- or canonical-package-root provenance plus the exact expected canonical target, and the extension rewrites the built-in read input to that target before execution. Legitimately symlinked package-root installs remain supported, but project aliases and nested or leaf package-resource aliases do not gain trust. This is a deterministic boundary around PiCM's guarded tools, not an OS sandbox for arbitrary filesystem access. Never use another worktree or any other route to bypass it.

Do not follow symlinks during protected scans. A non-excluded symlink can resolve to excluded or out-of-repository content, so the extension blocks direct path-tool access to symlinks. Record only the link path/type; if its content is genuinely needed, ask the user for a non-symlink, non-excluded copy inside the approved workspace.

Treat each submodule as a separate repository boundary. Do not initialize, fetch, or enter it automatically. If the user explicitly includes an already available submodule, apply parent Git rules, session/config privacy exclusions, and that submodule's own Git exclusions before reading anything.

When `.git` is absent, the extension creates temporary bare Git metadata only after privacy review, points it at the workspace for candidate and remaining Git-exclude evaluation, and removes it on session shutdown. It never runs `git init` in the user's workspace. If Git, privacy-config validation, or an ignore check is unavailable, stop rather than weakening enforcement.

The exclusion boundary reduces exposure but does not prove remaining files are safe. Avoid quoting credential-shaped or sensitive content in maps and reports.

## Entry paths

### Explicit shortcut

`/picm-adopt coding` enters coding adoption directly.

### Detection through normal adoption

After privacy review, normal `/picm-adopt` may use a shallow, path-only check for signals such as these. Derive this sample from protected candidate inventory in both Git and non-Git workspaces rather than directory traversal:

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

Curated mode is permission to analyze and propose—not permission to apply. Apply `preview-review-protocol.md` before every proposed project write. Highlight linked moves and deletions in the summary; deletions require mandatory exact review before direct approval of the complete current summary.

### 3. Automatic Strict adoption examination

Do not ask the user to choose a maintenance depth during initial coding adoption. Perform the Strict examination automatically and record `capabilities.codebaseMap.maintenancePreset: "strict"` in the exact config preview.

Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.

Use the Strict checks in `coding-maintenance-rubric.md` to establish the initial map baseline. This remains a bounded, protected scan: it does not authorize exhaustive source comprehension, weaken privacy boundaries, or approve writes.

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

Do not place `CONTEXT.md` in every package by default. Preview the proposed boundaries and rationale, and let the user add/remove boundaries before drafting files. Any proposal revision invalidates earlier approval and exact-review state.

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

Prefer pointers to manifests, scripts, tests, and architecture decisions over copied dependency lists or command definitions. Do not claim ownership, coupling, or invariants that cannot be supported by visible evidence or user confirmation. Do not duplicate relationships an agent can recover cheaply from ordinary imports, manifests, registration, or wiring.

A local coding context should remain concise and cover only the boundary's purpose, read-first files, entry points, dependencies/constraints, change risks, verification, coordination boundaries, and known unknowns.

### Optional non-obvious change-impact notes

Default to omission. Add an impact note only when a recurring or high-risk edit has important effects that ordinary code navigation does not reveal cheaply, such as external consumers, generated artifacts, migrations, configuration or reflection-based registration, deployment steps, or user-confirmed operational coupling.

A useful note contains:

- potentially affected non-local surfaces;
- known exclusions only when explicitly supported;
- source paths, architecture decisions, or user confirmation;
- confidence and unresolved uncertainty.

Do not turn impact notes into copied import graphs or complete dependency catalogs. Absence of a visible import or caller is not evidence for a known exclusion. Put unsupported effects in **Unknowns**.

### Optional operational status

Use an operational status only when it changes how an agent should navigate or edit an area:

- **live** — visible evidence or user confirmation shows the area is active and authoritative;
- **leftover** — the area remains present but explicit evidence identifies another path as primary or records this one as deprecated;
- **ghost** — the area is planned, stubbed, documented, or named but evidence shows it is not wired into current behavior;
- **unknown** — available evidence cannot support one of the other classifications.

An agent may propose a status with citations and confidence. Ask the user to confirm an ambiguous or consequential classification. User confirmation is strong evidence, while absence of imports alone is insufficient because configuration, reflection, plugins, generated code, and external consumers can hide use. Maintenance may flag possible drift, but must not silently relabel user-confirmed status.

Neither impact notes nor operational status are coding-readiness requirements. Keep them out of maps when they do not reduce navigation uncertainty.

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
      "maintenancePreset": "strict"
    }
  }
}
```

For a hybrid, preserve the primary workflow profile and use the same optional `capabilities.codebaseMap` object. Roots may overlap `paths.workflowFolders`. If the map lives in the routing file or an existing architecture document, record that path instead of manufacturing `CONTEXT-MAP.md`.

Existing configs remain compatible: explicit `light`, `balanced`, and `strict` values are readable and honored, while a historically missing value falls back to Balanced. Light is compatibility-only and must not appear in new adoption choices or new adoption output.

When the user approves durable PiCM-only scan exclusions, preserve their normalized project-relative paths in the same config:

```json
{
  "privacy": {
    "excludedPaths": [".env", "private-data"]
  }
}
```

These paths are scan policy, not normal agent context. The extension loads them before protected inventory, filters them from candidates, and blocks direct access throughout the authorized workflow. Keep file contents and explanatory sensitive details out of config.

When adding exclusions to an older `privacy` object that has no `excludedPaths`, preserve its existing members and add the normalized array. Reject an explicitly present malformed `excludedPaths` value instead of replacing or discarding it.

## Report additions

Add these sections to the normal adoption report when coding adoption is selected:

```markdown
## Coding adoption
- Primary profile or added capability:
- Mapping approach selected:
- Resulting map shape:
- Adoption depth:
- Initial examination: Strict
- Stored maintenance preset: strict

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
