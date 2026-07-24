# Task 2 구현 보고서 — stable token exchange service

## 상태

`DONE`

범위는 worktree의 `webhard-api/src/integration/device-auth`로 한정했다. Task 1의
`DeviceTokenExchange` 모델·migration·관리자 revoke 변경과 후속 `/token` controller,
transport/rate, bearer guard/heartbeat, legacy API-key 업무 경로는 수정하지 않았다.

## 설계 판단

- request ID는 credential pepper keyring과 분리했다. `DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET`
  로 `yjlaser:device-auth:v1:token-exchange-request:<environment>:<requestId>`를 HMAC-SHA256
  해 lower-hex digest만 저장·조회한다. `hashDeviceCredential`는 refresh credential에만 사용한다.
- normal exchange는 serializable transaction에서 predecessor CAS revoke → device credential
  version CAS increment → active successor/exchange/audit 생성 순서를 지킨다. JWT는 transaction
  완료 뒤에만 발급하므로 signer 실패 뒤에도 completed exchange의 recovery 경로가 유지된다.
- response-loss recovery는 동일 request digest의 completed exchange에서 raw predecessor/successor
  hash, selected environment, active device/successor, credential version을 다시 검증하고 새 JWT만
  민팅한다. 복구 창은 access-token TTL(10분)과 동일하며, 지난 exchange는 credential 변경 없이
  serializable하게 `expired`로만 전이한다.
- standard 권한은 `DEFAULT_INTEGRATION_WORKER_PERMISSIONS`의 정확한 프로그램별 값만 복사하고,
  `safe_canary`는 빈 배열을 사용한다. legacy `all` 또는 `hasIntegrationPermission`은 사용하지 않는다.
- runtime config는 다음 이름만 읽고 fallback하지 않는다:
  `DEVICE_AUTH_ACCESS_TOKEN_ISSUER`, `DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE`,
  `DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID`, `DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON`,
  `DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET`.
  `JwtModule.register({})`에는 전역 signing default를 주지 않았고, access-token service와
  exchange service는 symbol DI factory로 한 번씩만 구성했다.

## 수정 파일

- `webhard-api/src/integration/device-auth/device-token-exchange-hash.ts` (신규)
- `webhard-api/src/integration/device-auth/device-token-exchange-hash.spec.ts` (신규)
- `webhard-api/src/integration/device-auth/device-token-exchange.service.ts` (신규)
- `webhard-api/src/integration/device-auth/device-token-exchange.service.spec.ts` (신규)
- `webhard-api/src/integration/device-auth/device-auth.types.ts`
- `webhard-api/src/integration/device-auth/device-auth.runtime-config.ts`
- `webhard-api/src/integration/device-auth/device-auth.runtime-config.spec.ts`
- `webhard-api/src/integration/device-auth/device-auth.tokens.ts`
- `webhard-api/src/integration/device-auth/device-auth.module.ts`
- `webhard-api/src/integration/device-auth/device-auth.module.spec.ts`

## TDD 증적

### RED

테스트를 먼저 추가한 뒤 다음 명령을 실행했다.

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-token-exchange-hash.spec.ts src/integration/device-auth/device-token-exchange.service.spec.ts src/integration/device-auth/device-auth.runtime-config.spec.ts src/integration/device-auth/device-auth.module.spec.ts
```

결과: 예상대로 실패했다. 새 `DeviceTokenExchangeRequestHasher`/exchange service가 아직 없어
service spec은 `DeviceTokenExchangeRequestHasher is not implemented`로 실패했고, 기존 runtime
config는 새 access-token config가 없어 `accessTokenConfig` assertion 및 명시 변수 read assertion에서
실패했다. 이는 새 기능 부재에 의한 RED였다.

### GREEN

최소 구현 후 다음 명령을 다시 실행했다.

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-token-exchange-hash.spec.ts src/integration/device-auth/device-token-exchange.service.spec.ts src/integration/device-auth/device-auth.runtime-config.spec.ts src/integration/device-auth/device-auth.module.spec.ts src/integration/device-auth/device-access-token.service.spec.ts
```

결과: **5 suites / 80 tests PASS**.

포함된 회귀 검증은 canonical input 및 raw reuse, pending/revoked/expired/wrong-environment,
live rotation zero-write conflict, predecessor CAS miss, P2034 재시도, replay recovery 및 변경된
raw 값 거부, expired/revoked exchange, signer/DB unavailable, `safe_canary` empty permissions,
secret 비직렬화와 named runtime config다.

## 추가 검증

```powershell
cd webhard-api
pnpm exec tsc --noEmit --pretty false
pnpm exec prettier --check src/integration/device-auth/device-auth.types.ts src/integration/device-auth/device-auth.runtime-config.ts src/integration/device-auth/device-auth.runtime-config.spec.ts src/integration/device-auth/device-auth.tokens.ts src/integration/device-auth/device-auth.module.ts src/integration/device-auth/device-auth.module.spec.ts src/integration/device-auth/device-token-exchange-hash.ts src/integration/device-auth/device-token-exchange-hash.spec.ts src/integration/device-auth/device-token-exchange.service.ts src/integration/device-auth/device-token-exchange.service.spec.ts
git diff --check -- webhard-api/src/integration/device-auth/device-auth.types.ts webhard-api/src/integration/device-auth/device-auth.runtime-config.ts webhard-api/src/integration/device-auth/device-auth.runtime-config.spec.ts webhard-api/src/integration/device-auth/device-auth.tokens.ts webhard-api/src/integration/device-auth/device-auth.module.ts webhard-api/src/integration/device-auth/device-auth.module.spec.ts
```

결과: 모두 exit code 0. Prettier 대상 파일도 모두 적합했다.

## 리뷰

독립 reviewer agent를 요청했으나 세션 agent 슬롯이 모두 사용 중이라 배정할 수 없었다. 대신
fresh-context 자체 리뷰로 Task 2 체크리스트, Task 1 predecessor/successor 관계, request digest의
pepper 분리, JWT transaction 경계, DI export, secret serialization 경계를 재대조했다. Critical,
Important, Minor finding은 없었다. 이 독립 리뷰 제한은 남아 있다.

## 미실행 항목 및 남은 리스크

- 실제 DB 연결, migration 적용/생성, seed는 수행하지 않았다. Prisma mock 기반 unit test만 실행했다.
- 실제 환경변수/secret lookup, 실키 JWT 발급, deployment, HTTP endpoint, bearer guard/heartbeat는
  범위 밖이거나 명시 금지라 실행하지 않았다.
- runtime은 다섯 named token 설정이 없으면 fail-closed한다. 배포 전 별도 승인된 환경 설정 및 실제
  DB integration 검증이 필요하다.
- stage, commit, push는 수행하지 않았다.

## Fix 1 — 독립 리뷰 finding 보정 (2026-07-20)

### 수정 내용

- 초기 `(deviceId, requestIdDigest)` 조회 뒤 동시 요청이 같은 exchange를 완료한 경우를 위해,
  `createReplacementExchange`가 안전한 exchange 오류로 끝나면 동일 키를 한 번 재조회한다.
  재조회 결과가 있으면 기존 predecessor/successor raw 검증 recovery 경로만 사용한다. 따라서
  P2002, P2034 재시도 뒤 실패, 선행 credential 소실은 같은 raw 입력에만 새 JWT를 복구하며,
  변경된 raw 입력은 `DEVICE_TOKEN_EXCHANGE_INVALID`로 종료한다. 재조회 결과가 없으면 최초의
  안전한 오류를 그대로 반환한다.
- 이 절은 위 설계 판단의 "access-token TTL(10분) 복구 창" 설명을 대체한다.
  새 completed exchange의 `recoverableUntil`은 JWT TTL이 아니라 successor refresh credential의
  `expiresAt`과 같은 시각으로 저장한다. 따라서 successor 만료 전에는 완료 exchange를 expired로
  전이하지 않는다.
- canonical Base64URL의 길이·문자집합·decode/encode round-trip 검증은 유지하고, 모든 문자가
  같은 값이라는 비명세 제한만 제거했다. 이에 따라 0으로 채운 16/32/64-byte canonical 값도
  정상 입력으로 허용한다.

### TDD 증적

먼저 0값 request/refresh credential, successor 만료 바인딩, P2002/P2034/선행 credential 소실 뒤
재조회 recovery, 재조회 후 변경 raw 거부 테스트를 추가했다.

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-token-exchange-hash.spec.ts src/integration/device-auth/device-token-exchange.service.spec.ts
```

RED 결과: **2 suites / 36 tests 중 7 failures**. 기존 구현은 10분 `recoverableUntil`, 0값
Base64URL 거부, P2002/P2034/선행 credential 소실의 recovery 재조회 누락 때문에 각각 실패했다.

최소 구현 뒤 같은 명령을 재실행했다.

GREEN 결과: **2 suites / 36 tests PASS**.

### 최종 검증

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-token-exchange-hash.spec.ts src/integration/device-auth/device-token-exchange.service.spec.ts src/integration/device-auth/device-auth.runtime-config.spec.ts src/integration/device-auth/device-auth.module.spec.ts src/integration/device-auth/device-access-token.service.spec.ts
pnpm exec tsc --noEmit --pretty false
pnpm exec prettier --check src/integration/device-auth/device-token-exchange-hash.ts src/integration/device-auth/device-token-exchange-hash.spec.ts src/integration/device-auth/device-token-exchange.service.ts src/integration/device-auth/device-token-exchange.service.spec.ts
git diff --check -- webhard-api/src/integration/device-auth/device-token-exchange-hash.ts webhard-api/src/integration/device-auth/device-token-exchange-hash.spec.ts webhard-api/src/integration/device-auth/device-token-exchange.service.ts webhard-api/src/integration/device-auth/device-token-exchange.service.spec.ts
```

결과: Jest **5 suites / 85 tests PASS**, `tsc --noEmit` exit 0, Prettier exit 0,
scoped `git diff --check` exit 0. 새 Task 2 파일은 아직 untracked이므로 no-index whitespace check도
별도로 실행해 오류 출력이 없음을 확인했다.

### 독립 리뷰 및 남은 리스크

별도 agent가 읽기 전용으로 해당 네 파일과 회귀 테스트를 검토했고 Critical/P1/P2 finding은 없었다.
P2002·P2034·선행 credential 소실의 재조회가 동일 raw 검증을 거치고, 변경 raw가 invalid로 끝나는
경로를 확인했다. 실제 PostgreSQL 동시 transaction 통합 테스트, 실제 DB/secret/JWT/deploy는 이번
범위와 금지 사항상 실행하지 않았으므로 운영 전 승인된 환경에서 별도 검증이 필요하다.
