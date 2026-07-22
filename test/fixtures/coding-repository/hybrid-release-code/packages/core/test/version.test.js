import assert from "node:assert/strict";
import test from "node:test";

import { displayVersion } from "../src/version.js";

test("formats a display version", () => {
  assert.equal(displayVersion("1.2.3"), "v1.2.3");
});
