# Settings and reminders

Use before changing privacy exclusions or cadence, or recording a completed maintenance/optimization pass. Apply the shared scope/privacy and sign-off contract first. These tools affect only the current project's `.picm/config.json`; preserve unrelated fields and report conflicts or partial effects.

## Privacy exclusions

Use `picm_settings` `status` to read projected exclusions without exposing opaque configuration. Persist agreed exclusions with `set-exclusions`, passing the last observed `expectedExcludedPaths`. Session-only exclusions remain in conversation. An exclusion update grants no read/write authority and doesn't protect commits; recommend exact `.gitignore` patterns separately when useful.

## Optional cadence

A due reminder offers Run Now or Later. Run Now starts ordinary maintenance planning, not edits or completion. Even legacy `automatic` policies only offer work; nothing runs while Pi is closed or outside an eligible interactive session.

Use `picm_maintenance_policy` `status` to inspect cadence. After sign-off, `configure` uses the last observed `expectedMaintenance`; omit it only when no policy was observed. Include the chosen manual mode or interval and configuration effect in the final direction. For a new scaffold, configure only after its config exists; a calculated policy isn't a saved policy.

Use `complete` only after the agreed maintenance/optimization repair and validation—or an agreed inspection-only pass—finish. A selected unfinished repair must not clear the reminder. Check the tool's result; cancellation, a saved report, or a closed conversation doesn't establish completion.
