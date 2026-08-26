import test from "node:test";
import assert from "node:assert/strict";
import {
  isGeneratedSpecialistInputRoute,
  parseSpecialistFirstRunRecipe,
} from "../extensions/runtime/specialist-first-run-guidance.mjs";

test("runtime inputs remain route references while reusable inputs require generation", () => {
  const semantics = parseSpecialistFirstRunRecipe(
    "workflows/polish.md",
    `# Polish

## Inputs

- The future draft at \`input/faq.md\`.
- Reusable guidance at \`reference/style.md\`.

## Expected artifact

Create \`review/polished.md\`.

## Review gate

Inspect, edit, and approve \`review/polished.md\`. Keep unsupported claims visible. The next action reads from \`review/polished.md\`.
`,
  );
  const routes = semantics.inputs.flatMap((input) =>
    [...input.matchAll(/`([^`]+)`/g)].map((match) => match[1])
  );

  assert.deepEqual(routes.filter(isGeneratedSpecialistInputRoute), ["reference/style.md"]);
});
