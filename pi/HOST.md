# Pi host adapter

Apply these host rules alongside the included shared contract and selected procedure.

## Host operations

- Commands: `/picm-new`, `/picm-adopt`, `/picm-maintain`, `/picm-optimize`, and `/picm-help`.
- Shared `settings` operations use `picm_settings`; shared `maintenance` operations use `picm_maintenance_policy`. Pass the shared guide's action and fields unchanged. Status returns only projected values.
- For useful choices, use `picm_decision` or conversation. A selection isn't modification approval.
- Maintenance depth comes from command dispatch; interactive Pi offers Strict or Balanced, and non-TUI defaults to Strict. Preserve stored presets.

Pi loads root/nested `AGENTS.md`. Route to local `CONTEXT.md` through visible instruction files; don't duplicate their contents. Preserve existing `.pi/` settings.

Pi's optional due reminder offers Run Now or Later in an eligible interactive session. It never starts edits or clears an unfinished pass.

For help/setup only, the release-managed project-local install example is `pi install -l npm:@eyevanovich/picm-factory@0.5.2`. For a checkout, use `pi install -l /path/to/picm-factory` at the repository root.
