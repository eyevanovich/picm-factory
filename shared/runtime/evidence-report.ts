import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { codedError, errorCode } from "./errors.ts";

export const REPORT_CRITERIA = ["Context pointers", "Information hierarchy", "Canonical home", "Completion criteria", "Pruning"] as const;
const statuses = ["Pass", "Opportunity", "Not applicable", "Unverified"];
const messages: Record<string, string> = {
  INVALID_REPORT: "Provide a bounded report request with named documents, citations, assessments, and omissions.",
  INVALID_SOURCE: "A named source must be an eligible regular UTF-8 Markdown file inside the workspace, without symlinks.",
  SOURCE_TOO_LARGE: "Named sources exceed the report read limit.",
  SOURCE_CHANGED: "A named source differs from its supplied digest.",
  CITATION_NOT_FOUND: "A citation did not match its named source.",
  AMBIGUOUS_CITATION: "A citation matched more than once; provide a longer unique excerpt.",
  REPORT_CANCELLED: "Report generation was cancelled; no report was produced.",
  REPORT_READ_FAILED: "A named source could not be read; no report was produced.",
};

type Document = { path: string; sha256?: string };
type Citation = { id: string; path: string; quote: string };
type Assessment = { criterion: string; status: string; reason: string; evidence: string[] };
type Omission = { path: string; reason: string };
type Request = { documents: Document[]; citations: Citation[]; assessments: Assessment[]; omissions: Omission[] };
export type EvidenceReportResult = { ok: true; report: string } | { ok: false; code: string; message: string };

function fail(code = "INVALID_REPORT"): never {
  throw codedError(code, messages[code]);
}

function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const row = value as Record<string, unknown>;
  if (required.some((key) => !Object.hasOwn(row, key)) || Object.keys(row).some((key) => ![...required, ...optional].includes(key))) fail();
  return row;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x08\x0b-\x1f\x7f]/.test(value)) fail();
  return value;
}

function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail();
  return value;
}

function path(value: unknown, markdown = false): string {
  const raw = text(value, 256);
  const name = markdown ? raw : raw.replace(/\/+$/, "");
  const parts = name.split("/");
  if (isAbsolute(name) || /[\\\r\n\t]/.test(name) || parts.some((part) => !part || [".", ".."].includes(part))
    || (markdown && (!name.toLowerCase().endsWith(".md") || parts.some((part) => [".git", ".picm", ".pi"].includes(part))))) fail(markdown ? "INVALID_SOURCE" : "INVALID_REPORT");
  return name;
}

function unique(values: string[]) {
  if (new Set(values).size !== values.length) fail();
}

function request(value: unknown): Request {
  if (Buffer.byteLength(JSON.stringify(value) ?? "") > 65536) fail();
  const input = object(value, ["documents", "citations", "assessments", "omissions"]);
  const documents = array(input.documents, 20).map((value) => {
    const row = object(value, ["path"], ["sha256"]);
    const document: Document = { path: path(row.path, true) };
    if (row.sha256 !== undefined) {
      document.sha256 = text(row.sha256, 64);
      if (!/^[0-9a-f]{64}$/.test(document.sha256)) fail();
    }
    return document;
  });
  const citations = array(input.citations, 40).map((value) => {
    const row = object(value, ["id", "path", "quote"]);
    const citation = { id: text(row.id, 40), path: path(row.path, true), quote: text(row.quote, 1024) };
    if (!/^[a-z][a-z0-9-]*$/.test(citation.id) || !documents.some((d) => d.path === citation.path)) fail();
    return citation;
  });
  const assessments = array(input.assessments, REPORT_CRITERIA.length).map((value) => {
    const row = object(value, ["criterion", "status", "reason", "evidence"]);
    const assessment = { criterion: text(row.criterion, 40), status: text(row.status, 20), reason: text(row.reason, 1000),
      evidence: array(row.evidence, 40).map((id) => text(id, 40)) };
    if (!REPORT_CRITERIA.some((criterion) => criterion === assessment.criterion) || !statuses.includes(assessment.status)
      || (assessment.status !== "Unverified" && !assessment.evidence.length)
      || assessment.evidence.some((id) => !citations.some((c) => c.id === id))) fail();
    unique(assessment.evidence);
    return assessment;
  });
  const omissions = array(input.omissions, 20).map((value) => {
    const row = object(value, ["path", "reason"]);
    const omission = { path: path(row.path), reason: text(row.reason, 300) };
    if (documents.some((d) => d.path === omission.path || d.path.startsWith(`${omission.path}/`))) fail();
    return omission;
  });
  unique(documents.map((d) => d.path));
  unique(citations.map((c) => c.id));
  unique(assessments.map((a) => a.criterion));
  unique(omissions.map((o) => o.path));
  if (assessments.length !== REPORT_CRITERIA.length) fail();
  return { documents, citations, assessments, omissions };
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\`*_[\]#|!]/g, "\\$&");
}

function inline(value: string) {
  return escape(value.replace(/\s+/g, " "));
}

async function source(root: string, document: Document, limit: number, signal?: AbortSignal) {
  let current = root;
  const parts = document.path.split("/");
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())) fail("INVALID_SOURCE");
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail("INVALID_SOURCE");
    if (info.size > limit) fail("SOURCE_TOO_LARGE");
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) fail("SOURCE_TOO_LARGE");
    const bytes = buffer.subarray(0, length);
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail("INVALID_SOURCE"); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) fail("INVALID_SOURCE");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (document.sha256 && document.sha256 !== sha256) fail("SOURCE_CHANGED");
    return { content: content.replace(/\r\n/g, "\n"), sha256, bytes: length };
  } finally {
    await handle.close();
  }
}

export async function evidenceReport(root: string, input: unknown, signal?: AbortSignal): Promise<EvidenceReportResult> {
  try {
    signal?.throwIfAborted();
    const params = request(input);
    if (!isAbsolute(root)) fail("INVALID_SOURCE");
    const base = await realpath(root);
    if (!(await stat(base)).isDirectory()) fail("INVALID_SOURCE");
    const sources = new Map<string, Awaited<ReturnType<typeof source>>>();
    let bytes = 0;
    for (const document of [...params.documents].sort((a, b) => a.path.localeCompare(b.path, "en"))) {
      const snapshot = await source(base, document, Math.min(65536, 262144 - bytes), signal);
      bytes += snapshot.bytes;
      if (bytes > 262144) fail("SOURCE_TOO_LARGE");
      sources.set(document.path, snapshot);
    }
    const lines = ["# Optimization evidence report (experimental)", "", "Read-time snapshots of named sources only; no discovery or execution. Quotes are checked; model conclusions and scope completeness are not.", "", "## Named source snapshots"];
    for (const [name, snapshot] of sources) lines.push(`- ${inline(name)} — SHA-256 ${snapshot.sha256}`);
    if (!sources.size) lines.push("No source documents supplied.");
    lines.push("", "## Checked quotations");
    for (const citation of [...params.citations].sort((a, b) => a.id.localeCompare(b.id, "en"))) {
      const content = sources.get(citation.path)!.content;
      const quote = citation.quote.replace(/\r\n/g, "\n");
      const index = content.indexOf(quote);
      if (index < 0) fail("CITATION_NOT_FOUND");
      if (content.indexOf(quote, index + 1) >= 0) fail("AMBIGUOUS_CITATION");
      const start = content.slice(0, index).split("\n").length;
      const end = content.slice(0, index + quote.length - 1).split("\n").length;
      lines.push("", `### ${citation.id}: ${inline(citation.path)}:${start}${end === start ? "" : `-${end}`}`, ...quote.split("\n").map((line) => `> ${escape(line)}`));
    }
    if (!params.citations.length) lines.push("No quotations supplied.");
    lines.push("", "## Writing-lens audit (model assessments, not verified conclusions)", "", "Evidence references confirm quoted text, not whether it supports the assessment. No execution result is verified by this helper.", "", "| Criterion | Assessment | Model reasoning | Evidence IDs |", "| --- | --- | --- | --- |");
    for (const criterion of REPORT_CRITERIA) {
      const row = params.assessments.find((a) => a.criterion === criterion)!;
      lines.push(`| ${criterion} | ${row.status} | ${inline(row.reason)} | ${row.evidence.length ? [...row.evidence].sort().join(", ") : "none supplied"} |`);
    }
    lines.push("", "## Declared omissions (not inspected by this helper)");
    for (const omission of [...params.omissions].sort((a, b) => a.path.localeCompare(b.path, "en"))) lines.push(`- ${inline(omission.path)} — ${inline(omission.reason)}`);
    if (!params.omissions.length) lines.push("None declared; this does not establish complete coverage.");
    signal?.throwIfAborted();
    const report = lines.join("\n") + "\n";
    if (Buffer.byteLength(report) > 98304) fail();
    return { ok: true, report };
  } catch (error) {
    const code = signal?.aborted ? "REPORT_CANCELLED" : errorCode(error);
    const safeCode = code && Object.hasOwn(messages, code) ? code : "REPORT_READ_FAILED";
    return { ok: false, code: safeCode, message: messages[safeCode] };
  }
}
