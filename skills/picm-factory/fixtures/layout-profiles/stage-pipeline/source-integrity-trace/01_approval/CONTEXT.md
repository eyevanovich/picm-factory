# Approval Stage

## Purpose
Turn the event request into a factual brief for human approval. Do not draft the public announcement.

## Inputs

| Kind | Path | Use |
| --- | --- | --- |
| Working artifact | `../source/event-request.md` | Use as the source for event facts. |

## Process
1. Record the confirmed date, time, location, and capacity.
2. Mark missing or uncertain details instead of guessing.
3. Present the brief for human approval.

## Outputs

| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| `output/approved-event-brief.md` | Approved facts for the announcement. | `../02_publish/CONTEXT.md` after human review. |

## Verify
- Compare every logistical fact with `../source/event-request.md`.
- Keep unknowns visible.

## Handoff / review gate
- Human review: approve `output/approved-event-brief.md` before publishing work begins.
- Next stage/role: `../02_publish/` reads the approved brief.
