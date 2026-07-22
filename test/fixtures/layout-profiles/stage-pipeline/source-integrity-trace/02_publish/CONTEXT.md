# Publishing Stage

## Purpose
Turn the approved event brief into concise public copy. Do not change the event scope.

## Inputs

| Kind | Path | Use |
| --- | --- | --- |
| Working artifact | `../01_approval/output/approved-event-brief.md` | Use as the approved brief for this run. |

## Process
1. Write a short announcement with the key event details.
2. Make the wording friendly and direct.
3. Save the public-ready copy.

## Outputs

| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| `output/final-announcement.md` | Public-ready event announcement. | Human publisher after review. |

## Verify
- Check spelling and readability.
- Confirm the announcement includes the key event details.

## Handoff / review gate
- Human review: inspect `output/final-announcement.md` before publishing.
- Next stage/role: human publisher.
