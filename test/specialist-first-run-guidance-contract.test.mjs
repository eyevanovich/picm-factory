import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const base = join(root, "test/fixtures/layout-profiles/specialist-folder");

test("specialist recipes route the first run through a reviewed artifact", () => {
  const layout = readFileSync(join(root, "skills/picm-factory/references/layout-profiles.md"), "utf8");
  assert.match(layout, /`nextAction\.source` to equal `expectedArtifact`/);
  assert.match(layout, /`scaffolded` means the input is created/);

  for (const fixture of ["product-voice-reviewer", "faq-polisher"]) {
    const folder = join(base, fixture);
    const recipe = readdirSync(join(folder, "workflows"))[0];
    const text = readFileSync(join(folder, "workflows", recipe), "utf8");
    const match = /^```picm-specialist-first-run\n([\s\S]*?)\n```/.exec(text);
    assert.ok(match, `${fixture} needs a visible route receipt`);
    const route = JSON.parse(match[1]);
    assert.equal(route.nextAction.source, route.expectedArtifact);
    assert.equal(route.review.requiresInspectEditApprove, true);
    assert.ok(route.review.visibleUncertainty.length > 0);
    for (const input of route.inputs) {
      assert.ok(["scaffolded", "pre-existing", "per-run"].includes(input.availability));
      if (input.availability !== "per-run") {
        assert.ok(existsSync(join(folder, input.path)), `${fixture} missing ${input.path}`);
      }
    }
    const routing = readFileSync(join(folder, "AGENTS.md"), "utf8");
    assert.match(routing, /workflow|routing/i);
  }
});

test("specialist templates preserve context, uncertainty, and handoff semantics", () => {
  const specialist = readFileSync(join(root, "skills/picm-factory/templates/specialist-context.md"), "utf8");
  const handoff = readFileSync(join(root, "skills/picm-factory/templates/handoff-card.md"), "utf8");
  assert.match(specialist, /Reference material|Workflows/);
  assert.match(handoff, /Gaps \/ unknowns|Next action/);
});
