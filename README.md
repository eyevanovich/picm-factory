# PiCM Factory

PiCM Factory helps create, adopt, maintain, and improve folder-agent workspaces and agent-readable coding repositories. It supports [Pi Coding Agent](https://pi.dev) through an npm package and Claude Code through a self-contained plugin bundle.

## Quick start with Pi

Install Pi once:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

For a project-local install, I highly recommend pinning this version so behavior stays consistent and you get to decide when to update:

```bash
mkdir my-workflow
cd my-workflow
pi install -l npm:@eyevanovich/picm-factory@0.5.2 # remove version to always install latest
pi
```

Then run:

```text
/picm-new
```

For a global install stored in your user settings, drop the `-l`:

```bash
pi install npm:@eyevanovich/picm-factory@0.5.2 # remove version to always install latest
```

A project-level entry for the same package can override this global install. An unpinned install follows npm's `latest` and can be refreshed easily with `pi update --extensions`.

---

To add PiCM Factory to an existing project, install it from that project's root and run `/picm-adopt`. For local development, replace the npm specifier with `/path/to/picm-factory`.

## Claude Code

From a checkout, use Node 24 or newer:

```bash
npm ci
npm run build:claude
```

Start Claude from your target workspace with `claude --plugin-dir /absolute/path/to/picm-factory/dist/claude-code`, then run `/picm-factory:help`. Claude commands are `/picm-factory:new`, `/picm-factory:adopt`, `/picm-factory:maintain`, `/picm-factory:optimize`, and `/picm-factory:help`.

Releases produced by the updated workflow attach a self-contained `picm-claude-code-VERSION.zip`. Extract it into a stable trusted location and pass that directory to `--plugin-dir`. This is session-local loading, not marketplace installation or automatic updating. Older releases have no Claude bundle. See the [Claude adapter guide](https://github.com/eyevanovich/picm-factory/blob/main/claude-code/README.md).

Both hosts share the same guidance and templates. Each Claude command skill contains the common contract, host instructions, and its primary procedure; Pi assembles the same sections directly when its command runs. Detailed branch references stay on demand, without a shared skill router. Claude uses conversational choices and a Node 24 settings helper; startup reminder offers remain Pi-only. Both hosts use `AGENTS.md` for root and nested instructions, without import shims. Claude Code requires 2.1.277 or newer with native `AGENTS.md` loading enabled. Adoption proposes migration when only legacy instructions exist and resolves conflicts when both files exist; it never silently replaces either.

## Choose a command

You do not need to know PiCM or ICM terminology. The table uses Pi command names; Claude's equivalents are listed above.

| Command | Use it when | What it does |
| --- | --- | --- |
| `/picm-new [workflow description]` | You are starting a workflow in a new or mostly empty folder. | Interviews you, presents a final direction, then creates a minimal workspace after conversational sign-off. |
| `/picm-adopt [coding \| adoption request]` | The folder already contains source code, agent instructions, workflows, stages, or reference material. Add `coding` when you already know it is a coding repository or monorepo. | Inspects first and proposes additive PiCM support without converting the project. `coding` only skips initial classification; regular `/picm-adopt` can offer the same Coding Repository profile. |
| `/picm-maintain [strict \| balanced] [focus or session request]` | Guidance is stale, conflicting, or drifting from intended behavior. | Keeps guidance aligned and current through health checks and agreed repairs. `trace` investigates one symptom; session retrospectives are optional. |
| `/picm-optimize [focus or session request]` | You want better agent behavior or a more efficient workflow. | Improves guidance and context/token use, and identifies workflow-tooling opportunities. Direct edits remain documentation-only; session retrospectives are optional. |
| `/picm-help` | You want command help. | Explains syntax, examples, installation, and safety behavior. |

Arguments are optional conversational input, not required flags; bare commands remain valid. In interactive Pi, type a space after `/picm-adopt` or `/picm-maintain` to see argument completions.

Examples:

```text
/picm-new Create a three-stage publishing workflow
/picm-adopt coding
/picm-maintain routing
/picm-maintain trace "final output drifted from the approved source"
/picm-maintain use the past five sessions
/picm-optimize
/picm-optimize use the past five sessions
```

## Maintenance depth and reminders

A later interactive `/picm-maintain` run lets you choose a one-run depth with Strict preselected. `/picm-maintain strict` and `/picm-maintain balanced` bypass the selector; a bare non-TUI command defaults to Strict. Legacy Light metadata is preserved for compatibility but is not an available maintenance mode.

- Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.
- Balanced: representative coverage of major boundaries and one coding path; lower cost.

PiCM Factory can also record optional maintenance reminders in `.picm/config.json`. A due reminder offers an ordinary maintenance request in an interactive Pi session; it never launches work or edits autonomously, including while Pi is closed.

## Safety model

PiCM Factory is conservative by design:

- **Privacy before reads.** Agents select eligible paths using Git ignores, configured/session exclusions, and known sensitive boundaries before reading or searching content. Secrets and sensitive material must stay out of model-visible reads, tool output, consultation, memory, and reusable context—even with approval. Uncertain sources need already-sanitized input; sanitizing after disclosure is too late. These are agent-followed rules, not a claim that PiCM or host tools sandbox every read.
- **Non-destructive adoption.** Existing structure is preserved unless the signed-off direction changes it.
- **Final direction before edits.** New, adopt, maintain, and optimize inspect first, state a concise direction and material effects, then wait for conversational sign-off. Optional diffs or file review can clarify consequential changes; routine implementation within the agreed direction does not require repeated approval.
- **Checkpoint advice, not a gate.** A user-created Git checkpoint can help with substantial existing-content changes. PiCM never initializes, stages, commits, resets, cleans, or restores Git for you.
- **Behavior and efficiency through guidance.** Maintain keeps guidance aligned and current; optimize improves the approach, including unwanted behavior and unnecessary context/token or tool use. Optimization edits documentation only, records explicitly agreed behavioral corrections, and preserves required safeguards. Neither command implicitly implements or executes integrations; tooling changes are separate follow-ups. No semantic equivalence or unmeasured token savings are claimed.
- **Optional session evidence.** Both maintain and optimize offer documentation only, this session, recent sessions, or both. When requested, the agent locates available local history for the current workspace, reports coverage, and adapts to the work represented—not just coding. Session access still respects privacy boundaries. Maintenance-integrated optimization reuses the selected evidence and findings.

`.pi/` configures project-local Pi resources. `.picm/` holds small PiCM metadata and reports; it is maintainer-only context, not normal workflow context.

## Learn more

- [Changelog](https://github.com/eyevanovich/picm-factory/blob/main/CHANGELOG.md)
- [Methodology references](https://github.com/eyevanovich/picm-factory/blob/main/docs/references.md)
- [Contributing](https://github.com/eyevanovich/picm-factory/blob/main/CONTRIBUTING.md)
- [Release guide](https://github.com/eyevanovich/picm-factory/blob/main/docs/releasing.md)
- [GitHub Issues](https://github.com/eyevanovich/picm-factory/issues)

## Acknowledgments

PiCM Factory independently adapts ideas from Jake Van Clief and David McDermott's [*Interpretable Context Methodology*](https://arxiv.org/abs/2603.16021), the [Clief Notes community](https://www.skool.com/cliefnotes), and [`RinDig/icm-architect`](https://github.com/RinDig/icm-architect). It runs on [Pi Coding Agent](https://github.com/earendil-works/pi) by Mario Zechner.

The optional session-retrospective approach in maintain and optimize is inspired by [Matt Pocock’s retro skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/retro/SKILL.md), adapted for PiCM’s documentation-only scope.

## Development

Agent integrations live in `pi/` and `claude-code/`; canonical guidance, templates, and portable runtime live in `shared/`. The build assembles self-contained Claude command skills and copies their supporting resources into ignored `dist/claude-code/`. Generated copies aren't edited or committed. The root package remains the Pi npm installation entry point.

```bash
npm run check
```

See [CONTRIBUTING.md](https://github.com/eyevanovich/picm-factory/blob/main/CONTRIBUTING.md) for development and pull-request guidance.
