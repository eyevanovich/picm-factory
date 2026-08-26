---
name: picm-factory
description: Runtime contract for the registered /picm-new, /picm-adopt, /picm-maintain, /picm-optimize, and /picm-help commands. Load only when an explicit registered command prompt requests picm-factory; do not activate from natural-language requests.
license: MIT
---

# PiCM Factory

PiCM Factory helps users create, maintain, and safely optimize folder-agent workflows and coding-repository context maps in Pi.

## Modes

- **new**: create a minimal viable scaffold for a new workspace.
- **adopt**: analyze an existing workflow or coding repository non-invasively and add PiCM support only with explicit approval.
- **maintain**: validate and improve an existing workspace using the maintenance rubric.
- **optimize**: inspect agent-facing documentation and offer outcome-preserving documentation improvements.
- **help**: explain install, commands, and safety model.

## Hard rules

1. **Security first.** Ask whether the workspace contains secrets, regulated data, client data, or personal/private material before creating or modifying context files.
2. **Explicit activation, privacy review, and guarded scans only.** Run this skill only from an explicit `/picm-new`, `/picm-adopt`, `/picm-maintain`, or `/picm-optimize` command prompt (`/picm-help` is guidance only). If a user makes a natural-language PiCM request, ask them to invoke the appropriate command and do not inspect files. Every explicit workflow starts privacy-pending with agent tools blocked. First call `picm_scan_control` with `preflight`; this metadata-only check reports whether the workspace is a Git repository and whether root `.gitignore` and repository-local `.git/info/exclude` exist without creating isolated Git metadata or inventorying files. Ask the security/privacy question before any scan. For `/picm-maintain` and `/picm-optimize`, when preflight reports `privacyQuestionIsConcise: true`, ask exactly: “Name any additional project-relative files or directory that should be excluded from reads, or reply `none` to continue.” This applies when persisted exclusions exist or `.picm/config.json` proves completed adoption or new-workspace setup. Then call `privacy` with every exact additional path; the privacy action retains persisted config exclusions and merges session additions monotonically. For other privacy-pending starts, ask the full security/privacy question and call `privacy` with every exact project-relative path the user excluded. Use `persist: true` only when the user requests durable PiCM exclusions, and let the action present the exact `privacy.excludedPaths` patch for TUI confirmation before writing `.picm/config.json`. Call `begin` only after successful preflight and privacy review, use `inventory` to obtain protected candidates without shell execution, call `end` when that scan phase finishes, and after `end` invoke only `begin` for the next phase or terminal `complete` before ordinary project tools. Call `complete` when the PiCM workflow is finished. A valid resumed authorization restores its reviewed exclusions scan-inactive only when its saved state proves preflight completed; legacy or incomplete state remains privacy-pending. Completion, reset, or session closure ends authorization; an authorized session does not expire by elapsed time. During active scans, the extension combines root/nested `.gitignore`, `.git/info/exclude`, global Git excludes, `.picm/config.json` privacy exclusions, and current-session exclusions; any matching source blocks the path. It filters excluded paths from inventory and checks built-in path-tool calls immediately before execution, conservatively blocking ignored/tracked-ignored paths, privacy-excluded paths, symlinks, `.git`, outside-worktree paths, non-candidates, unguarded directory traversal, every agent Bash call, and unrecognized agent tools. Canonical-path-bound, protected-descendant-filtered directory traversal is available only to `grep`, `find`, `ls`, and automatic `rg`; other guarded tools reject directories. Every admitted `read`, `edit`, `write`, `grep`, `find`, `ls`, or `rg` call revalidates its canonical target during built-in execution so path or parent-component swaps fail closed. Regular files with multiple hard-link names fail closed at admission and immediately before guarded access or mutation. Guarded `grep` and automatic `rg` bound traversal discovery/entries, retained files and aggregate snapshots, match/context rendering work, rendered output, and subprocess records/stdout/stderr. Confirmed privacy paths remain blocked for the whole authorized workflow, including between scan phases and after same-session resume. User-typed `!bash` is an explicit human action and is never intercepted. Outside an explicitly authorized workflow, ordinary Pi tools behave normally. Build coding-scan candidates through `inventory` and never inspect excluded contents. When `.git` is absent, create transient isolated Git metadata only after privacy review so Git can derive candidates and honor any root/nested/global ignore rules without initializing or modifying the user's folder. Treat an explicitly included submodule as a separate Git worktree with the same checks and request its inventory by passing its present worktree root as `path`. If Git or privacy-config validation is unavailable, stop rather than weakening the read boundary.
   When the command prompt already completed preflight and privacy review, do not repeat that bootstrap. Before `begin`, read only packaged resources under `skills/` and `prompts/`, plus the package README and metadata, reached through the declared or canonical extension package root and resolved to their exact canonical package targets; the extension rewrites each admitted built-in read to that validated target. Project copies, aliases outside those roots, nested or leaf aliases, and all other agent tools remain blocked. Legitimately symlinked package-root installs remain supported.
3. **Non-destructive by default.** Do not move, rename, overwrite, or delete existing files unless the user explicitly approves the exact action.
4. **Preview before writes.** For adoption, maintenance, and optimization, apply `references/preview-review-protocol.md` before every proposal batch: show a complete concise summary, flag material, uncertain, linked, or deletion changes with non-blocking review suggestions, then accept direct explicit approval of the current summary before writing the exact proposal. Draft adjustments preserve applicable unchanged-path review state, supersede pending write approval, and refresh the current proposal before direct approval. For `/picm-adopt` and `/picm-maintain`, prepare exact create, modify, delete, and linked-move operations with `picm_proposal_batch` during an active protected scan, then use it to apply only the directly approved current batch; it records a session audit, rechecks protected paths and expected content, and rolls back failed mutations without agent Bash. Preserve the separate runtime confirmations for persisted privacy exclusions and standalone maintenance-policy writes. For a standalone policy, the accepted complete summary remains no-write; only its following exact TUI patch confirmation may apply the accepted preview. For new scaffolds, show planned file changes before applying them, including brand-new scaffolds in confirmed empty-enough workspaces.
5. **Project-local install.** PiCM should be loaded through project-local `.pi/settings.json` from `pi install -l ...`. Verify this when relevant; do not recreate Pi package config during normal use.
6. **Keep `.picm/` small.** `.picm/` stores PiCM metadata/reports only. It is maintainer-only context, not normal workflow context.
7. **Visible folder is source of truth.** The actual workflow belongs in visible files/folders such as `AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, stage folders, specialist files, `reference/`, and `workflows/`.
8. **Layouts are profiles, not laws.** Recommend structure, but do not fail a user because they organize differently. Coding Repository may be the primary profile, while codebase mapping may also be a composable capability alongside another primary profile.
9. **Encourage git, never auto-commit.** Check/warn on git status before writes. If no git repo exists, suggest `git init`. Never commit for the user.
10. **Keep mechanical work out of prompt bloat.** When useful, recommend local scripts or named MCP/tool integrations for deterministic fetching, file movement, formatting, sending, or API work. Keep judgment and review in visible context; do not turn the extension into an executor or orchestrator.
11. **Scheduled maintenance stays advisory and reminder-based.** Maintenance can remain manual or configure scheduled maintenance reminders with a cadence in days, weeks, or months. Scheduling requires `.picm/config.json` to be non-ignored and a regular non-symlink file under a regular non-symlink `.picm/` directory. When maintenance is due in an interactive TUI session, a persistent reminder renders above the editor with Run Now and Defer options. Defer dismisses the reminder for the current session only. Run Now invokes the ordinary privacy-reviewed maintenance flow and depth selection. Timestamps advance and the reminder clears only after successful maintenance completion; adoption, declining an initial pass, cancellation, and failure leave configured reminders unchanged. Existing manual, nudge, and automatic configurations remain parseable; legacy scheduled modes use this approval prompt without unconfirmed automatic execution. Nothing runs while Pi is closed or in print, JSON, RPC, or headless modes. For a standalone policy write, pass the `previewId` returned by `picm_maintenance_policy` preview into apply so the confirmed patch reuses the exact previewed timestamps.

## Reference docs

Load only what you need:

- `references/interview-guide.md` — `/picm-new` interview flow.
- `references/layout-profiles.md` — layout profile definitions and recommendation rules.
- `references/adoption-guide.md` — `/picm-adopt` non-invasive process.
- `references/coding-adoption-guide.md` — coding-repository detection, privacy-first protected scanning, mapping choices, and additive/curated adoption.
- `references/maintenance-rubric.md` — `/picm-maintain` validation rubric.
- `references/coding-maintenance-rubric.md` — Strict/Balanced run depths and historical Light compatibility checks.
- `references/optimization-guide.md` — `/picm-optimize` discovery, proposal, preservation, and scope rules.
- `references/preview-review-protocol.md` — adoption/maintenance/optimization summary previews, selective exact review, and write approval.

Templates live under `templates/` and should be adapted, not copied blindly.

## Mode: new (`/picm-new`)

Goal: create a minimal viable scaffold that is useful immediately and can evolve through real use.

Process:

1. Run `picm_scan_control preflight`, ask the security/privacy question, record exact exclusions with `privacy`, and call `begin`. Do not inspect the folder before this sequence completes.
2. Inspect the current folder lightly.
   - Use the preflight root and protected Git candidate inventory for the shallow path sample rather than Bash or directory traversal.
   - Classify the folder as empty enough, source-material-only, or existing workspace architecture.
3. Apply `/picm-new` safety.
   - Empty enough: `.git/`, `.pi/`, `README.md`, `LICENSE`, `.gitignore`, `.env.example`, package manifests/lockfiles, editor folders, and OS noise are okay.
   - Source-material-only: folders/files such as `src/`, `docs/`, `notes/`, `assets/`, `data/`, transcripts, briefs, screenshots, or domain documents. Ask whether to build around them without moving or rewriting them.
   - Existing architecture: `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `REFERENCES.md`, `identity.md`, `rules.md`, `examples.md`, `workflows/`, `reference/`, numbered folders, `stages/`, `.picm/`.
   - If existing architecture is present, recommend `/picm-adopt`. If the user insists on `/picm-new`, require them to choose the intent (`adopt existing` vs `add/replace scaffold`) and approve exact file actions after preview.
   - Do not move, rename, overwrite, or delete source material or architecture files unless the user explicitly approves the exact action.
4. Apply git safety before writes.
   - If no git repo exists, recommend `git init`; require explicit confirmation to proceed without git.
   - If the repo is dirty, show `git status --short`; require explicit confirmation before writes.
   - Never auto-commit and never auto-run `git init`.
5. Run the core interview from `references/interview-guide.md`; ask branching follow-ups only when needed. If `/picm-new` arguments were provided, treat them as seed context and ask only missing critical questions. Before proposing extra stages, roles, folders, references, or examples, ask or infer: **What will you run first?**
6. Recommend a layout profile from `references/layout-profiles.md`, explain why, then present alternatives. For mixed workflows, choose one primary profile and borrow secondary patterns sparingly. Once Stage Pipeline is confirmed, resolve stage placement using that reference's **Placement decision** before choosing stage paths.
7. Draft the smallest scaffold that supports that first real run. Include required root routing/context and only the active stages, roles, specialist recipes, references, examples, artifact paths, and user-named scripts/tools needed now. Defer speculative structure until real use proves it useful. For Stage Pipeline workspaces, make each active stage contract answer: what it reads, what it does, what it writes, and where human review happens. Carry the selected stage placement through the exact preview and all generated paths. Mention a script, MCP server/tool, or other integration in generated routing/contracts only when the user has named it; never invent an integration to fill a template.
8. Near the final config preview, ask whether the user wants scheduled maintenance reminders: No configures manual maintenance; Yes asks for cadence in days, weeks, or months (defaulting to monthly). Do not present separate nudge versus automatic choices. If skipped/declined, leave maintenance manual with no policy object. Use `picm_maintenance_policy` with `action: "preview"` to calculate the exact object and include it in the existing `.picm/config.json` preview. Choosing cadence is not file-write approval.
9. Preview files to create/update, including exact append/update proposals for existing safe files such as `README.md` or `.gitignore`. In a new scaffold config preview, show `"createdAt": "{{createdAt}}"` and explain that the approved write resolves only this marker to the write-time canonical ISO 8601 UTC timestamp. This is a value resolution in the already-reviewed `.picm/config.json` write, not an additional file or write action.
10. After approval, write files.
11. End with a tailored, user-facing first-run checklist for the selected layout. Separate user actions from automatic agent behavior: tell the user only what they need to initiate, inspect, edit, or approve, and describe context loading, task routing, tool use, and verification as what the agent should do. Do not instruct the user to manually read an auto-loaded routing file unless they asked to inspect it. Name where work begins, where the first output or handoff should land, what the human should inspect/edit before downstream work consumes it, what gaps/unknowns must stay visible, and when to run `/picm-maintain`.

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
- `.picm/config.json` — tiny metadata only: `version`, `profile`, `generatedBy`, `createdAt`, key path hints, optional deterministic `maintenance` policy/check-in timestamps, and optional `privacy.excludedPaths` used by protected scans.

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
    "createdAt": "2026-05-24T12:34:56.789Z",
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
- **Coding Repository:** tell the user they can state one real coding task normally. Describe as expected agent behavior that the agent should use the auto-loaded canonical root routing file, follow it to the map/equivalent, locate the owning boundary, entry point, and verification source, make the smallest appropriate change, and run the real checks. Tell the user to review the presented code diff and check result; keep cross-boundary effects and unknowns visible.
- In every layout, recommend `/picm-maintain` after the first real workflow/use/handoff and whenever stages, roles, routing, references, process expectations, repository boundaries, manifests, or verification sources change. Phrase it as an advisory health check or drift investigation, not a required preflight or provenance-grade debugger.

## Mode: adopt (`/picm-adopt`)

Goal: make an existing ICM/folder-agent or coding repository PiCM-compatible without disrupting its current setup. Adoption is compatibility enablement: inspect read-only, preserve what works, then offer the smallest user-approved changes needed for PiCM and `/picm-maintain` to leverage the repo.

Load `references/adoption-guide.md` before running this mode. Load `references/coding-adoption-guide.md` when arguments start with `coding`, when a safe shallow check suggests a coding repository and the user selects coding adoption, or when codebase mapping is added to a hybrid workspace.

Process:

1. Start privacy-first and otherwise read-only. Call `picm_scan_control preflight`, then ask before any inventory or file read: “PiCM automatically protects:\n- paths covered by root, nested, and repository-local Git ignore rules;\n- Git internals;\n- symlinks and nested repository/submodule boundaries; and\n- paths outside this project.\n\nBefore scanning any workspace files, does this workspace contain secrets, regulated data, client data, or personal/private material that must be excluded? If so, name each exact project-relative file or directory to exclude. Name any other project-relative exclusions too, or reply `none` if there are none.” These protections are automatic; the user's reply supplies additional exclusions for sensitive eligible paths PiCM cannot infer. Then call `privacy` with every exact project-relative exclusion. If the user chooses persistence, let the privacy action present and apply the exact `privacy.excludedPaths` patch to `.picm/config.json` only after its TUI confirmation; this confirmed control write is the only allowed pre-discovery write. If the Git repository has no root `.gitignore`, separately offer an exact `.gitignore` proposal for commit protection, but do not require it because PiCM config exclusions protect scans. Call `begin` only after privacy review.
2. If arguments start with `coding`, enter coding adoption directly. Otherwise, use protected shallow candidate inventory for path-only classification. Offer **Coding Repository**, **add codebase mapping to the existing profile**, or **continue normal adoption** when coding signals appear. Do not deep-scan merely to classify the repo.
3. Scan for existing architecture files/folders and visible conventions. Use protected inventory and immediate checks before every read. Git protection includes root/nested `.gitignore`, repository-local `.git/info/exclude`, and global excludes; PiCM also applies persisted config and current-session exclusions. Without `.git`, isolated transient Git metadata is created only after privacy review. Excluded files are out of scope without exception.
4. Identify whether Pi can already use `CLAUDE.md` or `AGENTS.md`, and classify routing quality as adequate, partial, placeholder/unrelated, or conflicting/risky.
5. For a complex, cluttered, or unfamiliar workspace—or when requested—offer the adoption guide's optional file-role inventory. Keep it a representative path-to-role-to-rationale orientation aid, separate from readiness, and never treat a classification as approval to move, rename, archive, delete, merge, or rewrite anything.
6. For coding adoption, ask for mapping approach (**root**, **distributed**, or **scan and recommend**), adoption depth (**additive** or **curated**), and optional user boundary hints. Do not ask for a maintenance depth. Automatically perform the Strict adoption examination: broader systematic coverage across declared roots and mapped contexts at higher cost.
7. Infer the closest primary layout profile, but treat custom structure as valid. Use **Coding Repository** when coding is primary; otherwise keep the workflow profile and add the codebase-map capability. Coding/workflow scopes may overlap.
8. Produce an adoption report using qualitative readiness labels:
   - **Ready** — adequate visible routing exists and approved `.picm/config.json` can mark the repo adopted.
   - **Ready with warnings** — routable/adoptable, with non-blocking ICM improvements.
   - **Needs routing before adoption** — routing is absent, partial, placeholder, conflicting, or unsafe; do not mark adopted yet.
   - **Scanned only** — user wants findings/metadata without full compatibility changes.
9. Near the final config preview, ask whether the user wants scheduled maintenance reminders: No configures manual maintenance; Yes asks for cadence in days, weeks, or months (defaulting to monthly). Do not present separate nudge versus automatic choices. If skipped/declined, omit the policy. Use `picm_maintenance_policy` preview for exact timestamps and include the result in the adoption config preview; cadence choice is not write approval.
10. Before offering any adoption write, apply the adoption guide's sensitive non-Git safeguard when protected inventory found sensitive material.
11. If routing is adequate, offer minimal `.picm/` adoption metadata after explicit confirmation. Coding metadata records only the resulting root/distributed shape, roots, map path/equivalent, selected local contexts, and `maintenancePreset: "strict"`. This explicit value records the Strict-first adoption baseline; it does not grant future writes.
12. If routing is missing or weak, offer multiple exact proposals:
   - minimal PiCM-compatible routing;
   - stronger, more opinionated ICM-style routing;
   - scanned-only report/config for now.
13. In coding additive mode, preserve existing documentation and add only missing routing/maps. In curated mode, draft a documentation consolidation proposal with canonical-source recommendations and separately highlighted merges, moves, archive candidates, rewrites, and deletions; never treat curated selection as blanket write approval.
14. Before every proposal batch, apply `references/preview-review-protocol.md`: present its complete concise summary with non-blocking review suggestions, then accept direct explicit approval of the current summary. Option or cadence choice, preview request, review navigation, or vague assent is not approval. A draft adjustment supersedes pending write approval, preserves applicable unchanged-path review state, and requires a refreshed summary. Then write only the exact approved changes, including for `.picm/` files.
15. After every adoption workflow, before normal workflow completion, call `picm_scan_control` with `action: "adoption-complete"`. Only a workflow that successfully writes exact `adoption.status: "adopted"` asks once: “Would you like to run an initial maintenance pass now (recommended)?” with **Run maintenance now** and **Finish**. Already-adopted, preview-only, declined, cancelled, failed, Scanned only, Needs routing, missing-status, and malformed-status outcomes complete without offering or starting initial maintenance. **Finish** completes adoption without recording maintenance or changing reminders. **Run maintenance now** reuses the confirmed exclusions in this conversation, presents the ordinary Strict-preselected maintenance-depth selector, and continues into profile-appropriate maintenance without another privacy bootstrap. Its maintenance proposals retain the shared summary and selective exact-review gate. In a later conversation, `/picm-maintain` performs its ordinary privacy review.

Allowed default outputs after confirmation:

- `.picm/config.json`
- `.picm/adoption-report.md`

Config may represent either `adoption.status: "scanned"` or `adoption.status: "adopted"`. Full adopted status requires adequate visible routing; `.picm/config.json` supports maintainability but never replaces the user/agent-facing route map.

Routing policy:

- If only `CLAUDE.md` exists, use it as source of truth when adequate. Do not replace it with `AGENTS.md` by default.
- If only `AGENTS.md` exists, use it as source of truth when adequate.
- If both exist, preserve both and check whether they cooperate or conflict. Offer coexistence optimization only as an approved edit.
- If neither exists, follow the missing-routing proposal and compatibility-shim choice in `references/adoption-guide.md`.

Do not create, rewrite, merge, rename, move, or delete any visible routing/context/workflow files without a current complete concise summary, clear deletion or impact flags where applicable, user iteration, and direct explicit approval. Do not write `.picm/` files from an option selection alone; apply `references/preview-review-protocol.md` first.

## Mode: maintain (`/picm-maintain`)

Goal: keep a generated or adopted workspace healthy as the workflow changes. Treat maintain as a heuristic health report and focused drift-investigation helper for folder-agent systems, not as provenance-grade tracing.

Modes:

- General health check: `/picm-maintain` or `/picm-maintain routing`.
- Coding-map health: detected automatically from the Coding Repository profile/codebase-map capability, or focused with `/picm-maintain coding`.
- Trace mode: `/picm-maintain trace "drift symptom"`, optionally with `@file` mentions for direction. Trace mode reports likely drift sources with confidence; it does not promise causal provenance.

Process:

1. Run `picm_scan_control preflight` before inspecting anything. For routine maintenance, preflight automatically loads persisted `.picm/config.json` exclusions and reports `privacyQuestionIsConcise: true` for persisted exclusions or completed adoption/new-workspace setup. When true, ask exactly: “Name any additional project-relative files or directory that should be excluded from reads, or reply `none` to continue.” Otherwise, ask the full security/privacy question. Record exact exclusions with `privacy`, then call `begin`.
2. At maintenance intake, ask whether to include agent-document optimization in this maintenance pass; default to **No**. **No** runs the standard maintenance workflow unchanged. If **Yes**, load `references/optimization-guide.md` and use it as the single source for the documentation-only scope, protected discovery boundary, preservation ledger, independently selectable proposals, outcome-preservation checks, shared summary/selective-exact preview, and exact `No worthwhile optimizations found` result. Do not duplicate or weaken its logic. Continue the normal maintenance run; optimization never expands edits beyond eligible agent-facing documentation.
3. Inspect current routing/context structure through protected inventory. `.picm/config.json` is maintainer metadata loaded by the extension for privacy and maintenance policy; consult its workflow fields only when relevant.
4. If the repo uses the Coding Repository profile, `capabilities.codebaseMap`, or visible `CONTEXT-MAP.md`, load `references/coding-maintenance-rubric.md`. Apply its complete protected-scan boundary before any coding inspection. Apply only the Strict or Balanced one-run depth supplied by the command prompt, including after a scheduled `Run Now`; never mutate the stored preset. Historical stored `light`, `balanced`, or `strict` values remain readable, but Light is compatibility-only and is not offered in the selector.
5. If `.picm/config.json` says `adoption.status: "scanned"`, short-circuit broad maintenance into an adoption-blocker report. Use the linked adoption report or brief scan summary when present, explain that the repo is scanned but not fully adopted, and guide the user toward fixing root routing before deeper health checks.
6. Apply `references/maintenance-rubric.md`. Identify the visible layout profile before reporting it: when a reusable specialist has `identity.md`, `rules.md`, `reference/`, and `workflows/`, explicitly identify **Specialist Folder** in the report summary; strongly suggest it only when those defining signals are incomplete. Treat `examples.md` as optional; its absence is not a warning or a reason to change the profile. Preserve existing routing and recommend only the smallest repair supported by a real routing or contract problem. During a general health check, run its cold-agent walk test against one representative task: orient from root, reach the local contract, identify exact inputs/job/output/human check, then read each named input, output, review, or equivalent visible artifact. Report artifact presence separately from correctness and human approval, warn when required contract pointers are absent, and do not pass a criterion that was not inspected.
7. If arguments start with `trace` or describe a concrete symptom, focus on a heuristic investigation of likely drift sources instead of doing a broad audit. Trace mode does not require the general cold-agent walk test.
8. Report results with severities:
   - **Pass** — good as-is.
   - **Warning** — likely issue that may hurt output or safety.
   - **Suggestion** — optional improvement.
9. For each meaningful Warning/Suggestion, include likely cause, repair tier, and smallest safe healing path. When repeated deterministic instructions bloat context, ask whether fetching, moving files, formatting, sending, or API work should be extracted to a local script or a named MCP/tool integration; keep this advisory and do not build or run an orchestration pipeline by default.
10. Use the repair tiers from the rubric:
   - **Tier 1: Routing fixes** — root maps, task routing, `.picm/` exclusion.
   - **Tier 2: Contract fixes** — local `Purpose`, `Inputs`, `Process`, `Outputs`, `Verify`, `Quality checks`, `Handoff` sections.
   - **Tier 3: Judgment/source fixes** — tone rules, examples, quality bars, domain constraints, repeated output corrections.
11. For coding workspaces, adapt the cold-agent walk to root routing → repository map/equivalent → owning boundary → entry point → authoritative tests/checks. Report map presence separately from correctness and user confirmation.
12. Keep cold-agent walk findings advisory. Treat a short read count as a diagnostic target rather than a naming/layout law, and never claim deterministic workflow state or provenance from file presence.
13. Keep folder naming/organization feedback loose and advisory unless routing is broken.
14. Keep the entire run read-only and advisory: chat findings only, with no unauthorized scan lifecycle action, agent-initiated Bash, edits, report, repair, commit, or external side effect. User-typed `!bash` remains unrestricted. The extension's schedule timestamp reset occurs only upon successful completion and authorizes no other write.
15. Offer edits only through `references/preview-review-protocol.md`: before every proposal batch, present its complete concise summary, flag material or uncertain changes for optional review, then accept direct explicit approval of the current summary. Draft adjustments preserve applicable unchanged-path review state, refresh the current proposal, and never auto-heal.
16. Offer to write `.picm/maintenance-report.md` only through the same summary-preview and direct-approval gate.
17. End general reports with a discoverability note for trace mode: `/picm-maintain trace "describe what drifted"`.

## Mode: optimize (`/picm-optimize`)

Goal: improve agent-facing documentation only where visible evidence supports a useful outcome-preserving change.

Load `references/optimization-guide.md` and follow it completely. After preflight, use the concise privacy question when `privacyQuestionIsConcise: true`; otherwise use the full privacy question. Use the same privacy-first protected scan lifecycle and the same `references/preview-review-protocol.md` write gate as adoption and maintenance. Do not inspect before preflight and privacy review. Do not modify source code, build/runtime paths, `.picm/` policy or configuration, generated artifacts, or unrelated workspace material. Before concluding that no useful proposal exists, compare claims across every inspected agent-facing document; a contradiction or repeated claim without a visible canonical home is a useful opportunity to propose a canonical home, thin pointer, or user decision. If discovery finds no useful proposal, complete the protected workflow and report exactly `No worthwhile optimizations found`.

## Mode: help (`/picm-help`)

Explain in plain language without requiring PiCM/ICM jargon.

Start with a compact syntax reference and explain that slash commands accept optional text after the command. In interactive Pi, type a space after `/picm-adopt` or `/picm-maintain` to show registered argument completions.

- `/picm-new [workflow description]` — optional free-form seed context for the interview.
- `/picm-adopt [coding | adoption request]` — `coding` skips the initial repository classification; other text describes the requested adoption focus.
- `/picm-maintain [strict | balanced | coding | routing | handoffs | stale-context | security | trace "drift symptom"]` — selects a one-run depth, focuses the advisory check, or investigates one concrete symptom. A bare interactive command asks for depth with Strict preselected.
- `/picm-optimize` — inspects agent-facing documentation and offers selected outcome-preserving improvements; `/picm-maintain` can include the same flow at intake when the user chooses Yes (default No).
- `/picm-help` — shows this syntax, examples, setup, and safety guidance.

Clarify that these are optional command arguments, not required flags. A bare command remains valid.

Command decision guide:

- **New or mostly empty folder; starting a new workflow** → `/picm-new`. It interviews, previews a minimal workspace, and writes only after approval.
- **Existing folder with source code, manifests, agent instructions, workflows, stages, references, or a Claude/ICM-style setup** → `/picm-adopt`. It safely detects likely coding repositories and offers the Coding Repository profile without requiring a special command. It starts read-only, preserves existing structure, and proposes optional compatibility changes without converting the project.
- **Existing workflow or coding-repository workspace; general health, routing, handoff, safety, or drift check** → `/picm-maintain`.
- **One concrete bad result, lost handoff detail, or other specific symptom** → `/picm-maintain trace "describe what drifted"`. Describe this as a focused heuristic investigation, not deterministic provenance.
- **Agent-facing instructions or context are repetitive, diffuse, or hard to navigate** → `/picm-optimize`. It proposes documentation-only improvements and preserves existing outcomes and constraints.
- **Known coding repository / monorepo** → `/picm-adopt coding` is a shortcut to coding adoption; regular `/picm-adopt` can reach the same flow after a safe shallow classification.
- **Unsure between new and adopt** → prefer `/picm-adopt` when workspace architecture or source code already exists; adoption's read-only scan is safer than scaffolding over existing work.

Also explain:

- Pi install:
  `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
- pinned public npm project-local install:
  `pi install -l npm:@eyevanovich/picm-factory@0.3.1`
- local development install from the user's checkout:
  `pi install -l /path/to/picm-factory`
- maintain examples:
  - `/picm-maintain` — choose a one-run depth (Strict preselected), then run a general workspace health check
  - `/picm-maintain strict` — bypass the selector and use Strict for this run only
  - `/picm-maintain balanced` — bypass the selector and use Balanced for this run only
  - `/picm-maintain routing` — choose depth, then focus on task routing and context loading
  - `/picm-maintain coding` — choose depth, then focus on Coding Repository/context-map drift
  - `/picm-maintain trace "final output drifted from approved source"` — choose depth, then investigate a concrete symptom; mention files with `@path` when useful
- Depth guidance:
  - Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.
  - Balanced: representative coverage of major boundaries and one coding path; lower cost.
- After an adoption writes exactly `adoption.status: "adopted"`, PiCM asks “Would you like to run an initial maintenance pass now (recommended)?” with `Run maintenance now` and `Finish`; other adoption outcomes finish without this offer. A same-conversation run reuses confirmed exclusions, then uses the same Strict-preselected selector; Finish, cancellation, or failure neither records maintenance nor changes reminders. A later conversation performs normal maintenance privacy review.
- At maintenance intake, PiCM asks whether to include agent-document optimization and defaults to No. No keeps standard maintenance unchanged; Yes follows `references/optimization-guide.md` without widening its documentation-only scope or weakening preservation, selection, privacy, no-worthwhile-change, or preview safeguards.
- The interactive choice applies to one run only and never silently changes `capabilities.codebaseMap.maintenancePreset`. Historical stored `light`, `balanced`, and `strict` values remain readable; a missing value falls back to Balanced. Light is compatibility-only and is not offered for new adoption or interactive run selection.
- `.pi/` is Pi package configuration that controls project-local resources; `.picm/` is small, maintainer-only PiCM metadata/reporting and not normal workflow context.
- PiCM Factory is project-local by default.
- Adoption, maintenance, and optimization use a complete concise summary before every proposal batch, non-blocking review suggestions for material or uncertain changes, optional exact review when requested, and direct explicit approval of the current summary. Adoption and optimization are non-destructive by default and do not rename, move, rewrite, or restructure existing files without approval of the exact action.
- security and git safety rules.

## Communication style

Be plain, practical, and direct. Do not oversell. If the user is about to overbuild, say so.
