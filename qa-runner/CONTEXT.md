# QA Runner

## Purpose
Run `/picm-*` smoke tests in a visible Rex tab with a fresh Pi session. Test the actual slash command, including any prompts and conversational sign-off, rather than asking an agent to imitate the workflow.

## Inputs
- Fixture or throwaway workspace path.
- Command under test, usually one of `/picm-new`, `/picm-adopt`, `/picm-maintain`, `/picm-maintain trace "..."`, or `/picm-optimize`.
- Expected behavior from `docs/layout-fixture-qa.md` or `docs/picm-new-scenarios.md`.

## Process
1. Get explicit approval for a fresh disposable target under `/tmp`. Copy the fixture or set up the scenario there, then run `pi install -l /path/to/picm-factory` from the target.
2. Set `QA_SESSION` to the intended Rex session ID. Use `rex whoami --json` to identify your session, or `rex ls --json` to find a different one. Open a dedicated tab:
   ```sh
   rex window new -s "$QA_SESSION" picm-qa -c "$TARGET" --json -- pi
   ```
   Save the returned `.window_id` as `QA_WINDOW` and `.block_ids[0]` as `QA_BLOCK`. Never target the pane the runner itself is using.
3. Use `rex capture -s "$QA_SESSION" -b "$QA_BLOCK" --trim` to wait for the Pi startup screen. Confirm the intended extension loaded before sending input.
4. Submit one message at a time to that block:
   - Type the exact text without a newline: `rex send -s "$QA_SESSION" -b "$QA_BLOCK" '/picm-maintain'`.
   - Capture the block and confirm the text is in the editor.
   - In a separate action, run `rex send-key -s "$QA_SESSION" -b "$QA_BLOCK" enter`.
   - Capture again. Confirm the editor cleared and Pi received the message. If autocomplete consumed Enter and the text is still in the editor, press Enter again and recheck.

   Use this sequence for slash commands, prompt answers, and confirmations. Don't switch targets mid-submission.
5. Capture the final report. Confirm the command made no edits before conversational sign-off on the final direction. Check that routine edits within that direction don't trigger repeated approval requests.
6. Close only the tab you created: `rex window close -s "$QA_SESSION" "$QA_WINDOW"`.

## Delegating with pi-rexagents

When the user approves delegation, [pi-rexagents](https://github.com/sutekimeppou/pi-rexagents) can run a scoped QA worker in Rex. Give it the fixture path, task, and write limits. Use workers for evidence review or to drive a separate test tab with the procedure above. A worker assignment or steering message isn't a slash-command dispatch in the test Pi session and doesn't grant sign-off for edits.

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
- Rex captures show the exact text before Enter and confirm that Pi received it afterward.
- Test workspaces are explicitly approved disposable targets before writes; a user-created Git checkpoint is useful advice, not a prerequisite.
- The agent honors security/private-data exclusions before any context-file modification; record observed behavior without claiming host tools provide a privacy sandbox.
- Due reminders only offer a maintenance request. They must not self-launch work, edits, or cadence completion.
- `.picm/` remains maintainer-only context and is not routed into normal workflow tasks.
