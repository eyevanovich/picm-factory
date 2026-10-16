# Help

Explain package behavior under the [shared contract](../CONTRACT.md) without inspecting or editing the workspace. Use the host adapter's command names and installation instructions.

## Commands

| Mode | Use |
| --- | --- |
| `new [workflow description]` | A new/mostly empty workspace; free-form text seeds the minimal scaffold interview. |
| `adopt [coding \| adoption request]` | Existing source, instructions, or architecture; `coding` skips classification and enters coding adoption. |
| `maintain [strict \| balanced] [coding \| routing \| handoffs \| stale-context \| security \| trace "drift symptom"]` | General/focused health checks or a likely-source drift investigation. |
| `optimize [focus or session request]` | Improve agent-facing documentation while preserving constraints and outcomes, optionally informed by a session retrospective. |
| `help` | Syntax, setup, settings, and behavior. |

Arguments are optional; bare commands remain valid. Give one concrete example using the host's maintenance command with `trace "the final draft differs from the approved brief"`.

Strict gives broader systematic coding-map coverage; Balanced samples major boundaries and one coding path. These are one-run recommendations, not persistent security modes; historical Light metadata remains readable but isn't offered. The host adapter owns depth selection and argument conveniences.

## Session-informed optimization

Optimize offers documentation only, this session, recent sessions, or this session plus recent sessions unless the request already specifies the evidence. Users can say "include this session" or "use the past five sessions"; use the active host's optimize command in examples. Recent means previous sessions for the current workspace, excluding the current one unless also requested. The agent locates available local history without requiring exports, asks for a count only if missing, and reports coverage limits. If history is unavailable or ambiguous, it asks for help rather than silently claiming a retrospective.

The review follows the work represented, whether coding, other workflows, or mixed. Session-informed findings join the normal opportunity list; tooling/check changes remain separate follow-ups outside documentation-only edits. History reads remain subject to privacy exclusions and sensitive-content boundaries.

## Setup and shared behavior

Follow the host adapter for installation and instruction loading. `.picm/` holds minimal maintainer metadata outside normal routing. Preserve existing setup during normal work.

Modification commands inspect, present a final direction, and await conversational sign-off. They preserve existing files by default; a Git checkpoint is optional advice, never an automatic Git operation. Ordinary tools and agent-followed exclusions aren't an execution sandbox. Secrets and sensitive material must stay out of model-visible context, even with approval.

## Settings and reminders

Explain that `settings` reports or conditionally saves project scan exclusions; `maintenance` reports/configures optional cadence and records completed passes. Both affect only the current project's `.picm/config.json` and preserve unrelated fields. The host adapter maps these operations to its tools or helper.

Where supported, a due reminder offers **Run Now** or **Later**. Run Now starts maintenance planning, not edits or automatic completion; legacy automatic policies also only offer this choice. An unfinished requested repair doesn't clear the reminder. Help describes these operations without calling them; actual configuration or completion follows [settings guidance](settings-guide.md) and sign-off. State the active host's actual reminder support rather than promising parity.
