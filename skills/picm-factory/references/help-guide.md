# Command help

Explain without inspecting or editing the workspace. Include syntax, one concrete example, setup, shared behavior, and a short **Settings and reminders** explanation.

## Syntax and choice

| Command | When to use it |
| --- | --- |
| `/picm-new [workflow description]` | A new/mostly empty workspace; free-form text seeds the minimal scaffold interview. |
| `/picm-adopt [coding \| adoption request]` | Existing source, instructions, or architecture; `coding` skips classification and enters coding adoption. |
| `/picm-maintain [strict \| balanced] [coding \| routing \| handoffs \| stale-context \| security \| trace "drift symptom"]` | General/focused health checks or a likely-source drift investigation. |
| `/picm-optimize` | Repetitive, diffuse, or hard-to-route agent documentation; documentation-only improvements preserving constraints and outcomes. |
| `/picm-help` | Syntax, setup, settings, and behavior. |

Arguments are optional; bare commands remain valid. In interactive Pi, a space after `/picm-adopt` or `/picm-maintain` shows completions. Give one concrete example: `/picm-maintain trace "the final draft differs from the approved brief"`.

Strict gives broader systematic coding-map coverage; Balanced samples major boundaries and one coding path. Interactive maintenance offers both with Strict preselected; explicit depth bypasses the selector, and non-TUI maintenance defaults to Strict. These are one-run recommendations, not persistent security modes; historical Light metadata remains readable but isn't offered.

## Setup and shared behavior

Use the pinned project-local install command in [the shared skill](../SKILL.md), or `pi install -l /path/to/picm-factory` for a checkout. `.pi/` holds Pi settings; `.picm/` holds minimal maintainer metadata outside normal routing. Preserve existing setup during normal work.

Modification commands inspect, present a final direction, and await conversational sign-off. They preserve existing files by default; a Git checkpoint is optional advice, never an automatic Git operation. Ordinary tools and agent-followed exclusions aren't an execution sandbox. Secrets and sensitive material must stay out of model-visible context, even with approval.

## Settings and reminders

Explain that `picm_settings` reports or conditionally saves project scan exclusions; `picm_maintenance_policy` reports/configures optional cadence and records completed passes. Both affect only the current project's `.picm/config.json` and preserve unrelated fields.

When due, a reminder offers **Run Now** or **Later**. Run Now starts maintenance planning, not edits or automatic completion; legacy automatic policies also only offer this choice. An unfinished requested repair doesn't clear the reminder. Help describes these tools without calling them; actual configuration or completion follows [settings guidance](settings-guide.md) and sign-off.
