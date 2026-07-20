---
description: Create a new PiCM folder-agent workspace through an interview-led setup flow
argument-hint: "[workflow description]"
---
Use the `picm-factory` skill. Load its `SKILL.md` before proceeding.

Mode: new
Command: /picm-new

Treat any user arguments as seed context. If no arguments are provided, run the full core interview. Do not bypass folder safety, git safety, security/privacy checks, layout confirmation, or scaffold preview.

User arguments:
$ARGUMENTS
