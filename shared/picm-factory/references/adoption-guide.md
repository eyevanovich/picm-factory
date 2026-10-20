# Adoption

Use for `adopt` under the [shared contract](../CONTRACT.md). Inspect existing material, preserve what works, and propose the smallest routing improvement. Adoption isn't automatic conversion.

For explicit `coding`, selected coding adoption, or hybrid codebase mapping: Load [coding adoption](coding-adoption-guide.md) for this branch before assessing readiness or producing a report. The shortcut skips classification, not its mapping decisions or Strict examination.

## Read-first orientation

After successful projected settings status and path eligibility, inspect routing/context: `AGENTS.md`, `CONTEXT.md`, `REFERENCES.md`, identity/rules/examples, references, workflows, handoffs, stages, and relevant projected configuration. Inspect eligible legacy instructions only for the migration cases below; don't open raw config to determine profile or adoption status. For a complex workspace, offer a representative path-to-role-to-rationale inventory; classification informs proposals, never migration authority.

For sensitive non-Git material, recommend storage/sharing review and exact `.gitignore` patterns when future commits are plausible. Discovery exclusions aren't commit protection. Leave Git initialization to the user; ignore-file edits require sign-off. Describe sensitive findings generically, without opening or quoting protected content.

## Routing readiness and outcomes

Adequate visible routing identifies purpose, core read-first context, common task starts, meaningful local boundaries, relevant privacy/coding rules, and `.picm/` exclusion. Classify it as **adequate**, **partial**, **placeholder/unrelated**, or **conflicting/risky**.

Preserve adequate `AGENTS.md` routing. Use the migration cases below for legacy instructions; creating or migrating routing still requires a final direction and sign-off.

### Instruction-file migration

`AGENTS.md` is the canonical target at root and meaningful nested instruction boundaries:

- **AGENTS-only:** use it; preserve its rules and existing local routes.
- **CLAUDE-only:** when `AGENTS.md` is absent and `CLAUDE.md` exists, propose migration to `AGENTS.md`. Preserve every applicable instruction, resolve relative paths and incoming pointers, and name any rename/removal effects. Wait for sign-off before writing, renaming, or deleting; declined migration leaves the original untouched and the migration pending.
- **Both:** if both exist, identify cooperation/conflicts and unique instructions. Propose reconciliation into `AGENTS.md`, preserving meaning and resolving disagreements with the user. Don't silently overwrite or delete either file. Claude's legacy-file precedence can suppress native `AGENTS.md` loading; retaining both doesn't complete migration. Report that unresolved state until the signed-off legacy-file disposition and native loading are verified.
- **Neither:** propose the smallest useful `AGENTS.md`, not an alternate instruction filename or compatibility shim.

Mention `CLAUDE.md` only to explain or carry out an existing-file migration. Generate no import shim. Verify the host can load the resulting `AGENTS.md`; unsupported versions/settings are a setup limitation, not a successful migration.

| Outcome | Meaning |
| --- | --- |
| **Scanned only** | Findings or agreed optional metadata; no full adoption. |
| **Needs routing before adoption** | Routing absent, partial, placeholder, conflicting, or unsafe. |
| **Ready** | Adequate visible routing exists or was added; minimal metadata only if useful. |
| **Ready with warnings** | Adequate routing with non-blocking improvements remaining. |

Set `adoption.status: "adopted"` only with adequate visible routing. Metadata never replaces the route map. Where routing needs work, offer minimal compatibility, stronger ICM routing, or scanned-only reporting. Preserve existing names, examples, and conventions unless the direction changes them.

## Coding or hybrid branch

For other requests, offer coding adoption after shallow, bounded classification; selecting it activates the coding reference above. It owns mapping approach, additive/curated depth, high-value hints, Strict baseline, and codebase-map metadata. A coding profile can be primary or complement an existing workflow profile.

## Direction and result

Prepare a report covering profile, routing source/readiness, coding shape when relevant, evidence/unknowns, preserved material, optional improvements, and next steps. Keep optional inventory separate from consolidation proposals. Scanned-only/profile/map/depth/cadence choices are design input, not sign-off.

Optional metadata is `.picm/config.json` and `.picm/adoption-report.md`: retain only useful profile/routing/path hints, readiness/status, mapping, cadence, and normalized privacy exclusions. Preserve unrelated fields; use [settings guidance](settings-guide.md) for privacy/cadence changes. Saving a report or config is an edit.

Present the final direction before changes. Explicitly name curated merge/move/archive/rewrite/delete effects. Avoid labeling ambiguous content dead or marking inadequate routing adopted. Completion includes an optional initial maintenance offer after successful adoption; state it in the closing response. Adoption is complete without accepting or running that pass.

## Optional ICM improvements

Recommend concise root routing, local contracts, stable-reference/working-artifact separation, reviewable outputs, and handoffs retaining gaps, uncertainty, and next action. Preserve custom layouts that route clearly. Profile-specific first-run guidance lives in [layout profiles](layout-profiles.md).

## Report shape

Use relevant sections rather than empty headings:

```markdown
# PiCM Adoption Report
## Summary
- Compatibility: Ready / Ready with warnings / Needs routing before adoption / Scanned only
- Profile and routing source:
- Persisted adoption status: evidence-backed value / unknown
## Existing structure and routing readiness
## PiCM compatibility and coding adoption
## Evidence and unknowns
## Optional file-role inventory
## Security/privacy notes
## Preserved as-is
## Optional changes requiring sign-off
## Next steps
```
