# PiCM Factory for Claude Code

The build embeds the common contract, Claude instructions, and selected primary procedure into each command's `SKILL.md`. Supporting references and templates remain separate and load only when needed. All behavioral text comes from canonical shared or host sources, not hand-maintained copies.

This adapter is bundled with shared PiCM guidance, templates, and a dependency-free settings helper. Node 24 or newer is required for settings operations. Use Claude Code 2.1.277 or newer with Project instructions configured for native `AGENTS.md` loading; older versions aren't supported for automatic instruction loading. After upgrading, start a new session if **Project instructions** is missing from `/config`. Verify the loaded `AGENTS.md` in `/memory`; manual file inspection by a command isn't proof of automatic loading.

`AGENTS.md` is canonical at root and nested boundaries. Adoption proposes migration if only `CLAUDE.md` exists. When both exist, it proposes reconciliation without discarding instructions: legacy-file precedence can prevent native loading until the agreed migration is complete. No compatibility shim is generated; migration edits wait for sign-off.

## Build and load

From the repository root:

```bash
npm ci
npm run build:claude
claude --plugin-dir /absolute/path/to/picm-factory/dist/claude-code
```

Start Claude from the workspace you want to work on, not from the bundle directory. Use an absolute plugin path.

Run `/picm-factory:help`, then `/picm-factory:new` or `/picm-factory:adopt coding` as appropriate. Other commands are `/picm-factory:maintain` and `/picm-factory:optimize`. These commands require explicit invocation; ordinary PiCM discussion doesn't launch a workflow.

Only load the generated bundle. The source `claude-code/` directory isn't independently installable.

## Release bundles

Releases produced by the updated release workflow attach `picm-claude-code-VERSION.zip`. Older releases have no Claude bundle.

Extract the archive into a stable trusted directory, then load that directory with `claude --plugin-dir /absolute/path/to/extracted-plugin`. The extracted directory must contain `.claude-plugin/plugin.json`, `skills/`, and `shared/`. This flag loads the plugin for that session; it doesn't install a persistent marketplace entry or update it automatically. To update, extract a new release into a new directory and restart Claude using its path.

For interactive validation, follow the [Claude QA guide](https://github.com/eyevanovich/picm-factory/blob/main/docs/claude-code-qa.md) on an explicitly approved disposable target. Automated package checks aren't conversational QA.

There are no startup reminder hooks in this version. Privacy settings and cadence operations are available through the helper described in the bundled host instructions. Modification commands inspect first and wait for conversational sign-off before editing. Host permissions and privacy exclusions are not a universal sandbox.
