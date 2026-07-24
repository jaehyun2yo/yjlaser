# Task 3 P1 fix brief — malformed refresh proof 401 계약 복구

## 목표

`POST /api/v1/integration/device-auth/token`에서 정확한 네 필드를 가진 non-empty string
요청은 rate/quota 경계를 통과한 뒤 `DeviceTokenExchangeService`가 canonical 형식을 판정한다.
따라서 malformed `refreshCredential` 또는 `refreshRequestId`는 Redis 장애처럼 503으로 끝나지
않고 기존 공개 계약인 401 `device_refresh_invalid`로 끝나야 한다.

## 소유 파일

- `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.ts`
- `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.spec.ts`
- `webhard-api/src/integration/device-auth/device-token-exchange.controller.spec.ts`
- 필요하면 이 brief와 같은 이름의 report만 수정한다.

다른 파일은 수정하지 않는다. 다른 작업자의 변경을 되돌리지 않는다.

구현 전 SHA-256 기준선:

- `device-bootstrap-rate-store.ts`: `90DBF9F6A774A665E19C63FD97CE8BDCA494C720D1A89080E0A0FCD75AB9BEC6`
- `device-bootstrap-rate-store.spec.ts`: `DA82D639CB19EA2EA73506CC4F31AF8C76E5FDF74D67C89EF65327E99FED687B`
- `device-token-exchange.controller.spec.ts`: `C7E8BC5E55EB520DF08357BB9670254EE3A000D3110C51AD79E142C229F05D17`

## 필수 TDD RED

구현 코드보다 테스트를 먼저 추가하고 다음 네 입력이 현재 결함 때문에 실패하는 것을 확인한다.

1. `refreshCredential: 'a'.repeat(513)`
2. `refreshRequestId: 'a'.repeat(513)`
3. `refreshCredential: 'abc\u0001def'`
4. `refreshRequestId: 'abc\u0001def'`

RED는 다음 교차계층 결과를 증명해야 한다.

- 정확한 four-key/non-empty-string shape는 통과한다.
- 실제 `DeviceBootstrapRateStore`와 stubbed Upstash fetch 경계를 사용한다. store 전체를 mock해
  `allowed`로 고정하는 테스트만으로 대체하지 않는다.
- 현재 코드는 store에서 `unavailable`이 되어 503 `device_auth_unavailable`로 끝난다.
- RED 출력과 실행 명령을 report에 기록한다.

## 권장 최소 구현

- 기존 공용 `parseIdentifier`를 넓히지 않는다. enroll/status/peer/replay 기존 의미를 보존한다.
- token acquire/release 전용 opaque-proof parser를 추가한다.
- 전용 transport의 4 KiB body 경계에 맞춰 non-empty string을 UTF-8 최대 4 KiB까지만 허용한다.
- raw proof는 HMAC 입력으로만 사용하고 Redis key, EVAL argument, 로그, 오류, 응답에 넣지 않는다.
- `acquireTokenExchange`의 `refreshCredential`/`refreshRequestId`와
  `releaseTokenExchangeRequestLease`의 `refreshRequestId`가 같은 전용 parser를 사용한다.
- malformed proof도 global/peer/refresh quota와 request-ID lease를 소비하고, service 성공/오류 뒤
  controller `finally`에서 nonce-match release를 수행한다. quota는 되돌리지 않는다.
- malformed 값을 shape 단계 400으로 바꾸거나 rate-store 503으로 유지하지 않는다.

## GREEN 완료 조건

- 위 네 HTTP 사례가 모두 401 `device_refresh_invalid`다.
- token service가 호출되고 request-ID lease release가 각각 한 번 실행된다.
- 실제 store의 fetch/EVAL 경계를 통과하며 raw proof가 직렬화된 command에 없다.
- 정상 token quota/lease, enrollment/status, transport/error/redaction 테스트가 회귀하지 않는다.
- raw 값은 test failure/report/log에도 그대로 출력하지 않는다. 테스트 이름과 safe label만 쓴다.

## 검증 명령

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts
pnpm exec jest --runInBand --no-cache src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-bootstrap-rate.guard.spec.ts src/integration/device-auth/device-token-exchange.errors.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts src/common/logging/request-redaction.spec.ts
pnpm exec tsc --noEmit --pretty false
pnpm exec prettier --check src/integration/device-auth/device-bootstrap-rate-store.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts
```

## 금지 사항

- 실제 DB/Redis/network/secret/API key/PC 접근 금지
- migration, 배포, stage, commit, push 금지
- `computeroff`, legacy program heartbeat, business endpoint 수정 금지
- unrelated dirty/untracked 파일 변경 또는 되돌리기 금지

## 보고

전체 보고는 `.superpowers/sdd/token-bearer-task-3-p1-fix-report.md`에 작성한다.

- RED 명령, 기대한 실패 요약
- GREEN 명령, suite/test 수와 exit 결과
- 변경 파일
- 구현 판단
- self-review와 남은 우려

최종 응답은 `DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`, 한 줄 테스트 요약,
우려, report 경로만 반환한다.
