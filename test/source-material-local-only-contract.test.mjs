import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extensionHarness } from "./helpers/picm-extension-harness.mjs";
import { withFixture, write } from "./helpers/git-fixtures.mjs";

test("picm-new offers local-only Git protection without a root .gitignore", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "picm-local-only-no-ignore-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(join(root, "notes/local-only.md"), "Synthetic local-only notes.\n");
  const h = extensionHarness();
  const ctx = h.context(realpathSync(root), "source-material-local-only-no-ignore");

  await h.commands.get("picm-new").handler("Build a Specialist folder around source material", ctx);

  const prompt = h.sent.at(-1);
  assert.match(prompt, /exact optional root `\/\.gitignore` proposal, for example the line `\/notes\/local-only\.md`/);
  assert.equal(existsSync(join(root, ".gitignore")), false);
});

test("picm-new keeps a local-only session exclusion separate from an optional Git ignore", async () => {
  await withFixture(async ({ root }) => {
    write(join(root, "notes/local-only.md"), "Synthetic local-only notes.\n");
    const initialGitignore = readFileSync(join(root, ".gitignore"), "utf8");
    const h = extensionHarness();
    const ctx = h.context(realpathSync(root), "source-material-local-only");

    await h.commands.get("picm-new").handler("Build a Specialist folder around source material", ctx);

    const prompt = h.sent.at(-1);
    assert.match(prompt, /including one excluded for this session/);
    assert.match(prompt, /session scan exclusion is only a read boundary and does not protect a later Git commit/);
    assert.match(prompt, /exact optional root `\/\.gitignore` proposal, for example the line `\/notes\/local-only\.md`/);
    assert.match(prompt, /Do not write it or add it to scaffold actions automatically/);
    assert.match(prompt, /choosing it is not scaffold approval/);

    const control = h.tools.get("picm_scan_control");
    await control.execute("local-only-preflight", { action: "preflight" }, undefined, undefined, ctx);
    await control.execute(
      "local-only-privacy",
      { action: "privacy", excludedPaths: ["notes/local-only.md"] },
      undefined,
      undefined,
      ctx,
    );
    await control.execute("local-only-begin", { action: "begin" }, undefined, undefined, ctx);
    const inventory = await control.execute(
      "local-only-inventory",
      { action: "inventory" },
      undefined,
      undefined,
      ctx,
    );

    assert.equal(inventory.details.candidates.includes("notes/local-only.md"), false);
    assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), initialGitignore);
  });
});
