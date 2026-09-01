# Polish FAQ Workflow

## Inputs

- The rough FAQ answer supplied for this run.
- `reference/faq-style.md` for reusable style guidance.

## Process

1. Identify the user's likely question.
2. Draft a direct answer from provided notes.
3. Add caveats only when supported.
4. List unresolved questions at the end.

## Expected artifact

Create the reviewable polished FAQ draft at `review/polished-faq.md`; create that artifact on the first run without pre-creating an empty `review/` directory.

## Review gate and next action

A human must inspect, edit, and approve `review/polished-faq.md`. Keep unsupported claims and unresolved questions visible there. The next use of this specialist reads from the approved edited `review/polished-faq.md`, not chat memory.
