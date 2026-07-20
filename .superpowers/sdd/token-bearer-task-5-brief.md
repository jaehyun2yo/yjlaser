# Task 5 brief — truthful contracts, full source verification, security review

## Preconditions and authority

- Start only after Task 4 implementation and independent review are approved.
- Authority: `C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/docs/superpowers/plans/2026-07-20-company-device-token-exchange-bearer-foundation.md`, Task 5.
- Source-only local work. No real database, Redis, secret, device, customer data, deploy, stage, commit, push, or publish.
- Preserve all unrelated/user changes.

## Owned files

- `docs/contracts/device-auth-v1-desktop-integration.md` in the parent workspace.
- `docs/specs/api/endpoints/integration.md` in this company-site clean RC.
- `docs/changelog/CHANGELOG.md` in this company-site clean RC.
- Canonical fixture and both verifiers only if Task 4 contract changes make an update necessary.
- `.superpowers/sdd/token-bearer-task-5-report.md` in this clean RC.

## Documentation truth boundary

Document the exact `/token` request, safe response, public error and no-ambient boundary; response-loss replay; bearer-only heartbeat/canary body and response contracts; verified-device rate `6/60s`; `safe_canary` no-side-effect restriction; and next-request revoke/version enforcement on `DeviceBearerGuard` routes.

Explicitly state that the implementation does **not** yet provide immediate revoke on legacy static-key business traffic or live PCs. Keep the remaining blockers visible: remote rotation prepare/ack/admin workflow, per-program business endpoint policy, all three desktop vault/client migrations and fixture copies, real migration/config, DEV/STG synthetic validation, signed artifacts, deployment and production pilot.

## Required source verification

From `webhard-api`:

```powershell
pnpm exec jest --runInBand --no-cache src/integration/device-auth src/common/guards/csrf.guard.spec.ts src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts src/common/middleware/device-auth-bearer-transport.middleware.spec.ts src/common/logging/request-redaction.spec.ts
pnpm exec tsc --noEmit --pretty false
pnpm build
$env:DATABASE_URL='postgresql://device_auth_validate:placeholder@127.0.0.1:5432/device_auth_validate?schema=public'
$env:DIRECT_URL=$env:DATABASE_URL
pnpm exec prisma validate
```

From the parent workspace:

```powershell
node docs/contracts/verify-device-auth-v1-fixtures.mjs --require-copies 0
python docs/contracts/verify_device_auth_v1_fixtures.py --require-copies 0
```

Also run Prettier on owned code/docs where configured and `git diff --check` in both repositories.

## Independent security review requirements

The review package must enumerate every tracked and untracked Task 1–5 file explicitly. Review raw refresh proof/JWT/actor leakage, parser alias/query/header ambiguity, replay/recovery/lease, selected-environment DB revoke/version checks, permission derivation, cookie/static fallback, CSRF ordering, route scope creep, error map, and `computeroff` exclusion. Do not mark the central foundation complete until no Critical/Important findings remain and the independent verdict is Approved.
