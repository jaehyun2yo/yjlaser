# Account Recovery Design

> **Status**: Design (brainstorm-approved 2026-05-18, review-revised 2026-05-18). Implementation in a follow-up plan.

**Goal**: 거래처 로그인 화면의 아이디 찾기를 이메일 안내형으로 전환하고, 이미 구현된 비밀번호 reset-link 흐름을 같은 보안 기준으로 보강한다.

**Scope**:

- 아이디 찾기: 화면 결과 표시 제거, 등록 이메일 안내 메일 발송
- 비밀번호 찾기: 기존 reset-link request/confirm 흐름 유지, request/confirm 경로와 reset-token URL/log/referrer 노출 방어 보강
- backend boundary: 계정 복구 NestJS endpoint를 Next.js server 경유/API key 보호 경로로 제한
- abuse 방지: 계정 복구 전용 rate limit을 IP와 HMAC fingerprint 기준으로 적용
- 민감정보 방어: raw email, phone, username, reset token 로그/응답/telemetry 노출 차단
- 문서 동기화: `docs/features-list.md`, `docs/progress.txt`, API specs, changelog

**Out of scope**:

- 휴대폰 본인인증, SMS 인증번호, 외부 본인확인 서비스 연동
- 로그인 화면 전체 리디자인
- 관리자 계정 복구
- 운영 SMTP 실제 왕복 QA 자동화

---

## Research Summary

외부 기준과 주요 서비스 패턴을 확인했다.

- OWASP는 계정 복구와 비밀번호 재설정에서 계정 존재 여부가 드러나지 않도록 동일한 메시지와 유사한 응답 시간을 유지하고, reset token은 랜덤, 장수명 방지, 안전 저장, 1회 사용을 요구한다.
- 네이버는 아이디 찾기와 비밀번호 찾기에서 등록 전화번호, 이메일, 본인인증 같은 소유 채널 확인 후 결과 확인 또는 복구를 진행한다.
- Microsoft는 보안 연락처 이메일 또는 전화번호로 코드를 보내고, 확인 후 사용자명 힌트 또는 비밀번호 재설정을 제공한다.
- Google Workspace 계정 복구도 recovery email/phone 또는 도메인 검증처럼 소유 증명 수단을 사용한다.

YJ Laser는 B2B 거래처 포털이며 이미 SMTP와 reset-link 기반 비밀번호 재설정이 있으므로, 아이디 찾기는 화면 표시보다 등록 이메일 안내 방식이 적합하다.

---

## Decision

아이디 찾기는 **이메일 안내형**으로 구현한다.

필수값 검증과 rate limit을 통과한 요청은 계정 일치 여부와 무관하게 같은 성공 안내를 보여준다. 입력값이 실제 업체 정보와 일치하고 복구 가능한 계정이면 등록된 `managerEmail`로 실제 `username`을 보낸다.

화면에는 전체 아이디도, 마스킹 아이디도 표시하지 않는다. 이 정책은 계정 존재 여부 노출을 줄이고, 기존 비밀번호 찾기 reset-link 정책과 일관된다.

메일 전송은 사용자 응답 경로에서 기다리지 않는다. 계정 조회 후 발생한 메일 전송 실패는 사용자에게 별도 오류로 노출하지 않고, PII-safe 로그와 운영 알림으로만 처리한다.

---

## Alternatives

### 1. 이메일 안내형 (선택)

장점:

- 계정 존재 여부 노출을 최소화한다.
- 기존 SMTP와 mail service 구조를 재사용할 수 있다.
- 구현 범위가 작고 운영 절차가 단순하다.

단점:

- 사용자가 등록 이메일에 접근할 수 없으면 직접 해결할 수 없다.

### 2. 인증코드 확인 후 화면 마스킹 표시

장점:

- 사용자가 브라우저에서 즉시 결과를 확인할 수 있다.
- Microsoft식 username hint UX와 유사하다.

단점:

- 인증코드 저장, 만료, 재시도 제한, 확인 화면이 추가되어 범위가 커진다.
- 현재 필요한 수준보다 복잡하다.

### 3. 관리자 문의형

장점:

- 가장 보수적이고 구현이 작다.

단점:

- 운영자 부담이 커지고 사용자가 직접 복구할 수 없다.

---

## User Flow

### 아이디 찾기

1. 사용자가 `/login?view=find-id`로 이동한다.
2. `업체명`, `가입 시 등록한 이메일`, `연락처`를 입력한다.
3. 프론트엔드는 `POST /api/auth/find-id`를 호출한다.
4. Next.js route는 계정 복구 전용 rate limit을 검사한다.
5. Next.js route는 server API key로 NestJS `POST /api/v1/auth/find-id/request`에 위임한다.
6. NestJS는 API key 권한과 입력값을 검증한다.
7. NestJS는 복구 가능한 업체 중 입력 세 값이 모두 일치하는 업체를 찾는다.
8. 일치하는 업체가 있으면 등록 이메일로 아이디 안내 메일을 비동기 발송한다.
9. 일치하지 않아도 화면에는 같은 성공 안내를 반환한다.

화면 안내 문구:

```text
입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다.
```

### 비밀번호 찾기

기존 reset-link confirm 모델은 유지하되 request 경로를 보강한다.

1. 사용자가 `/login?view=find-password`에서 `아이디`, `가입 시 등록한 이메일`을 입력한다.
2. `POST /api/auth/find-password`가 계정 복구 전용 rate limit을 검사한다.
3. Next.js route는 server API key로 NestJS `POST /api/v1/auth/password-reset/request`에 위임한다.
4. 일치하는 복구 가능 업체가 있으면 30분 TTL reset token을 hash-only로 저장하고 reset link 메일을 비동기 발송한다.
5. 불일치하거나 메일 발송이 실패해도 사용자 응답은 같은 generic success를 유지한다.
6. 사용자는 `/reset-password#token=...`에서 새 비밀번호를 설정한다.
7. confirm endpoint는 미사용, 미만료 token만 1회 사용 처리하고 `companies.password_hash`를 갱신한다.

---

## Backend Design

### NestJS endpoint boundary

계정 복구 NestJS endpoint는 브라우저 공개 endpoint로 취급하지 않는다. 공개 사용자는 Next.js `/api/auth/*` route만 호출하고, Next.js server가 NestJS로 위임한다.

NestJS endpoints:

```text
POST /api/v1/auth/find-id/request
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
```

요구사항:

- 세 endpoint는 계정 복구 전용 server-to-server guard 뒤에 둔다.
- 기존 `ApiKeyModule`은 `AuthModule`을 import하므로 `AuthModule`에서 다시 `ApiKeyModule`을 import하지 않는다.
- `webhard-api/src/auth/guards/recovery-api-key.guard.ts`에 `RecoveryApiKeyGuard`를 추가하고, `X-Account-Recovery-Key`를 `ACCOUNT_RECOVERY_API_KEY`와 constant-time 비교한다.
- Next.js recovery routes는 NestJS 호출 시 `X-Account-Recovery-Key`를 붙인다. 기존 외부 연동 프로그램용 API key와 `MIGRATION_API_KEY`는 recovery endpoint 인증에 사용하지 않는다.
- 외부 연동 프로그램용 API key가 계정 복구 endpoint를 호출할 수 없도록 recovery 전용 key만 허용한다.
- NestJS endpoint를 API key 없이 직접 호출하면 `401` 또는 `403`을 반환한다.
- `AuthModule`은 새 controller/service와 필요한 guard/provider module 의존성을 명시적으로 등록한다.

문서 표기 규칙:

- HTTP 계약 문서에는 `/api/v1/auth/find-id/request`처럼 full path를 쓴다.
- `nestjsFetch` 호출 예시는 base URL이 이미 `/api/v1`을 포함하므로 `/auth/find-id/request` 같은 relative path를 쓸 수 있다.

### Find ID request

요청:

```json
{
  "companyName": "대성목형",
  "email": "manager@example.com",
  "phone": "010-1234-5678"
}
```

응답:

```json
{
  "success": true,
  "message": "입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다."
}
```

조회 조건:

- `companyName` exact match after trim
- `managerEmail` case-insensitive normalized match
- `managerPhone` normalized phone match
- 전화번호 normalizing은 숫자만 비교한다. 예: `010-1234-5678`, `01012345678`은 같은 값으로 본다.

복구 가능한 계정:

- `status === 'active'`
- `isApproved === true`
- 로그인 가능한 회사 계정

`pending`, `inactive`, suspended/test/soft-deleted 성격의 계정은 계정 불일치와 같은 generic success로 처리하고 메일을 보내지 않는다.

### Mail dispatch

`MailService`에 `sendUsernameReminder`를 추가한다.

메일 내용:

- 수신자: `company.managerEmail`
- 제목: `[유진레이저목형] 아이디 안내`
- 본문: 업체명, 아이디, 요청하지 않았으면 무시하라는 안내

메일에는 비밀번호, reset token, 세션 정보, API key를 포함하지 않는다.

발송 정책:

- SMTP가 전역 미설정이면 계정 조회 전에 모든 요청이 같은 `503`으로 실패할 수 있다.
- 계정 조회 이후의 개별 메일 전송 실패는 사용자 응답에 반영하지 않는다.
- request path는 SMTP I/O를 기다리지 않는다.
- 이번 범위의 dispatch primitive는 `AccountRecoveryMailDispatcher`로 고정한다. 이 dispatcher는 sanitized payload만 받고 in-process fire-and-forget으로 메일을 발송한다.
- dispatcher 실패는 PII-safe logger context와 기존 admin notification 인프라에 `account_recovery_mail_failed`로 남긴다. 알림 metadata에는 `flow`, `companyId` 또는 HMAC fingerprint, `reason`만 저장하고 raw email/phone/username/token은 저장하지 않는다.
- 비밀번호 reset token 생성 후 메일 발송이 실패해도 raw token은 응답하지 않는다. token은 만료 시간까지 남아도 외부에 전달되지 않으며, 운영 알림으로만 추적한다.

### Timing behavior

입력 검증과 rate limit을 통과한 find-id/password-reset request는 계정 존재 여부와 무관하게 같은 동기 작업 형태를 유지한다.

- SMTP I/O는 동기 응답 경로에서 제외한다.
- match branch만 외부 네트워크 I/O를 수행하지 않는다.
- match/mismatch 모두 동일한 response status/body를 반환한다.
- match branch의 token 생성, post-lookup 발송 제한 조회, mail dispatch 예약이 관찰 가능한 latency 차이를 만들지 않도록 이번 구현은 latency floor 방식을 사용한다.
- `AccountRecoveryTiming` 같은 injectable timing helper를 두고, 입력 검증/rate limit 통과 이후의 match/mismatch/generic-success 응답은 같은 minimum response floor를 거친다.
- 테스트는 정확한 실제 ms 값을 고정하지 않고 fake timer 또는 timing abstraction으로 floor helper 호출 여부를 검증한다. 또한 mail promise가 resolve/reject되기 전에 request가 generic success로 반환되는지와 match/mismatch가 같은 response contract를 갖는지를 검증한다.

---

## Frontend Design

### Next.js route

`src/app/api/auth/find-id/route.ts`는 현재 `serverGetCompanies` 목록 조회와 브라우저 응답용 `username` 반환을 제거한다.

새 동작:

- body에서 `companyName`, `email`, `phone`을 string으로 검증하고 trim한다.
- 필수값이 없으면 `400`.
- 입력값 형식과 길이가 유효하지 않으면 `400`.
- pre-lookup IP 또는 입력 fingerprint rate limit 초과 시 `429`.
- 유효하면 NestJS `POST /auth/find-id/request`로 위임한다.
- 성공 시 generic message만 반환한다.
- 응답 body에 `username`, `maskedUsername`, `token`, `resetLink`를 포함하지 않는다.

입력 검증:

- `companyName`: trim 후 1-100자, 제어문자 거부
- `email`: trim/lowercase 후 기본 email 형식, 최대 254자
- `phone`: 숫자만 추출 후 9-15자리
- 과도하게 큰 JSON body는 route level에서 거부한다.
- rate-limit key 생성 전에도 같은 canonicalization을 사용한다.

### Reset password public confirm route

기존 공개 confirm route는 유지한다.

- `POST /api/auth/reset-password`는 `{ token, password, passwordConfirm }`을 받는다.
- `password === passwordConfirm`을 확인한 뒤 NestJS `POST /api/v1/auth/password-reset/confirm`으로 recovery key를 붙여 위임한다.
- 브라우저는 NestJS confirm endpoint를 직접 호출하지 않는다.

### LoginForm

아이디 찾기 성공 UI에서 `foundUsername` 상태와 표시 영역을 제거한다.

이번 범위는 `foundUsername` 제거, 안내 문구 변경, 새로 수정하는 폼 요소의 디자인 시스템 준수로 제한한다. 기존 로그인 화면 전체의 hardcoded brand hex/native control 부채 정리는 별도 UI cleanup으로 분리한다.

### UI states and accessibility

아이디 찾기와 비밀번호 찾기 폼은 다음 상태를 명시적으로 처리한다.

| State            | Behavior                                                 |
| ---------------- | -------------------------------------------------------- |
| idle             | 입력 가능, submit enabled                                |
| submitting       | submit disabled, loading text 표시, 중복 제출 차단       |
| success          | generic 안내 표시, `로그인으로 돌아가기` CTA 표시        |
| validation error | 필드 값 유지, 첫 오류 필드 또는 오류 요약으로 focus 이동 |
| rate limited     | 필드 값 유지, `429` 안내 표시                            |
| server error     | 필드 값 유지, 서버 오류 안내 표시                        |

접근성:

- 성공/오류 메시지는 `role="status"` 또는 `aria-live`로 알린다.
- validation error는 관련 input과 `aria-describedby`로 연결한다.
- 버튼은 키보드 submit과 터치 타깃을 유지한다.

등록 이메일에 접근할 수 없는 사용자는 성공 안내 아래에서 `/contact` 또는 관리자 문의 경로를 안내한다. 이 경로는 계정 존재 여부를 확인해주지 않는 일반 문의 안내로만 동작한다.

---

## Error Handling

### 아이디 찾기

| Case                                                  | HTTP | User message                                                                   |
| ----------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| 필수값 누락/형식 오류                                 | 400  | 모든 필드를 올바르게 입력해주세요.                                             |
| 계정 불일치                                           | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다. |
| 계정 일치, 메일 발송 예약 성공                        | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다. |
| 계정 일치, 계정/email 발송 cooldown 또는 day cap 초과 | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다. |
| 계정 일치, 개별 메일 전송 실패                        | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 아이디 안내를 보냈습니다. |
| SMTP 전역 미설정 preflight                            | 503  | 메일 발송 설정을 확인할 수 없습니다. 관리자에게 문의해주세요.                  |
| pre-lookup IP 또는 입력 fingerprint rate limit 초과   | 429  | 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.                               |
| 내부 예외                                             | 500  | 서버 오류가 발생했습니다.                                                      |

### 비밀번호 찾기

| Case                                                  | HTTP | User message                                                                            |
| ----------------------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| 필수값 누락/형식 오류                                 | 400  | 아이디와 이메일을 올바르게 입력해주세요.                                                |
| 계정 불일치                                           | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 비밀번호 재설정 링크를 보냈습니다. |
| 계정 일치, 메일 발송 예약 성공                        | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 비밀번호 재설정 링크를 보냈습니다. |
| 계정 일치, 계정/email 발송 cooldown 또는 day cap 초과 | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 비밀번호 재설정 링크를 보냈습니다. |
| 계정 일치, 개별 메일 전송 실패                        | 200  | 입력하신 정보와 일치하는 계정이 있으면 등록 이메일로 비밀번호 재설정 링크를 보냈습니다. |
| SMTP 전역 미설정 preflight                            | 503  | 메일 발송 설정을 확인할 수 없습니다. 관리자에게 문의해주세요.                           |
| pre-lookup IP 또는 입력 fingerprint rate limit 초과   | 429  | 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.                                        |
| 내부 예외                                             | 500  | 서버 오류가 발생했습니다.                                                               |

메일 미설정 preflight는 계정 조회 전에 실행되어 모든 요청에 동일하게 적용될 때만 사용자에게 `503`으로 노출할 수 있다. 계정별 메일 전송 실패와 post-lookup 계정/email 발송 제한 초과는 계정 존재 여부를 노출할 수 있으므로 사용자 응답에 반영하지 않는다.

---

## Abuse Protection

계정 복구 요청에는 로그인 rate limit을 재사용하지 않는다. `src/lib/auth/rateLimit.ts`에 `checkAccountRecoveryRateLimit`를 추가한다.

Next.js public route level:

- Upstash prefix: `ratelimit:account-recovery`
- 개발 환경에서는 기존 정책처럼 통과시켜 로컬 개발을 방해하지 않는다.
- production에서는 IP와 입력 fingerprint 기준 제한을 모두 적용한다.
- `/api/auth/find-id`와 `/api/auth/find-password`는 `recordLoginAttempt` 또는 로그인 성공 reset 함수를 호출하지 않는다.

권장 정책:

- IP 기준: 15분당 5회
- 입력 fingerprint 기준: 1시간당 3회
- 계정 또는 이메일 발송 기준: 10분 cooldown, 일 5회 cap
- pre-lookup IP 또는 입력 fingerprint 제한 초과 시에만 `429`
- post-lookup 계정/email 발송 제한 초과는 메일 발송만 억제하고 사용자 응답은 계정 불일치와 같은 generic `200`으로 유지

fingerprint key:

- raw PII를 Redis/log에 저장하지 않는다.
- normalized `companyName/email/phone` 또는 `username/email`을 HMAC-SHA256으로 해시한다.
- HMAC secret은 계정 복구 전용 env `ACCOUNT_RECOVERY_RATE_LIMIT_SECRET`을 사용한다.
- production에서 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ACCOUNT_RECOVERY_RATE_LIMIT_SECRET` 중 하나라도 없거나 Redis check가 실패하면 fail closed로 `503`을 반환한다.
- local/test 환경에서만 no-op 또는 in-memory fallback을 허용한다.

발송 제한 저장:

- IP, 입력 fingerprint, 계정/email 발송 cooldown/day cap 모두 Upstash Redis key로 저장한다.
- 계정/email 발송 제한 key는 raw email이 아니라 `companyId` 또는 HMAC fingerprint를 사용한다.
- `checkAccountRecoveryRateLimit`는 계정 조회 전 IP/fingerprint 제한 초과만 `429`로 반환한다.
- post-lookup 계정/email 발송 제한은 `canSendMail: false` 같은 내부 결과로만 반환하고 외부 status/body를 바꾸지 않는다.
- matched account가 발송 제한을 초과한 경우와 unmatched input은 status/body가 동일해야 한다.

NestJS layer:

- API key 없이 직접 호출하는 요청은 guard에서 차단한다.
- 외부 프로그램 API key가 우회 경로가 되지 않도록 recovery 전용 key를 확인한다.
- NestJS endpoint도 recovery key가 유효하더라도 같은 Redis account recovery limiter를 확인한다.
- NestJS limiter도 pre-lookup IP/fingerprint 제한과 post-lookup account/email 발송 제한의 외부 응답 계약을 구분한다.
- Next.js는 canonicalized 입력 fingerprint와 신뢰 가능한 client IP를 NestJS에 전달한다. NestJS는 recovery key가 유효한 요청에서만 이 forwarded client context를 신뢰한다.

---

## Security Notes

- API 응답에 `username`을 포함하지 않는다.
- 화면에는 아이디 전체 또는 마스킹 아이디를 표시하지 않는다.
- 로그에는 raw email, raw phone, username, reset token을 남기지 않는다.
- 계정 복구 로그는 `companyId` 또는 HMAC fingerprint만 사용한다.
- 기존 `PasswordResetService`의 raw username 로그도 제거한다.
- 일치/불일치 응답은 같은 status와 같은 문구를 사용한다.
- 계정별 메일 전송 실패는 사용자 응답으로 구분하지 않는다.
- reset token은 기존처럼 raw token을 저장하지 않고 hash만 저장한다.
- reset link는 `/reset-password#token=...` fragment 방식으로 발급해 서버 request URL에 raw token이 포함되지 않게 한다.
- development localhost/loopback 요청은 현재 Next.js dev origin으로 reset link를 만들고, production은 request origin을 무시하고 설정 URL을 사용한다.
- legacy `/reset-password?token=...` raw token은 app/proxy/error telemetry 로그에서 redaction하고, 클라이언트 mount 직후 제거한다.
- reset page에는 `Referrer-Policy: no-referrer` 또는 동등한 정책을 적용한다.
- reset page는 token이 포함된 URL에서 외부 third-party resource를 로드하지 않는다.
- reset form은 mount 직후 fragment 또는 legacy query token을 memory state/ref에 보관하고 `window.history.replaceState(null, '', '/reset-password')`로 주소창 token을 제거한다.
- Sentry event URL, `request.query_string`, navigation breadcrumb URL-like fields는 query/hash token 값을 `[Filtered]`로 redaction한다.
- 계정 복구 메일 실패 로그와 notification metadata는 allowlisted reason code만 저장하고 raw SMTP error, recipient email, reset token을 저장하지 않는다.
- development localhost/loopback에서는 `ACCOUNT_RECOVERY_API_KEY`가 없어도 Next.js와 NestJS가 dev-only 기본 recovery key를 공유한다. staging/test/production 또는 non-loopback 요청에서는 공개 dev key를 거부한다. production에서 key가 없으면 NestJS로 무키 계정복구 요청을 보내지 않고 설정 오류 `503`으로 조기 차단한다.
- confirm 요청은 memory에 보관한 token을 body로만 보낸다.
- 비밀번호 reset confirm은 기존처럼 token 1회 사용, 만료 검증, bcrypt hash 저장을 유지한다.
- 계정 복구 완료 후 사용자는 자동 로그인되지 않고 일반 로그인으로 돌아간다.

---

## Testing

### Frontend route tests

파일 후보: `src/__tests__/api/auth/account-recovery-routes.test.ts`

- `find-id`가 NestJS `/auth/find-id/request`로 `useApiKey: true` 위임한다.
- `find-id` 성공 응답에 `username`, `maskedUsername`, `token`, `resetLink`가 없다.
- `find-id` 필수값 누락/형식 오류 시 NestJS를 호출하지 않고 `400`.
- `find-password` 기존 reset-link 위임 테스트 유지.
- pre-lookup IP 또는 입력 fingerprint rate limit 초과는 `429`와 overuse message를 반환한다.
- account recovery limiter는 로그인 limiter 상태를 변경하지 않는다.
- `find-password` pre-lookup IP 또는 입력 fingerprint rate limit 초과도 `429`를 반환하고 login limiter 상태를 변경하지 않는다.
- production에서 Upstash 또는 `ACCOUNT_RECOVERY_RATE_LIMIT_SECRET` 누락 시 fail closed 응답을 반환한다.
- development localhost/loopback에서는 `ACCOUNT_RECOVERY_API_KEY` 없이도 dev-only 기본 recovery key를 붙이고, staging/test/non-loopback 또는 production 누락 시에는 NestJS 호출 없이 `503`을 반환해 `CSRF token missing`이 브라우저 응답으로 노출되지 않는다.
- IP, 입력 fingerprint, 계정/email cooldown, day cap 각각의 초과를 검증한다.
- matched account의 계정/email cooldown 또는 day cap 초과와 unmatched input은 같은 status/body를 반환한다.

### LoginForm tests

파일 후보: `src/__tests__/auth/login-form-account-recovery.test.tsx`

- 아이디 찾기 성공 시 안내 문구만 표시하고 아이디 문자열은 표시하지 않는다.
- 아이디 찾기 계정 불일치가 HTTP 200 generic success로 돌아와도 같은 안내 문구를 표시한다.
- 비밀번호 찾기 성공 시 reset-link 안내를 표시한다.
- submitting 상태에서 submit 버튼이 disabled 되고 중복 제출이 발생하지 않는다.
- 성공/오류 메시지에 `role="status"` 또는 `aria-live`가 적용된다.

### Backend tests

파일 후보:

- `webhard-api/src/auth/find-id.service.spec.ts`
- 기존 `webhard-api/src/auth/password-reset.service.spec.ts`
- `webhard-api/src/auth/account-recovery.controller.spec.ts`

검증:

- 업체명, 이메일, 전화번호가 모두 일치하고 계정이 active/approved이면 username reminder 메일 발송 작업을 예약한다.
- 이메일 대소문자와 전화번호 하이픈 차이는 normalize되어 일치한다.
- 불일치하면 동일 성공 응답을 반환하고 메일을 보내지 않는다.
- inactive/pending/unapproved 계정은 동일 성공 응답을 반환하고 메일을 보내지 않는다.
- SMTP 전역 미설정은 계정 조회 전에 `ServiceUnavailableException`.
- 계정 조회 이후 메일 발송 실패는 외부 응답을 generic success로 유지하고 PII-safe 로그/알림을 남긴다.
- password reset request도 계정 조회 이후 메일 발송 실패 시 generic success를 유지한다.
- `AccountRecoveryMailDispatcher` mail promise가 resolve/reject되기 전에 request가 generic success를 반환한다.
- fake timer 또는 timing abstraction으로 match/mismatch/generic-success 응답이 같은 latency floor를 거치는지 검증한다.
- dispatcher 실패는 `account_recovery_mail_failed` admin notification과 PII-safe 로그를 남긴다.
- raw email, raw phone, username, reset token이 logger mock에 전달되지 않는다.
- post-lookup 발송 제한 저장소 실패는 메일/token 생성을 억제하되 matched/unmatched 모두 generic success를 유지한다.
- reset token 저장소 장애 또는 `password_reset_tokens` 테이블 누락은 메일/token 생성을 억제하되 matched/unmatched 모두 generic success를 유지한다.
- API key 없이 NestJS 복구 endpoint 직접 호출 시 `401` 또는 `403`.
- 기존 외부 프로그램용 일반 API key 또는 `MIGRATION_API_KEY`로 호출하면 거부된다.
- `ACCOUNT_RECOVERY_API_KEY`로 호출하면 허용된다.
- NestJS recovery endpoint도 limiter 초과 시 `429`를 반환한다.
- NestJS recovery endpoint의 post-lookup account/email 발송 제한 초과는 메일 발송만 억제하고 generic `200`을 유지한다.

### Reset token leakage tests

- `/reset-password` 응답 또는 metadata가 raw token을 logging context에 넣지 않는다.
- reset page에 referrer policy가 적용된다.
- `ResetPasswordForm`은 mount 직후 initial token을 state/ref에 보관하고 URL query를 즉시 제거한다.
- validation error/server error/success 경로 모두에서 URL query가 제거된 상태를 유지한다.
- confirm body에는 state/ref에 보관한 token이 포함된다.

### Type checks

- `npx tsc --noEmit`
- `cd webhard-api && npx tsc --noEmit`

---

## Documentation Updates

구현 시 다음 문서를 동기화한다.

- `docs/features-list.md`: account recovery feature 상태 추가 또는 `company-password-reset-link` 설명 확장
- `docs/progress.txt`: 새 세션 기록 추가
- `docs/changelog/CHANGELOG.md`: 아이디 찾기 이메일 안내형 전환과 rate limit 보강 기록
- `docs/specs/api/nextjs-routes.md`: `/api/auth/find-id`, `/api/auth/find-password`, `/api/auth/reset-password` 응답/보안 계약 갱신
- `docs/specs/api/nestjs-endpoints.md`: `POST /api/v1/auth/find-id/request` 추가, `/api/v1/auth/password-reset/request`, `/api/v1/auth/password-reset/confirm` recovery key guard와 에러 정책 갱신

---

## Implementation Order

1. 작업 브랜치와 dirty 상태 확인
2. `checkAccountRecoveryRateLimit` 추가: Upstash 필수, HMAC fingerprint, IP/fingerprint `429`, account/email cooldown/day cap 발송 억제, production fail-closed
3. Next.js `/api/auth/find-id`와 `/api/auth/find-password`에 account recovery limiter 적용
4. `AccountRecoveryTiming` helper 추가: match/mismatch/generic-success 응답 latency floor 적용
5. `RecoveryApiKeyGuard` 추가: `ACCOUNT_RECOVERY_API_KEY` constant-time 비교, 기존 `ApiKeyModule` 순환 의존 회피
6. NestJS recovery endpoints에 guard와 backend limiter 적용
7. `AccountRecoveryMailDispatcher` 추가: in-process fire-and-forget, PII-safe failure log, `account_recovery_mail_failed` admin notification
8. NestJS find-id DTO/service/controller/mail method 추가 후 `AuthModule` controllers/providers 등록
9. 기존 password reset request의 raw username 로그 제거와 메일 실패 응답 정책 보정
10. reset token URL/log/referrer 노출 방어 보강
11. `LoginForm`에서 아이디 표시 제거, 문구/상태/accessibility 정리
12. frontend/backend 테스트 추가
13. 문서 동기화
14. typecheck와 targeted test 실행
15. 별도 reviewer pass 진행

---

## Open Questions

없음. 사용자는 이메일 안내형 아이디 찾기와 기존 비밀번호 reset-link 유지 방향을 승인했고, 리뷰 결과에 따라 보안 경계와 abuse 방지를 설계에 반영했다.
