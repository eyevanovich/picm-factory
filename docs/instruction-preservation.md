# Public instruction preservation map

Baseline: commit `700879b` (`fix: add redundancy checks`). This map was recorded before rewriting the instructions. Compare it with that commit when reviewing preservation; it isn't runtime guidance or proof of equivalent agent behavior. Paths below are relative to `skills/picm-factory/`.

| Requirement | Previous home(s) | Retained home / route |
| --- | --- | --- |
| Explicit command invocation only; arguments seed the selected mode | `SKILL.md`, backing prompts, dispatch | `SKILL.md` mode router; backing prompts still enter through the shared contract |
| Relevant current-workspace scope; named external/nested context grants reads, not writes/init/fetch | Skill, adoption guides | Shared contract; coding guide retains nested/symlink caveats |
| Git ignores, persisted/session exclusions, known sensitive paths, bounded eligible output; no sandbox claim | Skill and branch guides | Shared contract before branch discovery; standalone root template |
| No secrets/private/client/regulated material in model-visible context or reusable output | Shared skill; inconsistent exceptions in adoption/root template | Shared pre-read boundary and standalone template; exceptions removed following explicit user clarification |
| Inspect, explain material effects, await conversational sign-off; routine aligned work proceeds | Skill, preview guide, every mode | Shared contract; preview guide supplies proportional review advice |
| Report/help no-edit; saved reports are edits; design choices alone aren't approval | Skill, preview/adoption/optimization guides | Shared contract, help guide, maintenance/adoption result steps |
| Preserve unrelated files/settings/routing; re-read concurrent edits; no automatic rollback or uncertain replay | Shared skill, preview guide | Shared contract and preview recovery |
| Optional user-created Git checkpoint; no automatic init/stage/commit/reset/clean/restore or checkpoint verification | Skill, preview guide | Shared contract and preview review advice |
| Honest completed/failed/uncertain effects; local validation doesn't grant deployment/publication authority | Skill, preview guide | Shared contract and preview validation |
| Minimal `.picm/`, visible routing authoritative; `.pi/` installation, no executor | Skill, profiles, templates | Shared contract, help, profile/contract templates |
| Conditional config updates preserve unrelated fields; one-run depth doesn't mutate legacy presets | Skill, coding guides | Settings guide; coding guides and dispatch depth handling |
| Optional cadence offers work only; complete only an agreed finished pass, never unfinished repairs | Skill, maintenance/preview/help | Settings guide, mandatory maintenance completion pointer, help explanation |
| Empty/source-only/existing classification; protect source; timestamp at write time; resolve tokens | New mode, interview | Interview creation sequence and template authoring rules |
| Missing critical interview answers only; first real run; named mechanics, references, quality/operator/privacy/branch/timing needs | Interview, new mode | Interview guide |
| No speculative folders/placeholders; selected stage placement consistently affects paths/config/checklist | Interview, profiles, stage template | Interview and Stage Pipeline profile |
| Profile recommendations, hybrid coding, meaningful local boundaries rather than per-folder context | Skill, profiles, coding guides | Profiles and coding adoption |
| Path-specific first-run artifact/review/handoff; preserve gaps and durable-vs-one-off lessons | Interview, profiles, coding guide | Profile first-run sections; conditional specialist guide |
| Specialist JSON receipt, unique inputs and availability, reviewed artifact equals next source; existing recipe edits agreed | Profiles | Specialist guide reached by the Specialist Folder profile |
| Adequate/partial/placeholder/conflicting routing; preserve canonical AGENTS/CLAUDE and optional shim | Adopt mode/guide | Adoption guide |
| Ready/Ready with warnings/Needs routing/Scanned only; adequate visible routing before adopted metadata | Adopt mode/guide | Adoption guide and coding readiness |
| Optional inventory/report/metadata; minimal compatibility/stronger routing/scanned-only and optional initial maintenance | Adoption guide | Adoption guide |
| Coding shortcut skips classification only; root/distributed/recommend, additive/curated, initial Strict baseline | Adoption guides | Coding adoption guide with mandatory coding rubric |
| Evidence-backed maps, optional non-obvious impact/status, no ownership/import/dead-code overclaims | Coding adoption, profiles/templates | Coding adoption and map/boundary templates |
| Legacy light/balanced/strict metadata readable; map presence/correctness/approval separate | Coding guides | Coding adoption/maintenance guides |
| Heuristic severity, repair tiers, profile identification, general cold-agent walk and focused trace confidence | Maintain mode/rubric | Maintenance rubric; coding walk substitutes for workflow-artifact walk on coding tasks |
| Required within/across-file redundancy review even if optimization declined; focused/trace/depth coverage bounded | Skill, maintenance/optimization/redundancy guides | Required callers plus redundancy guide |
| Optional optimization defaults No; preserve maintenance report and answered intake | Maintain mode, optimization guide | Maintenance and optimization guides |
| Balanced major boundaries/one path; Strict all declared roots/contexts and broader walks; no exhaustive source claim | Coding rubric | Coding rubric |
| Documentation-only optimization; protected ledger, five ordered audit rows before findings/no-op, exact no-op text | Optimize mode/guide | Optimization guide |
| Meaning/applicability/disposition/canonical reachability; intentional repetition preserved, conflicts require decision | Redundancy guide | Redundancy guide |
| Templates adapted, conditional paths/sections, named tools only, local review/security independent of package | Skill/templates | Interview authoring rules and standalone templates |
| Help syntax, example, pinned local/global distinction, completions, one-run depth, settings/reminders | Skill/help prompt | Conditional help guide; release-managed install pin stays in skill |

## Reading-load snapshot

Whitespace-delimited words, including frontmatter, tables, and template authoring notes:

- Skill + all references + all templates: **10,660 → 7,539** (29% less), including the three new conditional guides.
- Main skill: **1,747 → 718** (59% less).

These aren't model token counts, actual read traces, or performance measurements. Representative read sets include the shared skill and mandatory branch detail; workspace content is excluded. Additional conditional configuration/review references can increase a particular run's load.

| Representative route | Baseline words | Refactored words | Read set / condition |
| --- | ---: | ---: | --- |
| Help | 1,747 | 1,105 | Skill; help guide now conditional |
| New Stage Pipeline | 4,536 | 2,386 | Skill, interview, layouts, root/root-context/stage templates; baseline required preview guide, now conditional; no cadence |
| New Specialist Folder | 4,430 | 2,568 | Skill, interview, layouts, root/root-context/specialist templates; new specialist guide; baseline preview required; no cadence |
| Non-coding adoption | 2,959 | 1,269 | Skill, adoption; baseline preview required; no config/consequential review |
| General maintenance | 3,578 | 1,987 | Skill, general rubric, redundancy; optimization declined, no cycle completion |
| Coding maintenance | 4,414 | 2,627 | Skill, general/coding rubrics, redundancy; no optimization/cycle completion |
| Optimization with review | 3,679 | 1,958 | Skill, optimization, redundancy, preview guidance |

## Validation boundary

Automated contracts check required instructions, routes, package contents, and fixture structure. `npm run check` passes 125 tests and package validation; `npm pack --dry-run --json` includes all three new guides, and packaged Markdown links resolve within its file inventory. These checks don't establish conversational compliance, prevent arbitrary host-tool disclosure, or prove semantic equivalence.

Approved disposable interactive QA exercised command workflows, approval/write boundaries, and reminders. A synthetic excluded-context prerequisite was read before skill loading on both baseline and the initial refactor. Follow-up dispatch instructions put skill loading and eligibility ahead of workspace prerequisites; fresh root/nested probes then refused before protected reads. Help stayed package-only, and bounded maintenance accepted a named external note without sibling discovery. These individual runs support the mitigation, not universal access control or broader statistical non-regression. Host auto-loading remains outside command-level protection. QA evidence stays local rather than shipping session transcripts.
