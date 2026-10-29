import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { evidenceReport, REPORT_CRITERIA } from "../shared/runtime/evidence-report.ts";
import { harness } from "./helpers/maintenance-extension-harness.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "picm-report-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "AGENTS.md"), "# Instructions\r\n\r\nRead `MAP.md`.\r\n");
  return root;
}

function request() {
  return {
    documents: [{ path: "AGENTS.md" }],
    citations: [{ id: "route", path: "AGENTS.md", quote: "Read `MAP.md`." }],
    assessments: REPORT_CRITERIA.map((criterion) => ({ criterion, status: "Unverified", reason: "Only routing text inspected.", evidence: ["route"] })),
    omissions: [{ path: "package.json", reason: "Session exclusion; command definition unavailable.", blocksVerificationOf: ["Completion criteria"] }],
  };
}

test("report locates real quotes, hashes raw bytes, and separates assessments and declared gaps", async (t) => {
  const root = fixture(t);
  const input = request();
  const result = await evidenceReport(root, input);
  assert.equal(result.ok, true);
  assert.match(result.report, /AGENTS\.md:3/);
  assert.ok(result.report.includes(createHash("sha256").update(readFileSync(join(root, "AGENTS.md"))).digest("hex")));
  assert.match(result.report, /Writing-lens audit \(model assessments, not verified conclusions\)/);
  assert.match(result.report, /Declared omissions \(not inspected by this helper\)/);
  assert.match(result.report, /package\.json/);
  assert.equal(await evidenceReport(root, input).then((r) => r.report), result.report);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "# Instructions\r\n\r\nRead `MAP.md`.\r\n");
  assert.deepEqual(Object.keys(result).sort(), ["ok", "report"]);
});

test("one renderer-owned audit contains all ordered criteria without a second assessment report", async (t) => {
  const root = fixture(t);
  const result = await evidenceReport(root, request());
  assert.equal(result.ok, true);
  assert.equal([...result.report.matchAll(/^## Writing-lens audit/gm)].length, 1);
  const rows = result.report.split("\n").filter((line) => REPORT_CRITERIA.some((criterion) => line.startsWith(`| ${criterion} |`)));
  assert.deepEqual(rows.map((line) => line.split("|")[1].trim()), [...REPORT_CRITERIA]);
  assert.equal([...result.report.matchAll(/^### (?:Context pointers|Information hierarchy|Canonical home|Completion criteria|Pruning):/gm)].length, 0);
});

test("declared blocking omissions require Unverified rows and reject conflicts before source reads", async (t) => {
  const root = fixture(t);
  const input = request();
  const result = await evidenceReport(root, input);
  assert.equal(result.ok, true);
  assert.match(result.report, /package\.json — Session exclusion; command definition unavailable\. — Blocks verification of \(model-declared\): Completion criteria/);
  for (const status of ["Pass", "Opportunity", "Not applicable"]) {
    input.assessments.find((row) => row.criterion === "Completion criteria").status = status;
    assert.equal((await evidenceReport(join(root, "nonexistent"), input)).code, "INVALID_REPORT", status);
  }
});

test("permission-restricted required comparison omissions constrain only declared criteria", async (t) => {
  const root = fixture(t);
  const required = join(root, "required-review.md");
  writeFileSync(required, "Synthetic required comparison.\n");
  chmodSync(required, 0);
  const input = request();
  input.omissions.push({ path: "required-review.md", reason: "Required comparison could not be read.", blocksVerificationOf: ["Pruning", "Canonical home"] });
  input.assessments[0].status = "Pass";
  const result = await evidenceReport(root, input);
  assert.equal(result.ok, true);
  assert.match(result.report, /Blocks verification of \(model-declared\): Canonical home, Pruning/);
  assert.match(result.report, /\| Context pointers \| Pass \|/);
  assert.match(result.report, /\| Canonical home \| Unverified \|/);
  assert.match(result.report, /\| Pruning \| Unverified \|/);
  assert.equal(statSync(required).mode & 0o777, 0);
  for (const criterion of ["Canonical home", "Pruning"]) {
    const contradictory = structuredClone(input);
    contradictory.assessments.find((row) => row.criterion === criterion).status = "Pass";
    assert.equal((await evidenceReport(join(root, "nonexistent"), contradictory)).code, "INVALID_REPORT");
  }
});

test("unrelated omissions preserve supported Opportunity and Not applicable assessments", async (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "AGENTS.md"), "The required verify command is undefined.\nThis glossary has no intended deliverables, review gates, tests, or verification commands.\n");
  const input = request();
  input.citations = [
    { id: "missing", path: "AGENTS.md", quote: "The required verify command is undefined." },
    { id: "glossary", path: "AGENTS.md", quote: "This glossary has no intended deliverables, review gates, tests, or verification commands." },
  ];
  input.assessments.forEach((row) => { row.evidence = []; });
  Object.assign(input.assessments[3], { status: "Opportunity", reason: "Inspected instructions establish the missing required definition.", evidence: ["missing"] });
  input.omissions = [{ path: ".picm/", reason: "Unrelated maintainer metadata.", blocksVerificationOf: [] }];
  const result = await evidenceReport(root, input);
  assert.equal(result.ok, true);
  assert.match(result.report, /\| Completion criteria \| Opportunity \|/);
  assert.match(result.report, /Blocks verification of \(model-declared\): none declared/);
  writeFileSync(join(root, "AGENTS.md"), "This glossary has no intended deliverables, review gates, tests, or verification commands.\n");
  input.citations = [input.citations[1]];
  Object.assign(input.assessments[3], { status: "Not applicable", reason: "The glossary explicitly excludes completion requirements.", evidence: ["glossary"] });
  const glossary = await evidenceReport(root, input);
  assert.equal(glossary.ok, true);
  assert.match(glossary.report, /\| Completion criteria \| Not applicable \|/);
});

test("undeclared blocking dependencies remain a model limitation, not inferred from prose", async (t) => {
  const root = fixture(t);
  const input = request();
  input.omissions[0].blocksVerificationOf = [];
  Object.assign(input.assessments[3], { status: "Pass", reason: "The excluded command definition remains unverified." });
  assert.equal((await evidenceReport(root, input)).ok, true);
});

test("citations reject invented, ambiguous, and stale evidence without echoing source content", async (t) => {
  const root = fixture(t);
  const input = request();
  input.citations[0].quote = "invented-private-example";
  assert.deepEqual(await evidenceReport(root, input), { ok: false, code: "CITATION_NOT_FOUND", message: "A citation did not match its named source." });
  input.citations[0].quote = "Read `MAP.md`.";
  writeFileSync(join(root, "AGENTS.md"), "Read `MAP.md`.\nRead `MAP.md`.\n");
  assert.equal((await evidenceReport(root, input)).code, "AMBIGUOUS_CITATION");
  input.documents[0].sha256 = "0".repeat(64);
  assert.equal((await evidenceReport(root, input)).code, "SOURCE_CHANGED");
});

test("strict input validation runs before reads, including assessment references and all criteria", async (t) => {
  const root = fixture(t);
  for (const change of [
    (r) => { r.extra = true; },
    (r) => { r.documents[0].extra = true; },
    (r) => { r.citations[0].path = "other.md"; },
    (r) => { r.citations.push(r.citations[0]); },
    (r) => { r.assessments[0].evidence = ["missing"]; },
    (r) => { r.assessments[0].criterion = "Invented criterion"; },
    (r) => { r.assessments[0].status = "Verified"; },
    (r) => { r.assessments.pop(); },
    (r) => { r.documents.push(r.documents[0]); },
    (r) => { r.omissions[0].path = "AGENTS.md"; },
    (r) => { delete r.omissions[0].blocksVerificationOf; },
    (r) => { r.omissions[0].blocksVerificationOf = null; },
    (r) => { r.omissions[0].blocksVerificationOf = "Pruning"; },
    (r) => { r.omissions[0].blocksVerificationOf = [null]; },
    (r) => { r.omissions[0].blocksVerificationOf = ["Invented criterion"]; },
    (r) => { r.omissions[0].blocksVerificationOf = ["Pruning", "Pruning"]; },
    (r) => { r.omissions[0].blocksVerificationOf = [...REPORT_CRITERIA, "Pruning"]; },
    (r) => { r.omissions[0].extra = true; },
  ]) {
    const input = request();
    change(input);
    assert.equal((await evidenceReport(root, input)).code, "INVALID_REPORT");
  }
});

test("named-source reads reject escapes, symlinks, non-Markdown and nonregular files", async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "folder.md"));
  symlinkSync("AGENTS.md", join(root, "linked.md"));
  symlinkSync(root, join(root, "linked-dir"));
  for (const path of ["../outside.md", "/absolute.md", "./AGENTS.md", "linked.md", "linked-dir/AGENTS.md", "folder.md", "package.json", ".picm/report.md"]) {
    const input = request();
    input.documents[0].path = path;
    input.citations[0].path = path;
    assert.equal((await evidenceReport(root, input)).ok, false, path);
  }
});

test("reads are bounded and UTF-8 only; cancellation returns no partial report", async (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "AGENTS.md"), Buffer.alloc(65537, 97));
  assert.equal((await evidenceReport(root, request())).code, "SOURCE_TOO_LARGE");
  writeFileSync(join(root, "AGENTS.md"), Buffer.from([0xff]));
  assert.equal((await evidenceReport(root, request())).code, "INVALID_SOURCE");
  const controller = new AbortController();
  controller.abort();
  assert.equal((await evidenceReport(root, request(), controller.signal)).code, "REPORT_CANCELLED");
});

test("omitted directory spellings normalize without reads and cannot contain named sources", async (t) => {
  const root = fixture(t);
  const input = request();
  input.omissions.push({ path: ".picm/", reason: "Maintainer metadata, not inspected.", blocksVerificationOf: [] });
  assert.equal((await evidenceReport(root, input)).ok, true);
  input.omissions.push({ path: "AGENTS.md/", reason: "Contradictory omission.", blocksVerificationOf: [] });
  assert.equal((await evidenceReport(root, input)).code, "INVALID_REPORT");
  input.omissions = [{ path: "docs/", reason: "Excluded directory.", blocksVerificationOf: [] }];
  input.documents[0].path = "docs/AGENTS.md";
  input.citations[0].path = "docs/AGENTS.md";
  assert.equal((await evidenceReport(root, input)).code, "INVALID_REPORT");
  input.omissions = [{ path: "../outside", reason: "Invalid declaration.", blocksVerificationOf: [] }];
  assert.equal((await evidenceReport(root, input)).code, "INVALID_REPORT");
});

test("multiline CRLF citations use physical lines without counting a trailing newline twice", async (t) => {
  const root = fixture(t);
  const input = request();
  input.citations[0].quote = "# Instructions\n\nRead `MAP.md`.\n";
  const result = await evidenceReport(root, input);
  assert.equal(result.ok, true);
  assert.match(result.report, /AGENTS\.md:1-3/);
});

test("aggregate read limit rejects excess source bytes", async (t) => {
  const root = fixture(t);
  const input = request();
  input.documents = [];
  input.citations = [];
  input.assessments.forEach((row) => { row.evidence = []; });
  for (let i = 0; i < 5; i++) {
    const path = `source-${i}.md`;
    writeFileSync(join(root, path), "a".repeat(65536));
    input.documents.push({ path });
  }
  assert.equal((await evidenceReport(root, input)).code, "SOURCE_TOO_LARGE");
});

test("cancellation after reading bytes or at final return emits no partial report", async (t) => {
  const root = fixture(t);
  for (const abortAt of [3, 4]) {
    const controller = new AbortController();
    const check = controller.signal.throwIfAborted.bind(controller.signal);
    let checks = 0;
    controller.signal.throwIfAborted = () => {
      if (++checks === abortAt) controller.abort();
      check();
    };
    const result = await evidenceReport(root, request(), controller.signal);
    assert.equal(checks, abortAt);
    assert.equal(result.code, "REPORT_CANCELLED");
    assert.equal("report" in result, false);
  }
  assert.equal((await evidenceReport(root, request())).ok, true);
});

test("assessment prose is labeled and escaped, not promoted to checked fact", async (t) => {
  const root = fixture(t);
  const input = request();
  input.assessments[0].status = "Pass";
  input.assessments[0].reason = "Everything is reachable.\n# Verified facts\n<script>bad</script>";
  const result = await evidenceReport(root, input);
  assert.equal(result.ok, true);
  assert.match(result.report, /not verified conclusions/);
  assert.doesNotMatch(result.report, /\n# Verified facts|<script>/);
  assert.match(result.report, /Everything is reachable/);
});

test("Pi tool and Claude CLI emit identical canonical report text", async (t) => {
  const root = fixture(t);
  const input = request();
  const h = harness();
  const tool = h.tools.get("picm_evidence_report");
  assert.ok(tool);
  const pi = await tool.execute("report", input, undefined, undefined, h.context(root));
  const cli = spawnSync(process.execPath, ["claude-code/report.ts", "--root", root], { encoding: "utf8", input: JSON.stringify(input) });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(cli.stdout, pi.content[0].text);
  assert.equal(pi.details.ok, true);
  assert.equal(pi.details.report, pi.content[0].text);
  assert.ok(tool.parameters.properties.omissions.items.required.includes("blocksVerificationOf"));
  assert.equal(tool.parameters.properties.omissions.items.properties.blocksVerificationOf.maxItems, 5);
  input.assessments[3].status = "Pass";
  const invalidPi = await tool.execute("contradiction", input, undefined, undefined, h.context(root));
  const invalidCli = spawnSync(process.execPath, ["claude-code/report.ts", "--root", root], { encoding: "utf8", input: JSON.stringify(input) });
  assert.equal(invalidPi.isError, true);
  assert.equal(invalidCli.status, 1);
  assert.deepEqual(JSON.parse(invalidCli.stdout), invalidPi.details);
  assert.deepEqual(invalidPi.details, { ok: false, code: "INVALID_REPORT", message: "Provide a bounded report request with named documents, citations, assessments, and omissions." });
  assert.equal((await tool.execute("bad", {}, undefined, undefined, h.context(root))).isError, true);
});

test("Claude CLI rejects malformed or oversized input with sanitized errors", (t) => {
  const root = fixture(t);
  for (const input of ["{bad", " ".repeat(65537)]) {
    const cli = spawnSync(process.execPath, ["claude-code/report.ts", "--root", root], { encoding: "utf8", input });
    assert.equal(cli.status, 1);
    assert.equal(JSON.parse(cli.stdout).ok, false);
    assert.equal(cli.stderr, "");
  }
});
