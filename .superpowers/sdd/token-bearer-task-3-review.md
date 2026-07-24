# Task 3 독립 리뷰 — `/token` 공개 경계

- 판정: **Not Ready**
- 리뷰 방식: fresh correctness reviewer가 Task 3의 tracked·untracked 파일 17개와 관련 service/error wiring을 명시적으로 읽기 전용 검토
- 외부 작업: 실제 DB·Redis·network·secret·배포·stage·commit·push 없음
- Critical: 없음
- Important: 1건
- Minor: 없음

## P1 — 비정상 refresh proof가 401 대신 503으로 종료됨

### 근거

- `device-bootstrap-request-shape.guard.ts:54-55`는 정확한 네 필드가 non-empty string인지만 확인한다.
- `device-token-exchange.controller.ts:40`에서 rate guard가 service보다 먼저 실행된다.
- `device-bootstrap-rate-store.ts:404-413,670-677`은 `refreshCredential`과
  `refreshRequestId`를 최대 512자로 제한하고 제어문자를 거절한 뒤 `unavailable`을 반환한다.
- `device-bootstrap-rate.guard.ts:80-83`은 이 결과를 `device_auth_unavailable` 503으로 매핑한다.
- 그 결과 `device-token-exchange.service.ts:534-616`의 canonical Base64URL 검증과
  `device-token-exchange.errors.ts:11-12`의 `device_refresh_invalid` 401 매핑에는 도달하지 않는다.

### 재현 흐름

`POST /api/v1/integration/device-auth/token`에 정확한 네 필드를 보내되 다음 중 하나를 사용한다.

- `refreshCredential: "a".repeat(513)`
- `refreshRequestId: "a".repeat(513)`
- `refreshCredential: "abc\u0001def"`
- `refreshRequestId: "abc\u0001def"`

4 KiB transport 한도 안의 요청이므로 shape guard는 통과하지만 rate store가 `unavailable`을
반환하고 service가 호출되기 전에 503으로 끝난다.

### 영향

- 같은 malformed credential 계약이 값 형태에 따라 401과 503으로 갈린다.
- 클라이언트가 잘못된 자격증명을 일시 장애로 오인해 재시도할 수 있다.
- 운영 모니터링에서 Redis/인증 서비스 장애 오탐이 발생할 수 있다.
- Task 3 보고서가 주장한 "service-owned canonical validation → 401" 경계가 실제로 성립하지 않는다.

### 누락된 테스트

- `device-token-exchange.controller.spec.ts:220-234`는 malformed `deviceId`만 검증한다.
- `device-bootstrap-rate-store.spec.ts:280-338`은 정상 token proof만 검증한다.
- `device-bootstrap-rate.guard.spec.ts`는 store mock을 사용해 실제 `parseIdentifier` 경계를 통과하지 않는다.

### 재개 시 완료 조건

1. **권장 방식:** 기존 공용 `parseIdentifier`를 넓히지 말고 token acquire/release 전용 opaque-proof
   parser를 추가한다. 전용 4 KiB transport가 이미 전체 body를 제한하므로 non-empty string을
   HMAC 입력으로만 사용하고 raw 값은 Redis key/command/log에 넣지 않는다. 이렇게 해야 malformed
   요청도 정상 quota와 request-ID lease를 거쳐 service가 단일 canonical validator 역할을 유지한다.
2. 어떤 방식을 사용하든 위 네 malformed proof는 기존 공개 계약인 401
   `device_refresh_invalid`로 끝나야 한다.
3. 정상 proof의 quota/request-ID lease와 성공·오류 후 nonce release가 회귀하지 않아야 한다.
4. rate-store spec에는 위 값이 `unavailable`이 아니라 HMAC key로 처리되고 raw 값이 command에
   없다는 회귀 테스트를 추가한다. controller 통합 spec은 실제 store와 stubbed fetch 경계를 사용해
   네 사례가 service의 canonical reject와 `finally` lease release까지 도달하는지 검증한다.
5. focused Jest, TypeScript, formatting 검증을 통과한 뒤 fresh reviewer에게 재검토받는다.

## 긍정적으로 확인된 경계

- `/token` 전용 4 KiB 비압축 strict JSON parser와 canonical path 예약
- ambient header/query/cookie 차단
- exact four-key shape
- no-store 응답과 공개 오류 envelope
- service 성공·오류 후 request-ID lease release
- raw refresh 값, request ID, exchange/digest 및 token 관련 로그 redaction

## 최종 판정

이 절의 `Not Ready` 판정은 최초 리뷰 시점의 기록이다.

## 2026-07-20 해결 기록

- 전용 opaque-proof parser로 token acquire/release의 UTF-8 4 KiB 경계를 분리하고 기존
  enroll/status `parseIdentifier`는 유지했다.
- 네 malformed proof가 actual rate-store quota/lease를 거쳐 401 `device_refresh_invalid`로
  끝나는 회귀 테스트를 추가했다.
- acquire/release 동일 HMAC replay key·nonce, compare-and-delete/no-DECR, raw proof 비노출,
  UTF-8 4096/4097-byte 경계를 직접 검증한다.
- 최종 검증: focused 2 suites / 49 tests, 지정 회귀 7 suites / 135 tests, TypeScript,
  Prettier 통과.
- fresh security re-review: Spec Compliance ✅, Task quality Approved,
  Critical/Important/Minor 0건.

따라서 최초 P1 finding은 해결됐으며 Task 3 source gate는 완료다. 실제 Redis/DB/network 검증은
후속 승인된 DEV/STG 운영 gate에 남는다.
