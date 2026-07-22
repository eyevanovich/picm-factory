# Draft Stage

## Purpose
Turn approved intake notes into a first-pass newsletter draft. Do not approve or publish the draft.

## Inputs
| Kind | Path | Use |
| --- | --- | --- |
| Stable reference | `../shared-reference/editorial-standards.md` | Apply tone, length, and claim-safety rules. |
| Working artifact | `../01_intake/output/intake-summary.md` | Use as the approved brief and fact source for this run. |

## Process
1. Draft the newsletter from approved intake facts only.
2. Preserve uncertainty markers instead of inventing missing facts.
3. Keep editor questions inline or in a final notes section.

## Outputs
| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| `output/newsletter-draft.md` | Reviewable first-pass newsletter copy. | `../03_review/CONTEXT.md` after human review. |

## Verify
- Check that every specific claim is present in the approved intake summary.
- Confirm unresolved questions remain visible.

## Handoff / review gate
- Human review: inspect/edit `output/newsletter-draft.md` before final review.
- Next stage/role: `../03_review/` reviews the approved draft.
- Open questions or risks: do not hide uncertain facts in polished copy.
