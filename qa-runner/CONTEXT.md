# QA Runner

## Purpose
Run interactive PiCM Factory QA in visible Pi/Zellij panes, especially smoke tests for `/picm-new`, `/picm-adopt`, and `/picm-maintain` that may ask clarifying or approval questions.

## Inputs
- Fixture or throwaway workspace path.
- Command under test, usually one of `/picm-new`, `/picm-adopt`, `/picm-maintain`, or `/picm-maintain trace "..."`.
- Expected behavior from `docs/layout-fixture-qa.md` or `docs/picm-new-scenarios.md`.

## Process
1. Create a disposable target under `/tmp` and copy the fixture or set up the scenario.
2. Install this package project-locally in the target:
   ```bash
   pi install -l /path/to/picm-factory
   ```
3. Start `pi` in a visible Zellij pane.
4. Wait for the Pi startup screen before sending any text.
5. When sending **any** text to the Pi chat from a Zellij tool, send the text and the carriage return as separate actions:
   - first send the exact text, for example `/picm-maintain` or `yes, preview the edits`
   - then send the explicit `Enter` key

   Do **not** rely on embedding `\n` in the text payload; it can leave the text sitting in the editor without submitting. This applies to slash commands, answers to prompts, confirmations, and ordinary chat messages.
6. Capture the pane output with full scrollback when the report finishes.
7. Confirm that the command did not write files unless the test explicitly approved a previewed change.
8. Stop or close the test pane when done.

## Output
Record concise QA notes in the relevant GitHub Issue and, when useful, in `docs/layout-fixture-qa.md` or another scenario doc:

- fixture/scenario path
- command run
- whether the report completed
- important Pass/Warning/Suggestion behavior
- whether files were changed
- misses or calibration notes

## Verify
- Interactive commands run in visible panes, not headless bash-only sessions.
- All Pi chat input in Zellij is submitted with explicit `Enter` after text input, not embedded newline text.
- Test workspaces are disposable or git-protected before writes.
- Security/private-data checks happen before any context-file modification.
- `.picm/` remains maintainer-only context and is not routed into normal workflow tasks.
