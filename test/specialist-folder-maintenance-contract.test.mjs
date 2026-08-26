import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const fixtures = [
  "product-voice-reviewer",
  "faq-polisher",
].map((name) => join(root, "test/fixtures/layout-profiles/specialist-folder", name));

function workspaceSnapshot(cwd) {
  const snapshot = [];
  function visit(path) {
    for (const name of readdirSync(path).sort()) {
      const entry = join(path, name);
      const stat = statSync(entry);
      if (stat.isDirectory()) visit(entry);
      else snapshot.push({
        path: relative(cwd, entry),
        digest: createHash("sha256").update(readFileSync(entry)).digest("hex"),
      });
    }
  }
  visit(cwd);
  return snapshot;
}

test("maintenance guidance identifies Specialist Folder from required signals and keeps examples optional", () => {
  const skill = readFileSync(join(root, "skills/picm-factory/SKILL.md"), "utf8");
  const rubric = readFileSync(join(root, "skills/picm-factory/references/maintenance-rubric.md"), "utf8");
  const guidance = `${skill}\n${rubric}`;

  assert.match(guidance, /explicitly identify or strongly suggest \*\*Specialist Folder\*\*/);
  assert.match(guidance, /`identity\.md`, `rules\.md`, `reference\/`, and `workflows\//);
  assert.match(guidance, /Treat `examples\.md` as optional/);
  assert.match(guidance, /absence is not a warning/);
  assert.match(guidance, /Preserve existing routing/);
});

test("specialist maintenance fixtures retain their optional example shape and no-write contract", () => {
  const before = fixtures.map(workspaceSnapshot);
  assert.equal(before[0].some(({ path }) => path === "examples.md"), true);
  assert.equal(before[1].some(({ path }) => path === "examples.md"), false);

  const qaGuidance = readFileSync(join(root, "docs/layout-fixture-qa.md"), "utf8");
  for (const fixture of ["product-voice-reviewer", "faq-polisher"]) {
    assert.match(qaGuidance, new RegExp(`specialist-folder/${fixture}`));
  }
  assert.match(qaGuidance, /Does not write files without explicit confirmation\./);

  assert.deepEqual(fixtures.map(workspaceSnapshot), before);
});
