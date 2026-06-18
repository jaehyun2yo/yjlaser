# Project Audit Execution Playbook — 2026-05-10

## 목적

`docs/reports/project-audit-ticket-plan-2026-05-09.md`의 PR 2 이후 항목을 다음 작업자가 바로 실행할 수 있는 단위로 풀어 쓴다.

이 문서는 원본 티켓 계획을 대체하지 않는다. 원본 계획은 범위와 우선순위를 고정하고, 이 문서는 각 PR의 실행 순서, red 테스트, 구현 방향, 검증, 문서 동기화 기준을 구체화한다.

## 현재 기준 상태

- PR 1 (`AUDIT-01`, `AUDIT-02`)은 현재 작업 브랜치 `fix/audit-backup-auth`에서 구현됨.
- PR 1 변경 요약:
  - `BackupAdminGuard` 추가
  - `backup:read`, `backup:write`, `backup:execute` 스코프 적용
  - `PUT /backup/settings`, `POST /backup/execute` 권한 매트릭스 테스트 추가
  - `docs/changelog/CHANGELOG.md`, `docs/features-list.md`, `docs/progress.txt`, `docs/specs/api/endpoints/webhard.md` 동기화
- 남은 실행 대상은 PR 2 ~ PR 14.

## 공통 실행 프로토콜

모든 PR은 아래 순서를 따른다.

1. `git status --short`로 기존 변경 확인.
2. 현재 브랜치 확인 후 가능하면 짧은 작업 브랜치 생성.
3. 기존 dirty/untracked 파일은 사용자 소유로 보고 되돌리거나 stage하지 않는다.
4. 먼저 문서와 코드 경로를 읽고 root cause를 확인한다.
5. production code 수정 전 red/coverage 테스트를 작성하고 실패를 확인한다.
6. 최소 구현으로 테스트를 green으로 만든다.
7. 관련 문서 동기화 여부를 판단하고, 변경하지 않는 문서는 최종 보고에 이유를 남긴다.
8. 요구 검증을 fresh run으로 실행한다.
9. stage/commit은 사용자 요청 전까지 하지 않는다.

공통 선독 문서:

- `docs/progress.txt`
- `docs/features-list.md`
- `docs/reports/project-audit-2026-05-08.md`
- `docs/reports/project-audit-ticket-plan-2026-05-09.md`
- 관련 `docs/specs/**`

공통 금지:

- 증상 패치
- broad `try/catch`
- silent fallback
- `window.location.reload()` 기반 복구
- 새 dependency 추가
- `any`
- `src/` 상대 import
- raw React Query key
- 새 `dark:` Tailwind class

## PR 2 — AUDIT-03 / AUDIT-04 / AUDIT-05

### 목표

관리자 모니터링의 24시간 활동 집계가 실제 날짜 필터를 적용하게 하고, storage breakdown에서 company 사용자가 타 업체/null 관리자 파일을 보지 못하게 한다.

### 주요 파일

- `webhard-api/src/activity-logs/activity-logs.controller.ts`
- `webhard-api/src/activity-logs/activity-logs.service.ts`
- `webhard-api/src/activity-logs/**.spec.ts`
- `src/app/api/webhard/performance/route.ts`
- `src/**/__tests__/**performance**`
- `webhard-api/src/storage/storage.service.ts`
- `webhard-api/src/storage/__tests__/storage.service.spec.ts`
- `docs/specs/api/endpoints/webhard.md`

### Root Cause 확인

- `src/app/api/webhard/performance/route.ts`는 `startDate`를 넘기지만 NestJS activity log API가 날짜 query를 받지 않는다.
- `ActivityLogsService.findAll`은 `createdAt` range를 where 조건에 넣지 않는다.
- `StorageService.getStorageBreakdown`은 company 사용자에게 `OR: [{ companyId: user.companyId }, { companyId: null }]`를 적용해 null 소유 파일을 포함할 수 있다.

### Red 테스트

1. `activity-logs` service/controller 테스트:
   - 1시간 전 로그는 포함된다.
   - 25시간 전 로그는 `startDate` 이후 조회에서 제외된다.
   - `endDate` 이후 로그는 제외된다.
   - invalid date는 400으로 고정한다.
2. performance route 테스트:
   - NestJS mock 응답 또는 route-level mock에서 25시간 전 로그가 집계에 포함되지 않아야 한다.
3. storage breakdown 테스트:
   - company user A는 company A 파일만 breakdown에서 본다.
   - company user A는 company B 파일을 보지 않는다.
   - company user A는 `companyId=null` 관리자/null 파일을 보지 않는다.
   - admin user는 전체 breakdown을 본다.

### 구현 방향

- ActivityLogs query DTO 또는 controller param에 `startDate`, `endDate` 추가.
- 날짜 parsing은 invalid date를 400으로 반환한다.
- service where에 `createdAt: { gte, lte }` range를 적용한다.
- performance route는 이미 전달하는 `startDate`가 NestJS에서 실제 필터로 작동하는지 contract를 맞춘다.
- company storage breakdown은 `companyId=null` 포함을 제거한다. null 파일을 실제로 company에 노출해야 하는 정책이 발견되면, folder visibility 또는 명시 소유 관계를 먼저 문서화하고 테스트명에 반영한다.

### 문서 게이트

갱신 필요:

- `docs/specs/api/endpoints/webhard.md`: ActivityLogs query 또는 storage breakdown 계약이 이 문서에 있으면 반영. 없으면 관련 API spec 위치를 찾아 반영.
- `docs/changelog/CHANGELOG.md`
- `docs/features-list.md`
- `docs/progress.txt`

변경 불필요 가능:

- `docs/specs/features/webhard-system.md`: API query와 storage breakdown 계약만 바뀌고 웹하드 시스템 구조가 그대로면 불필요.

### 검증

```powershell
cd webhard-api
pnpm test -- activity-logs --runInBand
pnpm test -- storage.service.spec.ts --runInBand
npx tsc --noEmit
```

Frontend route test를 추가/수정했다면:

```powershell
pnpm test -- --testPathPatterns="performance|webhard" --runInBand
npx tsc --noEmit
```

### 중단 조건

- `companyId=null`이 실제로 업체에게 노출되어야 하는 공용 데이터라는 근거가 나오면 구현을 멈추고 정책 문서부터 작성한다.
- ActivityLogs invalid date 정책이 기존 client와 충돌하면 400/ignore 중 하나를 문서로 확정한 뒤 진행한다.

## PR 3 — AUDIT-20

### 목표

웹하드 업로드 → 라우팅 → 자동 문의 생성 → 화면 반영 파이프라인에서 실패/skip reason을 관리자에게 추적 가능하게 만드는 최소 계약을 고정한다.

### 주요 파일

- `webhard-api/src/files/files.service.ts`
- `webhard-api/src/integration/orders/auto-contact.service.ts`
- `webhard-api/src/integration/sync-log/**`
- `webhard-api/src/activity-logs/**`
- `src/app/(admin)/admin/webhard/**`
- `src/app/(admin)/admin/system/**`
- `docs/specs/api/endpoints/webhard.md`
- `docs/specs/api/endpoints/integration.md`

### Root Cause 확인

- 현재 로그는 여러 서비스에 분산되어 있고, 한 파일/배치를 끝까지 추적할 공통 id가 부족하다.
- 라우팅 실패와 자동 문의 skip reason은 서버 로그에 남더라도 관리자 화면에서 backlog로 조회하기 어렵다.

### Red 테스트

- 라우팅 실패를 강제로 발생시키면 trace/backlog record가 남는다.
- auto-contact skip reason이 구조화되어 저장 또는 조회된다.
- 관리자 조회 API가 최근 실패 목록을 반환한다.
- presigned URL, token, secret, raw API key는 trace/log 응답에 포함되지 않는다.

### 구현 방향

- DB migration이 필요한 trace table이 필요하면 이 PR 안에서 바로 진행하지 말고 migration 계획/rollback을 먼저 작성한다.
- migration 없이 시작할 수 있으면 기존 `sync_log`, activity log, structured logger payload를 재사용해 MVP를 만든다.
- 최소 필드:
  - trace id 또는 batch id
  - file id / folder id
  - stage
  - status
  - reason code
  - createdAt
  - sanitized context
- 관리자 UI는 MVP 조회 화면 또는 기존 모니터링 탭의 실패 섹션으로 시작한다.

### 문서 게이트

갱신 필요:

- API spec
- feature spec 또는 신규 `docs/specs/features/webhard-pipeline-observability.md`
- changelog/features/progress
- DB migration이 있으면 DB spec과 rollback 계획

### 검증

```powershell
cd webhard-api
pnpm test -- files.service.spec.ts --runInBand
pnpm test -- auto-contact.service.spec.ts --runInBand
pnpm test -- sync-log --runInBand
npx tsc --noEmit
```

UI가 있으면:

```powershell
pnpm test -- --testPathPatterns="admin.*webhard|system|monitoring" --runInBand
npx tsc --noEmit
```

### 중단 조건

- DB migration이 필수면 backup/rollback/drain 계획 없는 구현을 중단한다.
- 실패 trace에 secret/token/presigned URL이 들어갈 위험이 있으면 schema부터 재설계한다.

## PR 4 — AUDIT-06

### 목표

웹하드 성능 개선 전에 대량 fixture와 opt-in 성능 계측 기반을 만든다.

### 주요 파일

- `webhard-api/src/files/**.spec.ts`
- `webhard-api/src/folders/**.spec.ts`
- `webhard-api/src/**/__tests__/helpers/**`
- `webhard-api/test/helpers/test-utils.ts`

### Red 테스트

- 10k folders fixture 생성 helper가 deterministic하게 folder tree를 만든다.
- 100k files fixture는 기본 CI에서 실행되지 않고 opt-in flag가 있을 때만 실행된다.
- 정확도 테스트는 소량 fixture로 기본 CI에서 실행된다.

### 구현 방향

- heavy 성능 테스트는 `RUN_PERF_TESTS=1` 같은 opt-in gate를 둔다.
- 기본 CI에는 helper 자체와 소량 정확도 테스트만 포함한다.
- fixture cleanup은 prefix 기반으로 안전하게 제한한다.

### 문서 게이트

갱신 필요:

- `docs/reports/project-audit-ticket-plan-2026-05-09.md`를 직접 수정하지 않는다면, 새 성능 테스트 실행법을 `docs/progress.txt` 또는 별도 test docs에 기록한다.
- changelog는 테스트 기반만 추가한 경우 간단히 기록.

### 검증

```powershell
cd webhard-api
pnpm test -- folders.service.spec.ts --runInBand
pnpm test -- files.service.spec.ts --runInBand
npx tsc --noEmit
```

Opt-in 성능 테스트:

```powershell
cd webhard-api
$env:RUN_PERF_TESTS='1'; pnpm test -- folders --runInBand
```

### 중단 조건

- fixture가 CI 시간을 과도하게 늘리면 기본 테스트에서 제외하고 정확도 테스트만 유지한다.

## PR 5 — AUDIT-07

### 목표

`/folders` 기본 조회가 전체 트리를 내려주지 않게 하고, 루트/자식 lazy loading으로 전환한다.

### 주요 파일

- `webhard-api/src/folders/folders.controller.ts`
- `webhard-api/src/folders/folders.service.ts`
- `webhard-api/src/folders/folders.service.spec.ts`
- `src/app/webhard/components/WebhardMain.tsx`
- `src/app/webhard/hooks/**`
- `src/lib/api/nestjs-server-client.ts`
- `docs/specs/api/endpoints/webhard.md`

### Red 테스트

- `parentId` 미지정 시 루트 폴더만 반환된다.
- 특정 `parentId` 지정 시 해당 자식만 반환된다.
- 기존 breadcrumb와 upload target이 lazy loading에서도 유지된다.
- 전체 트리 조회가 필요한 경로는 명시 endpoint 또는 명시 option을 사용한다.

### 구현 방향

- 구버전 외부웹하드 클라이언트가 `/folders` 전체 트리 계약에 의존하는지 먼저 확인한다.
- 위험하면 기존 `/folders` 계약을 유지하고 신규 `/folders/root` 또는 `/folders/children`를 추가한다.
- 프론트는 folder map 전체 의존을 줄이고 현재 경로와 자식 목록 중심으로 상태를 분리한다.

### 문서 게이트

갱신 필요:

- `docs/specs/api/endpoints/webhard.md`
- `docs/specs/features/webhard-system.md`
- changelog/features/progress

### 검증

```powershell
cd webhard-api
pnpm test -- folders.service.spec.ts --runInBand
npx tsc --noEmit
```

Frontend:

```powershell
pnpm test -- --testPathPatterns="src/app/webhard" --runInBand
npx tsc --noEmit
```

Browser smoke:

- 웹하드 첫 진입
- 폴더 열기
- breadcrumb 이동
- 파일 업로드 confirm
- 다운로드 표시

### 중단 조건

- 외부 클라이언트 계약이 깨질 가능성이 있으면 기존 endpoint를 바꾸지 말고 신규 endpoint로 분리한다.

## PR 6 — AUDIT-08

### 목표

뱃지 카운트 계산을 캐시/무효화 기반으로 개선하고, 업로드/다운로드/삭제/이동 후 자신/부모/루트 뱃지 정확도를 보장한다.

### 주요 파일

- `webhard-api/src/files/files.service.ts`
- `webhard-api/src/files/files.service.spec.ts`
- `webhard-api/src/folders/folders.service.ts`
- `src/app/webhard/**`

### Red 테스트

- 새 파일 업로드 후 대상 폴더와 조상 폴더 뱃지가 증가한다.
- 다운로드 완료 후 자신/부모/루트 뱃지가 감소한다.
- 파일 이동 후 이전 조상과 새 조상 뱃지가 각각 갱신된다.
- admin 전체 조회와 company 조회 cache key가 섞이지 않는다.

### 구현 방향

- 먼저 정확도 테스트를 고정한다.
- 캐시는 admin/company scope와 includeFolderCounts 옵션을 key에 포함한다.
- mutation 후 영향을 받는 folder ancestor만 invalidate한다.
- 대량 tree 전체 재계산은 fallback 또는 opt-in path로 둔다.

### 문서 게이트

갱신 필요:

- webhard feature spec의 badge 정책
- changelog/features/progress

### 검증

```powershell
cd webhard-api
pnpm test -- files.service.spec.ts --runInBand
pnpm test -- folders.service.spec.ts --runInBand
npx tsc --noEmit
```

### 중단 조건

- 캐시가 cross-company 데이터를 섞을 수 있으면 즉시 중단하고 key 정책부터 재설계한다.

## PR 7 — AUDIT-09

### 목표

외부웹하드 미매칭/빈 껍데기 후보 계산에서 root별 반복 subtree/count 쿼리를 bulk 계산으로 바꾼다.

### 주요 파일

- `webhard-api/src/folders/folders.service.ts`
- `webhard-api/src/folders/__tests__/folders.service.cleanup-husk.spec.ts`
- `webhard-api/src/folders/folders.service.spec.ts`

### Red 테스트

- 외부 root 500개 fixture에서 root별 반복 count가 발생하지 않는다.
- contactCount/fileCount가 기존 BFS 결과와 일치한다.
- 빈 껍데기 후보 기준이 직접 자식/파일 기준인지 전체 subtree 기준인지 테스트명에 명시된다.

### 구현 방향

- 후보 root는 DB where에서 최대한 좁힌다.
- 하위 폴더 관계는 한 번에 조회해 memory map으로 누적하거나 recursive CTE를 사용한다.
- raw SQL 사용 시 parameter binding과 transaction boundary를 테스트한다.

### 문서 게이트

갱신 필요:

- 외부웹하드 정리/매핑 spec
- changelog/progress

### 검증

```powershell
cd webhard-api
pnpm test -- folders.service.cleanup-husk.spec.ts --runInBand
pnpm test -- folders.service.spec.ts --runInBand
npx tsc --noEmit
```

### 중단 조건

- raw SQL이 path traversal 또는 injection 리스크를 만들면 ORM/bound parameter 방식으로 되돌린다.

## PR 8 — AUDIT-10

### 목표

폴더 rename/move 시 descendant path 갱신을 재귀 `SELECT + UPDATE` 대신 set-based 갱신으로 전환한다.

### 주요 파일

- `webhard-api/src/folders/folders.service.ts`
- `webhard-api/src/folders/folders.service.spec.ts`
- Prisma schema/index 관련 파일

### Red 테스트

- 5k descendant path가 정확히 갱신된다.
- 중간 실패 시 일부 path만 바뀌지 않고 transaction rollback된다.
- 동일 prefix를 가진 다른 branch path는 바뀌지 않는다.
- root move와 nested move를 모두 검증한다.

### 구현 방향

- materialized path prefix 치환을 transaction 안에서 수행한다.
- raw SQL 사용 시 old prefix/new prefix를 bound parameter로 처리한다.
- affected row count를 기록하고, 너무 큰 변경은 별도 background job 후보로 문서화한다.

### 문서 게이트

갱신 필요:

- webhard folder path 정책 spec
- changelog/progress
- DB/index 변경이 있으면 DB spec

### 검증

```powershell
cd webhard-api
pnpm test -- folders.service.spec.ts --runInBand
npx tsc --noEmit
```

### 중단 조건

- path prefix 치환이 sibling branch를 오염시킬 수 있으면 구현을 중단한다.

## PR 9 — AUDIT-11 / AUDIT-12 / AUDIT-13

### 목표

웹하드 프론트 안정화 선행 작업: raw React Query key 금지, 중복 가상 리스트 정리, reload/silent catch 제거.

### 주요 파일

- `src/lib/react-query/queryKeys.ts`
- `src/__tests__/lib/react-query/queryKeys.test.ts`
- `src/app/webhard/_lib/optimisticUpdates.ts`
- `src/app/webhard/_lib/cacheHelpers.ts`
- `src/app/webhard/components/WebhardMain.tsx`
- `src/app/webhard/components/WebhardSidebar.tsx`
- `src/app/webhard/components/VirtualizedFileList.tsx`
- `src/app/webhard/components/VirtualFileList.tsx`
- `src/lib/webhard-ui/components/VirtualFileList.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/app/worker/offline/page.tsx`
- `src/lib/socket/useSocketNamespace.ts`
- `src/app/webhard/components/WebhardErrorBoundary.tsx`

### Red 테스트

- production path에서 raw `['webhard'` / `["webhard"` key가 있으면 static test가 실패한다.
- 삭제할 virtual list component 사용처가 0건임을 검증한다.
- reload 호출이 수정 파일에 남아 있으면 static test 또는 targeted test가 실패한다.
- 업체명 조회 실패 등 기존 silent catch 경로가 logger/context를 남긴다.

### 구현 방향

- `queryKeys.webhard.*` factory를 필요한 shape로 확장한 뒤 사용처를 치환한다.
- 실제 화면에서 쓰는 virtual list 하나를 남기고 나머지는 삭제한다.
- reload는 error boundary reset, query invalidation, socket reconnect state로 대체한다.
- silent catch는 필수 데이터면 오류 상태로, best-effort면 logger context로 전환한다.

### 문서 게이트

갱신 필요:

- webhard frontend conventions 또는 feature spec
- changelog/progress

### 검증

```powershell
pnpm test -- --testPathPatterns="src/__tests__/lib/react-query/queryKeys.test.ts" --runInBand
pnpm test -- --testPathPatterns="src/app/webhard" --runInBand
npx tsc --noEmit
```

Static:

```powershell
rg -n -F "['webhard'" src/app src/lib
rg -n -F '["webhard"' src/app src/lib
rg -n "window\\.location\\.reload\\(" src/app src/components src/lib
```

### 중단 조건

- reload 대체가 UX 흐름을 바꾸면 해당 화면 테스트를 먼저 추가한다.

## PR 10 — AUDIT-14

### 목표

`WebhardMain.tsx`를 훅/command/presentational 단위로 분리하되 동작과 공개 props를 유지한다.

### 주요 파일

- `src/app/webhard/components/WebhardMain.tsx`
- `src/app/webhard/hooks/**`
- `src/app/webhard/_lib/**`
- `src/app/webhard/components/**`

### Red 테스트

- 파일 목록 fetch, 새 파일 목록, 폴더 fetch가 기존과 같은 query key를 사용한다.
- 선택 상태가 파일/폴더 이동/삭제 후 유지 또는 해제되는 정책을 고정한다.
- drag/drop, upload prompt, context menu 동작이 유지된다.
- virtual list threshold가 유지된다.

### 구현 방향

분리 순서:

1. `useWebhardFilesQuery`
2. `useWebhardFoldersQuery`
3. `useWebhardSelection`
4. `useWebhardDragAndDrop`
5. `useWebhardUploadPrompt`
6. command layer: rename/move/delete/download/link-to-contact

각 단계마다 테스트를 돌리고 diff를 작게 유지한다.

### 문서 게이트

갱신 필요:

- webhard frontend architecture doc 또는 feature spec
- changelog/progress

### 검증

```powershell
pnpm test -- --testPathPatterns="src/app/webhard" --runInBand
npx tsc --noEmit
```

Browser smoke:

- 첫 진입
- 폴더 이동
- breadcrumb
- 업로드 confirm
- 다운로드 표시
- context menu

### 중단 조건

- 한 번에 `WebhardMain.tsx`가 크게 흔들리면 PR을 더 쪼갠다.

## PR 11 — AUDIT-15

### 목표

`src/lib/api/nestjs-server-client.ts`를 도메인별 client로 분리하되 기존 public export와 인증/error/cache 계약을 유지한다.

### 주요 파일

- `src/lib/api/nestjs-server-client.ts`
- `src/lib/api/**`
- `src/app/api/**/route.ts`
- `src/app/actions/**`

### Red 테스트

- 기존 import 경로가 깨지지 않는다.
- domain client가 같은 endpoint/method/header/body를 호출한다.
- auth cookie/API key 전달 방식이 유지된다.
- error response shape가 유지된다.

### 구현 방향

- 먼저 `nestjs-server-client.ts`의 public API 목록을 inventory로 고정한다.
- 내부 파일만 `webhard.client.ts`, `contacts.client.ts`, `companies.client.ts`, `integration.client.ts` 등으로 분리한다.
- 기존 export barrel을 유지한다.
- 공통 fetch/auth/error/cache helper를 하나로 둔다.

### 문서 게이트

갱신 필요:

- API client architecture note 또는 implementation notes
- changelog/progress

### 검증

```powershell
pnpm test -- --testPathPatterns="api|client|nestjs-server-client" --runInBand
npx tsc --noEmit
```

### 중단 조건

- 기존 import 경로를 깨야 한다면 별도 migration PR로 분리한다.

## PR 12 — AUDIT-16

### 목표

`folders.service.ts`와 `files.service.ts`를 use-case service로 분리해 backend 유지보수 단위를 줄인다.

### 주요 파일

- `webhard-api/src/folders/folders.service.ts`
- `webhard-api/src/files/files.service.ts`
- `webhard-api/src/folders/folders.module.ts`
- `webhard-api/src/files/files.module.ts`
- 관련 service spec

### Red 테스트

- controller 계약이 그대로 유지된다.
- upload confirm, batch confirm, folder create/move/delete, external routing이 기존 결과를 반환한다.
- 분리된 use-case service가 독립 테스트 가능하다.

### 구현 방향

성능 티켓에서 경계가 드러난 순서대로 분리한다.

권장 후보:

- folder path update service
- external folder candidate service
- badge count service
- file upload confirm service
- file move/delete service

기존 public method signature는 유지하고 내부 delegation부터 시작한다.

### 문서 게이트

갱신 필요:

- backend architecture note 또는 relevant feature spec
- changelog/progress

### 검증

```powershell
cd webhard-api
pnpm test -- folders.service.spec.ts --runInBand
pnpm test -- files.service.spec.ts --runInBand
npx tsc --noEmit
```

### 중단 조건

- 분리가 behavior change를 동반하면 해당 behavior는 별도 PR로 분리한다.

## PR 13 — AUDIT-17

### 목표

`ContactForm.tsx`를 단계별 컴포넌트/훅으로 분리하면서 공개 폼 제출, 첨부, 방문예약, 견적 검증을 유지한다.

### 주요 파일

- `src/app/contact/ContactForm.tsx`
- `src/app/contact/**`
- `src/components/ui/**`
- `.claude/skills/design-system/SKILL.md`

### Red 테스트

- 공개 폼 제출 payload가 기존과 같다.
- 첨부 파일 검증과 업로드 흐름이 유지된다.
- 방문 예약 slot 선택/검증이 유지된다.
- 견적 방법별 필수 필드 검증이 유지된다.
- pending approval/password reset 등 최근 배포 대기 변경과 충돌하지 않는다.

### 구현 방향

- UI 변경이므로 `.claude/skills/design-system/SKILL.md`를 먼저 읽는다.
- 단계별로 분리한다:
  - company info section
  - file upload section
  - visit booking section
  - estimate method section
  - submit action/hook
- 새 UI는 `@/components/ui`와 semantic token을 사용한다.
- 새 `dark:` class와 raw brand hex를 추가하지 않는다.

### 문서 게이트

갱신 필요:

- contact feature spec
- changelog/progress
- UI/validation contract가 바뀌면 관련 API/user guide

### 검증

```powershell
pnpm test -- --testPathPatterns="contact|ContactForm" --runInBand
npx tsc --noEmit
```

Browser smoke:

- 공개 문의 제출
- 파일 첨부
- 방문 예약
- 견적 방법별 validation

### 중단 조건

- UI 분리 중 제출 payload가 바뀌면 즉시 중단하고 payload contract test를 먼저 보강한다.

## PR 14 — AUDIT-18 / AUDIT-19

### 목표

디자인시스템 static gate를 만들고, 관리자/웹하드 우선 범위에서 `dark:`와 brand hex 재유입을 막는다.

### 주요 파일

- `docs/specs/features/design-system.md`
- `.claude/skills/design-system/SKILL.md`
- `src/lib/styles/**`
- `src/app/webhard/**`
- `src/app/(admin)/**`
- `src/**/__tests__/**tokens**`
- `src/**/__tests__/**styles**`

### Red 테스트

- 신규/수정 파일에 `dark:`가 있으면 실패한다.
- 신규/수정 파일에 `#ED6C00`, `#d15f00`, `#ff8533` 등 brand hex가 있으면 실패한다.
- 디자인 토큰 생성이 깨지면 실패한다.

### 구현 방향

- 기존 전체 코드 0건을 즉시 목표로 하지 않는다.
- baseline을 문서화하고 신규/수정 파일 gate부터 적용한다.
- 관리자/웹하드에서 수정하는 파일만 token으로 치환한다.
- `@theme` / `@theme inline` 충돌 회귀가 나오면 색상 치환을 멈추고 token 생성 문제를 먼저 고친다.

### 문서 게이트

갱신 필요:

- `docs/specs/features/design-system.md`
- changelog/features/progress

### 검증

```powershell
pnpm test -- --testPathPatterns="tokens|styles" --runInBand
npx tsc --noEmit
```

Static:

```powershell
rg -n "dark:|#ED6C00|#d15f00|#ff8533" src/app/webhard src/app/(admin) src/lib/styles
```

Visual smoke:

- 웹하드
- 관리자 백업 설정
- Card/Badge/sidebar/modal
- light/dark 배경

### 중단 조건

- token 생성 회귀가 발견되면 마이그레이션을 멈추고 디자인시스템 기반부터 복구한다.

## 다음 작업 프롬프트 템플릿

새 세션에서는 먼저 아래 완성형 프롬프트로 PR 2를 실행한다. PR 2가 검증까지 끝난 뒤에는 같은 형식에서 PR 번호와 `이번 범위`만 추적성 매트릭스에 맞게 바꿔 PR 3부터 순서대로 진행한다.

### 새 세션 즉시 실행 프롬프트

```text
C:\Users\jaehy\OneDrive\Desktop\dev\projects\yjlaser\yjlaser_website 에서 작업해줘.

목표:
docs/reports/project-audit-ticket-plan-2026-05-09.md 와
docs/reports/project-audit-execution-playbook-2026-05-10.md 에 따라 PR 2를 구현해줘.

이번 범위:
- AUDIT-03: ActivityLog 날짜 필터 계약 적용
- AUDIT-04: 관리자 performance route의 24시간 활동 집계 정확도 보강
- AUDIT-05: Storage breakdown에서 company 사용자의 타 업체/null 관리자 파일 노출 차단
- AUDIT-DOC 문서 동기화 게이트 적용

반드시 지킬 것:
- 한국어로 진행 상황과 최종 보고를 작성.
- 먼저 git status --short 확인.
- 기존 dirty/untracked 파일은 사용자 소유로 보고 되돌리거나 stage 하지 말 것.
- 코드 수정 전 현재 브랜치 확인 후, 가능하면 짧은 작업 브랜치 생성.
- commit, stage는 하지 말 것. 내가 따로 요청할 때만 stage/commit.
- root cause first. broad try/catch, silent fallback, reload 기반 복구 금지.
- production code 수정 전 red/coverage 테스트를 먼저 작성.
- API key, secret, token, .env.local 값 출력 금지.
- Next 프록시나 UI 보정만으로 백엔드 계약 결함을 덮지 말 것.

반드시 먼저 읽을 문서:
- docs/progress.txt
- docs/features-list.md
- docs/reports/project-audit-2026-05-08.md
- docs/reports/project-audit-ticket-plan-2026-05-09.md
- docs/reports/project-audit-execution-playbook-2026-05-10.md
- docs/specs/api/endpoints/webhard.md
- docs/specs/features/webhard-system.md

구현 요구:
1. execution playbook의 PR 2 섹션에서 Root Cause 확인 항목을 코드로 검증.
2. 먼저 red/coverage 테스트 작성:
   - ActivityLogs startDate/endDate 필터
   - invalid date 400 정책
   - performance 24시간 집계에서 25시간 전 로그 제외
   - company storage breakdown에서 타 업체 및 companyId=null 파일 제외
   - admin storage breakdown은 전체 집계 유지
3. 그 다음 백엔드/프론트 라우트 계약 보강.
4. 문서 동기화:
   - docs/reports/project-audit-ticket-plan-2026-05-09.md 의 AUDIT-DOC 기준 확인
   - 필요한 경우 docs/features-list.md, docs/progress.txt, docs/changelog/CHANGELOG.md, docs/specs/api/endpoints/webhard.md 갱신
   - 변경하지 않는 문서는 최종 보고에 불필요 판단 이유 명시

검증:
- cd webhard-api && pnpm test -- activity-logs --runInBand
- cd webhard-api && pnpm test -- storage.service.spec.ts --runInBand
- cd webhard-api && npx tsc --noEmit
- frontend route test를 추가/수정했다면 가장 좁은 실제 Jest 패턴과 npx tsc --noEmit 실행
- 실패하면 원인 분석 후 고치고 재실행.
- 검증을 실행할 수 없으면 이유와 남은 리스크를 명확히 보고.

최종 보고 형식:
- 변경한 파일
- 구현한 정책/동작
- 추가/수정한 테스트
- 실행한 검증 명령과 결과
- 문서 동기화 여부
- 남은 리스크
```

### 반복 템플릿

다음 PR을 시작할 때 아래 템플릿을 사용한다.

```text
C:\Users\jaehy\OneDrive\Desktop\dev\projects\yjlaser\yjlaser_website 에서 작업해줘.

목표:
docs/reports/project-audit-ticket-plan-2026-05-09.md 와
docs/reports/project-audit-execution-playbook-2026-05-10.md 에 따라 PR <번호>를 구현해줘.

이번 범위:
- <AUDIT-ID>: <제목>
- <AUDIT-ID>: <제목>
- AUDIT-DOC 문서 동기화 게이트 적용

반드시 지킬 것:
- 한국어로 진행 상황과 최종 보고를 작성.
- 먼저 git status --short 확인.
- 기존 dirty/untracked 파일은 사용자 소유로 보고 되돌리거나 stage 하지 말 것.
- 코드 수정 전 현재 브랜치 확인 후, 가능하면 짧은 작업 브랜치 생성.
- commit, stage는 하지 말 것.
- root cause first.
- production code 수정 전 red/coverage 테스트를 먼저 작성.

검증:
- execution playbook의 PR <번호> 검증 명령을 실행.
- 실패하면 원인 분석 후 고치고 재실행.

최종 보고:
- 변경한 파일
- 구현한 정책/동작
- 추가/수정한 테스트
- 실행한 검증 명령과 결과
- 문서 동기화 여부
- 남은 리스크
```

## 추적성 매트릭스

| PR    | Audit IDs      | 상위 문제                           | 핵심 테스트                                    | 구현 표면                                         | 문서 게이트                          |
| ----- | -------------- | ----------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| PR 2  | AUDIT-03/04/05 | 모니터링 정확도, storage visibility | activity date range, storage company isolation | activity logs, performance route, storage service | API/spec/changelog/features/progress |
| PR 3  | AUDIT-20       | 파이프라인 관측성 부족              | routing failure, auto-contact skip reason      | files, auto-contact, sync-log, admin monitoring   | API/feature/DB if needed             |
| PR 4  | AUDIT-06       | 성능 개선 전 fixture 부재           | opt-in heavy fixture, default accuracy         | test helpers                                      | test docs/progress                   |
| PR 5  | AUDIT-07       | 전체 폴더 트리 조회                 | root/children query, navigation smoke          | folders API, Webhard UI                           | API/webhard spec                     |
| PR 6  | AUDIT-08       | badge 전체 트리 계산                | badge ancestor correctness                     | files badge service/cache                         | feature/changelog/progress           |
| PR 7  | AUDIT-09       | 외부 후보 반복 subtree/count        | bulk count correctness                         | folders external candidates                       | feature/changelog/progress           |
| PR 8  | AUDIT-10       | recursive path update               | 5k descendants, rollback                       | folders path update                               | folder/DB spec if changed            |
| PR 9  | AUDIT-11/12/13 | frontend stability                  | raw key/static, virtual list, reload removal   | webhard frontend                                  | frontend convention/changelog        |
| PR 10 | AUDIT-14       | WebhardMain 과대 책임               | hook/command behavior                          | webhard hooks/components                          | frontend architecture note           |
| PR 11 | AUDIT-15       | API client 과대 책임                | public export/contract                         | api clients                                       | architecture note                    |
| PR 12 | AUDIT-16       | backend service 과대 책임           | controller contract/use-case tests             | files/folders services                            | backend architecture note            |
| PR 13 | AUDIT-17       | ContactForm 과대 책임               | submit/upload/booking/estimate                 | contact UI/hooks                                  | contact/design docs                  |
| PR 14 | AUDIT-18/19    | 디자인시스템 drift                  | dark/hex static gate, visual smoke             | tokens/styles/admin/webhard                       | design-system spec                   |
