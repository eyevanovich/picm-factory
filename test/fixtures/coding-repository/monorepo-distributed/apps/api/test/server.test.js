import assert from "node:assert/strict";
import test from "node:test";

import { handleGreeting } from "../src/server.js";

test("returns a greeting payload", () => {
  assert.deepEqual(handleGreeting("reader"), { message: "Hello, reader" });
});
