import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("specialist fixtures retain visible routing, inputs, and review methodology", () => {
  for (const fixture of ["product-voice-reviewer", "faq-polisher"]) {
    const directory = join(root, "test/fixtures/layout-profiles/specialist-folder", fixture);
    const agents = readFileSync(join(directory, "AGENTS.md"), "utf8");
    const context = readFileSync(join(directory, "CONTEXT.md"), "utf8");
    assert.match(agents, /Specialist|routing|workflow/i);
    assert.match(context, /reference|input|review/i);
  }
});
