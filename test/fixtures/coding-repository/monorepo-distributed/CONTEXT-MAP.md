# Repository Context Map

| Area | Responsibility | Read next | Entry point / authority | Verification source |
| --- | --- | --- | --- | --- |
| `apps/api/` | HTTP-facing greeting application | `apps/api/CONTEXT.md` | `apps/api/src/server.js` | `apps/api/test/` |
| `packages/shared/` | Shared greeting formatting | `packages/shared/CONTEXT.md` | `packages/shared/src/format.js` | `packages/shared/test/` |

## Cross-boundary constraints

`apps/api` may consume `packages/shared`; the shared package must not import application code.
