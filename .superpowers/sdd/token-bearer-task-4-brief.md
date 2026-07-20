# Task 4 brief — per-request bearer, heartbeat, safe-canary

## Authority and scope

- Authority plan: `C:/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/docs/superpowers/plans/2026-07-20-company-device-token-exchange-bearer-foundation.md`, Task 4.
- Worktree: this clean RC only.
- Source-only local implementation. Do not use network, real Redis/DB, secrets, customer data, deploy, stage, commit, push, or publish.
- Other agents and user edits may coexist. Do not revert or clean unrelated changes.
- The plan route contract wins: only `/api/v1/integration/devices/heartbeat` and `/api/v1/integration/devices/canary`.
- Legacy `/api/v1/integration/programs/heartbeat` and all business/admin/rotation routes must remain unchanged.

## Required production files

Create:

- `webhard-api/src/common/middleware/device-auth-bearer-transport.middleware.ts`
- `webhard-api/src/integration/device-auth/device-bearer-request-source.guard.ts`
- `webhard-api/src/integration/device-auth/device-bearer.guard.ts`
- `webhard-api/src/integration/device-auth/current-device-principal.decorator.ts`
- `webhard-api/src/integration/device-auth/device-heartbeat-rate.guard.ts`
- `webhard-api/src/integration/device-auth/device-heartbeat.service.ts`
- `webhard-api/src/integration/device-auth/dto/device-heartbeat.dto.ts`
- `webhard-api/src/integration/device-auth/device-bearer.controller.ts`
- `webhard-api/src/integration/device-auth/device-bearer-no-store.middleware.ts`

Modify:

- `webhard-api/src/main.ts`
- `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.ts`
- `webhard-api/src/integration/device-auth/device-auth.types.ts`
- `webhard-api/src/integration/device-auth/device-auth.module.ts`

Create/modify the exact companion specs required by the authority plan, including `csrf.guard.spec.ts`, rate-store spec and module spec.

## TDD and behavioral contract

1. Record RED evidence before production changes, then implement the minimum behavior and record GREEN evidence in `.superpowers/sdd/token-bearer-task-4-report.md`.
2. Add a dedicated strict parser before the generic parser for the two canonical routes only. Reject aliases, query, Transfer-Encoding, compression, cookie, API/recovery/CSRF/session credentials, Origin and Referer. Set `no-store` even on early failure. Heartbeat is a strict JSON object under 4 KiB; canary is absent body or strict empty object only.
3. Source guard accepts exactly one raw `Authorization: Bearer <token>` and no ambient alternative or fallback.
4. Bearer guard verifies HS256, issuer, audience, kid and `token_type`, then revalidates the selected-environment device and matching active, unrevoked, unexpired credential version in Prisma. Derive permissions from server defaults. Standard permissions must exactly match JWT permissions; `safe_canary` must be empty. Attach a frozen `request.deviceAuthInfo` only. Never mutate `request.user`, attach `apiKeyInfo`, call `ApiKeyGuard`, or use `ProgramsService`.
5. Heartbeat body permits only `{}` or `{ appVersion: '1.2.3' }`. Rate limit after bearer verification and before writes: 6 per 60 seconds, HMAC namespace `device-auth:<environment>:heartbeat:device`. Seventh call must make zero writes.
6. Heartbeat CAS updates only `lastHeartbeatAt` and optional normalized SemVer `appVersion`. Do not touch `ProgramHeartbeat` or business services.
7. Canary performs zero Prisma/business writes.
8. Exact success responses:
   - heartbeat: `{ ok: true, deviceId, environment, programType, capabilityProfile, credentialVersion }`
   - canary: `{ ok: true, contractVersion: 'v1', environment, programType, capabilityProfile }`
9. Public errors are limited to `device_access_invalid` 401, `device_revoked` 401, `device_auth_rate_limited` 429 and `device_auth_unavailable` 503.
10. Prove CSRF exemption cannot admit cookie/static credentials and bearer works only on these two routes.

## Required verification

From `webhard-api`:

```powershell
pnpm exec jest --runInBand --no-cache src/common/guards/csrf.guard.spec.ts src/common/middleware/device-auth-bearer-transport.middleware.spec.ts src/integration/device-auth/device-bearer-request-source.guard.spec.ts src/integration/device-auth/device-bearer.guard.spec.ts src/integration/device-auth/device-heartbeat-rate.guard.spec.ts src/integration/device-auth/device-heartbeat.service.spec.ts src/integration/device-auth/device-bearer.controller.spec.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-auth.module.spec.ts
pnpm exec tsc --noEmit --pretty false
pnpm build
```

Also run Prettier check on all owned files and `git diff --check` where useful. The final report must list owned files, RED failures, GREEN counts, typecheck/build/format results, and all unverified operational gates.
