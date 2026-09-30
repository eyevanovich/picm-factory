# QA Runner

## Purpose
Run interactive PiCM Factory QA in visible Pi/Herdr panes, especially smoke tests for `/picm-new`, `/picm-adopt`, `/picm-maintain`, and `/picm-optimize` that may ask clarifying questions and require conversational sign-off before edits.

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
3. Start `pi` in a visible Herdr pane.
4. Wait for the Pi startup screen before sending any text.
5. When sending **any** text to the Pi chat through Herdr, target one pane at a time:
   - use `herdr_send_keys` to send the exact text only, for example `/picm-maintain` or `yes, preview the edits`
   - capture the pane with `herdr_pane_output` and confirm that the exact text is visible in the editor
   - only then use `herdr_send_keys` to send the explicit `Enter` key in a separate action
   - capture the pane again and confirm that the command left the editor and Pi started responding; if it remains in the editor, send `Enter` again and recheck

   Keep text and `Enter` as separate actions, and target no other pane until the submission is confirmed. Send literal text without an embedded newline. This applies to slash commands, answers to prompts, confirmations, and ordinary chat messages.
6. Capture the available pane output with `herdr_pane_output` when the report finishes.
7. Confirm that the command did not write files until the test gave conversational sign-off on the concise final direction. Verify that routine aligned edits do not trigger repeated approval requests.
8. Stop or close the test pane when done.

## Output
Record concise QA notes in the relevant GitHub Issue and, when useful, in `docs/layout-fixture-qa.md` or another scenario doc:

- fixture/scenario path
- command run
- whether the report completed
- important Pass/Warning/Suggestion behavior
- final direction and conversational sign-off, if edits were tested
- whether files were changed and checks run
- misses or calibration notes

## Verify
- Interactive commands run in visible panes, not headless bash-only sessions.
- All Pi chat input in Herdr is submitted through the intended pane one message at a time: exact text is visibly present, a separate explicit `Enter` is sent, and the pane confirms Pi received it. Use literal text without an embedded newline.
- Test workspaces are explicitly approved disposable targets before writes; a user-created Git checkpoint is useful advice, not a prerequisite.
- The agent honors security/private-data exclusions before any context-file modification; record observed behavior without claiming host tools provide a privacy sandbox.
- Due reminders only offer a maintenance request. They must not self-launch work, edits, or cadence completion.
- `.picm/` remains maintainer-only context and is not routed into normal workflow tasks.
