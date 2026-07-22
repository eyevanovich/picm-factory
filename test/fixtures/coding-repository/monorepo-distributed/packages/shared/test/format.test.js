import assert from "node:assert/strict";
import test from "node:test";

import { formatGreeting } from "../src/format.js";

test("formats a greeting", () => {
  assert.equal(formatGreeting("reader"), "Hello, reader");
});
