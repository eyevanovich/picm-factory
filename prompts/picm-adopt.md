---
description: Analyze an existing workflow or coding repository and add PiCM support non-invasively
argument-hint: "[coding | notes]"
---
Use the `picm-factory` skill. Load its `SKILL.md` before proceeding.

Mode: adopt
Command: /picm-adopt

User arguments:
$ARGUMENTS

When arguments begin with `coding`, enter the coding-adoption branch directly. Otherwise, safely offer it when shallow Git-ignore-aware repository signals support it.
