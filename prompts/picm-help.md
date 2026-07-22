---
description: Show PiCM Factory setup and command guidance
---
Use the `picm-factory` skill. Load its `SKILL.md` before proceeding.

Mode: help
Command: /picm-help

Explain command choice in plain language without assuming PiCM/ICM jargon: new or mostly empty workflow → `/picm-new`; existing source-code, agent/workflow, or Claude-style folder → `/picm-adopt`; known repository/monorepo → optional `/picm-adopt coding` shortcut, while regular `/picm-adopt` can offer the same Coding Repository profile; workspace health or drift → `/picm-maintain`; one concrete symptom → `/picm-maintain trace "describe what drifted"`. Include Git-ignore-safe coding scans, project-local install, `.pi/` versus `.picm/`, preview-before-write, and non-destructive adoption defaults.
