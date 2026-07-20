# [Stage Name] Context

## Purpose
[One sentence: what this stage is responsible for, and what it should not do.]

## Inputs
| Kind | Path | Use |
| --- | --- | --- |
| Stable reference | [reference path, if any] | [Reusable rules/examples/style/domain constraints to follow.] |
| Working artifact | [per-run input or prior stage output] | [Material to transform for this run.] |

If a kind is not needed for this stage, omit that row in generated files rather than creating an empty folder.

## Process
1. [step]
2. [step]
3. [step]

## Outputs
| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| [inspectable output path] | [artifact produced by this stage] | [next stage/role or final user review] |

## Named scripts / tools
Include this section only when the user has named a relevant local script, MCP server/tool, or integration. Record the exact path/name, deterministic job, expected inputs/outputs, side effects, and required human review. Otherwise omit it; do not invent a tool to fill the contract.

- [User-named script/tool]: [when to use it and what must be reviewed]

## Verify
- [Optional: check the output against a prior artifact, source constraint, or quality bar before handoff.]

## Handoff / review gate
- Human review: [what the user should inspect or edit before the next stage consumes this output]
- Next stage/role: [where approved output goes next]
- Open questions or risks: [what must remain visible downstream]
