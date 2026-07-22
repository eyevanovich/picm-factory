import assert from "node:assert/strict";
import test from "node:test";

import { greeting } from "../src/greeting.js";

test("greets by name", () => {
  assert.equal(greeting("reader"), "Hello, reader");
});
