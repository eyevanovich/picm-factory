<!-- PiCM authoring: omit unused input kinds, Named mechanics, and Verify; name artifacts without creating empty directories. Remove this comment from generated output. -->
# {{picm:stage-name}} context

## Purpose
{{picm:stage-purpose-and-boundary}}

## Inputs
| Kind | Path | Use |
| --- | --- | --- |
| Stable reference | {{picm:reference-path-if-needed}} | {{picm:reusable-constraint}} |
| Working artifact | {{picm:per-run-input-or-reviewed-prior-output}} | {{picm:material-to-transform}} |

## Process
{{picm:ordered-steps-and-completion-criteria}}

## Outputs
| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| {{picm:inspectable-output-path}} | {{picm:produced-artifact}} | {{picm:next-stage-role-or-final-review}} |

## Named mechanics
- {{picm:exact-script-or-tool-name}}: {{picm:job-inputs-outputs-side-effects-and-human-review}}

## Verify
{{picm:verification-before-handoff-if-needed}}

## Handoff / review gate
- Human check: {{picm:inspect-edit-approve-before-downstream-use}}
- Next route: {{picm:where-reviewed-artifact-goes}}
- Visible gaps/risks: {{picm:uncertainty-to-retain}}
