---
description: Check and improve a PiCM/ICM workspace using the maintenance rubric
argument-hint: '[strict | balanced | coding | trace "drift symptom" | routing | handoffs | stale-context | security]'
---
Use the `picm-factory` skill. Load its `SKILL.md` before proceeding.

Mode: maintain
Command: /picm-maintain

User arguments:
$ARGUMENTS

For an interactive run, the extension supplies a one-run Strict or Balanced depth after selection or explicit argument parsing. Apply it only to this run and never mutate `capabilities.codebaseMap.maintenancePreset`. Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost. Balanced: representative coverage of major boundaries and one coding path; lower cost.

Before every proposed project write, follow the skill's shipped summary-preview and exact-review protocol; require a separate explicit approval for the current proposal. In an interactive TUI privacy bootstrap, before calling `picm_scan_control` privacy with `persist: true`, present and obtain acceptance of the complete concise `.picm/config.json` summary, mark the safety/configuration change as mandatory exact review, and use the tool's exact TUI patch confirmation as the mandatory exact review and separate write approval.
