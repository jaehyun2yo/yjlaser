# Token/Bearer Task 1 구현 보고 — token-exchange persistence와 revoke terminalization

- 상태: 구현, 지정된 소스 전용 검증, 독립 리뷰 완료.
- 범위: 중앙 device token/bearer 계획의 첫 persistence 작업만 수행했다. HMAC request digest 생성, token endpoint, bearer guard, access-token 즉시 차단, 정상 rotation, heartbeat, desktop 배포는 포함하지 않았다.
- 외부 작업: 수행하지 않음. 실제 DB 연결·migration deploy·seed·inspection, secret 조회, Redis/PC 작업, API 호출, 배포, stage/commit/push를 실행하지 않았다.

## 변경 파일

- `webhard-api/prisma/schema.prisma`
- `webhard-api/prisma/migrations/20260720100000_add_device_token_exchanges/migration.sql` (신규 additive migration)
- `webhard-api/src/integration/device-auth/device-auth.types.ts`
- `webhard-api/src/integration/device-auth/device-auth.persistence.spec.ts`
- `webhard-api/src/integration/device-auth/device-management.service.ts`
- `webhard-api/src/integration/device-auth/device-management.service.spec.ts`

기존 `webhard-api/prisma/migrations/20260719120000_add_integration_device_credentials/migration.sql`은 수정하지 않았다.

## 구현 결과

### 1. 불변 token-exchange persistence

- Prisma에 `DeviceTokenExchangeStatus` (`completed`, `revoked`, `expired`)와 `DeviceTokenExchange`를 추가했다.
- exchange는 `deviceId`, predecessor `previousCredentialId`, one-time successor `successorCredentialId`, `requestIdDigest`, `credentialVersion`, 완료/복구/폐기 시각만 저장한다. raw request ID나 credential는 추가하지 않았다.
- device와 두 credential 관계는 `[credentialId, deviceId] -> device_refresh_credentials(id, device_id)` 복합 FK로 묶어 다른 장치 credential를 predecessor/successor로 참조할 수 없게 했다.
- `successorCredentialId` 단일 unique와 `[deviceId, requestIdDigest]` unique를 유지했다. 또한 Prisma의 복합 one-to-one relation 검증을 충족하기 위한 `[successorCredentialId, deviceId]` composite unique를 추가했다. 이는 기존 `DeviceCredentialRotation`의 candidate credential relation과 같은 패턴이다.
- `previousCredentialId + status`, `recoverableUntil` index를 추가했다. 시간 의존 `now()` partial index는 만들지 않았다.
- migration에는 빈 request digest 거부, `credential_version >= 1`, `completed_at <= recoverable_until`, 상태와 `revoked_at`의 terminal-state 일관성 제약을 넣었다.
  - `completed`와 `expired`: `revoked_at IS NULL`
  - `revoked`: `revoked_at IS NOT NULL`
- 새 table에 RLS를 켜고 `PUBLIC`, 존재할 때의 `anon`, `authenticated` role에서 모두 권한을 회수했다. 기존 device credential migration의 direct DB-role 차단 방식과 동일하다.
- `device-auth.types.ts`에는 후속 service가 사용할 `DeviceTokenExchangeStatus` union과 상태 상수를 추가했다.

### 2. revoke terminalization

`DeviceManagementService.revokeDevice()`의 기존 serializable transaction에서 device CAS, current refresh credential revoke, live rotation cancel 뒤와 audit write 전에 아래 상태 전이를 추가했다.

```ts
await transaction.deviceTokenExchange.updateMany({
  where: { deviceId: device.id, status: 'completed', revokedAt: null },
  data: { status: 'revoked', revokedAt: transactionNow },
});
```

- 장치 revoke와 같은 transaction/callback 안에서 실행하므로 audit write 실패나 serialization retry 시 독립적으로 성공한 것처럼 반환하지 않는다.
- management API summary/response에 exchange 또는 credential 정보를 추가하지 않았다.

## TDD 기록

1. persistence source assertion과 revoke assertion을 구현 전 추가했다.
2. 아래 focused command의 RED를 확인했다.

   ```powershell
   cd webhard-api
   pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-auth.persistence.spec.ts src/integration/device-auth/device-management.service.spec.ts
   ```

   - `DeviceTokenExchange` model 부재
   - 새 migration file 부재
   - revoke transaction의 `deviceTokenExchange.updateMany` 호출 수 0

3. schema/migration/service를 최소 범위로 구현했다.
4. 최초 `pnpm prisma:generate`에서 P1012을 재현했다. `successorCredentialId`의 단일 unique만으로는 `[successorCredentialId, deviceId]`를 relation field로 쓰는 one-to-one composite relation을 Prisma가 unique로 인정하지 않았다.
5. 기존 `DeviceCredentialRotation`의 `candidateCredentialId @unique` + `@@unique([candidateCredentialId, deviceId])` pattern을 확인했다. 같은 composite unique의 persistence regression assertion을 먼저 추가해 실패를 확인한 다음 schema와 additive migration에 반영했다.
6. 다시 generate 및 focused tests를 실행해 GREEN을 확인했다.

## 검증

| 명령 | 결과 |
| --- | --- |
| `cd webhard-api && pnpm prisma:generate` | 통과 — Prisma Client v6.19.2 생성, DB 연결 없음 |
| `cd webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-auth.persistence.spec.ts src/integration/device-auth/device-management.service.spec.ts` | 통과 — 2 suites / 23 tests |
| `cd webhard-api && pnpm exec prisma validate` | 로컬 shell에 `DIRECT_URL`이 없어 첫 실행은 P1012 환경변수 오류. source/schema 오류는 아님. |
| 프로세스 한정 synthetic `DATABASE_URL`/`DIRECT_URL`로 `pnpm exec prisma validate` 재실행 | 통과 — `The schema at prisma/schema.prisma is valid`; DB 연결 없음 |
| `cd webhard-api && pnpm exec tsc --noEmit --pretty false` | 통과 |
| `cd webhard-api && pnpm exec prettier --check src/integration/device-auth/device-auth.persistence.spec.ts` | 통과 |
| `git diff --check` | 통과 |

`prisma generate`와 기존 package 설정에서 npm/pnpm deprecation warning이 출력됐지만, 검증 exit code와 결과에는 영향을 주지 않았다.

## 검토

- 독립 reviewer가 requirements/diff/관계/FK/RLS/revoke order/security 범위를 검토했고 Critical/Important/Minor 발견 없음으로 판정했다.
- reviewer는 predecessor/successor의 `(credential_id, device_id)` composite FK가 기존 `DeviceRefreshCredential @@unique([id, deviceId])`와 맞아 cross-device 연결을 차단함을 확인했다.
- reviewer는 `successorCredentialId @unique`와 `@@unique([successorCredentialId, deviceId])`를 함께 유지하는 결정을 확인했다. 전자는 명시된 단일 successor 계약을, 후자는 Prisma composite one-to-one relation의 유일성 요구를 만족한다.
- reviewer는 transaction 순서가 credential → rotation → token exchange → audit이고, exchange update가 같은 Serializable callback에서 요구된 where/data로 실행되며 management response에 exchange field가 추가되지 않음을 확인했다.
- 기존 `20260719120000_add_integration_device_credentials` migration은 이 worktree에서 처음부터 untracked여서 Git base/hash로 무변경을 독립 증명할 수는 없었다. 다만 Task 1 변경은 별도 `20260720100000...` migration만 만들고, 기존 migration에는 `DeviceTokenExchange` 내용이나 이번 Task의 수정 경로가 없다.
- 구현자 자체 검토에서는 raw credential/actor/request ID를 새 persistence나 management response에 노출하는 경로를 추가하지 않았고, `ApiKeyGuard`, legacy program route, `computeroff` 경로도 변경하지 않았다.

## 남은 리스크 및 후속 범위

- 실제 PostgreSQL에서 migration을 적용하지 않았으므로 FK/check/RLS의 런타임 동작은 의도적으로 미검증이다. 운영/실DB 적용은 별도 명시 승인과 backup·rollback 계획이 필요하다.
- local `prisma validate`는 datasource 환경변수를 요구한다. 검증에는 프로세스 한정 synthetic DSN만 사용했으며 실제 endpoint에 연결하지 않았다.
- 안정 HMAC request digest 생성/검증과 exchange 생성·recoverability·`expired` 전이는 다음 service task의 책임이다. 이 Task는 table/관계/terminal revoke만 추가했다.
- worktree는 시작 시점부터 선행 device-auth 및 다른 기능의 미추적/수정 파일을 포함했다. 그 파일을 되돌리거나 stage하지 않았으며, 이번 Task 산출물도 unstaged다.
