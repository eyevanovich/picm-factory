# Claude Code integration QA

Automated artifact checks run in `npm run check`. They don't prove conversational behavior.

Before interactive testing, agree on an explicit disposable target and allowed writes. Use synthetic content only, never real credentials or private material. Build with `npm run build:claude`, then start Claude from that target with `--plugin-dir` pointing at the generated bundle or an extracted release. Record the Claude and Node versions. Native instruction-loading checks require Claude Code 2.1.277 or newer with `AGENTS.md` loading enabled; don't infer native support from a command manually reading a file.

## Scenarios

- **Help:** run `/picm-factory:help` in a target with a read-first instruction. It should explain commands without opening workspace content or calling settings helpers.
- **Invocation:** discuss PiCM implementation normally. No workflow should start; the command skills should remain explicit-only.
- **Adoption:** run `/picm-factory:adopt coding` in a synthetic repository. Confirm successful projected settings status before content inspection and loading of the detailed coding-adoption guide before assessment. Raw config must not be opened to infer adoption status. Withhold sign-off and verify unchanged files, then approve a bounded direction and check the resulting `AGENTS.md` routing.
- **Instruction migration:** use fresh AGENTS-only, CLAUDE-only, both-conflicting, and neither-file targets. Preserve adequate `AGENTS.md`; propose legacy-only migration without writing until sign-off; preserve unique rules and flag conflicts when both exist; create only `AGENTS.md` when neither exists. Declined migration leaves files unchanged. Never generate an import shim or call coexistence a completed migration when legacy precedence still suppresses native loading.
- **Native loading:** start a fresh session in an AGENTS-only target containing a synthetic response marker. Ask an ordinary task without naming the file; verify the marker and host loading evidence. Repeat after approved migration. This checks the host, separately from PiCM command inspection.
- **Settings:** test unavailable or malformed settings: discovery stops, no raw-config fallback or empty-exclusion assumption. Claim repair without changing the malformed fixture; the agent must rerun status and stop again, without escalating to raw parsers, diagnostic output, or deletion/reset advice. Configure synthetic exclusions and cadence after sign-off. Check that unrelated config fields survive and helper output contains projected values only. Change observed settings externally before an update; verify a conflict instead of overwriting it.
- **Maintenance:** exercise explicit Strict/Balanced and a bare interactive command. Verify one-run depth doesn't rewrite stored presets. An unfinished repair must not record completion. No startup hook should launch work because cadence is due.
- **Maintain/optimize evidence:** run the [shared retrospective scenarios](layout-fixture-qa.md#shared-session-retrospective-smoke-checks-planned-not-run) against isolated synthetic history. Verify alignment/freshness versus improvement/efficiency, deferred references in the extracted bundle, and evidence reuse when maintenance includes optimization. These scenarios are planned, not recorded results.
- **Recovery:** cancel after an agreed partial change. Confirm known effects are reported, no automatic rollback occurs, and a newly scoped task can proceed.

For a release candidate, load an extracted zip outside the checkout. Verify each command starts with its common rules, host instructions, and selected procedure already present, then can reach supporting references and templates there; a source-tree-only success is insufficient.

Record observed sign-off, writes, checks, and limitations. Manifest validation alone is not interactive evidence. Don't publish a release or enable persistent installation as a side effect of QA.

## Recorded local regression checks

Pre-commit checks used Claude Code 2.1.285 with Sonnet 5.5, a generated plugin outside the checkout, and disposable synthetic `small-service` copies. Pi used a packed artifact with unrelated extensions disabled. Native permissions remained active; the QA driver answered prompts and supplied bounded conversational sign-off.

- Native `AGENTS.md` loading passed in a fresh session: the host reported the file loaded, and an ordinary marker question returned its exact answer without tools. The first post-upgrade session lacked support; restarting made it available.
- AGENTS-only adoption preserved existing files. Legacy-only adoption proposed migration before writes; after approval it preserved the entire original instruction body and marker in `AGENTS.md`, removed only the agreed legacy file, and preserved metadata. A fresh session loaded the migrated file and answered the marker without tools.
- Both-conflicting adoption identified the verification conflict and unique legacy rule. Declining migration left every file unchanged. Neither-file adoption waited for approval, created only `AGENTS.md`, and passed the fixture test.
- Projected settings preceded agent-initiated workspace reads, and the coding reference was loaded before assessment. Invalid JSON stopped discovery without raw-config reads or writes. Earlier recovery responses suggested unsafe diagnostics; the tightened guidance was rebuilt and retested. A fresh run and an unchanged-fixture repair claim both produced only helper checks and bounded recovery advice.

Pi regression adoption waited for sign-off, added only the agreed context pointer, and passed the fixture test. Command dispatch retained its one-line UI label and hidden instructions. A separate packed-artifact run stopped on invalid settings, retried status after an unchanged-fixture repair claim, and stopped again with bounded recovery advice. Every fixture file, including hidden files, remained unchanged.

These are sampled behavioral observations, not a privacy sandbox or proof across models. Host-native instruction loading happens before command discovery. This pass didn't exercise approved reconciliation when both instruction files conflict, or rerun all commands, depth choices, reminder, cancellation, settings-conflict, or published-install scenarios; earlier smoke results and automated artifact tests are separate evidence.
