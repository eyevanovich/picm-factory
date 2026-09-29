import assert from "node:assert/strict";
import test from "node:test";

import { proposalReviewText, proposalSummary } from "../extensions/runtime/proposal-batch.mjs";

test("review renders each action's complete contents without changing the canonical summary", () => {
  const batch = {
    id: "picm-proposal:test",
    digest: "0123456789abcdef",
    operations: [
      { type: "create", path: "new.md", content: "" },
      { type: "modify", path: "guide.md", expectedContent: "first\nsecond", content: "first\nnew\n" },
      { type: "delete", path: "old.md", expectedContent: "removed\n" },
      { type: "move", from: "from.md", path: "to.md", expectedContent: "source\n", content: "destination" },
    ],
  };
  const canonical = proposalSummary(batch);
  const review = proposalReviewText(batch);
  assert.match(review, /1\. CREATE new\.md\nProposed new file:\n  \(empty file\)/);
  assert.match(review, /2\. MODIFY guide\.md\nCurrent file \(guide\.md\):\n  1 \| first\n  2 \| second\n  \(no final newline\)\nProposed file \(guide\.md\):\n  1 \| first\n  2 \| new\n  \(final newline present\)/);
  assert.match(review, /3\. DELETE old\.md\nCurrent file \(will be deleted\):\n  1 \| removed/);
  assert.match(review, /4\. MOVE from\.md → to\.md\nCurrent file \(from\.md\):\n  1 \| source\n  \(final newline present\)\nProposed file \(to\.md\):\n  1 \| destination/);
  assert.match(review, /Digest: 0123456789abcdef/);
  assert.doesNotMatch(review, /"expectedContent"|Git checkpoint recommendation:/);
  assert.equal(proposalSummary(batch), canonical);
});

test("review visualizes terminal controls instead of executing or hiding them", () => {
  const batch = {
    id: "picm-proposal:test",
    digest: "abc",
    operations: [{ type: "create", path: "unsafe\u001b[31m.md", content: "start\t\u001b[31m\rnext\0end\n[U+001B]\n" }],
  };
  const review = proposalReviewText(batch);
  assert.match(review, /unsafe\[U\+001B\]\[31m\.md/);
  assert.match(review, /start\[U\+0009\]\[U\+001B\]\[31m\[U\+000D\]next\[U\+0000\]end/);
  assert.match(review, /2 \| \[\[U\+001B\]/);
  assert.doesNotMatch(review, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
});
