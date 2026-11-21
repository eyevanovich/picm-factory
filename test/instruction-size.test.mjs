import assert from "node:assert/strict";
import test from "node:test";

import { instructionSize } from "../scripts/report-instructions.mjs";

test("instruction size counts logical lines, whitespace words, and UTF-8 bytes", () => {
  for (const [text, expected] of [
    ["", { lines: 0, words: 0, bytes: 0 }],
    ["\n", { lines: 1, words: 0, bytes: 1 }],
    ["one\n\n", { lines: 2, words: 1, bytes: 5 }],
    ["one two", { lines: 1, words: 2, bytes: 7 }],
    ["é\t猫\n", { lines: 1, words: 2, bytes: 7 }],
    ["one\r\ntwo\r\n", { lines: 2, words: 2, bytes: 10 }],
  ]) assert.deepEqual(instructionSize(text), expected);
});
