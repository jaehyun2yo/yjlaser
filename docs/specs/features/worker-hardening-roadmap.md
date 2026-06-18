# Worker Portal Hardening Roadmap

최종 갱신일: 2026-05-25

## 목적

`docs/specs/features/worker-portal.md`의 남은 hardening 범위를 실제 ticket 단위로 분해한다. Worker 기능 자체는 운영 가능한 흐름까지 구현됐지만, 접속 경계와 운영 추적은 별도 release gate로 관리한다.

## 현재 반영됨

- Worker PIN 로그인은 NestJS `POST /api/v1/erp/workers/pin-login`을 사용한다.
- Worker access log는 로그인 성공/실패, IP, User-Agent, metadata를 기록한다.
- PIN brute-force 방어는 `worker_access_logs` 기준 동일 IP의 최근 5분 `login_failed` 5회 이상에서 차단한다.
- 차단 응답은 `reason='rate_limited'`와 `retry_after_seconds`를 포함한다.
- Next.js `POST /api/erp/session`은 이름/PIN을 NestJS `pin-login`에 위임해 검증한 뒤에만 httpOnly `erp-session`을 발급한다. `workerId`/`workerName`만으로 세션을 만들 수 없다.
- Worker-facing Next route, socket token 발급, Server Action은 `getErpWorkerSession()` 또는 admin session 검증 실패 시 backend API key 호출 전에 실패한다.
- NestJS Contacts worker mutation endpoint는 `@AllowWorkerSession()`이 붙은 route에서만 `erp-session`을 검증하고, API key 요청이 `actorType=worker`를 위조하면 거부한다. 검증된 worker session 요청은 session의 `workerName`으로 actor를 확정한다.
- Worker contact/file/folder 접근은 backend worker access policy를 통해 worker-visible contact set에 연결된 리소스만 허용한다. 유효하지만 관련 없는 contact/file/folder UUID는 presigned URL, mutation, realtime room join 전에 403으로 거부한다.
- Worker dashboard/delivery/office/tasks는 server-side route guard를 거치며, client React Query는 hydration + worker session 확인 전 실행되지 않는다.
- Contacts realtime worker room join은 검증된 socket token 또는 검증 가능한 session만 허용한다. 검증 실패 `erp-session` fallback join은 금지한다.
- Worker login은 PIN을 localStorage에 저장하지 않는다.

## Ticket 분해

| Ticket       | 우선순위 | 범위                                   | 완료 기준                                                                                         | 검증                                                                             |
| ------------ | -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| WRK-HARD-001 | P0       | Worker PIN brute-force rate limit      | 동일 IP 5회 실패/5분 차단, 실패 로그 metadata에 reason/retry 기록                                 | `pin-brute-force.spec.ts`, Worker PIN manual QA                                  |
| WRK-HARD-002 | P0       | `worker.yjlaser.com` subdomain routing | Vercel domain과 middleware가 `/worker/*`로 안정 매핑                                              | desktop/mobile route smoke, session cookie domain 확인                           |
| WRK-HARD-003 | P0       | IP whitelist enforcement               | worker별 `allowedIps`가 비어 있으면 허용, 값이 있으면 matching IP만 허용                          | 허용/차단 IP matrix test, access log 확인                                        |
| WRK-HARD-004 | P1       | Admin IP management UI                 | admin이 worker별 허용 IP를 CRUD하고 마지막 로그인/IP를 확인                                       | admin browser QA, backend DTO/guard tests                                        |
| WRK-HARD-005 | P1       | Worker access log viewer               | admin이 worker, IP, action, 기간으로 로그를 검색                                                  | API pagination/filter test, admin table QA                                       |
| WRK-HARD-006 | P1       | Security dashboard                     | PIN 실패 급증, 외부 IP 접근, 차단 이벤트 요약 표시                                                | seeded data visual smoke, query scope test                                       |
| WRK-HARD-007 | P1       | Realtime/session production auth       | Worker/Admin realtime이 운영 도메인 cookie/session을 검증                                         | production-like WebSocket QA, expired/forged session reject                      |
| WRK-HARD-008 | P1       | Backend worker actor guard 분리        | Contacts worker mutation endpoint가 API key admin actor가 아니라 worker actor guard로 직접 보호됨 | completed 2026-05-19: contacts controller auth matrix, worker actor request test |

## Rollout 순서

1. `WRK-HARD-001`을 backend 배포에 포함한다.
2. `WRK-HARD-002`와 `WRK-HARD-007`을 같은 release window에서 확인한다. subdomain과 realtime cookie 정책이 함께 영향을 받기 때문이다.
3. `WRK-HARD-003`은 기본값 allow-all로 배포하고, 실제 제한은 작업장 IP 확정 후 켠다.
4. `WRK-HARD-004`~`006`은 운영자가 차단/로그를 직접 다룰 수 있게 하는 admin surface로 묶는다.

## Open Decisions

| 결정                                      | 영향                                                     |
| ----------------------------------------- | -------------------------------------------------------- |
| Worker subdomain을 첫 운영 cut에 강제할지 | session cookie domain과 Vercel domain 검증 범위가 달라짐 |
| 작업장 고정 IP가 있는지                   | IP whitelist 기본 정책과 rollout friction 결정           |
| access log 보존 기간                      | DB 용량, dashboard 조회 범위, 개인정보 보존 정책에 영향  |
