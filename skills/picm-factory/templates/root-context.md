# {{picm:workflow-name}} Context

## What this workspace helps with
{{picm:repeatable-work-description}}

## Users / audience
- Primary operator: {{picm:primary-operator}}
- Output audience: {{picm:output-audience}}

## Inputs
- {{picm:input-type}}
- {{picm:input-type}}

## Outputs
- {{picm:final-deliverable}}
- {{picm:working-artifact-if-any}}

## Named scripts / tools
Include this section only when the user has named a relevant local script, MCP server/tool, or integration. Record its exact path/name, deterministic job, inputs/outputs, side effects, and required human review. Otherwise omit this section; do not invent tools to fill it.

- {{picm:user-named-script-or-tool}}: {{picm:mechanical-job-and-review-boundary}}

## Quality bar
- Good output: {{picm:quality-criteria}}
- Avoid: {{picm:mistakes-or-non-goals}}

## Security / privacy
- Sensitive material: {{picm:sensitive-material-status}}
- Handling rule: {{picm:handling-rule}}
- Coding scan rule, when applicable: complete PiCM privacy review before scanning; Git-ignored and PiCM-excluded paths are never read and are checked again immediately before inspection.

## Maintenance notes
Run `/picm-maintain` after the first real workflow or whenever the process changes.
