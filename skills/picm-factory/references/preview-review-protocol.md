# Conversational Change and Review Guidance

Use this guidance for any PiCM modification. It supports review; it is not a proposal engine, authorization protocol, or semantic-equivalence checker.

## Final direction and sign-off

After inspection, state one concise final direction before editing:

- intended outcome and affected files or areas;
- material creates, replacements, moves, or deletions;
- behavior deliberately preserved;
- meaningful uncertainty or risk; and
- the most useful diff or file review, when useful.

Wait for conversational sign-off on that direction. The user may approve in their own words; do not require an exact phrase, ID, digest, modal, or separate approval for every routine edit. A request to adjust the direction replaces the earlier direction. If implementation reveals a material departure, destructive effect, or external write outside it, pause and realign.

Option, profile, cadence, and review choices are design input, not sign-off by themselves. Inspection-only and report-only requests remain no-edit. Never treat cancellation or assent to a different question as sign-off.

## Review and Git advice

Offer exact diffs or file review when the change is material, uncertain, linked across files, or requested. Keep review proportional: a concise direction is normally enough for a small aligned edit, while moves, deletions, safety/privacy changes, and broad restructures deserve clearer impact explanation and a suggested review surface.

For substantial changes to existing content, recommend a user-created Git checkpoint. It is advice, not a prerequisite or a claim that the checkpoint covers current work. Never initialize, stage, commit, reset, clean, restore, or inspect Git history/status to verify coverage. New and non-Git workspaces remain supported.

## Implementation and completion

Use ordinary tools to make the signed-off changes. Preserve unrelated content and settings; re-read an affected file when concurrent changes are apparent. Validate with available documentation, syntax checks, tests, or bounded local checks appropriate to the direction. Permission to run a local check does not imply permission for deployment, publication, or authenticated external work.

If an operation fails, report known effects and inspect relevant state before proposing an aligned repair. Do not automatically roll back completed changes or blindly replay uncertain work.

Finish with:

- what changed;
- what was checked;
- completed, failed, or uncertain effects; and
- remaining uncertainty or follow-up.

## Concise direction shape

```markdown
## Proposed direction

- **Outcome:** ...
- **Affected areas:** ...
- **Material effects:** ...
- **Preserved:** ...
- **Uncertainty / review:** ...

If this direction looks right, I will make these changes and run the relevant checks.
```
