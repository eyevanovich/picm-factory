import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const protocol = readFileSync(join(process.cwd(), "shared/picm-factory/references/preview-review-protocol.md"), "utf8");
const contract = readFileSync(join(process.cwd(), "shared/picm-factory/CONTRACT.md"), "utf8");

test("review guidance preserves a conversational final direction rather than runtime authority", () => {
  for (const signal of [
    "final direction",
    "conversational sign-off",
    "affected areas",
    "material creates/moves/deletes/replacements",
    "preserved behavior",
    "Finish with changes, checks, known effects",
  ]) assert.ok(contract.toLowerCase().includes(signal.toLowerCase()), `missing ${signal}`);
  assert.match(protocol, /\[shared contract\]\(\.\.\/CONTRACT\.md\)/);
  assert.match(protocol, /interdependent moves and deletions together/);
  for (const obsolete of ["proposal ID", "approval token", "picm_scan_control", "picm_proposal_batch"]) {
    assert.equal(protocol.includes(obsolete), false, `obsolete authority: ${obsolete}`);
  }
});

test("checkpoint advice is optional and never grants or blocks ordinary edits", () => {
  assert.match(contract, /user-created Git checkpoint is optional advice/);
  assert.match(protocol, /shared contract governs validation authority, checkpoints/);
  assert.doesNotMatch(protocol, /exact checkpoint acknowledgement|clean-tree requirement/i);
});
