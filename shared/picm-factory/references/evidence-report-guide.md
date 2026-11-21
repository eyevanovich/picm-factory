# Experimental optimization evidence report

Only use this helper for an explicitly requested experimental audit, after the relevant discovery, preservation, and required reference review. Report-only is not such a request. This audit is not a prerequisite for ordinary optimization proposals or a scoped no-op. Its output is the experimental writing-lens audit, not a second report after a separately written audit. Native tool/command output is the presentation path; use its expanded view to inspect the complete report. Completion and final-chat decisions belong to the [optimization procedure](optimization-guide.md#selection-changes-and-completion); this helper checks quotations, not whether the agreed review is complete or an optimization is worthwhile. If complete native output isn't accessible, disclose the delivery limitation instead of claiming the report was delivered unchanged. Keep preservation notes, opportunities, and other analysis separate and labeled as model assessments. This doesn't replace inspection or authorize changes; helper invocation and final prose aren't runtime-enforced.

## Scope and limits

Successful projected settings status and path eligibility checks must precede invocation. Name only already-eligible, non-sensitive Markdown documents inside the current workspace. Honor Git ignores, persisted/session exclusions, and sensitive-path rules before providing paths or excerpts. The helper doesn't discover paths or enforce those exclusions. Never pass excluded contents through an excerpt instead of a path. Declared omissions aren't opened.

The helper reads named files, checks unique exact excerpts, computes their locations and SHA-256 digests, and renders named scope without inventory totals. It neither crawls nor executes checks, saves reports, reads history, establishes Git membership, or proves routing completeness. Non-Markdown evidence, external documents, and unsupported evidence remain outside this helper's checked scope; describe the gap rather than changing exclusions or widening reads.

Checked text isn't a verified conclusion. Assessment statuses and reasons remain model judgments, including **Pass**. A valid quote doesn't prove it supports a judgment. Use **Unverified** per criterion when needed evidence is unavailable, uninspected, excluded, or outside scope; name the gap. An inspected missing required definition is **Opportunity**, not Unverified. **Not applicable** needs inspected evidence of inapplicability; an unopened manifest or absence of workflow stages isn't enough. Reading a check definition doesn't establish execution or success. No execution-success claim is verified by this helper.

Digests identify the bytes read during this call, not a simultaneous repository snapshot. If an independently measured earlier digest is available, supply `sha256` with that document to reject a mismatch. Without it, the helper doesn't establish freshness since earlier inspection. Regular-file and symlink checks reduce accidental path mistakes; they aren't a privacy sandbox or a guarantee against concurrent ancestor replacement.

## Request

Use the same JSON object on both hosts:

```json
{
  "documents": [{ "path": "AGENTS.md" }],
  "citations": [{ "id": "routing", "path": "AGENTS.md", "quote": "Read the context map." }],
  "assessments": [
    { "criterion": "Context pointers", "status": "Unverified", "reason": "The map wasn't inspected.", "evidence": ["routing"] },
    { "criterion": "Information hierarchy", "status": "Unverified", "reason": "Only the root routing instruction was inspected.", "evidence": [] },
    { "criterion": "Canonical home", "status": "Unverified", "reason": "Other documents weren't compared.", "evidence": [] },
    { "criterion": "Completion criteria", "status": "Unverified", "reason": "The verification definition is excluded.", "evidence": [] },
    { "criterion": "Pruning", "status": "Unverified", "reason": "Other documents weren't compared.", "evidence": [] }
  ],
  "omissions": [{ "path": "package.json", "reason": "Session exclusion.", "blocksVerificationOf": ["Completion criteria"] }]
}
```

Use actual excerpts, not the example's text. Document paths are normalized root-relative paths with `/` separators, without `.`/`..` segments. Omitted directory paths may end in `/`; the helper normalizes that spelling and rejects declarations that contain a named source. Every citation names a supplied document and has a unique lowercase ID. Every assessment names an existing criterion/status and references citation IDs, not invented locations. All audit criteria must appear exactly once. Assessments other than **Unverified** require a citation, but this is a reference-integrity check, not a relevance check.

Each omission requires `blocksVerificationOf`: up to five unique audit criterion names whose overall assessment the unavailable evidence prevents. Use `[]` when no criterion is blocked; relevance to a criterion alone isn't a blocking dependency. Every listed criterion must be **Unverified**. Other statuses reject the request with `INVALID_REPORT` before source reads; ratings aren't silently changed. Keep supported opportunities separate when an overall criterion remains Unverified. For example, an excluded command definition can block Completion criteria, while an unreadable mandatory comparison can block Canonical home and Pruning. Neither declaration authorizes opening the omitted path.

Blocking dependencies are model-declared, and the report labels them that way. The helper doesn't infer missing dependencies from paths, quotes, or prose: an empty list can still accompany a semantically incorrect rating. This consistency check doesn't establish review completeness, a no-op outcome, or final-chat compliance. Completion and output ownership remain with the optimization procedure.

Reads accept regular UTF-8 `.md` files without symlinks below the resolved workspace root. CRLF becomes LF for excerpt matching and line locations; digests cover raw bytes. Supply excerpts with LF newlines. Locations are one-based lines; a trailing newline doesn't add a new cited line. Missing or repeated excerpts fail without a partial report; provide a longer eligible excerpt for an ambiguous match, not an invented location.

Bounds: 64 KiB JSON input; up to 20 documents, 64 KiB per file and 256 KiB source bytes total; up to 40 citations of 1,024 characters; assessment reasons up to 1,000 characters; up to 20 declared omissions. Output is limited to 96 KiB. Errors expose sanitized codes/messages, not source contents. Cancellation yields no partial report. If the requested helper fails, state that no experimental audit was produced; don't substitute a handwritten audit or present proposals as fulfillment of the audit request. A failed helper call isn't a completed report and doesn't authorize diagnostic reads or saved artifacts.

## Host invocation

Pi uses `picm_evidence_report` with the JSON object as tool arguments. Claude uses its bundled `claude-code/report.ts --root /absolute/workspace`, with the same object on stdin. Resolve both through the installed host adapter, not workspace copies. Success returns the report text; failure returns a sanitized error and must remain visible as failure.

Report-only use stays read-only. Saving any report still requires conversational sign-off; neither helper saves automatically. A normal host tool trace may persist the request/result as part of host operation.
