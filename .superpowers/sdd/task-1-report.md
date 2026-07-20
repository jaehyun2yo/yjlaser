# Task 1 구현 보고 — Safe device-management service

- 상태: 완료 (로컬 소스·합성 테스트 기준)
- 범위: `webhard-api/src/integration/device-auth`의 장치 관리 서비스, 타입·토큰·모듈 factory 등록
- 외부 작업: 수행하지 않음. 실제 secret 조회, API 호출, DB migration deploy, 배포, stage/commit/push를 실행하지 않았다.

## 변경 파일

- `webhard-api/src/integration/device-auth/device-management.service.ts` (신규)
- `webhard-api/src/integration/device-auth/device-management.service.spec.ts` (신규)
- `webhard-api/src/integration/device-auth/device-auth.types.ts`
- `webhard-api/src/integration/device-auth/device-auth.tokens.ts`
- `webhard-api/src/integration/device-auth/device-auth.module.ts`
- `webhard-api/src/integration/device-auth/device-auth.module.spec.ts`

## 구현 결과

- `listDevices()`는 선택된 `DEVICE_AUTH_ENVIRONMENT`만 명시적 Prisma `select`로 조회하고, 예상 밖의 타 환경 row도 반환 전에 제외한다.
- 반환 DTO는 장치 식별·상태·버전·허용된 시간 필드만 포함한다. credential/hash, `approvedByActorHash`, 기타 민감 metadata는 select 및 summary에 포함하지 않는다.
- `approveDevice()`는 canonical lowercase UUID와 64자 lowercase hex actor hash를 선검증하고, 유효 입력만 enrollment lifecycle에 정확히 한 번 위임한다.
- `revokeDevice()`는 serializable transaction에서 device CAS, `prepared`/`active` refresh credential revoke, `requested`/`prepared` rotation cancel, audit write 순으로 실행한다. CAS/중간 write 실패는 성공으로 반환하지 않는다.
- transaction retry는 lifecycle과 동일하게 Prisma `P2034`에서만 최대 2회 시도한다. 그 외 persistence error는 원문 없이 `DEVICE_MANAGEMENT_UNAVAILABLE`으로 매핑한다.
- 관리 서비스는 `DEVICE_MANAGEMENT_SERVICE` symbol의 factory provider로만 등록·export했다.

## TDD 기록

- 목록/승인 테스트는 서비스 미구현 상태에서 `DeviceManagementService is not implemented`로 실패한 뒤 구현 후 통과했다.
- revoke 테스트는 `service.revokeDevice is not a function`으로 실패한 뒤 CAS transaction 구현 후 통과했다.
- module 테스트는 `DEVICE_MANAGEMENT_SERVICE` export 부재로 실패한 뒤 token/factory 등록 후 통과했다.
- 타 환경 mock row 반환 방어 테스트를 실패시킨 뒤 summary 전 filter를 추가해 통과시켰다.
- 전체 서비스 테스트 중 입력 검증이 동기 throw여서 Promise rejection 계약을 깨는 것을 재현했고, `approveDevice`/`revokeDevice`를 `async`로 고쳐 회귀 테스트를 통과시켰다.

## 검증

| 명령 | 결과 |
| --- | --- |
| `cd webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.service.spec.ts` | 통과 — 1 suite, 14 tests |
| `cd webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-auth.module.spec.ts` | 통과 — 1 suite, 2 tests |
| `cd webhard-api && npx tsc --noEmit --pretty false` | 통과 (exit 0; npm `shamefully-hoist` deprecation 경고만 출력) |
| `git diff --check` | 통과 (exit 0) |

## 남은 리스크

- 검증은 mock 기반 service/module 범위다. 실제 DB transaction isolation·rollback 동작과 controller/API authorization wiring은 후속 Task 또는 통합 검증에서 확인해야 한다.
- 현재 worktree의 `device-auth` subtree와 `.superpowers/sdd`는 기존 공유 미추적 변경 집합에 속한다. 따라서 stage/commit은 하지 않았고, 일반 `git diff --check`는 미추적 파일을 diff 대상으로 포함하지 않는다.
