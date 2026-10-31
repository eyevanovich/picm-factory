# Optional named-document reader

Use this convenience when you already know one Markdown path. It combines projected settings, applicable policy checks, and a bounded read in one invocation. It doesn't discover files or create workflow state. Don't require it for ordinary work or ask for another approval merely to use it.

## Request and result

Pi exposes `picm_read_document`. Claude exposes `claude-code/read-document.ts` in the installed plugin. Both accept the same JSON:

```json
{"path":"docs/guide.md","excludedPaths":["private-notes"]}
```

`path` is project-relative, uses `/`, and ends in `.md` (case-insensitive). `excludedPaths` is optional and adds session restrictions; it never overrides stored exclusions. Supply relevant conversation exclusions explicitly: the helper doesn't parse the conversation. Requests are limited to 64 KiB, paths to 1,024 characters and 32 components, and additive exclusions to 100 entries.

Success returns `{ok:true,path,content,bytes}` for that read only. Content is UTF-8 text, at most 64 KiB; `bytes` counts source bytes. Failure returns only `{ok:false,code,message}`, without document, configuration, policy contents, or raw Git diagnostics. Nothing is saved. Cancellation discards the result; it doesn't undo earlier unrelated work.

A separate settings call isn't needed for this invocation: the helper obtains projected settings internally. Success isn't admission for any later read or search, including an evidence-report invocation.

## Supported subset

The workspace must be a canonical absolute root of an ordinary Git worktree with a `.git` directory. This prototype targets macOS/Linux and Git versions providing `git var GIT_CONFIG_SYSTEM` and `GIT_CONFIG_GLOBAL`. The named file must be regular, without symbolic or hard links. No directory inventories or recursive discovery occur.

The helper reads exact applicable root/nested `.gitignore` files, `.git/info/exclude`, and the effective configured or default global excludes file, then uses native `git check-ignore --no-index`. Git configuration precedence, ignore negation, and tracked-but-ignored files use Git's semantics. Parent `.gitignore` files above the worktree root don't apply. Confirmed absence of an optional policy is allowed; denied, unresolved, nonregular, or oversized sources fail the invocation. Explicit policy/config-source reads are capped at 256 KiB each and 1 MiB combined.

Stored and additive exclusions use conservative Unicode-normalized, case-insensitive path-prefix matching. Metadata paths and common sensitive names (such as `.env`, credential/secret/private directories or files, SSH/cloud configuration, key files, passwords, and tokens) are refused. These lexical checks don't classify content or establish that an otherwise eligible document is safe to disclose. Keep applying the shared sensitive-content boundary.

Unsupported forms return a failure for this call:

- Non-Git roots, linked worktrees, nested repositories/submodules along the named path, and worktree-specific configuration.
- Configuration includes (including inactive `includeIf`), `core.worktree`, linked existing config/policy sources or their parent components, ambiguous/control-character configuration paths, and using the named document itself as a config/policy source.
- Git config/repository-location environment overrides, a configured `RIPGREP_CONFIG_PATH`, and relative/missing home locations. Native HOME/XDG locations are supported.
- Existing `.ignore` or `.rgignore` files along the named directory chain or the workspace's ancestors. These aren't interpreted as Git policy or silently discarded.

## Trust boundary and failure handling

Native Git configuration parsing is trusted bootstrap activity. It can follow includes or links, access a file named as configuration (even the named document), or consume configuration input before the helper detects and rejects that shape. Each subprocess has a five-second timeout, cancellation, and a 1 MiB output bound; these don't bound configuration input reads or memory use. The existing projected-settings store also retains its own internal read behavior. This isn't a sandbox for configuration reads.

The helper's own document open happens only after successful policy checks. Policy and document metadata are revalidated where practical, but native Git reopens policy sources and filesystem operations aren't atomic. Carefully timed ancestor, configuration, or policy changes can escape these checks. Native host startup loading and other tools are outside this operation.

An unsupported helper case isn't a workflow-wide gate. You can use ordinary tools when the existing scope and privacy checks can still be satisfied; those tools don't inherit this helper's checks. Don't bypass a real exclusion, an unreadable policy, or failed projected settings. For `READ_SETTINGS_FAILED`, report only the sanitized failure and follow the shared bounded settings-failure response. For uncertain policy, ask rather than opening uncertain content. Don't repair permissions, delete configuration, or publish diagnostics merely to make this helper succeed.
