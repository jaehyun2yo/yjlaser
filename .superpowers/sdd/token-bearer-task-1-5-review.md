# Task 1–5 final independent security review

## Initial verdict

- Spec Compliance: **❌**
- Task Quality: **Not Ready**
- Critical: 0
- Important: 1

## Important finding — bootstrap absolute-form request-target bypass

`device-auth-bootstrap-transport.middleware.ts` returned an unmodified path when the request-target
did not start with `/`. An absolute-form target such as
`http://service/api/v1/integration/device-auth/token` therefore skipped both the dedicated 4 KiB
non-inflating parser and the generic-parser skip, while Express could still route its pathname to
the canonical controller. This also bypassed the early query/alias/transfer/compression/no-store
boundary and permitted the generic 10 MiB parser to run before authentication.

Required resolution: reserve absolute-form targets whose decoded pathname matches enroll,
enrollment-status or token, but reject every non-canonical raw origin-form target with 400 and
`no-store, private`. Add table-driven absolute-form, query, compression, chunked/transfer and
over-4-KiB regressions for all three routes.

## Initial independent evidence

- Task 1–5 Jest: 34 suites / 549 tests passed.
- Related legacy programs: 3 suites / 20 tests passed.
- TypeScript, placeholder-DSN Prisma validate, JS/Python fixture verifier and both repository
  diff-checks passed.
- Build was not repeated by the read-only reviewer; the Task 5 implementer reported a passing Nest
  build.

## Resolution and re-review

The bootstrap transport now normalizes absolute-form targets for reservation and rejects every
non-canonical raw origin-form target before body parsing. Fifteen RED assertions were added across
enroll, enrollment-status and token for plain/query/compressed/chunked/over-4-KiB absolute-form
requests.

The subsequent re-review found canonical `Transfer-Encoding` and `X-Session-Token` parity gaps.
The middleware now rejects transfer encoding before body parsing, and both transport and Nest
source guards reject session-token headers. Direct canonical and value/empty/duplicate regressions
were added.

Current verification: focused 2 suites / 71 tests; Task 3 8 suites / 168 tests; full Task 1–5
34 suites / 571 tests; TypeScript; Nest build; changed-file Prettier; clean RC diff-check all passed.

Fresh security re-review directly probed all three corrected boundaries and returned **Spec
Compliance ✅**, **Task Quality Approved**, Critical 0, Important 0, Minor 0. Actual reverse-proxy,
Redis/PostgreSQL, migration, secret, PC and deployment validation remains an operational gate.
