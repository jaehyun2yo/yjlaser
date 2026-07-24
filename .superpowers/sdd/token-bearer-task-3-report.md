# Task 3 — Cookie-less token transport, quota/lease, controller, redaction

## 범위와 경계

- 작업 루트: `website-device-auth-clean-rc/webhard-api`
- 구현 범위: `POST /api/v1/integration/device-auth/token`의 transport, shape, 전용 rate/replay lease, controller/error projection, redaction.
- 제외: Task 1–2의 `DeviceTokenExchangeService` 복구/만료/런타임 구성·DI 변경, bearer guard/heartbeat/canary, remote rotation, business endpoint 정책, static API-key path.
- 실제 DB/Redis 연결, secret lookup, 실키, 배포, stage/commit/push는 실행하지 않았다.

## TDD RED → GREEN 증적

| 항목 | RED 확인 | 최소 GREEN 구현/결과 |
| --- | --- | --- |
| Token path 예약 | `pnpm exec jest --runInBand --no-cache src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts`에서 token path의 generic parser skip 기대값 `true`, 실제 `false` | 같은 reserved transport set에 canonical token path를 추가해 해당 suite 통과 |
| Token rate-store API | `pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-bootstrap-rate-store.spec.ts`에서 `acquireTokenExchange` 부재 | 전용 EVAL quota + request-ID lease API 추가 후 통과 |
| Token shape guard | `pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts --testNamePattern "available to reject"`에서 guard export 부재 | exact own-key/plain-object four-field guard 추가 후 통과 |
| Token rate guard | `pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-bootstrap-rate.guard.spec.ts --testNamePattern "token request-ID lease"`에서 guard export 부재 | socket peer 기반 acquire/opaque lease guard 추가 후 통과 |
| Public error mapper/controller | 각각의 새 error/controller module 부재를 Jest RED로 확인 | stable 401/409/503 mapper 및 controller 추가 후 통과 |
| Module registration | controller spec에서 `DeviceAuthModule` controller metadata에 token controller가 없음 | module controller/provider 등록 후 통과 |
| Encoded alias reservation | token `%2f` 및 encoded segment alias가 404로 generic parser 경계를 우회 | route-comparison에서 one-pass URL decode 후 reserved/400 처리로 통과 |
| Failure-path lease release | malformed four-string proof가 DTO 단계 400으로 종료되어 controller `finally`에 이르지 않음 | malformed `deviceId` 사례는 service 401 mapping + finally release를 통과. 513자/제어문자 refresh proof는 후속 독립 리뷰에서 rate-store 503 결함으로 확인 |
| Redaction | `refreshRequestId`, exchange ID/digest가 URL/object redaction에서 노출되는 RED 확인 | request ID, exchange ID/digest, predecessor/successor, actor/rotation 및 bearer inputs redaction 후 통과 |

## 구현 판단

### Transport 및 shape

- token은 enroll/status와 동일한 4 KiB, `inflate: false`, strict JSON parser를 사용한다.
- canonical `POST`와 단일 `application/json`(optional UTF-8), absent/identity content encoding만 허용한다.
- query, cookie/session, Authorization/proxy authorization, API/recovery key, CSRF, Origin/Referer, compressed body와 case/trailing slash/encoded alias는 controller/service 전에 fail-closed한다.
- token body는 `Object.prototype`의 own-key plain object이고 정확히 `deviceId`, `refreshCredential`, `nextRefreshCredential`, `refreshRequestId` 네 키의 non-empty string만 허용한다.
- canonical value 형식은 Task 2 service가 단일 권위로 판정하는 것이 의도였다. 그러나 후속 독립
  리뷰에서 rate-store의 512자·제어문자 선검증이 일부 malformed-but-string input을 service 전에
  503으로 종료시키는 계약 결함을 확인했다. 자세한 내용은
  `.superpowers/sdd/token-bearer-task-3-review.md`를 따른다.

### Rate/replay lease

- 기존 dedicated `DeviceBootstrapRateStore`만 확장했다. generic Redis setting, in-memory mode, forwarded-IP fallback은 추가하지 않았다.
- HMAC input domain은 `device-auth:<environment>:token`; Redis key에는 raw peer/proof/request ID를 넣지 않는다.
- no-redirect, 3초 abort EVAL로 global `120/60s`, socket peer `60/600s`, refresh proof `12/600s`, request-ID `60s` lease를 한 atomic command에서 처리한다.
- controller는 service 성공/오류 모두 `finally`에서 nonce-match release를 시도한다. release는 lease만 삭제하며 quota는 되돌리지 않는다.

### Public response/error/logging

- 성공 응답은 정확히 `accessToken`, `capabilityProfile`, `credentialVersion`, `deviceId`, `environment`, `programType`, `refreshCredentialAction`만 projection한다.
- token exchange service code는 `device_refresh_invalid`(401), `device_refresh_in_progress`(409), `device_revoked`(401), `device_auth_unavailable`(503)로 generic mapping한다.
- refresh values/request ID, bearer inputs, exchange IDs/digests 및 rotation/actor metadata를 redaction 대상에 추가했고 error response에는 reflection하지 않는다. 성공 응답의 `accessToken`은 endpoint contract상 의도적으로 반환되는 유일한 token 값이다.

## 수정 파일

- `src/common/middleware/device-auth-bootstrap-transport.middleware.ts`
- `src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts`
- `src/integration/device-auth/device-bootstrap-request-shape.guard.ts`
- `src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts`
- `src/integration/device-auth/device-bootstrap-rate-store.ts`
- `src/integration/device-auth/device-bootstrap-rate-store.spec.ts`
- `src/integration/device-auth/device-bootstrap-rate.guard.ts`
- `src/integration/device-auth/device-bootstrap-rate.guard.spec.ts`
- `src/integration/device-auth/dto/device-token-exchange.dto.ts` (new)
- `src/integration/device-auth/device-token-exchange.errors.ts` (new)
- `src/integration/device-auth/device-token-exchange.errors.spec.ts` (new)
- `src/integration/device-auth/device-token-exchange.controller.ts` (new)
- `src/integration/device-auth/device-token-exchange.controller.spec.ts` (new)
- `src/integration/device-auth/device-auth.module.ts`
- `src/common/logging/request-redaction.ts`
- `src/common/logging/request-redaction.spec.ts`

`src/main.ts`의 기존 dedicated transport registration/skip hook은 shared reserved-path function을 호출하므로 token path 추가가 자동 적용된다. 별도 main 변경은 불필요했다.

## 최종 검증

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-bootstrap-rate.guard.spec.ts src/integration/device-auth/device-token-exchange.errors.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts src/common/logging/request-redaction.spec.ts
```

- 결과: 7 suites / 123 tests passed.

```powershell
pnpm exec tsc --noEmit --pretty false
```

- 결과: exit 0.
- 추가: 대상 파일 Prettier 적용, 대상 tracked diff `git diff --check` 통과.

## 남은 리스크 / 운영 확인 필요

- 최초 독립 리뷰의 P1 401/503 finding은 `.superpowers/sdd/token-bearer-task-3-p1-fix-report.md`
  작업으로 해결됐다. 최종 검증은 focused 2 suites / 49 tests, 지정 회귀 7 suites / 135 tests,
  TypeScript, Prettier 통과이며 fresh security re-review에서 Spec Compliance ✅, Task quality
  Approved, finding 0건을 받았다.
- 실제 Upstash/DB/secret/network는 의도적으로 호출하지 않았으므로 staging 환경에서 dedicated Upstash credential, proxy topology의 socket peer 식별, real concurrent exchange와 release failure를 별도 승인 후 확인해야 한다.
- 이 Task는 token transport만 다루며 bearer enforcement, heartbeat/canary, remote credential rotation 및 기존 business endpoint policy는 후속 Task 범위다.
