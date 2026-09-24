# PiCM Factory

PiCM Factory is a project-local [Pi Coding Agent](https://pi.dev) package for creating, adopting, maintaining, and optimizing folder-agent workspaces and agent-readable coding repositories.

## Quick start

Install Pi once:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

For a project-local install, I highly recommend pinning this version so behavior stays consistent and you get to decide when to update:

```bash
mkdir my-workflow
cd my-workflow
pi install -l npm:@eyevanovich/picm-factory@0.4.0 # remove version to always install latest
pi
```

Then run:

```text
/picm-new
```

For a global install stored in your user settings, drop the `-l`:

```bash
pi install npm:@eyevanovich/picm-factory@0.3.1 # remove version to always install latest
```

A project-level entry for the same package can override this global install. An unpinned install follows npm's `latest` and can be refreshed easily with `pi update --extensions`.

---

To add PiCM Factory to an existing project, install it from that project's root and run `/picm-adopt`. For local development, replace the npm specifier with `/path/to/picm-factory`.

## Choose a command

You do not need to know PiCM or ICM terminology. PiCM Factory gives Pi five commands for working on folder-agent and coding projects.

| Command | Use it when | What it does |
| --- | --- | --- |
| `/picm-new [workflow description]` | You are starting a workflow in a new or mostly empty folder. | Interviews you, previews a minimal workspace, and writes only after approval. |
| `/picm-adopt [coding \| adoption request]` | The folder already contains source code, agent instructions, workflows, stages, or reference material. Add `coding` when you already know it is a coding repository or monorepo. | Inspects first and proposes additive PiCM support without converting the project. `coding` only skips initial classification; regular `/picm-adopt` can offer the same Coding Repository profile. |
| `/picm-maintain [strict \| balanced] [coding \| routing \| handoffs \| stale-context \| security \| trace "drift symptom"]` | You want a health check, focused routing/context check, or drift investigation. | Runs a heuristic health check; general reports use Pass, Warning, and Suggestion findings. `trace` investigates one concrete symptom and reports likely causes with confidence. |
| `/picm-optimize` | Agent-facing instructions or context are repetitive, diffuse, or hard to navigate. | Outcome-preserving optimization of agent-facing documentation only. |
| `/picm-help` | You want command help. | Explains syntax, examples, installation, and safety behavior. |

Arguments are optional conversational input, not required flags; bare commands remain valid. Full syntax is `/picm-adopt [coding | adoption request]` and `/picm-maintain [strict | balanced] [coding | routing | handoffs | stale-context | security | trace "drift symptom"]`. In interactive Pi, type a space after `/picm-adopt` or `/picm-maintain` to see argument completions.

Examples:

```text
/picm-new Create a three-stage publishing workflow
/picm-adopt coding
/picm-maintain routing
/picm-maintain trace "final output drifted from the approved source"
/picm-optimize
```

## Maintenance depth and reminders

A later interactive `/picm-maintain` run lets you choose a one-run depth with Strict preselected. `/picm-maintain strict` and `/picm-maintain balanced` bypass the selector; a bare non-TUI command defaults to Strict. Legacy Light metadata is preserved for compatibility but is not an available maintenance mode.

- Strict (recommended): broader systematic coverage across declared roots and mapped contexts; higher cost.
- Balanced: representative coverage of major boundaries and one coding path; lower cost.

PiCM Factory can also record optional maintenance reminders in `.picm/config.json`. A due reminder only appears in an interactive Pi session and still runs the normal privacy and approval flow—nothing runs while Pi is closed.

## Safety model

PiCM Factory is conservative by design:

- **Privacy first.** Protected scans begin with a privacy review. Git-ignored paths, Git internals, symlinks, outside-worktree paths, persisted exclusions, and session exclusions are not read.
- **Non-destructive adoption.** Existing structure is preserved unless you approve an exact proposed action.
- **Preview before writes.** Adoption, maintenance, and optimization present a complete concise summary before each proposal. Material or uncertain changes can be inspected with optional exact review: `View all`, `Select files`, and `Return to summary`.
- **Explicit approval.** Selecting an option, asking for a preview, or vague assent does not authorize writes. PiCM applies only the current, explicitly approved proposal and never makes Git commits for you.
- **Documentation-only optimization.** `/picm-optimize` preserves unique constraints and intended outcomes; it does not modify source or runtime files, claim semantic equivalence, or promise token savings.

`.pi/` configures project-local Pi resources. `.picm/` holds small PiCM metadata and reports; it is maintainer-only context, not normal workflow context.

## Learn more

- [Changelog](https://github.com/eyevanovich/picm-factory/blob/main/CHANGELOG.md)
- [Methodology references](https://github.com/eyevanovich/picm-factory/blob/main/docs/references.md)
- [Contributing](https://github.com/eyevanovich/picm-factory/blob/main/CONTRIBUTING.md)
- [Release guide](https://github.com/eyevanovich/picm-factory/blob/main/docs/releasing.md)
- [GitHub Issues](https://github.com/eyevanovich/picm-factory/issues)

## Acknowledgments

PiCM Factory independently adapts ideas from Jake Van Clief and David McDermott's [*Interpretable Context Methodology*](https://arxiv.org/abs/2603.16021), the [Clief Notes community](https://www.skool.com/cliefnotes), and [`RinDig/icm-architect`](https://github.com/RinDig/icm-architect). It runs on [Pi Coding Agent](https://github.com/earendil-works/pi) by Mario Zechner.

## Development

```bash
npm run check
```

See [CONTRIBUTING.md](https://github.com/eyevanovich/picm-factory/blob/main/CONTRIBUTING.md) for development and pull-request guidance.
