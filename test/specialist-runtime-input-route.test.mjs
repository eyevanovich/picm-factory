import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasUnresolvedSpecialistPlaceholder,
  parseSpecialistFirstRunRecipe,
  renderSpecialistFirstRunGuidance,
} from "../extensions/runtime/specialist-first-run-guidance.mjs";

function receipt(overrides = {}) {
  const value = {
    version: 1,
    inputs: [
      {
        path: "reference/style.md",
        availability: "scaffolded",
        description: "Reusable style guidance",
      },
      {
        path: "source/request.md",
        availability: "per-run",
        description: "Request supplied for this run",
      },
    ],
    expectedArtifact: "review/result.md",
    review: {
      requiresInspectEditApprove: true,
      visibleUncertainty: ["unsupported claims"],
    },
    nextAction: { source: "review/result.md" },
    ...overrides,
  };
  return `\`\`\`picm-specialist-first-run\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function recipe({ prose = "", heading = "# Recipe", receiptBlock = receipt(), initialBlankLines = "" } = {}) {
  return `${initialBlankLines}${receiptBlock}\n\n${heading}\n\n${prose}\n`;
}

function parse(recipeText) {
  return parseSpecialistFirstRunRecipe("workflows/review.md", recipeText);
}

test("equivalent headings and prose after the receipt render only from the receipt", () => {
  const first = parse(recipe({
    heading: "# Review copy",
    prose: "## Old wording\n\nCreate `other/result.md` only after a careful review.",
  }));
  const second = parse(recipe({
    heading: "### Any heading works",
    prose: "A differently phrased checklist may mention `archive/ignore.md` without route semantics.",
  }));

  assert.deepEqual(first.inputs, [
    {
      path: "reference/style.md",
      availability: "scaffolded",
      description: "Reusable style guidance",
    },
    {
      path: "source/request.md",
      availability: "per-run",
      description: "Request supplied for this run",
    },
  ]);
  assert.equal(first.expectedArtifact, "review/result.md");
  assert.equal(first.nextActionSource, "review/result.md");
  assert.equal(first.requiresInspectEditApprove, true);
  assert.deepEqual(first.visibleUncertainty, ["unsupported claims"]);
  assert.equal(renderSpecialistFirstRunGuidance(first), renderSpecialistFirstRunGuidance(second));
});

test("leading blank lines and CRLF receipt lines are accepted", () => {
  const semantics = parse(recipe({ initialBlankLines: " \t\n\n" }).replaceAll("\n", "\r\n"));
  assert.equal(semantics.expectedArtifact, "review/result.md");
});

test("receipt has no prose fallback and must be the first nonblank content", () => {
  for (const prefix of [
    "# Recipe\n\n",
    "A prose introduction.\n\n",
    "<!-- comment -->\n\n",
    "<section>HTML</section>\n\n",
    "````markdown\n",
  ]) {
    assert.throws(() => parse(`${prefix}${receipt()}\n`), /SPECIALIST_RECIPE_RECEIPT_INVALID/);
  }
  assert.throws(
    () => parse("# Output\n\nCreate `review/result.md`. Inspect, edit, and approve it before continuing."),
    /SPECIALIST_RECIPE_RECEIPT_INVALID/,
  );
});

test("receipt rejects missing, malformed, unsupported, and unclosed delimiters", () => {
  for (const receiptBlock of [
    "```json\n{}\n```",
    "``` picm-specialist-first-run\n{}\n```",
    " ```picm-specialist-first-run\n{}\n```",
    "```picm-specialist-first-run \n{}\n```",
    "```picm-specialist-first-run\n{}\n``` ",
    "```picm-specialist-first-run\n{}\n````",
    "```picm-specialist-first-run\n{}",
  ]) {
    assert.throws(() => parse(`${receiptBlock}\n`), /SPECIALIST_RECIPE_RECEIPT_INVALID/);
  }
});

test("duplicate canonical raw openings are rejected anywhere after the receipt", () => {
  for (const suffix of [
    `<!-- example\n${receipt()}\n-->`,
    `## Example\n\n${receipt()}`,
    `\`\`\`markdown\n${receipt()}\n\`\`\``,
  ]) {
    assert.throws(() => parse(`${receipt()}\n\n${suffix}\n`), /SPECIALIST_RECIPE_RECEIPT_INVALID/);
  }
});

test("subsequent ordinary HTML and nested Markdown remain literal source text", () => {
  const prose = [
    '<div title="a > b">ordinary HTML with <em>quoted angle brackets</em></div>',
    "",
    "<!-- a later HTML comment is ordinary text -->",
    "",
    "- Parent item",
    "  - ```markdown",
    "    # Nested example",
    "    ```picm-specialist-first-run",
    "    this is not a receipt delimiter because it is indented",
    "    ```",
    "",
    "````markdown",
    "```picm-specialist-first-run with trailing text",
    "ordinary example text",
    "```",
    "````",
  ].join("\n");
  assert.equal(parse(recipe({ prose })).expectedArtifact, "review/result.md");
});

test("receipt preserves valid Markdown links and reference labels after its closing line", () => {
  const semantics = parse(recipe({
    prose: "See the [API guide](reference/api.md), [the reference guide][api-guide], and [API guide].\n\n[api-guide]: reference/api.md\n[API guide]: reference/api.md",
  }));

  assert.equal(semantics.expectedArtifact, "review/result.md");
  assert.equal(hasUnresolvedSpecialistPlaceholder("[API guide](reference/api.md)\n\n[API guide]: reference/api.md"), false);
});

test("receipt requires review, next action, uncertainty, and valid typed fields", () => {
  for (const overrides of [
    { review: undefined },
    { nextAction: undefined },
    { review: { requiresInspectEditApprove: true, visibleUncertainty: [] } },
    { review: { requiresInspectEditApprove: false, visibleUncertainty: ["unsupported claims"] } },
    { inputs: [{ path: "reference/style.md", availability: "scaffolded", description: "" }] },
  ]) {
    assert.throws(() => parse(recipe({ receiptBlock: receipt(overrides) })), /SPECIALIST_RECIPE_RECEIPT_INVALID/);
  }
  assert.throws(
    () => parse("```picm-specialist-first-run\n{ not JSON }\n```\n"),
    /SPECIALIST_RECIPE_RECEIPT_INVALID/,
  );
});

test("receipt rejects duplicate input routes, unsupported values, and route escapes", () => {
  for (const overrides of [
    {
      inputs: [
        { path: "reference/style.md", availability: "scaffolded", description: "Style" },
        { path: "reference/style.md", availability: "per-run", description: "Duplicate" },
      ],
    },
    { version: 2 },
    { inputs: [{ path: "reference/style.md", availability: "generated", description: "Style" }] },
    { inputs: [{ path: "../private.md", availability: "per-run", description: "Private" }] },
    { expectedArtifact: "/tmp/result.md", nextAction: { source: "/tmp/result.md" } },
    { nextAction: { source: "C:\\review\\result.md" } },
  ]) {
    assert.throws(() => parse(recipe({ receiptBlock: receipt(overrides) })), /SPECIALIST_RECIPE_RECEIPT_INVALID/);
  }
  assert.throws(() => parseSpecialistFirstRunRecipe("../workflows/review.md", recipe()), /SPECIALIST_RECIPE_INCOMPLETE/);
});

test("reserved PiCM tokens reject raw recipe content and decoded receipt fields", () => {
  for (const marker of [
    "{{picm:prose}}",
    "`{{picm:code}}`",
    "```text\n{{picm:fenced}}\n```",
    "{{picm:}}",
    "{{picm:",
    "{{picm:line\nbreak}}",
    "{{picm:unfinished",
  ]) {
    assert.equal(hasUnresolvedSpecialistPlaceholder(marker), true, marker);
    assert.throws(() => parse(recipe({ prose: `Leave ${marker} unresolved.` })), /SPECIALIST_RECIPE_UNFINISHED/);
  }

  const escapedPrefix = (block) => block.replaceAll("{{picm:", "\\u007b\\u007bpicm:");
  for (const block of [
    receipt({ inputs: [{ path: "source/{{picm:draft}}.md", availability: "per-run", description: "Draft" }] }),
    receipt({ inputs: [{ path: "source/draft.md", availability: "per-run", description: "{{picm:input-description}}" }] }),
    receipt({ expectedArtifact: "review/{{picm:artifact}}.md", nextAction: { source: "review/{{picm:artifact}}.md" } }),
    receipt({ review: { requiresInspectEditApprove: true, visibleUncertainty: ["{{picm:uncertainty}}"] } }),
  ]) {
    assert.throws(
      () => parse(recipe({ receiptBlock: escapedPrefix(block) })),
      /SPECIALIST_RECIPE_RECEIPT_INVALID: receipt fields must not contain unresolved template markers/,
    );
  }
  assert.throws(
    () => parseSpecialistFirstRunRecipe("workflows/{{picm:recipe}}.md", recipe()),
    /SPECIALIST_RECIPE_UNFINISHED/,
  );
});

test("ordinary Markdown, mustache variables, and interpolation remain literal", () => {
  const literalMarkdown = [
    "Use `[quality rule]`, `{{createdAt}}`, and `${workflowName}` as literal examples.",
    "Use ``[unequal backtick span]` without treating bracket text as a token.",
    "",
    "> - [x] Quoted task list",
    ">   - [ ] Nested quoted task list",
    "",
    "See [guide](reference/guide.md), [the guide][guide], and [guide].",
    "",
    "[guide]: reference/guide.md",
  ].join("\n");
  assert.equal(hasUnresolvedSpecialistPlaceholder(literalMarkdown), false);
  assert.doesNotThrow(() => parse(recipe({ prose: literalMarkdown })));
});

test("five migrated templates use reserved PiCM tokens", () => {
  for (const template of [
    "root-agents.md",
    "root-context.md",
    "specialist-context.md",
    "stage-context.md",
    "handoff-card.md",
  ]) {
    const content = readFileSync(join(process.cwd(), "skills/picm-factory/templates", template), "utf8");
    assert.match(content, /\{\{picm:/, template);
    assert.equal(hasUnresolvedSpecialistPlaceholder(content), true, template);
    assert.doesNotMatch(content, /\[(?:[A-Z][A-Z /-]*|[a-z]+ [a-z /-]*)]/, template);
  }
});

test("receipt requires the next action source to equal the reviewed artifact", () => {
  assert.throws(
    () => parse(recipe({ receiptBlock: receipt({ nextAction: { source: "review/other.md" } }) })),
    /SPECIALIST_RECIPE_RECEIPT_INVALID: nextAction\.source must equal expectedArtifact/,
  );
  assert.throws(
    () => renderSpecialistFirstRunGuidance({
      ...parse(recipe()),
      nextAction: { source: "review/other.md" },
    }),
    /SPECIALIST_GUIDANCE_INVALID: nextAction\.source must equal expectedArtifact/,
  );
});

test("renderer retains the validated receipt contract", () => {
  const semantics = parse(recipe());
  assert.throws(
    () => renderSpecialistFirstRunGuidance({
      ...semantics,
      review: { requiresInspectEditApprove: false, visibleUncertainty: ["unsupported claims"] },
    }),
    /SPECIALIST_GUIDANCE_INVALID/,
  );
});
