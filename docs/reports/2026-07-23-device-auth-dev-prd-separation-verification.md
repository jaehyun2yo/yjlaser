# 중앙 장치 인증 개발·운영 환경 분리 검증 보고서

- 날짜: 2026-07-23
- 대상: 회사사이트
- 브랜치: `codex/company-device-auth-upstash-compat-20260721`
- 범위: 소스 구현과 로컬 검증
- 제외: 외부 개발/운영 배포, secret 변경, DB 연결·migration, 실제 장치 키 작업

## 결론

관리자 장치 인증 화면은 Frontend 기대 환경과 Backend 실제 환경이 정확히 일치할 때만
장치 등록·조회·승인·폐기·키 재발급 화면을 연다. 기대 환경 누락, 환경 확인 실패,
응답 계약 위반, 환경 불일치에서는 모든 장치 작업을 fail-closed로 차단한다.

Backend는 admin session으로 보호된 endpoint에서 `dev`/`stg`/`prd` 식별자만 반환한다.
credential, keyring, HMAC, database, Redis 정보는 응답에 포함하지 않는다.
화면 진입 후 proxy 대상이 바뀌는 경우도 막기 위해 Frontend는 모든 관리자 장치 요청에
기대 환경을 전달하고, Backend는 실제 작업 직전에 `DEVICE_AUTH_ENVIRONMENT`와 exact
비교한다. 누락·대소문자 변형·불일치는 서비스 호출 전에 generic `409`로 거부한다.

소스 범위 검증은 통과했다. 회사사이트 Frontend 전체 suite는 통과했으며 Backend 전체
suite에는 이번 변경과 무관한 기존 실패가 남아 있다. 따라서 이 보고서는 외부 배포
완료나 실제 개발/운영 인프라 연결 완료를 의미하지 않는다.

구현 후 독립 보안 재검토 최종 판정은 `APPROVED`, Critical/Important/Minor finding
0건이다.

## 구현 결과

1. `GET /api/v1/integration/devices/runtime-environment`
   - 기존 `SessionAuthGuard`와 `AdminGuard`가 적용된 controller에 추가했다.
   - 응답은 `{ "environment": "dev" | "stg" | "prd" }` 한 필드만 허용한다.
   - 전역 응답 필터의 `Cache-Control: no-store, private`를 확인했다.
2. Frontend 환경 boundary
   - `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`를 `dev`/`stg`/`prd` exact 값으로만 파싱한다.
   - Backend 응답도 exact schema로 검증하며 추가 필드가 있으면 거부한다.
   - 일치하기 전에는 등록 패널과 관리 패널을 렌더하지 않는다.
   - 실패 또는 불일치 상태에서는 환경 재확인만 허용한다.
3. 요청 시점 환경 결속
   - 조회·등록 코드 발급·승인·폐기·키 재발급과 CSRF bootstrap에
     `x-device-auth-environment`를 전달한다.
   - Backend `DeviceAdminEnvironmentGuard`가 등록·관리·관리자 키 회전 controller의
     매 요청을 서버 환경과 비교한다.
   - 환경 식별 endpoint만 관리자 인증을 유지한 채 비교 대상에서 제외한다.
   - 오류 응답은 공급된 환경 문자열이나 secret을 반사하지 않는다.
4. 배포 계약
   - local development=`dev`, staging/preview=`stg`, production=`prd` 조합을 문서와
     정적 계약 테스트로 고정했다.
   - database, Redis, credential/access-token keyring과
     audit/token-exchange/rate-limit HMAC namespace는 환경 사이에서 재사용하지 않도록
     중지 조건을 기록했다.

## TDD 증거

| 단계 | RED | GREEN |
| --- | --- | --- |
| Backend runtime environment endpoint | 신규 인증/응답 테스트 2건이 `404`로 실패 | 관련 controller/module 2 suites / 39 tests 통과 |
| Frontend 환경 parser/API | 신규 module/function 부재로 실패 | parser/API 2 suites / 39 tests 통과 |
| 관리자 fail-closed boundary | 누락·실패·불일치·재시도 시나리오 4건 실패 | 페이지/nav 2 suites / 14 tests 통과 |
| 요청 시점 환경 결속 | 환경 header 및 backend guard 부재로 신규 API/guard 테스트 실패 | Backend 5 suites / 109 tests, Frontend 4 suites / 58 tests 통과 |
| 배포 문서 계약 | 환경 조합과 분리 문구 부재로 1건 실패 | 정적 계약 6/6 통과 |

최종 집중 재검증:

- Frontend 관리자 환경/API/UI: 4 suites / 58 tests 통과
- Backend 장치 인증 핵심: 5 suites / 109 tests 통과

## 전체 검증

| 검증 | 결과 | 비고 |
| --- | --- | --- |
| Root TypeScript | 통과 | `npx tsc --noEmit --pretty false` |
| Backend TypeScript | 통과 | `npx tsc --noEmit --pretty false` |
| Root ESLint | 통과 | 0 errors, 기존 warning 1,031건 |
| Frontend 전체 Jest | 통과 | 160 suites / 1,177 tests |
| Backend build | 통과 | Nest build |
| Frontend production build | 통과 | Webpack build, `/admin/integration/devices` route 생성 확인 |
| 기본 Turbopack build script | 실행환경 실패 | worktree의 외부 `node_modules` symlink를 filesystem root 밖으로 판단 |
| Backend 전체 Jest | 기존 실패 | 165 suites / 2,337 tests 통과, 11 suites / 28 tests 실패 |
| Production 읽기 전용 smoke | 통과 | health `200`, 비로그인 관리자 경로 `307` 및 정확한 login redirect |
| Git whitespace 검사 | 통과 | `git diff --check` |

Frontend 전체 테스트 첫 재실행에서는 새 상대 경로 import를 금지하는 정적 gate 1건이
실패했다. 해당 import를 프로젝트 절대 별칭으로 수정한 뒤 전체 160 suites /
1,177 tests를 다시 실행해 모두 통과했다.

Frontend 전체 테스트의 첫 실행에서는 Git이 worktree 소유권을 거부해 정적 gate 3개가
실패했다. global 설정은 변경하지 않고 해당 테스트 프로세스에만 `safe.directory`를
전달해 재실행했으며 160 suites가 모두 통과했다.

Backend 전체 테스트의 첫 병렬 실행은 메모리 부족으로 중단됐다. 순차 실행과 테스트
프로세스 전용 8 GiB heap으로 재실행해 실제 suite 결과를 확보했다.

## Backend 전체 suite의 비관련 기존 실패

현재 변경 범위는 관리자 장치 환경 endpoint, 요청별 환경 guard, 관리자 화면과 관련
테스트이며 아래 비관련 실패 파일은 수정하지 않았다.

- 웹하드 폴더 이동 mock/기대 불일치
  - `folders/folders.service.spec.ts`
  - `contacts/contact-folder-sync.service.spec.ts`
- 고정 과거 날짜 fixture가 30일 복구 기한을 넘김
  - `companies/companies.service.spec.ts`
- 기존 integration test module의 `DeviceBearerRequestSourceGuard` provider 누락
  - `integration/events/*.spec.ts`
  - `integration/orders/order-timeline.spec.ts`
- 기존 로그 redaction 기대값과 scanner fixture 불일치
  - `activity-logs/activity-logs.service.spec.ts`
  - `integration/__tests__/operational-security-boundary.spec.ts`

이 실패를 이번 장치 인증 환경 분리 범위에서 함께 수정하면 사용자가 승인한 목표를
벗어나므로 수정하지 않았다. 별도 회귀 정리 작업으로 처리해야 한다.

## 환경별 시나리오 판정

| Frontend 기대값 | Backend 실제값 | 결과 |
| --- | --- | --- |
| `dev` | `dev` | 개발 환경 표시 후 장치 작업 허용 |
| `stg` | `stg` | parser/API 계약에서 허용 |
| `prd` | `prd` | parser/API 계약에서 허용 |
| `dev` | `prd` | 환경 불일치 표시, 모든 장치 작업 차단 |
| 누락/잘못된 값 | 호출 안 함 | 설정 누락 표시, 모든 장치 작업 차단 |
| 유효값 | API 실패/비정상 응답 | 확인 실패 표시, 모든 장치 작업 차단 |

화면 진입 당시 환경이 일치했더라도 이후 각 작업 요청의
`x-device-auth-environment`가 Backend 실제 환경과 다르면 `409`로 차단된다.

## 남은 운영 단계

외부 인프라에 실제로 적용하려면 별도 승인 후 다음 작업이 필요하다.

1. 개발/preview Frontend와 Backend 배포 대상을 별도로 확정한다.
2. Frontend와 Backend에 환경별 식별자를 같은 조합으로 설정한다.
3. 환경별 database, Redis, keyring, HMAC namespace가 서로 다른지 값 원문 없이 확인한다.
4. 각 배포의 관리자 화면에서 표시 환경과 Backend 응답을 확인한다.
5. 개발 환경에서만 등록·승인·폐기·재발급 smoke를 수행한 뒤 운영은 읽기 확인부터
   단계적으로 진행한다.

운영 설정, 배포, 실제 키 작업은 이 보고서 작성 과정에서 수행하지 않았다.

## 독립 재검토의 잔여 위험

- 배포에서 `DEVICE_AUTH_ENVIRONMENT` 자체를 잘못 지정하면 소스만으로 database,
  Redis, keyring, HMAC 연결 대상의 의미까지 판별할 수 없다.
- Backend 전체 suite의 기존 11 suites / 28 tests 실패 때문에 변경 범위 밖 통합
  회귀까지 완전히 보증하지는 않는다.
- 실제 개발·스테이징·운영 URL과 외부 저장소 분리는 별도 승인된 배포 단계에서
  값 원문을 노출하지 않는 방식으로 확인해야 한다.
