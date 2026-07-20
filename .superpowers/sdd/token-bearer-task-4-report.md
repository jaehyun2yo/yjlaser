# Task 4 report — per-request bearer, heartbeat, safe-canary

## Scope

- Source-only local implementation in the clean RC.
- No network, real Redis/DB, secrets, deployment, staging, commit, push, or publish.
- Legacy `/api/v1/integration/programs/heartbeat` and business/admin/rotation routes remain unchanged.

## RED evidence

Command: the authority plan's exact nine-suite Jest command.

- Result: 9 failed suites / 9 total, 0 tests executed.
- Expected failure cause: missing bearer transport/source/DB guard/rate guard/heartbeat
  service/controller/no-store production files, missing `DeviceAccessPrincipal`, and missing
  `DeviceBootstrapRateStore.checkDeviceHeartbeat`.

## GREEN evidence

- Focused transport/controller after the first correction: 2 suites / 35 tests passed.
- Authority-plan final command after independent-review resolution: 9 suites / 121 tests passed,
  0 failed, exit 0.
- `pnpm exec tsc --noEmit --pretty false`: exit 0.
- `pnpm build`: exit 0. The command emitted only pre-existing npm configuration deprecation
  warnings; Nest compilation succeeded.
- `pnpm exec prettier --check <all 22 owned TypeScript files>`: exit 0.
- `git diff --check`: exit 0.
- Scope grep across the new production boundary found no `ProgramsService`, `ApiKeyGuard`,
  `request.user`, `apiKeyInfo`, or `ProgramHeartbeat` reference.

## Owned files

Created:

- `webhard-api/src/common/middleware/device-auth-bearer-transport.middleware.ts`
- `webhard-api/src/common/middleware/device-auth-bearer-transport.middleware.spec.ts`
- `webhard-api/src/integration/device-auth/device-bearer-request-source.guard.ts`
- `webhard-api/src/integration/device-auth/device-bearer-request-source.guard.spec.ts`
- `webhard-api/src/integration/device-auth/device-bearer.guard.ts`
- `webhard-api/src/integration/device-auth/device-bearer.guard.spec.ts`
- `webhard-api/src/integration/device-auth/current-device-principal.decorator.ts`
- `webhard-api/src/integration/device-auth/device-heartbeat-rate.guard.ts`
- `webhard-api/src/integration/device-auth/device-heartbeat-rate.guard.spec.ts`
- `webhard-api/src/integration/device-auth/device-heartbeat.service.ts`
- `webhard-api/src/integration/device-auth/device-heartbeat.service.spec.ts`
- `webhard-api/src/integration/device-auth/dto/device-heartbeat.dto.ts`
- `webhard-api/src/integration/device-auth/device-bearer.controller.ts`
- `webhard-api/src/integration/device-auth/device-bearer.controller.spec.ts`
- `webhard-api/src/integration/device-auth/device-bearer-no-store.middleware.ts`

Modified:

- `webhard-api/src/main.ts`
- `webhard-api/src/common/guards/csrf.guard.spec.ts`
- `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.ts`
- `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.spec.ts`
- `webhard-api/src/integration/device-auth/device-auth.types.ts`
- `webhard-api/src/integration/device-auth/device-auth.module.ts`
- `webhard-api/src/integration/device-auth/device-auth.module.spec.ts`

Report:

- `.superpowers/sdd/token-bearer-task-4-report.md`

## Remaining operational gates

- No real Redis, Prisma database, proxy, migration, deployment, device, signed artifact, or
  production pilot verification was performed.
- The Upstash Lua quota, Prisma filters/CAS, JWT verification integration, and proxy alias/body
  behavior are proven only with local synthetic tests; DEV/STG infrastructure proof is still
  required.
- No desktop client consumes these routes yet, so live-PC next-request revocation is not claimed.
- All files remain local and unstaged; no commit, push, publish, or deployment was performed.

## Independent review resolution

The independent review found one Important transport-reservation gap and one Minor SemVer gap.
Both were resolved with a fresh TDD cycle:

- RED: focused 4 suites produced 8 expected failures: three absolute-form request-target
  reservation assertions, two revoked-exchange predicate assertions, two service-level
  leading-zero prerelease assertions, and one HTTP validation assertion.
- Absolute-form request-targets whose decoded pathname targets heartbeat/canary are now reserved
  from the generic parser. Because they are not canonical raw origin-form paths, the dedicated
  middleware immediately returns generic 400 with `no-store, private`; the same applies when an
  absolute-form target includes a query.
- The successful bearer DB predicate now requires no revoked token exchange for the JWT
  credential version. An otherwise-active device with such an exchange fails closed and is mapped
  to `device_revoked` through the explicit secondary classification.
- Canonical SemVer validation now rejects leading-zero numeric prerelease identifiers such as
  `1.2.3-01` and `1.2.3-alpha.01`, while retaining alphanumeric prerelease and build metadata.
- GREEN: focused 4 suites / 61 tests passed; final authority command 9 suites / 121 tests passed.
- Post-resolution TypeScript, Nest build, TypeScript/report Prettier checks, and `git diff --check`
  all exited 0.
