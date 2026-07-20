# Workspace Context

Purpose: convert private source notes into public-safe memos while preserving strict context boundaries.

## Inputs
| Type | Path | Use |
|---|---|---|
| Working artifact | `source/private-source-notes.md` | Extract only approved, public-safe claims. |
| Stable reference | `reference/public-style.md` | Follow tone and formatting constraints. |

## Process
1. Identify sensitive-looking source material.
2. Sanitize before drafting.
3. Write public-safe drafts to `output/`.

## Outputs
- `output/public-memo.md` after human review.

## Verify
- Confirm no token-looking strings, private/client labels, account-like IDs, or personal-looking placeholders were copied into the public draft.
