# QA Runner

## Purpose
Run interactive PiCM Factory QA in visible Pi/Zellij panes, especially smoke tests for `/picm-new`, `/picm-adopt`, `/picm-maintain`, and `/picm-optimize` that may ask clarifying or approval questions.

## Inputs
- Fixture or throwaway workspace path.
- Command under test, usually one of `/picm-new`, `/picm-adopt`, `/picm-maintain`, `/picm-maintain trace "..."`, or `/picm-optimize`.
- Expected behavior from `docs/layout-fixture-qa.md` or `docs/picm-new-scenarios.md`.

## Process
1. Create a disposable target under `/tmp` and copy the fixture or set up the scenario.
2. Install this package project-locally in the target:
   ```bash
   pi install -l /path/to/picm-factory
   ```
3. Start `pi` in a visible Zellij pane.
4. Wait for the Pi startup screen before sending any text.
5. When sending **any** text to the Pi chat from a Zellij tool, submit one pane at a time:
   - send the exact text, for example `/picm-maintain` or `yes, preview the edits`
   - capture the pane and confirm that the exact text is visible in the editor
   - only then send the explicit `Enter` key in a separate action
   - capture the pane again and confirm that the command left the editor and Pi started responding; if it remains in the editor, send `Enter` again and recheck

   Do **not** batch text and `Enter` actions, or mix either with another pane's input. Do **not** rely on embedding `\n` in the text payload; it can leave the text sitting in the editor without submitting. This applies to slash commands, answers to prompts, confirmations, and ordinary chat messages.
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
- All Pi chat input in Zellij is submitted one pane at a time: exact text is visibly present, a separate explicit `Enter` is sent, and the pane confirms Pi received it. Never batch text/`Enter` actions across panes or use an embedded newline.
- Test workspaces are disposable or git-protected before writes.
- Security/private-data checks happen before any context-file modification.
- `.picm/` remains maintainer-only context and is not routed into normal workflow tasks.
