# Interview and creation

Use for `/picm-new` under the [shared contract](../SKILL.md). Create the smallest scaffold that supports the first real run. Command arguments seed the interview; ask only missing critical questions.

## Orient before interviewing

Classify the folder as empty enough, source-material-only, or existing architecture. Git/Pi metadata, README/license/ignore files, manifests, editor folders, and OS noise are compatible with an otherwise empty workspace.

For source material, ask whether to build around it without moving or rewriting it. For existing architecture, recommend adoption; scaffold over it only when the user chooses that direction. Preserve deployment/setup already completed.

## Core interview

Combine related questions and reuse supplied answers:

- **Purpose and first run:** repeatable job, operator/audience, and shortest real-input-to-reviewed-output path.
- **Inputs and outputs:** stable references versus per-run material, final deliverables, and intermediate artifacts consumed after review.
- **Process:** sequential stages, one specialist, or roles/handoffs; each active part's inputs, job, output, and human review.
- **Quality and boundaries:** quality bar, forbidden inventions/mistakes, human judgment, and privacy constraints affecting scope/context.
- **Mechanics:** user-named scripts/integrations for deterministic fetching, movement, formatting, sends, or API work; record inputs, outputs, side effects, and review. Keep judgment in visible context.
- **References and maintenance:** available durable examples/policies/domain rules, material kept outside reusable context, and whether manual maintenance or an optional reminder interval is useful.

Relevant follow-ups cover operator guidance for non-technical/team users, actual triggers/timing, incomplete input/failed review/backward flow, and real golden examples or anti-examples. For sensitive work, identify local-only boundaries and suitable storage/sharing; request already-sanitized sources. Recommend exact `.gitignore` patterns when commit protection is useful; changes require sign-off.

## Choose and propose the scaffold

1. Load [layout profiles](layout-profiles.md), recommend a primary layout, and explain useful alternatives. Resolve Stage Pipeline placement before choosing paths.
2. Summarize the first-run workflow and smallest justified path set. Include routing, active contracts/recipes, real references/examples, artifact paths, and named mechanics needed now. Every path has a current purpose; omit speculative stages, unused roles, empty folders, and placeholder content. A contract may name a future artifact without creating its parent today.
3. For each active stage, expose Purpose, Inputs, Process, Outputs, optional named tool/Verify, and Handoff/review. Preserve existing material unless the direction explicitly changes it.
4. Present the final direction and wait for sign-off before writing. If reminders are wanted, first load [settings and reminders](settings-guide.md) and include cadence/config effects.

## Templates and writing

Load only templates needed for the selected layout from `../templates/`:

| Content | Template |
| --- | --- |
| Root routing and overview | [root instructions](../templates/root-agents.md), [root context](../templates/root-context.md) |
| Stage contract | [stage context](../templates/stage-context.md) |
| Specialist context | [specialist context](../templates/specialist-context.md); recipe receipt comes from [specialist guidance](specialist-guide.md) |
| Role/stage handoff | [handoff card](../templates/handoff-card.md) |
| Coding map/local boundary | [context map](../templates/context-map.md), [code boundary](../templates/code-boundary-context.md) |

Templates are authoring examples, not schemas. Adapt paths and sections to visible needs; resolve `{{picm:...}}` tokens and remove authoring comments/instructions from generated files. Point only to existing, scaffolded, or explicitly per-run inputs. Create no optional reference/examples/tool route solely to fill a template.

Typical files are root `AGENTS.md`/`CONTEXT.md`, necessary local context, and justified recipes/references. `.picm/config.json` may hold minimal profile/path/privacy/cadence metadata, outside normal routing. Resolve `createdAt` at write time; preserve unrelated config and configure agreed cadence through its conditional tool after config exists.

## Completion

Validate the scaffold and pointers; leave no unresolved tokens or authoring notes. Give the selected profile's path-specific first-run checklist from `layout-profiles.md` (including specialist guidance when applicable), naming the first artifact, human check, downstream source, and remaining gaps.

Recommend `/picm-maintain` after first real use and when stages, roles, routing, references, mechanics, coding boundaries, manifests, or verification sources change. Maintenance is advisory, not a preflight or provenance debugger.
