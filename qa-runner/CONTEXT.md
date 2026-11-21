# QA Runner

## Purpose
Run PiCM smoke tests in fresh, visible Pi or Claude Code terminal blocks in Rex. Invoke the actual slash command and exercise its prompts and conversational sign-off.

## Inputs
- Fixture or throwaway workspace path.
- Host, artifact, model, and slash command (for example, Pi `/picm-adopt coding` or Claude Code `/picm-factory:adopt coding`).
- Expected behavior from [the fixture scenarios](../docs/layout-fixture-qa.md), [the new-workspace scenarios](../docs/picm-new-scenarios.md), or [the Claude Code QA guide](../docs/claude-code-qa.md).

## Process
1. Agree on disposable targets under `/tmp` and allowed writes before setup. Give each run a fresh fixture copy and an unused session ID; use a UUID for Claude Code. For a comparison, freeze the inputs and keep model, effort, and permission mode fixed within each host. Use the generated or extracted artifacts, not Claude's source adapter.
2. Reuse the hosts' existing logins when approved. A fresh conversation doesn't need a fresh config directory. Don't redirect `PI_CODING_AGENT_DIR` or `CLAUDE_CONFIG_DIR` unless the test calls for isolated authentication. Agree on any native transcript, trust, and cache writes outside the scratch root. Don't copy credentials or change global settings.
3. Find the intended Rex session with `rex whoami --json` or `rex ls --json` and set `QA_SESSION` to its ID. To compare extracted artifacts, set `PI_EXTENSION` to the extracted PiCM extension file and `PI_SESSIONS` to an existing directory in scratch:
   ```sh
   rex window new -s "$QA_SESSION" picm-qa -c "$PI_TARGET" --keep-open --json -- \
     pi --session-id "$PI_SESSION_ID" --session-dir "$PI_SESSIONS" \
     --no-extensions --no-skills --no-prompt-templates --no-themes --no-mcp \
     --extension "$PI_EXTENSION"
   ```
   Save `.window_id` as `QA_WINDOW` and `.block_ids[0]` as `PI_BLOCK`. If the scenario tests normal Pi package discovery instead, install project-locally with `pi install -l /path/to/picm-factory` and don't disable discovery.

   Add Claude Code beside Pi. Set `CLAUDE_PLUGIN` to the bundle root, `CLAUDE_TMP` to an existing directory in scratch, and `CLAUDE_PERMISSION_MODE` to the agreed native mode (`auto` for the coding-onboarding comparison):
   ```sh
   rex split -s "$QA_SESSION" -b "$PI_BLOCK" --split right --label 'Claude Code' \
     -c "$CLAUDE_TARGET" --keep-open --json -- \
     env CLAUDE_CODE_TMPDIR="$CLAUDE_TMP" \
     claude --session-id "$CLAUDE_SESSION_ID" --plugin-dir "$CLAUDE_PLUGIN" \
     --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
     --permission-mode "$CLAUDE_PERMISSION_MODE"
   ```
   Save the split's `.block_ids[0]` as `CLAUDE_BLOCK`, not `.anchor_id`. For Claude-only QA, use the same host command with `rex window new`. Add the agreed model and effort flags to each host command. On macOS, `TMPDIR` alone doesn't redirect Claude Code's internal temp directory.
4. Set `QA_BLOCK` to the recorded block for the host and capture it with `rex capture -s "$QA_SESSION" -b "$QA_BLOCK" --trim`. Verify the selected PiCM artifact is the only external add-on active; record any allowed built-ins and context sources. In Claude, check the Installed view in `/plugin` before dispatch. Don't use safe mode for this comparison: it can disable PiCM too. Record the model that actually served a response, not just the startup label. Stop on an auth or model blocker; don't repair auth or substitute a model.
5. Submit one message at a time to that block:
   - Type the exact text without a newline: `rex send -s "$QA_SESSION" -b "$QA_BLOCK" '/picm-maintain'`.
   - Capture the block and confirm the text is in the editor.
   - In a separate action, run `rex send-key -s "$QA_SESSION" -b "$QA_BLOCK" enter`.
   - Capture again. Confirm the editor cleared and the host received the message. If autocomplete consumed Enter and the text is still in the editor, press Enter again and recheck.

   Use this sequence for slash commands, prompt answers, and confirmations. Don't switch targets mid-submission.
6. Save the pre-sign-off and final fixture snapshots. Review the ordered tool trace too: did the agent read applicable ignore rules before listing directory children or opening content, and did writes follow sign-off? Check final claims against observed actions. A caveat doesn't make an unverified native load a pass. Native trust or auto mode doesn't replace conversational sign-off. Keep interrupted attempts and initial failures; don't silently replay them.
7. Leave the QA tab visible if the user wants to inspect it. Otherwise, close only the tab you created: `rex window close -s "$QA_SESSION" "$QA_WINDOW"`.

## Delegating with pi-rexagents

When the user approves delegation, [pi-rexagents](https://github.com/sutekimeppou/pi-rexagents) can run a scoped QA worker in Rex. Give it the fixture path, task, and write limits. Use workers for evidence review or to drive a separate test tab with the procedure above. A worker assignment or steering message isn't a slash-command dispatch in the test Pi session and doesn't grant sign-off for edits.

## Output
Record concise QA notes locally. Post to a GitHub issue only if publication is approved, and share findings rather than raw session traces:

- fixture/scenario path
- command run
- whether the report completed
- important Pass/Warning/Suggestion behavior
- final direction and conversational sign-off, if edits were tested
- whether files were changed and checks run
- misses or calibration notes

## Verify
- Interactive commands run in visible panes, not headless bash-only sessions.
- Rex captures show the exact text before Enter and confirm that the intended CLI received it afterward.
- Test workspaces are explicitly approved disposable targets before writes; a user-created Git checkpoint is useful advice, not a prerequisite.
- The agent honors security/private-data exclusions before any context-file modification; record observed behavior without claiming host tools provide a privacy sandbox.
- Due reminders only offer a maintenance request. They must not self-launch work, edits, or cadence completion.
- `.picm/` remains maintainer-only context and is not routed into normal workflow tasks.
