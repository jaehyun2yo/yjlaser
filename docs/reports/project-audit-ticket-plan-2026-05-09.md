# Project Audit Ticket Plan — 2026-05-09

## 작업 상태

- 작업 브랜치: `codex/project-audit-ticket-plan`
- 입력 보고서: `docs/reports/project-audit-2026-05-08.md`
- 목적: 프로젝트 감사 보고서의 P0/P1 항목을 티켓 단위로 나누고, 각 티켓의 범위·선행 조건·검증 기준을 고정한다.
- 주의: `docs/reports/project-audit-2026-05-08.md`는 작업 시작 전 untracked 상태였으므로 사용자 소유 파일로 취급한다.

## 기준 근거

- P0 백업 권한: NestJS 백업 API가 `ApiKeyGuard`만 사용하고 API key 인증 사용자를 `admin`으로 주입한다는 지적. `docs/reports/project-audit-2026-05-08.md:16`, `docs/reports/project-audit-2026-05-08.md:260`
- P1 웹하드 성능: 전체 폴더 트리 조회, 뱃지 전체 트리 계산, 외부웹하드 후보 반복 subtree 조회. `docs/reports/project-audit-2026-05-08.md:17`, `docs/reports/project-audit-2026-05-08.md:121`, `docs/reports/project-audit-2026-05-08.md:148`, `docs/reports/project-audit-2026-05-08.md:202`
- P1 모니터링: 24시간 활동 집계가 실제 날짜 필터를 적용하지 못하는 경로. `docs/reports/project-audit-2026-05-08.md:18`, `docs/reports/project-audit-2026-05-08.md:349`
- P1 유지보수: 대형 파일 집중. `docs/reports/project-audit-2026-05-08.md:19`, `docs/reports/project-audit-2026-05-08.md:48`
- P1 디자인시스템: `brand hex`, `dark:` 잔존. `docs/reports/project-audit-2026-05-08.md:20`, `docs/reports/project-audit-2026-05-08.md:548`
- 웹하드 스펙 기준: frontend `src/app/webhard/`, backend NestJS files/folders/storage, company isolation, presigned upload. `docs/specs/features/webhard-system.md:9`, `docs/specs/features/webhard-system.md:10`, `docs/specs/features/webhard-system.md:16`, `docs/specs/features/webhard-system.md:57`
- 디자인시스템 기준: CSS token, `dark:` 금지, `@/components/ui` 사용, raw color 금지. `docs/specs/features/design-system.md:10`, `docs/specs/features/design-system.md:225`, `docs/specs/features/design-system.md:227`, `docs/specs/features/design-system.md:229`

## 실행 원칙

1. P0 권한 경계는 성능/리팩토링보다 먼저 처리한다.
2. 기능 수정 전 현재 버그를 재현하거나 현재 정책을 고정하는 테스트를 먼저 추가한다.
3. 성능 티켓은 정확도 테스트와 opt-in 성능 계측을 분리한다.
4. UI 리팩토링은 디자인시스템 금지 패턴 검사와 브라우저 smoke 없이 완료로 보지 않는다.
5. 대형 파일 분리는 공개 API와 기존 props/return type을 유지하는 순수 구조 변경부터 진행한다.
6. 배포 대기 상태인 `external-batch-auto-contact-observability`, `webhard-unclassified-file-relocate`, `company-password-reset-link`, `company-pending-login-message`와 충돌 가능성을 먼저 확인한다.
7. 동작, API, DB, 운영 화면이 바뀌는 티켓은 완료 전에 `docs/features-list.md`, `docs/progress.txt`, `docs/changelog/CHANGELOG.md`, 관련 `docs/specs/**` 갱신 필요 여부를 명시한다.
8. Frontend Jest 검증은 현재 root Jest 30 기준 `--testPathPatterns`를 사용하고, `.worktrees/**` 중복 테스트 탐색이 결과를 오염시키지 않는지 확인한다.

## 티켓 백로그

| ID        | 우선순위 | 제목                                                          | 주요 파일                                                                                    | 완료 기준                                                                                                           | 검증                                                                 |
| --------- | -------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| AUDIT-01  | P0       | Backup API 권한 회귀 테스트                                   | `webhard-api/src/backup/**`                                                                  | API key-only, admin session, company session access matrix 테스트 추가                                              | `cd webhard-api && pnpm test -- backup --runInBand`                  |
| AUDIT-02  | P0       | BackupAdminGuard 또는 권한 스코프 적용                        | `webhard-api/src/backup/backup.controller.ts`, auth guard                                    | 백업 read/write/execute가 관리자 또는 명시 권한으로만 허용                                                          | backup test, backend `tsc`                                           |
| AUDIT-03  | P1       | ActivityLog 날짜 필터 테스트                                  | `webhard-api/src/activity-logs/**`                                                           | 25시간 전 로그가 24시간 집계에서 제외되는 테스트 추가                                                               | `cd webhard-api && pnpm test -- activity-logs --runInBand`           |
| AUDIT-04  | P1       | ActivityLog 날짜 필터 구현                                    | activity logs controller/service, performance route                                          | `startDate`/`endDate`가 Prisma `createdAt` range로 적용되고 관리자 성능 route의 24시간 집계가 25시간 전 로그를 제외 | activity-log test, performance route test, frontend `tsc`            |
| AUDIT-05  | P1       | Storage breakdown `companyId=null` 정책 정리                  | `webhard-api/src/storage/storage.service.ts`                                                 | 업체 사용자가 타 업체/null 관리자 파일을 breakdown에서 보지 못함                                                    | `cd webhard-api && pnpm test -- storage.service.spec.ts --runInBand` |
| AUDIT-06  | P1       | 웹하드 대량 fixture 성능 테스트 기반                          | files/folders test helpers                                                                   | 10k folders/100k files fixture helper, opt-in 성능 계측 분리                                                        | files/folders targeted tests                                         |
| AUDIT-07  | P1       | `/folders` 기본 조회와 lazy folder loading                    | `folders.service.ts`, `WebhardMain.tsx`, webhard hooks                                       | 전체 트리 기본 조회 제거, breadcrumb/upload/navigation 유지                                                         | folders tests, webhard tests, browser smoke                          |
| AUDIT-08  | P1       | 뱃지 카운트 캐시와 조상 invalidate                            | `files.service.ts`, badge helper                                                             | 업로드/다운로드/삭제/이동 후 자신/부모/루트 뱃지 정확                                                               | files service test, backend `tsc`                                    |
| AUDIT-09  | P1       | 외부웹하드 미매칭/빈 껍데기 후보 bulk화                       | `folders.service.ts`, cleanup-husk tests                                                     | root 수만큼 쿼리가 선형 증가하지 않음                                                                               | folders cleanup-husk test                                            |
| AUDIT-10  | P1       | 폴더 rename/move descendant path set-based 갱신               | `folders.service.ts`                                                                         | 5k descendant path 갱신 정확, 실패 시 transaction rollback                                                          | folders test, backend `tsc`                                          |
| AUDIT-11  | P1       | raw React Query key 제거와 정적 금지 테스트                   | `queryKeys.ts`, webhard cache files, static test                                             | 테스트 파일 제외 production path raw webhard key 0건을 정적 테스트가 실패로 증명                                    | queryKeys factory test, raw-key static test, frontend `tsc`          |
| AUDIT-12  | P1       | 중복 가상 리스트 정리                                         | `VirtualizedFileList.tsx`, `VirtualFileList.tsx`                                             | 남길 컴포넌트 1개 결정, 삭제 대상 사용처 0건                                                                        | `rg`, webhard tests, frontend `tsc`                                  |
| AUDIT-13  | P1       | reload와 silent catch 제거                                    | ErrorBoundary, socket, webhard error boundary                                                | reload 대신 reset/invalidation, silent catch 대신 logger/context                                                    | `rg`, targeted tests                                                 |
| AUDIT-14  | P1       | `WebhardMain.tsx` 훅/command 분리                             | `WebhardMain.tsx`, 신규 webhard hooks                                                        | 서버 데이터/선택/drag/upload/action 책임 분리, 동작 유지                                                            | webhard tests, frontend `tsc`, browser smoke                         |
| AUDIT-15  | P1       | `nestjs-server-client.ts` 도메인별 분리                       | `src/lib/api/**`                                                                             | public export 유지, auth/error/cache 공통 유틸화                                                                    | API/client tests, frontend `tsc`                                     |
| AUDIT-16  | P1       | `folders.service.ts`/`files.service.ts` use-case service 분리 | backend files/folders services                                                               | controller 계약 유지, use-case별 테스트 확보                                                                        | folders/files tests, backend `tsc`                                   |
| AUDIT-17  | P1       | `ContactForm.tsx` 단계별 분리                                 | `src/app/contact/**`                                                                         | 공개 폼 제출/첨부/방문예약/견적 검증 유지                                                                           | contact form tests, frontend `tsc`, browser smoke                    |
| AUDIT-18  | P1       | 디자인시스템 static gate                                      | tokens/styles tests                                                                          | 신규/수정 코드 `dark:`/brand hex 재유입 차단                                                                        | tokens/styles test, `rg`                                             |
| AUDIT-19  | P1       | 디자인시스템 관리자/웹하드 우선 마이그레이션                  | admin webhard, `src/app/webhard/**`                                                          | 수정 파일 기준 `dark:`/brand hex 0건, light/dark smoke 통과                                                         | frontend `tsc`, visual smoke                                         |
| AUDIT-20  | P1       | 웹하드 파이프라인 trace/backlog MVP                           | files, auto-contact, sync-log, admin monitoring                                              | routing/auto-contact 실패와 skip reason이 관리자 조회 가능                                                          | service/route tests, backend/frontend `tsc`                          |
| AUDIT-DOC | P1       | 문서 동기화 게이트                                            | `docs/features-list.md`, `docs/progress.txt`, `docs/changelog/CHANGELOG.md`, `docs/specs/**` | 각 PR이 변경 유형별 문서 갱신 여부를 명시하고 필요한 문서를 함께 갱신                                               | docs diff review, 관련 spec/API 문서 spot check                      |

## 상세 티켓 메모

### AUDIT-01 / AUDIT-02 — Backup 권한

- 먼저 red test를 만든다. 최소 endpoint는 `PUT /backup/settings`, `POST /backup/execute`.
- API key를 계속 허용해야 한다면 key 전체를 admin으로 간주하지 말고 `backup:read`, `backup:write`, `backup:execute` 같은 명시 권한을 확인한다.
- `MIGRATION_API_KEY`의 실제 운영 사용 경로가 불명확하면 구현을 멈추고 권한 정책 문서부터 작성한다.

### AUDIT-03 / AUDIT-04 — ActivityLog 24시간 집계

- `ActivityLogsController`와 service가 `startDate`, `endDate`를 받도록 한다.
- invalid date 처리 정책은 400 또는 무시 중 하나로 테스트명에 고정한다.
- 관리자 성능 route의 "최근 24시간" 문구와 API 필터가 일치해야 한다.
- `src/app/api/webhard/performance/route.ts`는 NestJS activity log 응답을 mock/stub해서 25시간 전 로그가 UI metric에 포함되지 않는지 route 단위로 검증한다.

### AUDIT-06 ~ AUDIT-10 — 웹하드 성능

- 성능 개선 전 fixture/test 기반을 먼저 만든다.
- `/folders` 계약 변경은 구버전 외부웹하드 클라이언트를 깨지 않는지 확인한다. 위험하면 기존 endpoint를 유지하고 신규 `/folders/root` 또는 `/folders/children` 경로로 분리한다.
- 뱃지 카운트는 admin 전체 조회와 company 조회의 cache key를 분리한다.
- 외부웹하드 후보 계산은 root별 반복 count 대신 bulk 조회 또는 recursive CTE를 우선 검토한다.
- descendant path 갱신에 raw SQL을 쓰면 parameter binding과 rollback 테스트를 반드시 포함한다.

### AUDIT-11 ~ AUDIT-14 — 웹하드 프론트 안정화

- raw query key 제거, 중복 virtual list 정리, reload 제거를 먼저 처리하면 `WebhardMain.tsx` 분리 리스크가 줄어든다.
- raw query key 금지는 `queryKeys` factory shape 테스트만으로 완료하지 않는다. 테스트 파일 제외 production path에서 `['webhard'`, `["webhard"` 패턴이 남으면 실패하는 static test를 추가한다.
- `WebhardMain.tsx` 분리는 `useWebhardFilesQuery`, `useWebhardFoldersQuery`, `useWebhardSelection`, `useWebhardDragAndDrop`, `useWebhardUploadPrompt` 순서로 얇게 빼낸다.
- 새 UI/스타일 코드는 `dark:`와 brand hex를 금지하고 `@/components/ui` 및 semantic token을 사용한다.

### AUDIT-15 ~ AUDIT-17 — 대형 파일 분리

- `nestjs-server-client.ts`는 도메인별 파일로 나누되 기존 import 경로를 바로 깨지 않는다.
- `folders.service.ts`/`files.service.ts`는 성능 티켓에서 경계가 드러난 use-case부터 분리한다.
- `ContactForm.tsx`는 pending deploy 변경과 충돌 가능성을 먼저 보고, 공개 폼 제출/첨부/방문예약/견적 방법 검증을 회귀 기준으로 삼는다.

### AUDIT-18 / AUDIT-19 — 디자인시스템

- 기존 전체 코드 0건을 즉시 목표로 잡지 않는다. baseline을 만들고 신규/수정 파일 금지부터 적용한다.
- `@theme`/`@theme inline` 충돌 회귀가 생기면 색상 치환을 멈추고 token 생성 문제를 먼저 복구한다.
- 핵심 smoke 대상: 웹하드, 관리자 백업 설정, Card/Badge/sidebar/modal light/dark 배경.

### AUDIT-20 — 파이프라인 관측성

- 기존 `external-batch-auto-contact-observability` pending deploy 결과를 먼저 반영한다.
- 최소 MVP는 routing 실패, auto-contact 실패/skip reason, trace id 기반 조회다.
- DB migration이 필요한 경우 백업/rollback 계획을 별도 티켓으로 분리한다.
- 이 티켓은 files/folders/auto-contact/admin monitoring을 건드리는 후속 성능·분리 PR보다 먼저 최소 계약을 고정한다.

### AUDIT-DOC — 문서 동기화 게이트

- 권한, ActivityLog query, folder endpoint, pipeline trace, DB migration, 관리자 UI 변경은 관련 spec/API/feature/changelog/progress 문서 업데이트 여부를 각 PR 설명에 명시한다.
- 문서 갱신이 필요 없다고 판단한 경우에도 근거를 PR에 남긴다.
- 문서 변경이 필요한 티켓은 코드 검증과 별개로 문서 spot check를 완료 기준에 포함한다.

## 권장 실행 순서

1. `AUDIT-01` -> `AUDIT-02`
2. `AUDIT-03` -> `AUDIT-04` -> `AUDIT-05`
3. `AUDIT-20`
4. `AUDIT-06`
5. `AUDIT-07` -> `AUDIT-08` -> `AUDIT-09` -> `AUDIT-10`
6. `AUDIT-11` -> `AUDIT-12` -> `AUDIT-13` -> `AUDIT-14`
7. `AUDIT-15` -> `AUDIT-16` -> `AUDIT-17`
8. `AUDIT-18` -> `AUDIT-19`
9. `AUDIT-DOC`는 모든 PR의 공통 완료 게이트로 적용한다.

## PR 분할

- PR 1: `AUDIT-01`, `AUDIT-02`
- PR 2: `AUDIT-03`, `AUDIT-04`, `AUDIT-05`
- PR 3: `AUDIT-20`
- PR 4: `AUDIT-06`
- PR 5: `AUDIT-07`
- PR 6: `AUDIT-08`
- PR 7: `AUDIT-09`
- PR 8: `AUDIT-10`
- PR 9: `AUDIT-11`, `AUDIT-12`, `AUDIT-13`
- PR 10: `AUDIT-14`
- PR 11: `AUDIT-15`
- PR 12: `AUDIT-16`
- PR 13: `AUDIT-17`
- PR 14: `AUDIT-18`, `AUDIT-19`

모든 PR은 `AUDIT-DOC` 게이트를 적용한다. 특히 API/DB/운영 화면 변경은 관련 `docs/specs/**`, `docs/changelog/CHANGELOG.md`, `docs/features-list.md`, `docs/progress.txt` 갱신 여부를 PR 완료 조건에 포함한다.

## 공통 검증 세트

- Backend targeted:
  - `cd webhard-api && pnpm test -- backup --runInBand`
  - `cd webhard-api && pnpm test -- activity-logs --runInBand`
  - `cd webhard-api && pnpm test -- storage.service.spec.ts --runInBand`
  - `cd webhard-api && pnpm test -- folders.service.spec.ts --runInBand`
  - `cd webhard-api && pnpm test -- files.service.spec.ts --runInBand`
  - `cd webhard-api && npx tsc --noEmit`
- Frontend targeted:
  - `pnpm test -- --testPathPatterns="src/__tests__/lib/react-query/queryKeys.test.ts" --runInBand`
  - `pnpm test -- --testPathPatterns="src/app/webhard" --runInBand`
  - `pnpm test -- --testPathPatterns="tokens|styles" --runInBand`
  - `npx tsc --noEmit`
- Static/docs:
  - raw webhard query key 금지 테스트 또는 `rg -n -F "['webhard'" src/app src/lib` 결과 검토
  - 신규/수정 파일 `dark:`/brand hex 금지 테스트 또는 `rg -n "dark:|#ED6C00|#d15f00|#ff8533" <changed-files>` 결과 검토
  - 변경 유형별 `docs/features-list.md`, `docs/progress.txt`, `docs/changelog/CHANGELOG.md`, `docs/specs/**` 갱신 여부 확인
- Browser/E2E smoke:
  - 웹하드 첫 진입, 폴더 이동, breadcrumb, 파일 업로드 confirm, 다운로드 표시
  - 관리자 백업 설정/상태/이력 화면
  - 관리자 웹하드 성능/로그 화면

## 중단 조건

- 권한 정책이 실제 운영 key/세션 흐름과 충돌하는데 코드로 확인할 수 없으면 P0 구현을 중단하고 정책 문서를 먼저 작성한다.
- 대량 fixture가 CI 시간을 과도하게 늘리면 성능 계측 테스트는 opt-in으로 분리하고 정확도 테스트만 기본 CI에 둔다.
- 폴더 조회 기본 동작 변경이 구버전 외부웹하드 클라이언트 계약을 깨면 기존 `/folders` 계약 유지 + 신규 endpoint로 우회한다.
- 디자인시스템 migration 중 `@theme` 회귀가 발견되면 UI 치환을 멈추고 token 생성 문제를 먼저 복구한다.
