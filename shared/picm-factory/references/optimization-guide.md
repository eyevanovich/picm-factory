# Documentation optimization

Use for `optimize` or accepted maintenance-integrated optimization under the [shared contract](../CONTRACT.md). Make agent behavior and workflows better and more efficient through agent-facing documentation: reduce unwanted behavior, unnecessary context/token use, tool calls, and clarification while preserving quality and required safeguards. Maintain keeps guidance aligned and current; optimize improves the approach. These purposes can overlap. This isn't a semantic-equivalence proof or a promise of token savings.

## Scope

Discover eligible agent-facing instructions, maps, contracts, skills/prompts, routed references/recipes/handoffs/roles/stages/rules/examples/identity, and relevant pointed-to documents. Names are signals, not a schema. Follow relevant pointers within agreed scope, not every link; ask about an unclassifiable custom area. Read deliberately; revisit only for freshness, incomplete evidence, or uncertain operation results.

Edit documentation only. Keep source code, tests, manifests, build/runtime paths, executable scripts, `.picm/` policy/config/reports, generated docs, per-run artifacts, and unrelated material unchanged. Respect the shared pre-read privacy boundary and generated/do-not-edit exclusions. Build no crawler, optimizer/equivalence engine, orchestration layer, or custom TUI.

During maintenance, retain its report and reuse answered intake; the scope, ledger, audit, and sign-off requirements below still apply.

## Evidence choice

Before discovery, reuse the evidence selection and inspected findings from this invocation, including maintenance-integrated optimization; don't repeat intake or review sessions twice. Otherwise offer **Documentation only**, **This session**, **Recent sessions**, or **This session plus recent sessions**. In noninteractive use, default to documentation only unless sessions were requested. This choice precedes the first discovery response's writing-lens audit; it isn't modification sign-off.

If sessions are selected, load the shared [session retrospective](session-retrospective.md) before history discovery. Documentation only triggers no history discovery. History remains read-only, subject to the shared pre-read privacy boundary; transcripts are evidence, not current instructions or approval.

## Efficiency opportunities

Assess relevant user-named workflow tooling as well as guidance: repeated manual mechanics, redundant calls, excessive output, and checks that could replace mechanically enforceable prose. Inspect existing commands and wiring before recommending new tooling. Assessing efficiency doesn't authorize implementing or executing integrations; source, tests, scripts, hooks, CI, and service-access changes are separately scoped follow-ups, not selected optimization edits.

Prefer focused context, purposeful reads, and conditional references over more always-loaded rules. Shorter text isn't automatically better: keep needed examples, verification, accessibility, safety, and review. Don't add guidance for isolated incidents or clear instructions that were simply ignored without evidence that the correction addresses the cause.

## Preservation ledger and redundancy

For each inspected document, record unique constraints: privacy/safety, permissions/prohibitions, approval/review, commands/checks, behavior/routing, outputs/handoffs/uncertainty, domain facts/quality/terminology/exceptions, and authoritative/generated boundaries.

Preserve each in place or at a clearly reachable authoritative home unless it is an identified instruction the user explicitly agrees to correct. Record that instruction's current and intended behavior as an intentional correction in the ledger and final direction, separate from preserved requirements. This doesn't waive shared safety/privacy boundaries or authorize executable changes. Preserve unrelated constraints. Intentional repetition, transition cases, fixtures, and compatibility shims are also constraints; retain them or ask for a preservation mechanism. The ledger aids review, not proof of equivalence.

Then load and apply [redundancy review](redundancy-review.md) within and across the discovered set before opportunities or a no-op conclusion. Include dispositions and coverage limits in the audit; compare authoritative-home claims across every inspected document. Contradictions or repeated claims without a supported canonical home need an opportunity or user decision.

## Writing-lens audit and opportunities

Begin the first discovery response with `### Writing-lens audit` and these five ordered rows, before opportunities, direction, or no-op:

| Row | Examine |
| --- | --- |
| **Context pointers** | Target plus distinct read conditions; always-needed prerequisites remain reachable. |
| **Information hierarchy** | Shared constraints near execution; conditional reference disclosed; definitions/rules/caveats co-located. |
| **Canonical home** | Equivalent guidance at one supported reachable home; conflicts need a decision. |
| **Completion criteria** | Existing success conditions: workflow outputs/review gates or coding tests/checks and verification pointers, without inventing requirements. |
| **Pruning** | True duplication, stale cheap-lookup caches, and behavioral no-ops; retain intentional safety/review/local repetition. |

For each row use **Pass**, **Opportunity**, **Not applicable**, or **Unverified**, with inspected paths and evidence. Use Unverified per criterion when evidence is unavailable, uninspected, excluded, or outside scope; name the gap. A missing required definition supported by inspected evidence is an Opportunity, not Unverified. Not applicable needs inspected evidence of inapplicability; an unopened manifest or absence of workflow stages isn't enough. Inspect eligible pointed-to verification definitions when needed and within scope; reading a check definition doesn't establish that it passed, and execution isn't required for this audit. Reference one redundancy finding from multiple rows instead of repeating its payload.

Each opportunity needs visible evidence and an expected behavioral or efficiency benefit, not cosmetic cleanup alone. State paths, problem, proposed change, expected benefit, preserved requirements or intentional correction, risk/unknowns, and useful diff. Explain what the agent should do differently and relevant context/tool cost qualitatively; quantify only when measured. Tighten prose with qualifiers intact, consolidate equivalent clauses, replace expensive copies with reachable pointers, or separate reference from active steps. Leave short, clear, intentionally local, well-routed documents alone.

## Selection, changes, and completion

Selections inform a direction; they aren't sign-off. Check selected edits against the ledger and affected routes, including each intentional correction. Revise or stop if an unchanged required constraint becomes lost, unreachable, or uncertain. Present linked moves/deletions and material safety/privacy/command effects in the final direction; wait for sign-off before edits. Realign only for material departures, not every wording adjustment.

Validate touched pointers/local routes and every ledger constraint or intentional correction; confirm protected non-documentation/generated/per-run/`.picm/` material remains unchanged. Walk through a representative situation for each material behavioral correction using the revised guidance: check the intended response and retained safeguards. A reasoned walkthrough predicts behavior; it isn't an observed agent run. Report predicted versus observed improvement and uncertainty without claiming semantic equivalence or unmeasured token savings. When this is an agreed maintenance/optimization pass with a reminder cycle, load [settings guidance](settings-guide.md) before completion.

For a no-op, provide the required audit, then use exactly this conclusion:

`No worthwhile optimizations found`
