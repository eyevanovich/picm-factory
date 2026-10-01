# Redundancy review

Use during `/picm-maintain` and `/picm-optimize` discovery to find repeated instructions and context pointers. Review meaning and applicability, not just matching text.

## Scope

Compare eligible agent-facing documents in the agreed inspection scope: root/local instructions, context maps, contracts, and routed workflow/reference/skill/prompt guidance. Use the document set already discovered for the current task; follow relevant pointers within that scope rather than crawling every link. Honor the calling workflow's privacy exclusions and generated/do-not-edit boundaries.

General maintenance reviews its inspected set even when optional optimization is declined. Focused maintenance and trace compare only documents relevant to the requested check or symptom. Coding Balanced compares its representative set; Strict compares its broader inspected set. State coverage and omissions rather than implying workspace-wide completeness.

## Compare and classify

1. **Group repeated meaning.** Compare instructions within each file and across the inspected set. Look for exact copies, paraphrases, overlapping clauses, copied workflow steps, and repeated pointers. Cite paths and headings or line ranges for each candidate group.
2. **Check applicability.** Compare required action, trigger, scope, precedence, exceptions, and qualifiers. Identical wording under different scopes isn't automatically redundant. Pointers to the same target may serve different task branches or independent entry points; a thin pointer to authoritative detail isn't a duplicate of that detail.
3. **Classify the evidence.** Use the dispositions below. For partial overlaps, separate the shared clause from each unique requirement. Conflicting instructions need a source-of-truth decision, not deduplication by choosing the shortest version.
4. **Check the proposed home.** For a consolidation candidate, identify a supported canonical home and test reachability from every affected task route or independent working directory. Preserve all unique constraints and pointer triggers. If ownership or reachability is unclear, ask or leave the candidate unresolved.

| Disposition | Meaning and next action |
| --- | --- |
| Consolidation candidate | Same meaning and applicability with no visible reason for repetition. Propose the smallest merge, removal, or thin pointer supported by a reachable canonical home. |
| Partial overlap | Some meaning is shared, but qualifiers or actions differ. Propose consolidation only for the shared portion; retain each unique requirement. |
| Retain intentionally | Repetition supports safety, review, local boundaries, compatibility, independent entry points, or an explicit preservation constraint. State why it stays. |
| Uncertain or conflicting | Meaning, applicability, authority, or preservation is unresolved. Name the uncertainty or user decision; don't propose deletion as if equivalence were established. |

Useful pointer consolidation keeps the target and every distinct condition for reading it. Avoid hiding an always-needed prerequisite behind a conditional pointer, or replacing locally required instruction with an unreachable reference.

## Report and completion

For each candidate group, report the locations, repeated meaning or pointer target, disposition and evidence, unique constraints to retain, and smallest safe action. Name the proposed canonical home when consolidation is supported; otherwise explain why the group stays or needs a decision. Don't quote excluded or sensitive content.

In maintenance, classify harmless removable repetition as a **Suggestion**. Use **Warning** when divergence or ambiguity affects behavior, safety, or routing. Include likely cause and the existing repair tier; repetition alone isn't a hard failure. Include retained or uncertain groups as coverage notes rather than calling them removable duplicates.

In optimization, put pointer findings in **Context pointers** and ownership/pruning findings in **Canonical home** or **Pruning** within the existing five-row audit. Keep one finding per group and refer to it from other rows rather than repeating the payload. Check proposed consolidation against the preservation ledger.

Complete the review when the inspected set has been compared within and across files, each candidate has a disposition, and coverage limits are stated. A no-finding result describes that inspected scope only; an uninspected area isn't Pass. This is a qualitative review, not proof of semantic equivalence or token savings.

Review doesn't authorize edits. Repairs and selected optimizations use the calling workflow's final-direction/sign-off contract. After approved consolidation, verify preserved constraints and reachable pointers from each affected entry point.
