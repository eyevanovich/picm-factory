# Pi host adapter

Apply these host rules alongside the included shared contract and selected procedure.

## Optimize session history

Only when optimize includes previous sessions, locate local history using available host metadata. Pi exposes `PI_SESSION_FILE` and `PI_SESSION_ID` for the current session; ephemeral sessions may have no file. Its containing directory is a useful starting point, not proof that every file belongs to this workspace. Default history is `~/.pi/agent/sessions/`, grouped by working directory. Storage can be overridden by `--session-dir`, `PI_CODING_AGENT_SESSION_DIR`, or the `sessionDir` setting (CLI takes precedence). Don't dump environment variables or host settings to discover overrides; use available path metadata or ask for the location if unresolved.

Pi JSONL headers contain `type: "session"`, `id`, `timestamp`, `cwd`, and optionally `parentSession`. Verify the workspace using minimal header metadata; use session-file modification times for recent activity ordering and disclose that basis. Exclude the current ID/file for previous-session requests. Entries form a tree through `id`/`parentId`; distinguish branches, compaction summaries, and copied ancestry rather than treating every line as a linear conversation or independent recurrence. Apply the selected procedure's history scope and privacy rules before reads.

## Host operations

- Commands: `/picm-new`, `/picm-adopt`, `/picm-maintain`, `/picm-optimize`, and `/picm-help`.
- Shared `settings` operations use `picm_settings`; shared `maintenance` operations use `picm_maintenance_policy`. Pass the shared guide's action and fields unchanged. Status returns only projected values.
- For useful choices, use `picm_decision` or conversation. A selection isn't modification approval.
- Maintenance depth comes from command dispatch; interactive Pi offers Strict or Balanced, and non-TUI defaults to Strict. Preserve stored presets.

Pi loads root/nested `AGENTS.md`. Route to local `CONTEXT.md` through visible instruction files; don't duplicate their contents. Preserve existing `.pi/` settings.

Pi's optional due reminder offers Run Now or Later in an eligible interactive session. It never starts edits or clears an unfinished pass.

For help/setup only, the release-managed project-local install example is `pi install -l npm:@eyevanovich/picm-factory@0.5.2`. For a checkout, use `pi install -l /path/to/picm-factory` at the repository root.
