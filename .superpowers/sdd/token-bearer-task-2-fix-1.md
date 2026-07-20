# Task 2 fix 1 — independent review findings

Apply only this Task 2 repair in `webhard-api/src/integration/device-auth`; keep all work unstaged and do not touch the upcoming HTTP transport/bearer tasks.

## Binding fixes

1. Concurrent / immediate retry recovery must be idempotent.
   - If the initial lookup sees no exchange and concurrent work creates the same `(deviceId, requestIdDigest)`, a later P2034 / P2002 / predecessor-missing conditional path must re-read that exchange and run the existing raw predecessor/successor recovery checks.
   - Same request ID plus same old/next raw values must receive a newly issued recovery JWT. Same request ID with changed old or next raw value must remain invalid. If no matching completed exchange exists, retain the original safe error.
   - Add focused red/green tests that exercise the post-transaction retry/relookup path. Do not widen any legacy/static-key route.

2. `recoverableUntil` must equal the successor refresh credential expiry, as required by Task 1 persistence semantics. Do not limit it to the 10-minute JWT TTL. A stale exchange may transition to `expired` only after that successor expiry. Update/add tests.

3. Exact canonical Base64URL validation must not reject an otherwise canonical all-zero 16/32/64-byte value merely because its encoded characters repeat. Remove the undocumented repeated-character restriction and adjust/add regression tests; keep required byte lengths and round-trip validation.

## Verification

- Follow TDD: add/adjust failing focused tests first and record expected RED evidence.
- Re-run the Task 2 focused Jest command, `pnpm exec tsc --noEmit --pretty false`, the affected Prettier check, and scoped `git diff --check`.
- Append the fix details, red/green evidence, and test results to `token-bearer-task-2-report.md`.
- No real DB, migration, secret lookup, deployment, stage, commit, or push.
