import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const protocol = readFileSync(join(process.cwd(), "skills/picm-factory/references/preview-review-protocol.md"), "utf8");

test("review guidance preserves a conversational final direction rather than runtime authority", () => {
  for (const signal of [
    "final direction",
    "conversational sign-off",
    "affected areas",
    "material creates, replacements, moves, or deletions",
    "preserved behavior",
    "what changed",
  ]) assert.ok(protocol.toLowerCase().includes(signal.toLowerCase()), `missing ${signal}`);
  for (const obsolete of ["proposal ID", "approval token", "picm_scan_control", "picm_proposal_batch"]) {
    assert.equal(protocol.includes(obsolete), false, `obsolete authority: ${obsolete}`);
  }
});

test("checkpoint advice is optional and never grants or blocks ordinary edits", () => {
  assert.match(protocol, /checkpoint/i);
  assert.match(protocol, /advice|recommendation/i);
  assert.doesNotMatch(protocol, /exact checkpoint acknowledgement|clean-tree requirement/i);
});
