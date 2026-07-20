# Rotation endpoint policy Task 3 report

Status: DONE — implementation and verification complete; final fresh correctness and security re-reviews approved.

## Implemented

- Bound bearer-only `POST /api/v1/integration/devices/credential-rotations/:rotationId/prepare` and `/ack` controllers without admin session guards, with the reserved strict 4 KiB transport, exact request-shape guards, no-store responses, CSRF exemption, and device-specific 401 error mapping.
- Completed `requested -> prepared -> acknowledged` serializable transitions with canonical 32-byte Base64URL proofs, timing-safe equality/verification, environment/profile/device revalidation, candidate-reuse rejection, CAS updates, exact version increment, predecessor and old-exchange revocation, null-actor audit rows, and JWT issuance only after commit. ACK revokes the predecessor before activating the candidate so PostgreSQL's non-deferrable one-active-credential index is never violated; any later failure rolls the transaction back.
- Added same-candidate prepare idempotency, deadline equality rejection, device-revoke fail-closed behavior, and response-loss ACK recovery through `/ack` only. Recovery requires an acknowledged same-device rotation, predecessor token version `current - 1`, matching candidate proof, and the inclusive `acknowledgedAt + rotationAckRecoverySeconds` boundary.
- Changed ordinary `/token` behavior during a compatible live rotation to mint a current-version JWT with `refreshCredentialAction: keep_current` and `{ id, deadlineAt }`, with zero successor/exchange writes. Deadline equality first expires the rotation and then permits the normal replacement flow; incompatible legacy live rows return `device_rotation_incompatible`.
- Preserved pre-migration compatibility when `rotationRuntimeEnabled=false`: bearer prepare/ack raw targets (including malformed, oversized, query, alias, and absolute-form inputs) are hidden by the pre-parser no-store 404 gate, while `/token` does not query rotation columns or emit a directive and retains the ordinary replacement flow.
- Registered the bearer controller, guards, request-shape guards, middleware, and access-token dependency in `DeviceAuthModule`. The recovery guard has no undecorated clock constructor dependency and is covered by a Nest DI compilation test. Public token projection includes the rotation directive only when present and strips private exchange fields.
- Bearer controller failures preserve exact public codes: invalid is 401 `device_rotation_invalid`, revoke is 401 `device_revoked`, and expired/incompatible/in-progress are distinct 409 rotation conflicts. Recovery database failures are generalized to 503 `device_auth_unavailable`.

## TDD evidence

- RED: missing ACK method failed with `expected function, received undefined`.
- RED: prepare same-proof idempotency failed with `DEVICE_ROTATION_IN_PROGRESS`.
- RED: ACK success and before/equal/after response-loss recovery failed because `ack` was absent.
- RED: old-version ACK recovery guard propagated the ordinary bearer rejection.
- RED: live `/token` returned `DEVICE_TOKEN_EXCHANGE_CONFLICT` instead of `keep_current`.
- RED: deadline-equality expiry and legacy incompatible rotation tests failed before the token policy implementation.
- RED: candidate reuse resolved as prepared before the explicit reuse lookup was added.
- RED: overdue prepared prepare and ACK paths did not commit terminalization before returning the expired error, and the requested predecessor query lacked the exact active/version/expiry predicate.
- RED: ACK activated the candidate before revoking the predecessor, and Nest DI required an unintended `Function` provider for the recovery guard clock.
- RED: runtime-off bearer targets reached downstream parsing, runtime-off `/token` still required rotation state, bearer errors collapsed to `device_access_invalid`, and recovery DB failures could escape as internal 500s.
- GREEN: final split execution of the specified focused set passed 9 suites / 199 tests (rotation service + recovery guard 57, token service + controller 63, rotation controller + transport 58, request-shape + bearer + redaction 21). Recovery includes an 11-case negative predicate table plus DB-failure and non-ACK isolation coverage.

## Verification

- Specified focused Jest set, split only to preserve complete shell summaries: 9 suites / 199 tests passed, all process exits successful.
- Final rotation service + recovery guard verification: 2 suites / 57 tests passed (41 service, 16 recovery guard).
- Rotation feature-gate/controller residual verification: 2 suites / 45 tests passed.
- `pnpm exec tsc --noEmit --pretty false`: passed.
- `pnpm build`: passed; npm printed only existing unknown/deprecated config warnings.
- Placeholder `DATABASE_URL`/`DIRECT_URL` `pnpm exec prisma validate`: passed; Prisma 7 configuration deprecation warning only.
- Prettier applied and `--check` passed for all Task 3 TypeScript files.
- `git diff --check`: passed (`FORMAT_DIFF_EXIT=0`).
- Fresh correctness and security re-reviews: Critical 0, Important 0, Minor 0.

## Self-review

- No raw refresh/candidate credential or access token is persisted or written to audit rows; responses are structurally projected.
- Recovery is implemented only in `DeviceRotationBearerGuard`, which is bound only to prepare/ack, and additionally requires the `/ack` route before accepting an old-version bearer.
- No stage, commit, push, deployment, database mutation, secret access, or external I/O was performed.

## Concerns

- Build and Prisma validation emitted only the non-failing package/config deprecation warnings noted above.
