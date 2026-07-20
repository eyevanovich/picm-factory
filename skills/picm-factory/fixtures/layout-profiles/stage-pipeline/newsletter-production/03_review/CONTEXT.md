# Review Stage

## Purpose
Check the approved draft for clarity, unsupported claims, and missing handoff notes. Do not publish.

## Inputs
| Kind | Path | Use |
| --- | --- | --- |
| Stable reference | `../shared-reference/editorial-standards.md` | Use as the quality and safety bar. |
| Working artifact | `../02_draft/output/newsletter-draft.md` | Review as the current draft for this run. |
| Working artifact | `../01_intake/output/intake-summary.md` | Trace claims and unresolved questions back to the approved brief. |

## Process
1. Compare the draft to the intake summary and editorial standards.
2. Identify unsupported claims, unclear sections, and unresolved questions.
3. Return review notes rather than final publishing approval.

## Outputs
| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| `output/review-summary.md` | Human-readable findings, required edits, and publish-readiness notes. | Human editor. |

## Verify
- Trace flagged claims to either the draft or intake summary.
- Confirm the review distinguishes blockers from optional polish.

## Handoff / review gate
- Human review: inspect `output/review-summary.md` and decide whether to edit the draft or return to intake.
- Next stage/role: human editor; there is no automatic publishing stage.
- Open questions or risks: unresolved source gaps remain blockers.
