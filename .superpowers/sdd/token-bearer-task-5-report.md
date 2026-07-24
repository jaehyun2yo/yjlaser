# Task 5 report — truthful contracts and full source verification

## Scope and result

- Updated the source-only desktop and company-site API contracts to match Tasks 1–4.
- Documented the exact token request/public response, response-loss recovery, bearer-only
  heartbeat/canary boundary, verified-device heartbeat quota `6/60s`, safe-canary no-side-effect
  rule, and next-request revoke/version enforcement on `DeviceBearerGuard` routes.
- Kept the truth boundary explicit: no immediate revoke claim for legacy static-key business
  traffic or live PCs, and no production/deployment claim.
- Canonical fixture and both verifiers were inspected through their required commands; no contract
  shape change was required, so they were not modified.
- No real database, Redis, network, secret, migration application, device, customer data, deploy,
  stage, commit, push, or publish operation was performed.

## Owned files

Modified:

- Parent workspace: `docs/contracts/device-auth-v1-desktop-integration.md`
- Clean RC: `docs/specs/api/endpoints/integration.md`
- Clean RC: `docs/changelog/CHANGELOG.md`

Created:

- Clean RC: `.superpowers/sdd/token-bearer-task-5-report.md`

Not modified because Task 4 did not change their canonical shape:

- `docs/contracts/device-auth-v1-fixtures.json`
- `docs/contracts/verify-device-auth-v1-fixtures.mjs`
- `docs/contracts/verify_device_auth_v1_fixtures.py`

## Full source-only verification

### Jest

Command from `webhard-api`:

```powershell
pnpm exec jest --runInBand --no-cache src/integration/device-auth src/common/guards/csrf.guard.spec.ts src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts src/common/middleware/device-auth-bearer-transport.middleware.spec.ts src/common/logging/request-redaction.spec.ts
```

Initial result: exit 0, 34 suites / 549 tests passed, 0 failed. The two expected synthetic 503 log lines
from `device-bootstrap.controller.spec.ts` were redacted and did not fail the suite.

After the final security review's bootstrap findings were fixed, the same command was rerun:
exit 0, 34 suites / 571 tests passed, 0 failed. Added assertions cover plain absolute-form, query,
compression, over-4-KiB inputs, canonical chunked rejection and session-header isolation across
enroll, enrollment-status and token.

### TypeScript and Nest build

```powershell
pnpm exec tsc --noEmit --pretty false
pnpm build
```

Results: both exit 0. Nest compilation succeeded. The build emitted only existing npm configuration
deprecation warnings.

### Prisma schema with isolated placeholder DSN

```powershell
$env:DATABASE_URL='postgresql://device_auth_validate:placeholder@127.0.0.1:5432/device_auth_validate?schema=public'
$env:DIRECT_URL=$env:DATABASE_URL
pnpm exec prisma validate
```

Result: exit 0, `prisma/schema.prisma` valid. Prisma emitted only the existing `package.json#prisma`
deprecation warning. No connection or migration was attempted.

### Canonical fixture verifiers

Commands from the parent workspace:

```powershell
node docs/contracts/verify-device-auth-v1-fixtures.mjs --require-copies 0
python docs/contracts/verify_device_auth_v1_fixtures.py --require-copies 0
```

Results: both exit 0, `device-auth v1 fixture parity passed: 0 desktop copy/copies`.
`--require-copies 0` validates only the canonical source shape and is not desktop release evidence.

### Formatting and diff checks

- The first Prettier invocation from the clean RC root failed because that package has no local
  `prettier` binary. It did not modify files.
- Running the configured `webhard-api` Prettier found the parent contract needed formatting.
  `prettier --write` formatted only that owned Markdown file.
- A subsequent `prettier --check` over all three owned contract/changelog files exited 0.
- `git diff --check` exited 0 in both the clean RC and parent repositories. The parent contract is
  currently untracked, so its whitespace/style is covered by the explicit Prettier check rather
  than tracked diff output.

## Remaining operational and release gates

- Remote credential-rotation prepare/ack/admin workflow.
- Per-program business endpoint allowlist and explicit legacy policy.
- Vault/client migrations and byte-identical fixture copies for all three desktop programs.
- Real migration/config injection and Redis/PostgreSQL/reverse-proxy validation.
- DEV/STG standard synthetic and safe-canary device validation.
- Signed desktop artifacts, controlled deployment, production pilot, and legacy retirement.
- Independent Task 1–5 security review with an explicit tracked/untracked file inventory. The
  central foundation must not be marked complete until that review is Approved with no
  Critical/Important findings.

`computeroff` remains excluded.
