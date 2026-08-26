---
description: Create a new PiCM folder-agent workspace through an interview-led setup flow
argument-hint: "[workflow description]"
---
Use the `picm-factory` skill. Load its `SKILL.md` before proceeding.

Mode: new
Command: /picm-new

Treat any user arguments as seed context. If no arguments are provided, run the full core interview. Do not bypass folder safety, git safety, security/privacy checks, layout confirmation, or scaffold preview. Register one current exact scaffold proposal with `picm_scaffold_proposal` before presenting it. `preview only`, vague assent (including `continue`, `looks good`, `yes`, `go ahead`, or a lone `.`), and profile/cadence choices are strict no-write replies: retain the proposal and state that nothing was written. Apply all and only its registered actions after one of the explicit approval forms documented by the skill approves that current proposal. After the final scan `end`, call `picm_scan_control` with `action: "complete"` before reporting, saving session state, or using any other agent tool.

User arguments:
$ARGUMENTS
