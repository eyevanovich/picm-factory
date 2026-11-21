# Specialist receipt and review

Load for scaffolding a specialist recipe or preparing its first-run guidance. Apply the shared contract; this receipt describes generated workflow review, not runtime authorization.

## Visible receipt

Begin the recipe with a concise fenced JSON receipt:

````markdown
```picm-specialist-first-run
{"version":1,"inputs":[{"path":"reference/style.md","availability":"scaffolded","description":"Reusable style guidance"},{"path":"source/request.md","availability":"per-run","description":"Material supplied for this run"}],"expectedArtifact":"review/result.md","review":{"requiresInspectEditApprove":true,"visibleUncertainty":["unsupported claims"]},"nextAction":{"source":"review/result.md"}}
```
````

Name unique local inputs, expected artifact, visible uncertainty, human inspect/edit/approve review, and next-action source. Require `nextAction.source` to equal `expectedArtifact`; downstream work uses the reviewed artifact.

`scaffolded` means the input is created in this scaffold; `pre-existing` means it already exists; `per-run` means the user supplies it each run. Create every scaffolded input and verify pre-existing routes. Keep retained `paths.firstRecipe`, generated-input, and runtime-input hints aligned. Add a receipt to an older prose-only recipe only through an agreed edit.

## First run and learning

Include a receipt-derived first-run checklist in the closing response. Name the recipe path, each input and its availability, the expected artifact, inspect/edit/approve review, and the next action's reviewed source. Mark already-completed steps accurately. Complete only when the checklist identifies those actual routes. Keep stated uncertainty visible in the artifact or review notes before any subsequent specialist action.

After review, distinguish one-off artifact corrections from durable lessons for an existing approved `rules.md`, `examples.md`, or `reference/` route. Retain only already-sanitized, non-sensitive lessons through agreement; never invent optional folders or operations to fill a layout. Recommend maintenance after first real use or changes to the recipe, rules, inputs, or output/review route.
