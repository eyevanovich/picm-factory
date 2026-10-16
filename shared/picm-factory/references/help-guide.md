# Help

Explain package behavior under the [shared contract](../CONTRACT.md) without inspecting or editing the workspace. Use the host adapter's command names and installation instructions.

## Commands

| Mode | Use |
| --- | --- |
| `new [workflow description]` | A new/mostly empty workspace; free-form text seeds the minimal scaffold interview. |
| `adopt [coding \| adoption request]` | Existing source, instructions, or architecture; `coding` skips classification and enters coding adoption. |
| `maintain [strict \| balanced] [focus or session request]` | Keep guidance aligned with intended behavior and current reality; repair stale context and drift, optionally using a session retrospective. |
| `optimize [focus or session request]` | Improve agent behavior and workflow efficiency through documentation, optionally using a session retrospective. |
| `help` | Syntax, setup, settings, and behavior. |

Arguments are optional; bare commands remain valid. Give one concrete example using the host's maintenance command with `trace "the final draft differs from the approved brief"`.

Strict gives broader systematic coding-map coverage; Balanced samples major boundaries and one coding path. These are one-run recommendations, not persistent security modes; historical Light metadata remains readable but isn't offered. The host adapter owns depth selection and argument conveniences.

## Maintain, optimize, and session evidence

Maintain keeps guidance aligned and current; optimize makes the approach better and more efficient, including behavior, context/token use, and workflow-tooling opportunities. These purposes can overlap: maintenance already offers optional optimization. Relevant tooling can be assessed, but executable script/tool/CI changes are separately scoped follow-ups, not implicit maintenance or optimization edits.

Both offer documentation only, this session, recent sessions, or this session plus recent sessions unless the request already specifies the evidence. Users can say "include this session" or "use the past five sessions"; give examples with both active-host commands. Recent means previous sessions for the current workspace, excluding the current one unless also requested. The agent locates available local history without requiring exports, asks for a count only if missing, and reports coverage limits. If history is unavailable or ambiguous, it asks for help rather than silently claiming a retrospective. Maintenance-integrated optimization reuses the evidence selection and findings without a second session review.

The review follows the work represented, whether coding, other workflows, or mixed. Session-informed findings join the existing maintenance/trace report or optimization opportunities. History reads remain subject to privacy exclusions and sensitive-content boundaries. Behavior corrections require an explicit agreed direction; shorter guidance isn't automatically better, and token savings aren't promised.

## Setup and shared behavior

Follow the host adapter for installation and instruction loading. `.picm/` holds minimal maintainer metadata outside normal routing. Preserve existing setup during normal work.

Modification commands inspect, present a final direction, and await conversational sign-off. They preserve existing files by default; a Git checkpoint is optional advice, never an automatic Git operation. Ordinary tools and agent-followed exclusions aren't an execution sandbox. Secrets and sensitive material must stay out of model-visible context, even with approval.

## Settings and reminders

Explain that `settings` reports or conditionally saves project scan exclusions; `maintenance` reports/configures optional cadence and records completed passes. Both affect only the current project's `.picm/config.json` and preserve unrelated fields. The host adapter maps these operations to its tools or helper.

Where supported, a due reminder offers **Run Now** or **Later**. Run Now starts maintenance planning, not edits or automatic completion; legacy automatic policies also only offer this choice. An unfinished requested repair doesn't clear the reminder. Help describes these operations without calling them; actual configuration or completion follows [settings guidance](settings-guide.md) and sign-off. State the active host's actual reminder support rather than promising parity.
