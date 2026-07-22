---
name: picm-factory
description: Create, adopt, and maintain PiCM / ICM-style folder-agent workspaces and coding-repository context maps in Pi Coding Agent. Use for /picm-new, /picm-adopt, /picm-adopt coding, /picm-maintain, /picm-help, repository or monorepo onboarding, or when the user wants a folder-architecture workflow scaffold.
license: MIT
---

# PiCM Factory

PiCM Factory helps users create and maintain folder-agent workflows and coding-repository context maps in Pi.

## Modes

- **new**: create a minimal viable scaffold for a new workspace.
- **adopt**: analyze an existing workflow or coding repository non-invasively and add PiCM support only with explicit approval.
- **maintain**: validate and improve an existing workspace using the maintenance rubric.
- **help**: explain install, commands, and safety model.

## Hard rules

1. **Security first.** Ask whether the workspace contains secrets, regulated data, client data, or personal/private material before creating or modifying context files.
2. **Git ignored means unreadable during coding scans.** Build coding-scan candidates through Git, run `git check-ignore --no-index` before reading each candidate, and never inspect ignored file contents—even when already tracked. Do not use broad ignore-bypassing traversal or follow symlinks automatically. Treat an explicitly included submodule as a separate Git worktree with the same checks. If Git is unavailable, do not run an automatic coding scan.
3. **Non-destructive by default.** Do not move, rename, overwrite, or delete existing files unless the user explicitly approves the exact action.
4. **Preview before writes.** Show planned file changes before applying them, including brand-new scaffolds in confirmed empty-enough workspaces.
5. **Project-local install.** PiCM should be loaded through project-local `.pi/settings.json` from `pi install -l ...`. Verify this when relevant; do not recreate Pi package config during normal use.
6. **Keep `.picm/` small.** `.picm/` stores PiCM metadata/reports only. It is maintainer-only context, not normal workflow context.
7. **Visible folder is source of truth.** The actual workflow belongs in visible files/folders such as `AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, stage folders, specialist files, `reference/`, and `workflows/`.
8. **Layouts are profiles, not laws.** Recommend structure, but do not fail a user because they organize differently. Coding Repository may be the primary profile, while codebase mapping may also be a composable capability alongside another primary profile.
9. **Encourage git, never auto-commit.** Check/warn on git status before writes. If no git repo exists, suggest `git init`. Never commit for the user.
10. **Keep mechanical work out of prompt bloat.** When useful, recommend local scripts or named MCP/tool integrations for deterministic fetching, file movement, formatting, sending, or API work. Keep judgment and review in visible context; do not turn the extension into an executor or orchestrator.

## Reference docs

Load only what you need:

- `references/interview-guide.md` — `/picm-new` interview flow.
- `references/layout-profiles.md` — layout profile definitions and recommendation rules.
- `references/adoption-guide.md` — `/picm-adopt` non-invasive process.
- `references/coding-adoption-guide.md` — coding-repository detection, Git-ignore-safe scanning, mapping choices, and additive/curated adoption.
- `references/maintenance-rubric.md` — `/picm-maintain` validation rubric.
- `references/coding-maintenance-rubric.md` — Light/Balanced/Strict coding-map drift checks.

Templates live under `templates/` and should be adapted, not copied blindly.

## Mode: new (`/picm-new`)

Goal: create a minimal viable scaffold that is useful immediately and can evolve through real use.

Process:

1. Inspect the current folder lightly.
   - Use `pwd`, `git status --short` when in a git repo, and a shallow tree/listing.
   - Classify the folder as empty enough, source-material-only, or existing workspace architecture.
2. Apply `/picm-new` safety.
   - Empty enough: `.git/`, `.pi/`, `README.md`, `LICENSE`, `.gitignore`, `.env.example`, package manifests/lockfiles, editor folders, and OS noise are okay.
   - Source-material-only: folders/files such as `src/`, `docs/`, `notes/`, `assets/`, `data/`, transcripts, briefs, screenshots, or domain documents. Ask whether to build around them without moving or rewriting them.
   - Existing architecture: `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `REFERENCES.md`, `identity.md`, `rules.md`, `examples.md`, `workflows/`, `reference/`, numbered stage folders, `stages/`, `.picm/`.
   - If existing architecture is present, recommend `/picm-adopt`. If the user insists on `/picm-new`, require them to choose the intent (`adopt existing` vs `add/replace scaffold`) and approve exact file actions after preview.
   - Do not move, rename, overwrite, or delete source material or architecture files unless the user explicitly approves the exact action.
3. Apply git safety before writes.
   - If no git repo exists, recommend `git init`; require explicit confirmation to proceed without git.
   - If the repo is dirty, show `git status --short`; require explicit confirmation before writes.
   - Never auto-commit and never auto-run `git init`.
4. Ask the security/privacy check.
5. Run the core interview from `references/interview-guide.md`; ask branching follow-ups only when needed. If `/picm-new` arguments were provided, treat them as seed context and ask only missing critical questions. Before proposing extra stages, roles, folders, references, or examples, ask or infer: **What will you run first?**
6. Recommend a layout profile from `references/layout-profiles.md`, explain why, then present alternatives. For mixed workflows, choose one primary profile and borrow secondary patterns sparingly.
7. Draft the smallest scaffold that supports that first real run. Include required root routing/context and only the active stages, roles, specialist recipes, references, examples, artifact paths, and user-named scripts/tools needed now. Defer speculative structure until real use proves it useful. For Stage Pipeline workspaces, make each active stage contract answer: what it reads, what it does, what it writes, and where human review happens. Mention a script, MCP server/tool, or other integration in generated routing/contracts only when the user has named it; never invent an integration to fill a template.
8. Preview files to create/update, including exact append/update proposals for existing safe files such as `README.md` or `.gitignore`.
9. After approval, write files.
10. End with a tailored first-run checklist for the selected layout. Name where to start, where the first output or handoff should land, what the human should inspect/edit before downstream work consumes it, what gaps/unknowns must stay visible, and when to run `/picm-maintain`.

Typical files for a new scaffold:

- `AGENTS.md` — concise Pi routing map at the root by default.
- `CONTEXT.md` — workflow/domain context.
- Layout-specific folders/files, usually with local `CONTEXT.md` files.
- `REFERENCES.md` or `reference/` only when reusable background material is identified. Encourage useful references, but do not create empty placeholders.
- Real example files only when the user provides golden examples or explicitly wants an example area.
- Input/output/work folders only when the workflow needs them.
- Existing or planned local scripts and MCP/tool integrations only when the user names them and explains their purpose. Record the exact path or tool name and the human/AI review boundary; do not scaffold runtime execution logic.
- For Stage Pipeline stages, prefer named inspectable output files (often under a stage `output/` folder) when downstream stages will consume the result after human review.
- Do not pre-create empty input/output/work folders just because a contract names a future path. Create those folders only when adding a real seed file, reference file, first-run artifact, or when the user explicitly wants physical directories now.
- `.picm/config.json` — tiny metadata only: `version`, `profile`, `generatedBy`, `createdAt`, and key path hints such as `rootInstructions`, `rootContext`, optional `references`, and workflow folder paths.

Scaffold quality rules:

- Every generated folder and file must support the first real run, required routing/safety, or an identified reusable constraint. Omit unused roles, future stages, and empty organizational areas.
- When no real references or examples exist yet, explicitly recommend adding them after the first real use reveals durable rules or a genuine golden example; do not manufacture or scaffold placeholders.
- Do not write unresolved bracket placeholders such as `[WORKFLOW NAME]` into generated files.
- Ask enough to fill core sections, or write a clear note such as “To define after the first real run.”
- Stage Pipeline `CONTEXT.md` files should usually include concise `Purpose`, `Inputs`, `Process`, `Outputs`, optional `Verify`, and `Handoff / review gate` sections.
- In stage `Inputs`, distinguish stable reference/factory material from per-run working artifacts when useful. Stable references are constraints to follow; working artifacts are material to process for this run.
- In stage `Outputs`, name inspectable files or review surfaces and the downstream stage/role/user that consumes them. Do not point downstream stages at vague “previous work” when a concrete output can be named.
- Omit irrelevant rows/sections rather than creating empty speculative folders. A contract may name a future output path without pre-creating its empty parent directory.
- Keep repetitive deterministic mechanics out of long stage instructions when a user-named local script or MCP/tool can perform them more reliably. Context should state when to use the named mechanism, expected input/output, and required human review—not reproduce its implementation.
- Prefer root `AGENTS.md` plus local `CONTEXT.md`; create buried `AGENTS.md` only when a folder is likely to be used as an independent Pi/subagent working directory or needs hard local behavior/safety rules.
- Keep `.picm/` minimal. Do not create one-time scaffold reports by default.
- Recommended `.picm/config.json` shape:

  ```json
  {
    "version": 1,
    "profile": "stage-pipeline",
    "generatedBy": "picm-factory",
    "createdAt": "2026-05-24",
    "paths": {
      "rootInstructions": "AGENTS.md",
      "rootContext": "CONTEXT.md",
      "references": null,
      "workflowFolders": ["01_discovery", "02_production"]
    }
  }
  ```
- If sensitive/private inputs or local-only outputs are identified, explain and propose exact `.gitignore` entries instead of adding generic noise.

First-run checklist requirements:

- **Stage Pipeline:** tell the user to start in the first stage folder and read its `CONTEXT.md`; produce the named first-stage output/review artifact; stop before the next stage; inspect/edit/approve that artifact against the stage's Verify/Handoff notes; keep gaps, unsupported claims, and open questions visible in the output or handoff notes; then run the downstream stage from the approved edited artifact. Name each intermediate review/edit boundary when multiple downstream stages consume prior outputs.
- **Team / Role OS:** tell the user which role/folder should handle the first real work item; name the handoff card or agreed handoff artifact before another role acts; require human review of summary, facts/decisions, confidence, blockers/risks, gaps/unknowns, and next action; keep uncertainty visible instead of smoothing it into confident instructions; tell the receiving role to work from the reviewed handoff rather than chat memory.
- **Specialist Folder:** tell the user which workflow/task recipe to run first, where the first result or draft should be reviewed, and to decide after review whether corrections are one-off output edits or stable rules/examples worth adding.
- **Custom / Existing Structure:** route the first run through the generated or existing root instructions/context and name the visible output or handoff convention actually present. If no good review surface exists yet, flag that as a future `/picm-maintain` suggestion rather than forcing a rewrite during scaffold creation.
- **Coding Repository:** start from the canonical root routing file, follow it to the map/equivalent, choose one real coding task, locate the owning boundary, entry point, and verification source, then review the code diff and check result. Keep cross-boundary effects and unknowns visible.
- In every layout, recommend `/picm-maintain` after the first real workflow/use/handoff and whenever stages, roles, routing, references, process expectations, repository boundaries, manifests, or verification sources change. Phrase it as an advisory health check or drift investigation, not a required preflight or provenance-grade debugger.

## Mode: adopt (`/picm-adopt`)

Goal: make an existing ICM/folder-agent or coding repository PiCM-compatible without disrupting its current setup. Adoption is compatibility enablement: inspect read-only, preserve what works, then offer the smallest user-approved changes needed for PiCM and `/picm-maintain` to leverage the repo.

Load `references/adoption-guide.md` before running this mode. Load `references/coding-adoption-guide.md` when arguments start with `coding`, when a safe shallow check suggests a coding repository and the user selects coding adoption, or when codebase mapping is added to a hybrid workspace.

Process:

1. Start read-only. Do not write or edit anything during discovery.
2. If arguments start with `coding`, enter coding adoption directly. Otherwise, a shallow path-only Git-ignore-aware check may identify likely coding signals; offer **Coding Repository**, **add codebase mapping to the existing profile**, or **continue normal adoption**. Do not deep-scan merely to classify the repo.
3. Scan for existing architecture files/folders and visible conventions. During coding scans, require a Git worktree, derive candidate paths through Git, and run `git check-ignore --no-index` before every read. Ignored files are out of scope without exception.
4. Identify whether Pi can already use `CLAUDE.md` or `AGENTS.md`, and classify routing quality as adequate, partial, placeholder/unrelated, or conflicting/risky.
5. For a complex, cluttered, or unfamiliar workspace—or when requested—offer the adoption guide's optional file-role inventory. Keep it a representative path-to-role-to-rationale orientation aid, separate from readiness, and never treat a classification as approval to move, rename, archive, delete, merge, or rewrite anything.
6. Ask the security/privacy check before content-heavy discovery and before proposing report/config/context writes. For coding adoption, also ask for mapping approach (**root**, **distributed**, or **scan and recommend**), adoption depth (**additive** or **curated**), maintenance preset (**Light**, **Balanced**, or **Strict**), and optional user boundary hints.
7. Infer the closest primary layout profile, but treat custom structure as valid. Use **Coding Repository** when coding is primary; otherwise keep the workflow profile and add the codebase-map capability. Coding/workflow scopes may overlap.
8. Produce an adoption report using qualitative readiness labels:
   - **Ready** — adequate visible routing exists and approved `.picm/config.json` can mark the repo adopted.
   - **Ready with warnings** — routable/adoptable, with non-blocking ICM improvements.
   - **Needs routing before adoption** — routing is absent, partial, placeholder, conflicting, or unsafe; do not mark adopted yet.
   - **Scanned only** — user wants findings/metadata without full compatibility changes.
9. If routing is adequate, offer minimal `.picm/` adoption metadata after explicit confirmation. Coding metadata records only the resulting root/distributed shape, roots, map path/equivalent, selected local contexts, and maintenance preset.
10. If routing is missing or weak, offer multiple exact proposals:
   - minimal PiCM-compatible routing;
   - stronger, more opinionated ICM-style routing;
   - scanned-only report/config for now.
11. In coding additive mode, preserve existing documentation and add only missing routing/maps. In curated mode, draft a documentation consolidation proposal with canonical-source recommendations and separately highlighted merges, moves, archive candidates, rewrites, and deletions; never treat curated selection as blanket write approval.
12. Iterate on proposals until the user is satisfied, then write only the exact approved changes. Option choice is not write approval; if the user asks for a preview or says not to write yet, stop after preview and require a separate explicit approval before any file write, including `.picm/` files.

Allowed default outputs after confirmation:

- `.picm/config.json`
- `.picm/adoption-report.md`

Config may represent either `adoption.status: "scanned"` or `adoption.status: "adopted"`. Full adopted status requires adequate visible routing; `.picm/config.json` supports maintainability but never replaces the user/agent-facing route map.

Routing policy:

- If only `CLAUDE.md` exists, use it as source of truth when adequate. Do not replace it with `AGENTS.md` by default.
- If only `AGENTS.md` exists, use it as source of truth when adequate.
- If both exist, preserve both and check whether they cooperate or conflict. Offer coexistence optimization only as an approved edit.
- If neither exists, recommend creating root `AGENTS.md` and ask whether to also add a small `CLAUDE.md` shim for future Claude Code compatibility.

Do not create, rewrite, merge, rename, move, or delete any visible routing/context/workflow files without exact preview, user iteration, and explicit approval. Do not write `.picm/` files from an option selection alone; require explicit approval after showing exact planned contents.

## Mode: maintain (`/picm-maintain`)

Goal: keep a generated or adopted workspace healthy as the workflow changes. Treat maintain as a heuristic health report and focused drift-investigation helper for folder-agent systems, not as provenance-grade tracing.

Modes:

- General health check: `/picm-maintain` or `/picm-maintain routing`.
- Coding-map health: detected automatically from the Coding Repository profile/codebase-map capability, or focused with `/picm-maintain coding`.
- Trace mode: `/picm-maintain trace "drift symptom"`, optionally with `@file` mentions for direction. Trace mode reports likely drift sources with confidence; it does not promise causal provenance.

Process:

1. Inspect current routing/context structure.
2. Read `.picm/config.json` only if present and relevant.
3. If the repo uses the Coding Repository profile, `capabilities.codebaseMap`, or visible `CONTEXT-MAP.md`, load `references/coding-maintenance-rubric.md`. Apply its Git-ignore-safe scan boundary before any coding inspection and use the configured Light/Balanced/Strict preset (Balanced when absent, after telling the user).
4. If `.picm/config.json` says `adoption.status: "scanned"`, short-circuit broad maintenance into an adoption-blocker report. Use the linked adoption report or brief scan summary when present, explain that the repo is scanned but not fully adopted, and guide the user toward fixing root routing before deeper health checks.
5. Apply `references/maintenance-rubric.md`. During a general health check, run its cold-agent walk test against one representative task: orient from root, reach the local contract, identify exact inputs/job/output/human check, then read each named input, output, review, or equivalent visible artifact. Report artifact presence separately from correctness and human approval, warn when required contract pointers are absent, and do not pass a criterion that was not inspected.
6. If arguments start with `trace` or describe a concrete symptom, focus on a heuristic investigation of likely drift sources instead of doing a broad audit. Trace mode does not require the general cold-agent walk test.
7. Report results with severities:
   - **Pass** — good as-is.
   - **Warning** — likely issue that may hurt output or safety.
   - **Suggestion** — optional improvement.
8. For each meaningful Warning/Suggestion, include likely cause, repair tier, and smallest safe healing path. When repeated deterministic instructions bloat context, ask whether fetching, moving files, formatting, sending, or API work should be extracted to a local script or a named MCP/tool integration; keep this advisory and do not build or run an orchestration pipeline by default.
9. Use the repair tiers from the rubric:
   - **Tier 1: Routing fixes** — root maps, task routing, `.picm/` exclusion.
   - **Tier 2: Contract fixes** — local `Purpose`, `Inputs`, `Process`, `Outputs`, `Verify`, `Quality checks`, `Handoff` sections.
   - **Tier 3: Judgment/source fixes** — tone rules, examples, quality bars, domain constraints, repeated output corrections.
10. For coding workspaces, adapt the cold-agent walk to root routing → repository map/equivalent → owning boundary → entry point → authoritative tests/checks. Report map presence separately from correctness and user confirmation.
11. Keep cold-agent walk findings advisory. Treat a short read count as a diagnostic target rather than a naming/layout law, and never claim deterministic workflow state or provenance from file presence.
12. Keep folder naming/organization feedback loose and advisory unless routing is broken.
13. Offer edits only after preview and explicit confirmation. Never auto-heal.
14. Offer to write `.picm/maintenance-report.md` only after confirmation.
15. End general reports with a discoverability note for trace mode: `/picm-maintain trace "describe what drifted"`.

## Mode: help (`/picm-help`)

Explain in plain language without requiring PiCM/ICM jargon.

Command decision guide:

- **New or mostly empty folder; starting a new workflow** → `/picm-new`. It interviews, previews a minimal workspace, and writes only after approval.
- **Existing folder with source code, manifests, agent instructions, workflows, stages, references, or a Claude/ICM-style setup** → `/picm-adopt`. It safely detects likely coding repositories and offers the Coding Repository profile without requiring a special command. It starts read-only, preserves existing structure, and proposes optional compatibility changes without converting the project.
- **Existing folder-agent workspace; general health, routing, handoff, safety, or drift check** → `/picm-maintain`.
- **One concrete bad result, lost handoff detail, or other specific symptom** → `/picm-maintain trace "describe what drifted"`. Describe this as a focused heuristic investigation, not deterministic provenance.
- **Known coding repository / monorepo** → `/picm-adopt coding` is a shortcut to coding adoption; regular `/picm-adopt` can reach the same flow after a safe shallow classification.
- **Unsure between new and adopt** → prefer `/picm-adopt` when workspace architecture or source code already exists; adoption's read-only scan is safer than scaffolding over existing work.

Also explain:

- Pi install:
  `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
- pinned public npm project-local install:
  `pi install -l npm:@eyevanovich/picm-factory@0.1.2`
- local development install from the user's checkout:
  `pi install -l /path/to/picm-factory`
- maintain examples:
  - `/picm-maintain` — general workspace health check
  - `/picm-maintain routing` — focus on task routing and context loading
  - `/picm-maintain coding` — focus on Coding Repository/context-map drift using the configured maintenance preset
  - `/picm-maintain trace "final output drifted from approved source"` — investigate a concrete symptom; mention files with `@path` when useful
- `.pi/` is Pi package configuration that controls project-local resources; `.picm/` is small, maintainer-only PiCM metadata/reporting and not normal workflow context.
- PiCM Factory is project-local by default.
- Every write requires a preview and explicit approval; adoption is non-destructive by default and does not rename, move, rewrite, or restructure existing files without approval of the exact action.
- security and git safety rules.

## Communication style

Be plain, practical, and direct. Do not oversell. If the user is about to overbuild, say so.
