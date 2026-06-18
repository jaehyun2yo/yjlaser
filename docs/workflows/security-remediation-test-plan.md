# Security Remediation Test Plan

## 목적

보안/성능/디자인/유지보수 전수 리뷰에서 나온 P0 수정 전에 RED 테스트를 먼저 고정한다. 구현 전 현재 기준으로 실패해야 하며, 수정 완료 후 GREEN 기준을 통과해야 한다.

## RED 테스트

| Ticket         | Test command                                                                                                                                     | 현재 실패 기준                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01, SEC-04 | `pnpm test -- --runTestsByPath tests/security/middleware-auth-boundary.test.ts --runInBand`                                                      | forged `admin-session`, `company-session`, `erp-session`, spoofed `x-forwarded-for`가 middleware를 통과하면 실패                                                                                                                                                          |
| SEC-02         | `cd webhard-api && pnpm test -- src/auth/guards/admin.guard.spec.ts src/integration/auth/api-key.guard.spec.ts --runInBand`                      | API key principal이 admin session처럼 취급되면 실패                                                                                                                                                                                                                       |
| SEC-08, SEC-09 | `pnpm test -- --runTestsByPath src/__tests__/api/security-mutation-routes.test.ts src/__tests__/api/portfolio/portfolio-api.test.ts --runInBand` | unauthenticated/company/worker-mismatch mutation이 upstream fetch, push send, upload를 실행하면 실패                                                                                                                                                                      |
| UI-AUDIT-01    | `pnpm test -- --runTestsByPath src/__tests__/lib/styles/literal-classname-static-gate.test.ts --runInBand`                                       | production `src` 코드에 `className="...${...}"` literal interpolation이 남아 있으면 실패. 이 gate는 전체 디자인 부채 정리용이며 Train 3 Task 17에서 GREEN으로 만든다. Train 1에서 해당 파일을 직접 수정한 경우에는 그 파일의 신규 interpolation만 로컬 범위에서 제거한다. |

## GREEN 성공 기준

- P0 auth matrix는 `anonymous`, forged cookie, company session, worker session, integration API key, admin session 각각의 expected status가 테스트로 고정되어야 한다.
- 인증 실패 경로는 upstream NestJS call, R2 upload, push send, sync service proxy를 호출하지 않아야 한다.
- API key actor는 admin session과 다른 principal로 모델링되어야 하며, admin-only guard는 API key principal을 거부해야 한다.
- Worker mutation/read는 verified worker session과 대상 worker/contact/file visibility allowlist를 모두 만족해야 한다.
- Portfolio upload는 admin-only여야 하며 company session은 파일 처리 전에 403이어야 한다.
- Literal class interpolation static gate는 Train 3 완료 시 production source 기준 0건이어야 한다. Train 1의 P0 보안 검증에서는 기존 전체 디자인 부채를 release blocker로 삼지 않는다.

## 전체 회귀 확인 기준

P0 수정 후 최소 검증:

```powershell
pnpm test -- --runTestsByPath tests/security/middleware-auth-boundary.test.ts src/__tests__/api/security-mutation-routes.test.ts src/__tests__/api/portfolio/portfolio-api.test.ts src/__tests__/api/worker-auth-boundary.test.ts src/__tests__/actions/qa-test-auth.test.ts --runInBand
cd webhard-api && pnpm test -- src/auth/guards/admin.guard.spec.ts src/integration/auth/api-key.guard.spec.ts --runInBand
npx tsc --noEmit
cd webhard-api && npx tsc --noEmit
```

추가로 P0 보안 구현이 완료되면 browser/API E2E에서 forged cookie, company session, worker session, integration API key, admin session별 실제 route 접근 결과를 확인한다.

`src/__tests__/lib/styles/literal-classname-static-gate.test.ts`는 기존 production-wide 디자인 부채 52건을 포함해 실패하는 것이 현재 baseline이며, Task 17에서 전체 수정 후 성공 기준으로 전환한다.
