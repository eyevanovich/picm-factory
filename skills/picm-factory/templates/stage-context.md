# {{picm:stage-name}} Context

## Purpose
{{picm:stage-purpose-and-boundary}}

## Inputs
| Kind | Path | Use |
| --- | --- | --- |
| Stable reference | {{picm:reference-path-if-any}} | {{picm:reusable-rules-examples-style-or-domain-constraints}} |
| Working artifact | {{picm:per-run-input-or-prior-stage-output}} | {{picm:material-to-transform-for-this-run}} |

If a kind is not needed for this stage, omit that row in generated files rather than creating an empty folder.

## Process
1. {{picm:step}}
2. {{picm:step}}
3. {{picm:step}}

## Outputs
| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| {{picm:inspectable-output-path}} | {{picm:artifact-produced-by-this-stage}} | {{picm:next-stage-role-or-final-user-review}} |

## Named scripts / tools
Include this section only when the user has named a relevant local script, MCP server/tool, or integration. Record the exact path/name, deterministic job, expected inputs/outputs, side effects, and required human review. Otherwise omit it; do not invent a tool to fill the contract.

- {{picm:user-named-script-or-tool}}: {{picm:when-to-use-it-and-what-must-be-reviewed}}

## Verify
- {{picm:optional-verification-before-handoff}}

## Handoff / review gate
- Human review: {{picm:what-the-user-should-inspect-or-edit-before-the-next-stage-consumes-this-output}}
- Next stage/role: {{picm:where-approved-output-goes-next}}
- Open questions or risks: {{picm:what-must-remain-visible-downstream}}
