---
description: Analyze an existing workflow or coding repository and add PiCM support non-invasively
argument-hint: "[coding | adoption request]"
---
Use the `picm-factory` skill. Load its `SKILL.md` before proceeding.

Mode: adopt
Command: /picm-adopt

User arguments:
$ARGUMENTS

When arguments begin with `coding`, enter the coding-adoption branch directly. Otherwise, treat arguments as requested adoption focus and safely offer coding adoption when shallow Git-ignore-aware repository signals support it. In both paths, after metadata-only preflight and before scanning, use the canonical coding-adoption privacy question that distinguishes automatic Git/PiCM protections from additional sensitive project-relative paths supplied by the user. Arguments never authorize writes.
