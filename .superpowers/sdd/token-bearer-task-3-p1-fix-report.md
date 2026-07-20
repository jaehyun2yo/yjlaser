# Task 3 P1 fix report — malformed refresh proof 401 계약 복구

## 결과

`POST /api/v1/integration/device-auth/token`의 정확한 four-key/non-empty-string 요청은
token rate/quota 및 request-ID lease 경계를 통과한 뒤 service가 canonical proof를 판정한다.
legacy identifier 제한을 넘거나 opaque control character를 포함한 refresh proof는 이제
rate-store `unavailable`/503이 아니라 service의 `device_refresh_invalid`/401 계약으로 끝난다.

## TDD RED

명령:

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts
```

결과: exit 1, 2 suites 중 8 tests 실패 / 37 tests 통과.

- 실제 `DeviceBootstrapRateStore` + stubbed Upstash fetch 경계에서 safe label 4개가 모두
  `unavailable`으로 실패했다.
- 동일 4개 HTTP 사례는 401 기대에 대해 기존 공개 오류 503으로 실패했다.
- 실패 출력과 테스트명에는 raw proof를 기록하지 않았다.

## 구현 판단

- 공용 `parseIdentifier`는 enroll/status/peer/replay 의미 보존을 위해 변경하지 않았다.
- token acquire와 request-ID lease release 전용 `parseTokenExchangeOpaqueProof`를 추가했다.
  non-empty string과 UTF-8 4 KiB 상한만 확인하므로 raw proof는 HMAC key-derivation 입력으로만
  흐른다.
- malformed proof도 기존 global/peer/refresh quota와 nonce-matched request-ID lease를 소비하고,
  controller `finally`에서 release된다. quota는 되돌리지 않는다.

## GREEN 및 회귀 검증

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts
```

exit 0 — 2 suites / 45 tests 통과.

```powershell
pnpm exec jest --runInBand --no-cache src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-bootstrap-rate.guard.spec.ts src/integration/device-auth/device-token-exchange.errors.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts src/common/logging/request-redaction.spec.ts
```

exit 0 — 7 suites / 131 tests 통과.

```powershell
pnpm exec tsc --noEmit --pretty false
pnpm exec prettier --check src/integration/device-auth/device-bootstrap-rate-store.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts
```

둘 다 exit 0. Prettier write 후 check를 재실행했으며 대상 3개 파일 모두 통과했다.

## 변경 파일

- `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.ts`
- `webhard-api/src/integration/device-auth/device-bootstrap-rate-store.spec.ts`
- `webhard-api/src/integration/device-auth/device-token-exchange.controller.spec.ts`

## Self-review 및 남은 우려

- 실제 store HTTP command가 raw refresh proof를 포함하지 않고, 각 malformed HTTP 사례가
  service 호출 및 lease release까지 진행하는 것을 검증했다.
- 실제 Redis/DB/network/secret/PC/API key/deploy는 실행하지 않았다. 본 작업 범위에서는
  의도된 제한이며, 운영 Upstash 동작은 이 테스트가 아닌 승인된 운영 검증에서 확인해야 한다.
- stage, commit, push는 실행하지 않았다.

## Fix 1 — reviewer finding 보완

- malformed-proof store/controller 테스트가 두 Upstash fetch body를 JSON으로 parse하고,
  acquire의 request replay key와 nonce가 release의 key/nonce와 각각 동일한지를 safe boolean으로
  단언한다. release EVAL은 `GET` nonce 비교 뒤 `DEL`을 수행하고 `DECR`을 포함하지 않음을
  함께 단언한다.
- raw proof 미포함 검사는 parse된 command string을 대상으로 boolean을 계산한 뒤
  `expect(boolean).toBe(false)`로 확인한다. control character의 JSON escaping 및 Jest 실패
  matcher가 raw 값을 출력할 수 있는 경로를 제거했다.
- controller service 도달 검사는 호출 수와 safe boolean으로 확인한다. raw request body 전체를
  matcher에 전달하지 않는다.
- UTF-8 multibyte proof의 정확히 4,096-byte 허용과 4,097-byte 거절을 추가했다. request ID는
  acquire와 release 양쪽에서, refresh credential은 acquire에서 실제 store 경계로 검증한다.
  생산 `parseTokenExchangeOpaqueProof`는 이미 `Buffer.byteLength(..., 'utf8')` 4 KiB 경계를
  충족했으므로 생산 동작 변경은 필요 없었다.

### Fix 1 검증

```powershell
cd webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts
```

exit 0 — 2 suites / 49 tests 통과.

```powershell
pnpm exec jest --runInBand --no-cache src/common/middleware/device-auth-bootstrap-transport.middleware.spec.ts src/integration/device-auth/device-bootstrap-request-shape.guard.spec.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-bootstrap-rate.guard.spec.ts src/integration/device-auth/device-token-exchange.errors.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts src/common/logging/request-redaction.spec.ts
pnpm exec tsc --noEmit --pretty false
pnpm exec prettier --check src/integration/device-auth/device-bootstrap-rate-store.ts src/integration/device-auth/device-bootstrap-rate-store.spec.ts src/integration/device-auth/device-token-exchange.controller.spec.ts
```

모두 exit 0 — 회귀 7 suites / 135 tests 통과, TypeScript 및 Prettier 통과.

## Fix 2 — bootstrap transport 최종 보안 리뷰

- absolute-form request-target의 pathname도 bearer transport와 같은 URL 정규화를 거쳐
  enroll/status/token generic parser skip에 예약하고, raw canonical origin-form이 아니므로
  dedicated middleware에서 400 및 `no-store, private`로 거절한다.
- 세 경로 각각에 plain/query/compressed/chunked/4,097-byte absolute-form 15개 회귀를 추가했다.
- canonical origin-form의 `Transfer-Encoding: chunked`는 body parser 전에 400/no-store로 거절한다.
- `x-session-token`을 transport와 Nest source guard 양쪽에서 금지하고, 값 있음/빈 값/중복 값의
  controller 이전 거절을 고정했다.

RED: absolute-form focused 1 suite에서 15 failures / 39 passes. 후속 header RED는 2 suites에서
7 failures / 64 passes였다. GREEN: header focused 2 suites / 71 tests, Task 3 회귀 8 suites /
168 tests 통과. `tsc --noEmit`, Nest build, owned-file Prettier가 모두 통과했다.

구현자 프로세스의 Task 1–5 단일 명령은 메모리 경합으로 summary 없이 종료됐지만, 상위 gate가
동일 명령을 다시 실행해 34 suites / 571 tests 통과를 확인했다. `tsc --noEmit`, Nest build,
owned-file Prettier와 clean RC `git diff --check`도 통과했다. 실제 외부 I/O, stage, commit,
push, deploy는 수행하지 않았다.
