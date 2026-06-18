# Google Drive 웹하드 E2E 검증 리포트

- 검증일: 2026-06-01
- 목적: 자체 웹하드에서 Google Drive 저장소로 전환한 뒤, 기존 웹하드 기능이 E2E 기준으로 동일하게 동작하는지 확인
- 기준 문서: `docs/specs/features/webhard-system.md`, `docs/specs/api/endpoints/webhard.md`, `docs/features-list.md`, `docs/progress.txt`

## 기능별 결과

| 구분            | 기존 기능                                                      | E2E 증거                                                                                               | 결과 |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 인증/접근       | 비로그인 웹하드 접근 차단, 관리자 접근 허용                    | `e2e/webhard.spec.ts`, `e2e/security.spec.ts`                                                          | PASS |
| 권한 경계       | 관리자/업체/API 미인증 요청 차단                               | `e2e/security.spec.ts`                                                                                 | PASS |
| 파일 목록       | 목록 조회, 새 파일 모드, 정렬, 뷰 전환                         | `e2e/webhard.spec.ts`                                                                                  | PASS |
| 파일 업로드     | 소/중/대용량, 100MB+, 4/5/15/100개 동시 업로드                 | `e2e/webhard-file-operations.spec.ts`                                                                  | PASS |
| 업로드 제한     | 2GB 초과 거부, 100개 초과 거부, 금지 확장자 거부               | `e2e/webhard-file-operations.spec.ts`                                                                  | PASS |
| 드래그 업로드   | 루트 및 특정 폴더 드래그 앤 드롭 업로드                        | `e2e/webhard-file-operations.spec.ts`, `e2e/webhard.spec.ts`                                           | PASS |
| 파일 삭제       | 컨텍스트 메뉴, 아이콘, 툴바, 단건/다건 삭제                    | `e2e/webhard-file-operations.spec.ts`                                                                  | PASS |
| 삭제 실패 처리  | 네트워크 실패, 존재하지 않는 파일, rollback                    | `e2e/webhard-file-operations.spec.ts`                                                                  | PASS |
| 파일명 변경     | Enter/blur 저장, Escape 취소, 포커스, 빈값/공백 거부           | `e2e/webhard-file-operations.spec.ts`                                                                  | PASS |
| 파일명 검증     | 특수문자 sanitize, 중복 파일명, 권한 없음, rollback            | `e2e/webhard-file-operations.spec.ts`                                                                  | PASS |
| 폴더 생성       | 루트 폴더, 하위 폴더, 빈 이름 거부, ESC 취소                   | `e2e/webhard-folder-operations.spec.ts`                                                                | PASS |
| 폴더 수정/삭제  | 이름 변경, 삭제, 하위 폴더 포함 삭제, 비어 있지 않은 폴더 확인 | `e2e/webhard-folder-operations.spec.ts`                                                                | PASS |
| 폴더 네비게이션 | 클릭 이동, breadcrumb 상위 폴더 이동                           | `e2e/webhard-folder-operations.spec.ts`                                                                | PASS |
| 폴더 edge case  | 특수문자, 긴 이름, 같은 parent 중복 방지                       | `e2e/webhard-folder-operations.spec.ts`                                                                | PASS |
| 배경/UI         | 사이드바, 검색 드롭다운, 검색 모달 불투명 배경                 | `e2e/webhard-background.spec.ts`                                                                       | PASS |
| 외부 연동       | 레이저가공 업체 매핑/동기화, 업체 상세/목록, 백업 설정 표시    | `e2e/laser-only-company.spec.ts`                                                                       | PASS |
| 문의/도면 연동  | 문의 분류, 도면 리비전, 최신 도면 다운로드, 타임라인 realtime  | `e2e/contact-feedback-pack.spec.ts`, `e2e/drawing-consistency.spec.ts`, `e2e/drawing-timeline.spec.ts` | PASS |
| API 디버그      | 브라우저 API 직접 폴더 생성                                    | `e2e/debug-folder-api.spec.ts`                                                                         | PASS |

## 실행 결과

| 검증                                                                                                                                                                                                                      | 결과                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `npx tsc --noEmit`                                                                                                                                                                                                        | PASS                                            |
| `cd webhard-api && npx tsc --noEmit`                                                                                                                                                                                      | PASS                                            |
| `pnpm test -- --runInBand src/__tests__/lib/utils/uploadQueue-security.test.ts src/__tests__/api/webhard-upload-batch-complete-route.test.ts`                                                                             | 2 suites / 9 tests PASS                         |
| `pnpm exec playwright test --project=chromium --reporter='list,json'`                                                                                                                                                     | 127 passed / 0 skipped / 0 unexpected / 0 flaky |
| `pnpm exec playwright test --project=firefox --reporter='list,json'`                                                                                                                                                      | 127 passed / 0 skipped / 0 unexpected / 0 flaky |
| `pnpm exec playwright test --project=webkit --reporter='list,json'`                                                                                                                                                       | 127 passed / 0 skipped / 0 unexpected / 0 flaky |
| `pnpm exec playwright test --project='Mobile Chrome' --reporter='list,json'`                                                                                                                                              | 127 passed / 0 skipped / 0 unexpected / 0 flaky |
| `pnpm exec playwright test --project='Mobile Safari' --reporter='list,json'`                                                                                                                                              | 127 passed / 0 skipped / 0 unexpected / 0 flaky |
| `pnpm exec playwright test --project=Tablet --reporter='list,json'`                                                                                                                                                       | 127 passed / 0 skipped / 0 unexpected / 0 flaky |
| `pnpm exec playwright test --last-failed --project=chromium --reporter='list,json'`                                                                                                                                       | 2 passed / 0 skipped / 0 unexpected / 0 flaky   |
| `pnpm exec playwright test e2e/webhard-folder-operations.spec.ts --project=chromium --reporter='list,json'`                                                                                                               | 14 passed / 0 skipped / 0 unexpected / 0 flaky  |
| `pnpm exec playwright test e2e/webhard-file-operations.spec.ts --project=chromium --reporter='list,json'`                                                                                                                 | 38 passed / 0 skipped / 0 unexpected / 0 flaky  |
| `cd webhard-api && pnpm build`                                                                                                                                                                                            | PASS                                            |
| `cd webhard-api && pnpm test -- --runInBand src/files/__tests__/files.service.spec.ts -t "batchMoveFiles realtime\|batchDeleteFiles Drive repair\|routing target lazy create\|Google Drive metadata retry is idempotent"` | 5 passed / 0 failed                             |
| `pnpm exec playwright test e2e/webhard-file-operations.spec.ts --project=chromium --grep='should upload 5 files simultaneously\|should batch delete 5 files via toolbar' --reporter=list`                                 | 2 passed / 0 failed                             |
| `pnpm exec playwright test e2e/webhard-folder-operations.spec.ts --project=chromium --grep='should create folder via sidebar button\|should create subfolder under parent folder' --reporter=list`                        | 2 passed / 0 failed                             |

총합: 762 passed / 0 skipped / 0 unexpected / 0 flaky

## 수정된 검증 이슈

- Google Drive resumable upload URL은 브라우저 CORS 응답을 제공하지 않아, NestJS streaming proxy 경로로 업로드하도록 수정했다.
- Google Drive 실연동 E2E에서는 R2 upload route mock을 비활성화해 실제 Drive proxy upload 경로를 검증하도록 수정했다.
- Google Drive 실연동 E2E는 공유 DB seed와 실제 외부 업로드 상태를 사용하므로 Playwright worker를 1로 고정했다.
- 긴 스위트 실행 중 웹하드 초기 로딩 문구가 남는 fixture 플레이크를 재시도 대상으로 포함했다.
- 독립 리뷰에서 확인된 Drive upload proxy JSON body parser 소비 문제를 수정했다.
- Drive 업로드 성공 후 metadata 저장 실패가 성공 건수로 집계되지 않도록 수정했다.
- 동일 외부웹하드 routing target 폴더를 같은 배치 안에서 중복 생성하지 않도록 promise를 합쳤다.
- Drive E2E에서 isolated upload folder 생성 실패 시 루트 fallback으로 통과하지 않고 실패하도록 수정했다.
- batch-complete partial failure를 502로 변환하지 않고 200 + 파일별 results로 내려 전체 chunk 재시도를 막았다.
- uploadQueue가 batch-complete results를 반영해 파일별 metadata 저장 성공/실패를 집계하도록 수정했다.
- Drive batch move/delete 중 일부 Drive 작업만 성공한 경우 DB updateMany를 건너뛰고 성공한 Drive 작업만 storage repair에 기록하도록 수정했다.
- 외부웹하드 routing child folder lazy create에 PostgreSQL advisory transaction lock을 추가해 프로세스 간 중복 생성을 막았다.
- batch-complete 응답 손실 후 클라이언트가 재시도해도 같은 Drive file id/path metadata가 이미 있으면 새 row를 만들지 않고 성공으로 처리하도록 idempotency를 추가했다.
- Nest batch-confirm이 파일별 results를 반환하고, Next route가 non-prefix 오류 문자열도 파일명 포함 기준으로 매핑하도록 보강했다.
