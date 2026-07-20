# Layout Profile Fixtures

These fixtures are small, synthetic PiCM/ICM workspaces for manual QA and smoke testing.
They are not canonical schemas. Layout profiles are recommendations; maintainers should check routing clarity, context locality, safety, and handoff quality rather than exact paths.

Each micro-fixture is a self-contained workspace unless its name begins with `existing-`, which represents a pre-adoption project for `/picm-adopt`.

Profiles covered:

- `stage-pipeline/` — ordered workflow stages, including root-numbered and nested `stages/` shapes plus an intentional source-integrity drift fixture for heuristic trace QA.
- `specialist-folder/` — one reusable expert/helper, with `examples.md` present in one fixture and absent in another.
- `team-role-os/` — multiple role folders with handoffs and shared reference.
- `custom-existing-structure/` — pre-adoption agent-file variants plus one adopted custom PiCM workspace.
- `security-red-team/` — synthetic sensitive-material fixtures for `/picm-adopt` and `/picm-maintain` safety checks.
- `anti-patterns/` — synthetic, non-sensitive workspaces with one primary maintenance defect each: root brain dump, missing task routing, missing stage outputs/review gates, mixed reference/working artifacts, stale context, normal routing through `.picm/`, or incomplete handoff.

Security red-team fixtures use fake token-looking strings and labeled private/client-looking material only. They must never contain real secrets, credentials, client data, regulated data, or private personal data.

See `docs/layout-fixture-qa.md` for smoke-test instructions.
