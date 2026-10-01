# Change and review guidance

Use for consequential PiCM changes or failed-operation recovery. The [shared contract](../SKILL.md) owns scope, privacy, final direction, conversational sign-off, cancellation, and completion; this guide adds review detail, not authorization machinery.

## Proportional review

A final direction identifies outcome, affected areas, material creates, replacements, moves, or deletions, preserved behavior, and uncertainty. Offer the most useful diff or file review for linked edits, destructive effects, safety/privacy changes, broad restructuring, or a user request. Small aligned edits need no fixed categories or repeated approval.

Option/profile/cadence selections inform the direction; assent to another question or cancellation isn't sign-off. An adjusted direction replaces the earlier one. Pause and realign when implementation materially departs from it.

For substantial existing-content changes, recommend a user-created Git checkpoint as advice, not a prerequisite or coverage claim. Leave Git operations to the user; don't inspect history/status to verify a checkpoint. New and non-Git workspaces remain supported.

## Validation and recovery

Use appropriate documentation, syntax checks, tests, or bounded local checks. Validation authority doesn't include deployment, publication, or authenticated external work. Preserve unrelated content/settings and re-read files when concurrent edits are apparent.

If an operation fails, report known effects and inspect relevant eligible state before an aligned repair. Do not automatically roll back or blindly replay uncertain work. Finish with what changed, what was checked, completed/failed/uncertain effects, and follow-up.
