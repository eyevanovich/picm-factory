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

At maintenance intake, ask whether to include agent-document optimization in this pass. Default to No. No runs standard maintenance unchanged. If Yes, load `references/optimization-guide.md` and follow it as the single source for the documentation-only scope, preservation ledger, proposal selection, privacy boundaries, no-worthwhile-change result, and shared summary/selective-exact preview; do not duplicate or weaken its logic.

Before every proposal batch, follow the skill's shipped summary-preview and optional-diff-review protocol; prepare exact create, modify, delete, and linked-move operations with `picm_proposal_batch` during an active protected scan, then accept direct explicit approval of the current summary before its `apply`. Vague assent, cancellation, and revision are no-write; never use agent Bash. In an interactive TUI privacy bootstrap, before calling `picm_scan_control` privacy with `persist: true`, present and obtain acceptance of the complete concise `.picm/config.json` summary, explain the safety/configuration impact, and use the tool's exact TUI patch confirmation as the separate runtime write confirmation.
