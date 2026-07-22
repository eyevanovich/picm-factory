# Intake Stage

## Purpose
Collect audience, newsletter goal, source notes, and missing questions. Do not draft the newsletter yet.

## Inputs
| Kind | Path | Use |
| --- | --- | --- |
| Stable reference | `../shared-reference/editorial-standards.md` | Follow newsletter safety, tone, and source-use constraints. |
| Working artifact | `../source/source-notes.md` | Treat as the per-run source material to summarize and question. |

## Process
1. Identify the issue goal, audience, source facts, and missing information.
2. Preserve uncertainty markers instead of filling gaps.
3. Stop and flag blockers if source material is incomplete.

## Outputs
| Path | Purpose | Downstream consumer |
| --- | --- | --- |
| `output/intake-summary.md` | Approved facts, assumptions, gaps, and draft brief for this run. | `../02_draft/CONTEXT.md` after human review. |

## Verify
- Check every fact in the summary against `../source/source-notes.md`.
- Flag any missing source or unsupported claim before handoff.

## Handoff / review gate
- Human review: inspect `output/intake-summary.md`, answer open questions, and approve it before drafting.
- Next stage/role: `../02_draft/` reads the approved intake summary.
- Open questions or risks: source gaps must remain visible downstream.
