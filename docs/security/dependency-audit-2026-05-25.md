# Dependency Audit - 2026-05-25

## Scope

- Frontend production dependencies: `pnpm audit --prod --audit-level high --json`
- Backend production dependencies: `pnpm --dir webhard-api audit --prod --audit-level high --json`
- Target gate: production-runtime Critical/High findings must be zero. Moderate findings may remain only with documented reachability and expiry.

## Result

| Area     | Critical | High | Moderate | Status                                                |
| -------- | -------: | ---: | -------: | ----------------------------------------------------- |
| Frontend |        0 |    0 |        0 | PASS                                                  |
| Backend  |        0 |    0 |        1 | PASS with documented non-reachable Moderate exception |

## Fixed Findings

| Area     | Package                                          | Classification                                   | Action                                                                                                   |
| -------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Frontend | `socket.io-parser`                               | production-runtime                               | Override to `4.2.6`                                                                                      |
| Frontend | `ws`                                             | production-runtime                               | Override to `8.20.1`                                                                                     |
| Frontend | `bn.js`                                          | production-runtime                               | Override vulnerable v4 range to `4.12.3`                                                                 |
| Frontend | `postcss`                                        | production-runtime/build pipeline                | Override to `8.5.10`                                                                                     |
| Frontend | `openai`                                         | unused production dependency                     | Removed                                                                                                  |
| Frontend | `@sentry/nextjs`, `inngest`                      | production-runtime monitoring/background jobs    | Updated to current versions and pinned vulnerable transitive packages with overrides                     |
| Frontend | `hono`, `picomatch`, `yaml`                      | production transitive via Inngest/Sentry         | Override to patched versions                                                                             |
| Frontend | AWS SDK packages                                 | production-runtime                               | Updated to `3.1053.0`; replaced deprecated `@aws-sdk/node-http-handler` with `@smithy/node-http-handler` |
| Backend  | AWS SDK packages                                 | production-runtime                               | Updated to `3.1053.0`                                                                                    |
| Backend  | `express` / `path-to-regexp`                     | production-runtime                               | Updated `express`; override `path-to-regexp@0` to `0.1.13`                                               |
| Backend  | `socket.io-parser`, `ws`                         | production-runtime                               | Override to patched versions                                                                             |
| Backend  | `multer`                                         | production-runtime via Nest adapter              | Override to `2.1.1`                                                                                      |
| Backend  | `effect`, `defu`                                 | production transitive via Prisma package graph   | Override to patched versions                                                                             |
| Backend  | `glob`, `minimatch`, `brace-expansion`, `lodash` | production transitive via archive tooling        | Override to patched versions                                                                             |
| Backend  | `file-type`                                      | production transitive via Nest common validators | Override to `21.3.2`                                                                                     |

## Remaining Exception

| Package                | Advisory              | Severity | Classification                   | Reachability                                            | Owner  | Expiry      |
| ---------------------- | --------------------- | -------- | -------------------------------- | ------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------- |
| `@nestjs/core@10.4.22` | `GHSA-36xv-jgw5-4q75` | Moderate | non-reachable in current backend | The issue is in Nest SSE event serialization. `rg "@Sse | Sse\\( | EventSource | MessageEvent" webhard-api/src` returns no production usage. Current realtime paths use Socket.IO gateways, not Nest SSE routes. | Platform/security | 2026-06-25 |

## Follow-Up Ticket

### SEC-07-FU-01: Nest 11 Migration Spike

- Upgrade target: `@nestjs/core >= 11.1.18` and matching Nest packages.
- Success criteria:
  - backend typecheck passes;
  - focused auth, contacts, files, gateway, and Prisma tests pass;
  - no new peer dependency mismatch that affects runtime;
  - `pnpm --dir webhard-api audit --prod --audit-level high --json` reports Critical/High zero and documents any remaining Moderate.
- Failure criteria:
  - controller decorators, guards, interceptors, websockets, or Prisma integration require behavior changes that cannot be proven in the same migration patch.

## Verification Evidence

```powershell
pnpm audit --prod --audit-level high --json
```

Result: exit code 0, Critical/High/Moderate all zero.

```powershell
pnpm --dir webhard-api audit --prod --audit-level high --json
```

Result: Critical 0, High 0, Moderate 1. The remaining Moderate is the documented non-reachable Nest SSE exception above.

Latest non-JSON verification also passed the high gate:

```powershell
pnpm audit --prod --audit-level high
pnpm --dir webhard-api audit --prod --audit-level high
```

Result: both commands exited 0. Backend still reports the same documented Moderate advisory when run without the high threshold.
