import test from "node:test";
import assert from "node:assert/strict";
import {
  generatedSpecialistInputRoutes,
  parseSpecialistFirstRunRecipe,
} from "../extensions/runtime/specialist-first-run-guidance.mjs";

test("runtime inputs remain route references while reusable inputs require generation", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/polish.md",
    `# Polish

## Inputs

- The future draft at \`reference/faq.md\`.
- Reusable guidance at \`knowledge/style.md\`.

## Expected artifact

Create \`review/polished.md\`.

## Review gate

Inspect, edit, and approve \`review/polished.md\`. Keep unsupported claims visible. The next action reads from \`review/polished.md\`.
`,
  );
  assert.deepEqual(generatedSpecialistInputRoutes(semantics.inputs), ["knowledge/style.md"]);
});

test("uncertainty clauses normalize supported visibility wording", () => {
  for (const review of [
    "Flag unsupported claims and unresolved questions in the review notes.",
    "Keep unsupported claims visible and unresolved questions in review notes.",
  ]) {
    const semantics = parseSpecialistFirstRunRecipe(
      "workflows/review.md",
      `# Review

## Inputs

- A supplied draft.

## Output

Create \`review/draft.md\`.

## Review gate

Inspect, edit, and approve \`review/draft.md\`. ${review} The next action reads from \`review/draft.md\`.
`,
    );
    assert.deepEqual(semantics.visibleUncertainty, ["unsupported claims", "unresolved questions"]);
  }
});
