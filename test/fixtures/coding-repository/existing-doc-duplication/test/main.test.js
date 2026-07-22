import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../src/main.js";

test("formats runtime values", () => {
  assert.equal(run(42), "42");
});
