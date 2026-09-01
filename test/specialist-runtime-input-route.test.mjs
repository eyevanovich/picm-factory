import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSpecialistFirstRunRecipe,
  renderSpecialistFirstRunGuidance,
} from "../extensions/runtime/specialist-first-run-guidance.mjs";

test("recipe parsing preserves runtime and generated input routes", () => {
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
  assert.deepEqual(semantics.inputs, [
    "The future draft at `reference/faq.md`.",
    "Reusable guidance at `knowledge/style.md`.",
  ]);
  assert.deepEqual(semantics.inputPaths, ["reference/faq.md", "knowledge/style.md"]);
});

test("recipe parsing accepts Markdown link labels", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/polish.md",
    `# Polish

See the [API guide](reference/api.md), [the reference guide][api-guide], and [API guide].

[api-guide]: reference/api.md

## Inputs

- A supplied draft.

## Expected artifact

Create \`review/polished.md\`.

## Review gate

Inspect, edit, and approve \`review/polished.md\`. Keep open questions visible. The next action reads from \`review/polished.md\`.
`,
  );

  assert.equal(semantics.expectedArtifact, "review/polished.md");
});

test("uncertainty clauses normalize supported visibility wording", () => {
  for (const review of [
    "Flag unsupported claims and unresolved questions in the review notes.",
    "Keep unsupported claims visible and unresolved questions in review notes.",
    "Flag unsupported claims. Leave unresolved questions in the review notes.",
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

test("Oxford-comma uncertainty lists render without a duplicated conjunction", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/review.md",
    `# Review

## Inputs

- A supplied draft.

## Output

Create \`review/draft.md\`.

## Review gate

Inspect, edit, and approve \`review/draft.md\`. Keep gaps, unsupported claims, and open questions visible. The next action reads from \`review/draft.md\`.
`,
  );

  assert.deepEqual(semantics.visibleUncertainty, ["gaps", "unsupported claims", "open questions"]);
});

test("or-conjoined uncertainty lists render without a duplicated conjunction", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/review.md",
    `# Review

## Inputs

- A supplied draft.

## Output

Create \`review/draft.md\`.

## Review gate

Inspect, edit, and approve \`review/draft.md\`. Keep missing information, blockers, or low-confidence points visible. The next action reads from \`review/draft.md\`.
`,
  );
  const guidance = renderSpecialistFirstRunGuidance(semantics);

  assert.deepEqual(semantics.visibleUncertainty, ["missing information", "blockers", "low-confidence points"]);
  assert.doesNotMatch(guidance, /and or low-confidence points/);
});

test("artifact-location uncertainty wording renders once", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/review.md",
    `# Review

## Inputs

- A supplied draft.

## Output

Create \`review/draft.md\`.

## Review gate

Inspect, edit, and approve \`review/draft.md\`. Keep gaps, unsupported claims, and open questions visible in the artifact. The next action reads from \`review/draft.md\`.
`,
  );

  assert.deepEqual(semantics.visibleUncertainty, ["gaps", "unsupported claims", "open questions"]);
});

test("artifact parsing uses the creation clause rather than a reference path", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/polish.md",
    `# Polish

## Inputs

- A supplied draft.

## Expected artifact

Compare with \`reference/style.md\`, then create \`review/polished.md\`.

## Review gate

Inspect, edit, and approve \`review/polished.md\`. Keep open questions visible. The next action reads from \`review/polished.md\`.
`,
  );

  assert.equal(semantics.expectedArtifact, "review/polished.md");
});

test("artifact parsing rejects ambiguous creation clauses", () => {
  assert.throws(() => parseSpecialistFirstRunRecipe(
    "workflows/polish.md",
    `# Polish

## Inputs

- A supplied draft.

## Expected artifact

Create \`review/polished.md\` or write \`review/alternate.md\`.

## Review gate

Inspect, edit, and approve \`review/polished.md\`. Keep open questions visible. The next action reads from \`review/polished.md\`.
`,
  ), /SPECIALIST_GUIDANCE_INVALID/);
});

test("review gate accepts noun variants bound to the expected artifact", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/review.md",
    `# Review

## Inputs

- A supplied draft.

## Output

Create \`review/draft.md\`.

## Review gate

Human inspection, edits, and explicit approval of \`review/draft.md\` are required. Keep open questions visible. The next action reads from \`review/draft.md\`.
`,
  );

  assert.equal(semantics.reviewGateArtifact, "review/draft.md");
  assert.equal(semantics.requiresInspectEditApprove, true);
});

test("review gate rejects an artifact different from the expected artifact", () => {
  assert.throws(() => parseSpecialistFirstRunRecipe(
    "workflows/review.md",
    `# Review

## Inputs

- A supplied draft.

## Output

Create \`review/draft.md\`.

## Review gate

Inspect, edit, and approve \`review/final.md\`. Keep open questions visible. The next action reads from \`review/draft.md\`.
`,
  ), /SPECIALIST_GUIDANCE_INVALID/);
});

test("review gate rejects actions not all applied to the artifact", () => {
  assert.throws(() => parseSpecialistFirstRunRecipe(
    "workflows/review.md",
    `# Review

## Inputs

- A supplied draft.

## Output

Create \`review/output.md\`.

## Review gate

Inspect the source, then edit and approve \`review/output.md\`. Keep open questions visible. The next action reads from \`review/output.md\`.
`,
  ), /SPECIALIST_GUIDANCE_INVALID/);
});

test("review gate accepts pronouns bound to the artifact", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/review.md",
    `# Review

## Inputs

- Use \`knowledge/style.md\` when polishing.

## Output

Create \`review/output.md\`.

## Review gate

Inspect and edit \`review/output.md\`, then explicitly approve it. Keep open questions visible. The next action reads from \`review/output.md\`.
`,
  );

  assert.equal(semantics.reviewGateArtifact, "review/output.md");
  assert.equal(semantics.requiresInspectEditApprove, true);
});
