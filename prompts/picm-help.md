---
description: Show PiCM Factory command syntax, arguments, setup, and safety guidance
---
Use the `picm-factory` skill. Load its `SKILL.md` before proceeding.

Mode: help
Command: /picm-help

Start with a compact syntax and argument reference. Explain that bare commands remain valid and optional text follows the command. In interactive Pi, type a space after `/picm-adopt` or `/picm-maintain` to show registered argument completions. Include `/picm-new [workflow description]`, `/picm-adopt [coding | adoption request]`, `/picm-maintain [coding | routing | handoffs | stale-context | security | trace "drift symptom"]`, and `/picm-help`.

Explain command choice in plain language without assuming PiCM/ICM jargon: new or mostly empty workflow → `/picm-new`; existing source-code, agent/workflow, or Claude-style folder → `/picm-adopt`; known repository/monorepo → optional `/picm-adopt coding` shortcut, while regular `/picm-adopt` can offer the same Coding Repository profile; workspace health or drift → `/picm-maintain`; one concrete symptom → `/picm-maintain trace "describe what drifted"`. Include privacy-first protected coding scans, project-local install, `.pi/` versus `.picm/`, and non-destructive adoption defaults. Explain that adoption and maintenance show a complete concise summary preview before every proposed project write, offer selective exact review, require exact review for deletions and safety/permission/approval-boundary/required-command changes, and require separate explicit approval for the current proposal.
