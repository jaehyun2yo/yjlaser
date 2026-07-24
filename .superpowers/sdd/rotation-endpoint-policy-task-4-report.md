# Rotation endpoint policy Task 4 report

Status: DONE — correctness/security review fixes and verification complete; fresh independent re-reviews approved.

## Implemented

- Added `IntegrationPrincipalSourceGuard` with a single raw principal-source decision before delegation. Exclusive bearer requests run the strict bearer source parser and `DeviceBearerGuard`; exclusive API-key/admin/company/worker requests use an `ApiKeyGuard` strict entrypoint that ignores `@Public` while preserving the standalone guard's existing public bypass. Exact branch postconditions are required before a private request-keyed `WeakMap` records the authenticated mode. Device requests never synthesize `request.user` or `apiKeyInfo`, static/session requests are never promoted to `deviceAuthInfo`, and pre-existing ambient principal fields fail closed.
- Moved raw credential ambiguity enforcement into `ApiKeyGuard` before `@Public`, session verification, API-key validation, or principal mutation. Duplicate and comma-combined Authorization/API-key/Cookie values, multiple named auth cookies, and bearer/API-key/session mixtures fail closed.
- Added an immutable device endpoint registry with the locked initial 14 approved method/path/program rows. Lookup uses exact method, normalized path template, and program type; unregistered or wrong-program routes default to `hard_hold`.
- Added `DeviceEndpointPolicyGuard` and the immutable metadata decorator. A principal must first have an authenticated mode recorded by the composite guard. Authenticated legacy API-key/admin/company/worker principals pass through unchanged; only `device_bearer` is evaluated against device policy. Untrusted ambient principals, `safe_canary`, missing device metadata, wrong method/program, and held device routes return `DEVICE_PRINCIPAL_NOT_ALLOWED`; approved device routes missing their exact permission return `INTEGRATION_PERMISSION_DENIED`.
- Added a separate immutable, census-owned `LegacyCompatibilityPolicy` ledger. It is intentionally empty because no environment/grace deadline is configured, and no device guard imports or reads it. Existing legacy API-key behavior remains behind `ApiKeyGuard`.
- Added exact permissions `folder/read`, `folder/write`, `folder/move`, `file/read`, `file/write`, and `file/move`. Added frozen `DEFAULT_DEVICE_ACCESS_PERMISSIONS` without changing `DEFAULT_INTEGRATION_WORKER_PERMISSIONS`.
- Re-derived every central device access-token issuance/verification and bearer/recovery path from the device-only map: access-token service, ordinary bearer guard, token exchange, rotation ACK token issuance, and ACK response-loss recovery guard. External sync receives only the six file/folder permissions, management receives the four reviewed permissions, and nesting receives an empty list.
- Exported the bearer source/verifier from `DeviceAuthModule`, and registered/exported the composite and endpoint-policy guards from `IntegrationModule`. No Task 5 controller adapter or endpoint guard wiring was added.

## TDD evidence

- RED: the first `apply_patch` added the device permission-map contract; focused Jest failed with TS2305 because `DEFAULT_DEVICE_ACCESS_PERMISSIONS` did not exist.
- GREEN: the device map and six exact permissions passed the permission suite while the legacy defaults remained unchanged.
- RED: five ApiKeyGuard ambiguity cases passed through `@Public`, and the composite guard module was absent.
- GREEN: source isolation and ApiKeyGuard ambiguity passed 2 suites / 22 tests.
- RED: policy, guard, decorator, and legacy ledger modules were absent.
- GREEN: registry/default-deny/safe-canary/legacy separation passed 3 suites / 10 tests.
- RED: access-token issue/verify, ordinary bearer, token exchange, rotation ACK issuance, recovery guard, and bearer HTTP fixtures still expected legacy defaults.
- GREEN: all device token/bearer/rotation call sites now use only `DEFAULT_DEVICE_ACCESS_PERMISSIONS`.
- Fresh self-review RED: comma-combined raw Cookie credentials still reached `@Public` and the composite static branch.
- Fresh self-review GREEN: comma-combined Cookie values now fail closed; source isolation passed 2 suites / 24 tests, and actor pass-through assertions use exact `integration`, `admin`, `company`, and `worker` types.
- Correctness/security review RED: the composite static/session branch inherited `ApiKeyGuard`'s `@Public` bypass, had no trusted-mode record, accepted insufficient branch postconditions, and the policy guard denied every legacy principal. Three focused suites failed on the missing strict entrypoint/getter and four legacy pass-through cases.
- Correctness/security review GREEN: standalone `ApiKeyGuard` keeps its public bypass, while `canActivateStrict` authenticates valid API-key/session credentials and rejects invalid or absent credentials. The composite records an exact mode only after exact postconditions, forged ambient state is denied, and the policy guard passes through all four trusted legacy modes. The three focused suites passed 49 tests.
- Device management DI RED: the module-resolved `approveDevice` path failed with `approveEnrollment is not a function`, and provider metadata exposed an extra `DEVICE_ACCESS_TOKEN_SERVICE` injection before `DEVICE_ENROLLMENT_SERVICE`.
- Device management DI GREEN: the factory now has four injection tokens aligned with four arguments; a real Nest testing module override proves `approveDevice` calls the resolved enrollment service. The module suite passed 7 tests.

## Verification

- Final specified Task 4 focused Jest command: 10 suites / 85 tests passed, 0 failed, exit 0.
- Final approved call-site and management regression command (`device-token-exchange`, `device-credential-rotation`, `device-rotation-bearer`, `device-bearer.controller`, `device-management.service`, `device-management.controller`): 6 suites / 140 tests passed, 0 failed, exit 0.
- `pnpm exec tsc --noEmit --pretty false`: passed.
- `pnpm build`: passed. npm printed only existing unknown/deprecated configuration warnings.
- Placeholder `DATABASE_URL`/`DIRECT_URL` with `pnpm exec prisma validate`: schema valid; Prisma printed only its package configuration deprecation warning.
- Prettier applied to all Task 4 and approved call-site files; final `prettier --check`: passed.
- `git diff --check`: passed.

## Correctness/security review fixes

- Requirements, changed files, public error contracts, exact policy rows, default-deny behavior, permission derivation, module metadata, and legacy separation were re-read after implementation.
- Class-level legacy `ApiKeyGuard` cannot accept a bearer/static/session mixture because ambiguity now fails inside `ApiKeyGuard` before public metadata or validation. Task 5 still must replace controller-level source guards only on explicitly approved routes; Task 4 did not pre-wire any route.
- Static/session principals are delegated only to `ApiKeyGuard.canActivateStrict`; valid credentials on public routes are authenticated instead of bypassed. The composite rejects every pre-existing `user`/`apiKeyInfo`/`deviceAuthInfo`, enforces raw-mode-specific postconditions, and records trust only after success.
- `DeviceEndpointPolicyGuard` reads only the private composite-authentication mode record. An undefined mode is denied, `device_bearer` receives the device policy checks, and the four authenticated legacy modes preserve the existing API-key/session behavior. Forged ambient request fields cannot establish trust.
- Device policy authorization does not import the legacy ledger and requires standard capability, the exact immutable row, a server-derived program permission, and the same permission on the frozen device principal.
- Review findings fixed: correctness P1 2 (trusted legacy pass-through and management provider injection), security Important 1 (`@Public` strict composite authentication), plus the prior comma-combined Cookie finding.
- Fresh correctness and security re-reviews: Critical 0, Important 0, Minor 0.

## Operational boundary

No desktop project, Task 5 route adapter, `computeroff`, production database, migration apply, secret, deployment, external I/O, stage, commit, or push was touched. All validation used source-only tests and a process-local placeholder Prisma URL.

## Concerns

- Jest needed `NODE_OPTIONS=--max-old-space-size=6144` for the combined focused execution in this dirty clean-RC worktree; the final focused commands completed normally with that process-local setting.
- The release ledger has no approved environment/grace deadline, so the separate legacy compatibility ledger remains empty instead of inventing operational policy.
