# Design Stage

## Purpose
Create a simple agenda, activity list, and facilitator notes from approved discovery context. Do not prepare follow-up communications.

## Inputs
| Kind | Path | Use |
| --- | --- | --- |
| Stable reference | `../../shared-reference/facilitation-principles.md` | Apply reusable workshop design constraints. |
| Working artifact | `../01_discovery/output/discovery-brief.md` | Use as the approved source for this run. |

## Process
1. Draft an agenda that fits the confirmed goal, audience, and constraints.
2. Include facilitator notes and materials needed.
3. Mark any remaining assumptions for human review.

## Outputs
| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| `output/workshop-plan.md` | Reviewable agenda, activities, materials, and facilitator notes. | `../03_followup/CONTEXT.md` after the workshop. |

## Verify
- Check the plan against the discovery brief and facilitation principles.
- Confirm every activity maps to the stated learning goal.

## Handoff / review gate
- Human review: inspect/edit `output/workshop-plan.md` before running the workshop.
- Next stage/role: `../03_followup/` uses the approved plan plus actual workshop notes.
- Open questions or risks: unresolved logistics remain visible.
