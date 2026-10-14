import assert from "node:assert/strict";
import test from "node:test";

import { harness } from "./helpers/maintenance-extension-harness.mjs";

function resultDetails(result) {
  return JSON.parse(result.content[0].text);
}

test("decision tool returns a selected choice without recording approval state", async () => {
  const h = harness();
  const ctx = h.context(process.cwd());
  ctx.hasUI = true;
  ctx.ui.select = async () => "Curated";
  const result = await h.tools.get("picm_decision").execute("id", {
    question: "Choose adoption depth",
    choices: ["Additive", "Curated"],
  }, undefined, undefined, ctx);
  assert.deepEqual(resultDetails(result), { status: "selected", choice: "Curated" });
  assert.equal(h.entries.length, 0);
});

test("decision dismissal and unavailable UI return information only", async () => {
  const h = harness();
  const dismissed = h.context(process.cwd());
  dismissed.hasUI = true;
  dismissed.ui.select = async () => undefined;
  const tool = h.tools.get("picm_decision");
  assert.deepEqual(resultDetails(await tool.execute("dismissed", {
    question: "Choose", choices: ["One", "Two"],
  }, undefined, undefined, dismissed)), { status: "dismissed" });

  const unavailable = h.context(process.cwd());
  unavailable.hasUI = false;
  assert.deepEqual(resultDetails(await tool.execute("unavailable", {
    question: "Choose", choices: ["One", "Two"],
  }, undefined, undefined, unavailable)), { status: "unavailable" });
  assert.equal(h.entries.length, 0);
});
