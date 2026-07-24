# Task 2 구현 보고 — Administrator-only device-management API boundary

- 상태: 완료 (로컬 소스·합성 HTTP 테스트 기준)
- 범위: webhard-api/src/integration/device-auth의 관리자 전용 장치 목록/승인/폐기 API 경계
- 외부 작업: 수행하지 않음. 실제 secret 조회, API 호출, DB migration deploy, 배포, stage/commit/push를 실행하지 않았다.

## 변경 파일

- webhard-api/src/integration/device-auth/device-management.controller.ts (신규)
- webhard-api/src/integration/device-auth/device-management.controller.spec.ts (신규)
- webhard-api/src/integration/device-auth/device-management-no-store.middleware.ts (신규)
- webhard-api/src/integration/device-auth/device-enrollment-admin-empty-body.guard.ts (신규)
- webhard-api/src/integration/device-auth/device-enrollment-admin-empty-body.guard.spec.ts (신규)
- webhard-api/src/integration/device-auth/device-enrollment-admin-session-source.guard.ts
- webhard-api/src/integration/device-auth/device-enrollment-admin-session-source.guard.spec.ts
- webhard-api/src/integration/device-auth/device-auth.module.ts
- webhard-api/src/integration/device-auth/device-enrollment.controller.spec.ts

## 구현 결과

- GET /api/v1/integration/devices, POST /api/v1/integration/devices/:id/approve-enrollment, POST /api/v1/integration/devices/:id/revoke를 admin session + CSRF 경계에 추가했다.
- action endpoint는 명시적으로 200을 반환하고, path device ID는 controller가 변환하지 않아 management service의 canonical UUID 검증으로 전달한다.
- DeviceManagementNoStoreMiddleware를 DeviceAuthModule.configure에서 DeviceManagementController에만 route-entry middleware로 결선했다. 따라서 전역 CSRF, session/admin, credential-source, action body guard가 controller 전에 거부하는 경우를 포함해 목록과 두 action의 모든 응답에 Cache-Control: no-store, private가 먼저 설정된다.
- 목록은 management service의 safe summary만 반환한다. controller와 action body guard는 cache header를 직접 설정하지 않으며, 해당 책임은 route-entry middleware 하나로 유지한다.
- action 본문은 zero-octet만 수락한다. Transfer-Encoding, nonzero/duplicate Content-Length, text/plain, null/array/key가 있는 body를 거부한다. Express JSON parser가 실제 Content-Length: 0 요청을 일반 empty {}로 만드는 경우에는 raw Content-Length가 단 하나이고 값이 정확히 0인 경우에만 parser artifact로 허용한다.
- session-source guard는 x-api-key, x-account-recovery-key, authorization을 값 유무와 무관하게 거부하고 raw duplicate header도 검사한다. rawHeaders가 없거나 배열이 아닌 테스트/mock request는 빈 배열로 안전하게 취급한다.
- DeviceManagementError와 approve 위임의 DeviceEnrollmentError를 raw message 없이 generic envelope으로 매핑한다.
  - invalid → 400 / device_management_invalid
  - conflict → 409 / device_management_conflict
  - unavailable 및 unknown → 503 / device_management_unavailable
- enrollment-code CSRF bootstrap GET 및 issuance POST 회귀 테스트에 Authorization 거부를 추가했다.

## TDD 기록

- 신규 controller spec은 controller/empty-body guard module 부재로 실패한 뒤 구현했다.
- shared source guard spec은 Authorization 및 raw duplicate header 4건이 통과하지 않는 것을 확인한 뒤 보완했다.
- empty-body guard spec은 module 부재로 실패한 뒤 구현했고, zero-octet parser artifact 및 framing 우회 회귀를 추가했다.
- P1 no-store 회귀 테스트는 route middleware/module configure 부재로 실패한 뒤 추가했다. list와 두 action에서 no-session 401, company 403, CSRF 403, credential-source 403, body 400의 Cache-Control을 확인한다.

## 검증

| 명령 | 결과 |
| --- | --- |
| cd webhard-api; pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.controller.spec.ts | 통과 — 1 suite, 27 tests (P1 route-entry no-store HTTP 회귀 포함) |
| cd webhard-api; pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-enrollment-admin-empty-body.guard.spec.ts | 통과 — 1 suite, 18 tests |
| cd webhard-api; pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-enrollment-admin-session-source.guard.spec.ts | 통과 — 1 suite, 16 tests |
| cd webhard-api; pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-enrollment.controller.spec.ts | 통과 — 1 suite, 29 tests |
| cd webhard-api; pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-auth.module.spec.ts | 통과 — 1 suite, 3 tests (DeviceManagementController route binding 포함) |
| cd webhard-api; npx tsc --noEmit --pretty false | 통과 (exit 0; npm shamefully-hoist deprecation 경고만 출력) |
| git diff --check | 통과 (exit 0) |

## 남은 리스크

- 검증은 local NestJS/Supertest 및 mock service 범위다. 실제 proxy가 duplicate header를 정규화하는 방식과 production session/CSRF topology는 운영 승인 범위에서 확인해야 한다.
- zero-octet parser artifact 허용은 raw framing 검증으로 제한했지만, 실배포 edge proxy와 desktop client 조합의 전송 형식은 별도 운영 검증이 필요하다.
- 실제 DB transaction, credentials, secrets, migration, deployment, PC enrollment, 외부 API 호출은 이 Task에서 수행하지 않았다.
