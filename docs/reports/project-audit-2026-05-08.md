# YJ Laser 프로젝트 코드 분석 및 리팩토링 보고서

- 작성일: 2026-05-08
- 작업 브랜치: `codex/project-audit-report`
- 범위: 프론트엔드 `src/`, 백엔드 `webhard-api/src`, Prisma 스키마, 웹하드 관련 스펙/테스트/관리자 UI
- 원칙: 코드 수정 없음. 문서 작성만 수행.

## 1. 결론 요약

현재 프로젝트는 기능 폭이 넓고 웹하드, 문의, ERP/작업자, 관리자 모니터링까지 통합되어 있습니다. 핵심 기능은 이미 상당히 구현되어 있고, 웹하드 쪽도 `createMany`, React Query 캐시, 가상 스크롤, 성능 메트릭 같은 최적화 장치가 일부 들어가 있습니다.

다만 유지보수성과 성능 관점에서는 다음 5개가 우선순위입니다.

| 우선순위 | 영역                   | 결론                                                                                                                                                               |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | 백업/관리 API 권한     | NestJS 백업 API가 `ApiKeyGuard`만 사용하고, API Key 사용자는 `admin`으로 주입됩니다. Next 프록시는 관리자 검사를 하지만, 백엔드 단에서 권한 경계가 약합니다.       |
| P1       | 웹하드 폴더 트리 성능  | 프론트가 전체 폴더 트리를 가져오고, 뱃지/외부웹하드 후보 계산도 전체 트리 또는 루트별 반복 쿼리에 의존합니다. 데이터가 커지면 병목이 됩니다.                       |
| P1       | 관리자 모니터링 정확도 | 모니터링 화면은 존재하지만 24시간 활동 집계가 실제로 24시간 필터를 적용하지 못하는 코드 경로가 있습니다. 업로드-라우팅-문의생성 전체 파이프라인 추적도 부족합니다. |
| P1       | 유지보수 단위          | `ContactForm.tsx`, `WebhardMain.tsx`, `nestjs-server-client.ts`, `folders.service.ts`, `files.service.ts`가 너무 큽니다. 기능 추가 시 영향 범위가 커집니다.        |
| P1       | 디자인시스템 적용      | 디자인시스템 문서와 UI primitive는 있지만, `brand hex`와 `dark:` 클래스가 아직 많이 남아 있습니다. 자동 검증 없이는 새 코드가 다시 흩어질 가능성이 높습니다.       |

## 2. 분석 기준과 확인한 근거

먼저 프로젝트 지침에 따라 `git status --short`를 확인했고, 작업 전 워킹트리는 깨끗했습니다. 이후 새 브랜치 `codex/project-audit-report`를 생성했습니다.

확인한 기준 문서:

- `docs/progress.txt`
- `docs/features-list.md`
- `docs/specs/features/webhard-system.md`
- `docs/specs/features/design-system.md`
- `docs/specs/api/endpoints/webhard.md`
- `.claude/skills/design-system/SKILL.md`

정적 분석으로 확인한 주요 수치:

| 항목                                                         |         결과 |
| ------------------------------------------------------------ | -----------: |
| `src/app/api/**/route.ts` 개수                               |        121개 |
| 프론트엔드 프로덕션 코드의 직접 Prisma/Supabase/DB 접근 흔적 |          0건 |
| `brand hex` 사용 라인                                        |      688라인 |
| `dark:` 사용 라인                                            |      372라인 |
| `@/components/ui` 언급 라인                                  |       78라인 |
| 웹하드 핵심 범위 high severity anti-slop 스캔                | 107파일, 0건 |

큰 파일 상위 예시:

| 파일                                           | 라인 수 | 리스크                                          |
| ---------------------------------------------- | ------: | ----------------------------------------------- |
| `src/app/contact/ContactForm.tsx`              |    3353 | 문의 폼 UI/상태/DOM 탐색이 한 파일에 몰림       |
| `webhard-api/src/contacts/contacts.service.ts` |    2781 | 문의 도메인 규칙이 비대해짐                     |
| `src/app/webhard/components/WebhardMain.tsx`   |    2256 | 웹하드 화면 상태, 쿼리, 액션, 렌더링이 결합됨   |
| `src/lib/api/nestjs-server-client.ts`          |    2221 | 도메인별 API 클라이언트 경계가 약함             |
| `webhard-api/src/folders/folders.service.ts`   |    1862 | 폴더 정책/조회/정리/외부웹하드 로직이 결합됨    |
| `webhard-api/src/files/files.service.ts`       |    1554 | 파일 조회/업로드 확정/뱃지/자동문의 훅이 결합됨 |

## 3. 전체 데이터 흐름 평가

현재 의도된 데이터 흐름은 다음 구조입니다.

```text
Browser
  -> Next.js App Router / Server Actions / API Routes
  -> NestJS API (/api/v1)
  -> Prisma
  -> PostgreSQL
  -> Cloudflare R2
```

좋은 점:

- `src/` 프로덕션 코드에서 Prisma, Supabase, `DATABASE_URL` 직접 접근 흔적은 발견되지 않았습니다.
- 웹하드 파일 목록은 서버 페이지네이션과 React Query 캐시를 사용합니다.
- NestJS 백엔드가 Prisma와 R2, WebSocket 이벤트, 활동 로그를 통합하는 중심 역할을 하고 있습니다.

문제점:

- Next API route가 121개라서 프록시, 인증, 에러 처리, 캐시 정책이 여러 파일에 퍼져 있습니다.
- `src/lib/api/nestjs-server-client.ts`가 2221라인입니다. 모든 도메인 API가 한 파일에 모이면 신규 기능 추가 시 충돌과 회귀가 늘어납니다.
- 일부 route는 `nestjsFetch`를 쓰고, 일부는 직접 `NESTJS_API_URL`과 `fetch`를 구성합니다. 같은 API 호출이어도 인증 헤더와 에러 처리 방식이 달라질 수 있습니다.

개선 방향:

1. `src/lib/api/nestjs-server-client.ts`를 도메인별 클라이언트로 분리합니다.
   - 예: `webhard.client.ts`, `contacts.client.ts`, `companies.client.ts`, `integration.client.ts`
2. Next API route는 세 가지 유형으로 분류합니다.
   - 브라우저 보안 프록시
   - 서버 액션 대체 가능 라우트
   - 진짜 외부 연동용 라우트
3. 공통 프록시 유틸을 하나로 고정합니다.
   - 인증 검사
   - 쿠키 전달
   - API Key 사용 여부
   - 에러 응답 형식
   - `cache: 'no-store'` 여부

테스트 기준:

- Next route별 인증 매트릭스 테스트를 만듭니다.
- 도메인 클라이언트별 contract test를 만들어 NestJS endpoint, method, header, body를 검증합니다.
- `src/`에서 `@prisma/client`, `PrismaClient`, `DATABASE_URL`, `supabase` 사용을 금지하는 정적 테스트를 유지합니다.

## 4. 웹하드 성능 병목 분석

### 4.1 이미 잘 되어 있는 부분

웹하드에는 성능을 의식한 구현이 있습니다.

- `files.service.ts`의 파일 목록 조회는 `count + findMany`를 트랜잭션으로 묶고 `skip/take` 페이지네이션을 사용합니다.
- `batchConfirmUpload`는 파일을 `createMany`로 한 번에 생성합니다.
- 배치 업로드에서 폴더 정보 조회와 라우팅 캐시를 사용합니다.
- 프론트의 `WebhardMain.tsx`는 파일이 50개를 넘으면 `VirtualizedFileList`를 사용합니다.
- `storage.service.ts`의 성능 메트릭은 5분 캐시를 사용합니다.

이 부분은 유지해야 합니다.

### 4.2 병목 1: 전체 폴더 트리 조회

근거:

- `webhard-api/src/folders/folders.service.ts:122`의 `getFolders`는 `parentId`가 `undefined`일 때 모든 폴더를 반환합니다.
- `src/app/webhard/components/WebhardMain.tsx:539`는 `/api/webhard/folders`를 호출하면서 `parentId`를 넘기지 않습니다.
- 그 결과 웹하드 화면 진입 시 전체 폴더 트리가 내려올 수 있습니다.

왜 문제가 되는가:

- 폴더 수가 수천~수만 개가 되면 첫 진입 응답 크기와 브라우저 메모리 사용량이 커집니다.
- `folderMap`, breadcrumb, child prefetch 계산은 프론트에서 계속 전체 배열을 기준으로 동작합니다.
- 관리자와 업체 사용자 모두에서 성능 저하 원인이 됩니다.

개선 방향:

1. 기본 조회를 `parentId=null`의 루트 폴더 조회로 바꿉니다.
2. 전체 트리 조회가 필요한 화면은 별도 endpoint를 둡니다.
   - 예: `/folders/tree`
3. 폴더 열기 시 자식 폴더만 lazy-load합니다.
4. 자주 쓰는 breadcrumb는 `/folders/:id/ancestors`를 사용합니다.

테스트 기준:

- 폴더 10,000개 fixture를 만들고 첫 진입 API 응답 크기와 응답 시간을 측정합니다.
- 기존 UI가 루트 폴더만 받아도 탐색, breadcrumb, 이동, 업로드가 깨지지 않는지 E2E로 검증합니다.

### 4.3 병목 2: 뱃지 카운트가 전체 폴더를 매번 읽음

근거:

- `webhard-api/src/files/files.service.ts:1184`의 `getBadgeCounts`는 미다운로드 파일 수를 계산합니다.
- `includeFolderCounts`일 때 `groupBy` 후 `webhardFolder.findMany`로 전체 폴더 트리를 읽습니다.
- DFS로 상위 폴더까지 카운트를 전파합니다.

좋은 점:

- 예전 방식의 N+1보다 낫습니다.
- 직접 카운트 `groupBy`와 메모이제이션 DFS를 사용합니다.

남은 문제:

- 요청마다 전체 폴더 트리를 읽습니다.
- 관리자 전체 보기에서 폴더 수가 커지면 모든 사용자에게 영향을 줍니다.
- `isDownloaded=false`와 `deletedAt=null` 조건은 인덱스가 있으나, 폴더 트리 전파는 애플리케이션 메모리에서 처리합니다.

개선 방향:

1. 뱃지 카운트는 폴더 단위 캐시를 둡니다.
2. 업로드, 다운로드 처리, 삭제, 이동 이벤트에서 영향을 받는 조상 폴더만 invalidate합니다.
3. PostgreSQL recursive CTE 또는 별도 closure table을 검토합니다.
4. 최소한 관리자 전체 조회와 업체 조회의 캐시 키를 분리하고 TTL/무효화 정책을 문서화합니다.

테스트 기준:

- 1만 폴더, 10만 파일 기준 `getBadgeCounts(includeFolderCounts=true)` 성능 테스트를 추가합니다.
- 파일 다운로드 처리 후 자신/부모/루트 뱃지가 정확히 줄어드는 regression test를 유지합니다.

### 4.4 병목 3: 폴더 rename/move의 재귀 path 갱신

근거:

- `webhard-api/src/folders/folders.service.ts:1177`의 `updateDescendantPaths`는 한 폴더를 업데이트한 뒤 자식 폴더를 조회하고 재귀 호출합니다.

왜 문제가 되는가:

- 하위 폴더가 많은 트리에서 `UPDATE + SELECT`가 노드 수만큼 반복됩니다.
- 깊은 트리에서는 재귀 호출 스택 리스크도 있습니다.
- 폴더 이동/이름 변경은 관리자가 실제로 사용할 수 있는 기능이라 운영 중 체감 병목이 될 수 있습니다.

개선 방향:

1. `path`를 materialized path로 계속 쓸 거라면, PostgreSQL의 `UPDATE ... SET path = regexp_replace(...) WHERE path LIKE ...` 방식으로 일괄 갱신을 검토합니다.
2. path 갱신 전후를 트랜잭션으로 묶습니다.
3. 변경 대상 수를 먼저 계산하고, 너무 크면 백그라운드 작업으로 넘기는 정책을 둡니다.

테스트 기준:

- 깊이 8, 노드 5,000개 트리에서 rename/move 성능 테스트를 추가합니다.
- 실패 시 일부 path만 바뀌지 않도록 트랜잭션 롤백 테스트를 추가합니다.

### 4.5 병목 4: 외부웹하드 미매칭/빈 껍데기 후보 계산

근거:

- `webhard-api/src/folders/folders.service.ts:1900`의 `getExternalUnmatchedFolders`는 `/외부웹하드/` 후보를 찾고, root마다 `collectSubtreeFolderIds`를 호출합니다.
- `collectSubtreeFolderIds`는 큐를 돌면서 자식 조회를 반복합니다.
- `getEmptyExternalHusks`도 후보별로 자식 수와 파일 수를 반복 조회합니다.

왜 문제가 되는가:

- 외부웹하드 연동이 늘수록 관리자 정리 화면이 느려질 수 있습니다.
- 후보 root 수가 늘면 root 수만큼 subtree 조회와 count가 반복됩니다.

개선 방향:

1. `/외부웹하드/` depth=2 후보는 DB에서 최대한 필터링합니다.
2. subtree 계산은 한 번의 전체 조회 후 메모리에서 처리하거나 recursive CTE로 처리합니다.
3. 파일 수와 문의 수는 root별 반복 count 대신 `groupBy` 또는 raw query 집계로 가져옵니다.

테스트 기준:

- 외부웹하드 root 500개, 하위 폴더 10,000개 fixture로 쿼리 수와 응답 시간을 측정합니다.
- 빈 껍데기 후보가 직접 파일/직접 자식 기준인지, 전체 subtree 기준인지 명확히 테스트명에 반영합니다.

### 4.6 성능 관련 DB 인덱스 평가

현재 `WebhardFile`에는 다음 인덱스가 있습니다.

- `folderId`
- `companyId`
- `deletedAt`
- `companyId, deletedAt`
- `folderId, deletedAt`
- `isDownloaded, deletedAt`
- `name, folderId, deletedAt`

현재 `WebhardFolder`에는 다음 인덱스가 있습니다.

- `parentId`
- `companyId`
- `path`
- `deletedAt`
- `name, parentId, companyId`
- `parentId, deletedAt`
- `contactId`

좋은 점:

- 기본 목록, 폴더별 조회, 삭제 제외 조건은 어느 정도 받쳐줍니다.

검토할 점:

- `path startsWith '/외부웹하드/'`가 자주 쓰이면 PostgreSQL에서 일반 btree `path` 인덱스가 기대만큼 쓰이는지 `EXPLAIN ANALYZE`로 확인해야 합니다.
- `folderKind`로 필터링하는 외부웹하드 후보 조회가 있으나 `folderKind` 단독/복합 인덱스는 없습니다.
- 새 파일/미다운로드 목록은 `companyId + isDownloaded + deletedAt + createdAt` 조합을 검토할 가치가 있습니다.

## 5. 백엔드 로직과 권한 경계

### 5.1 P0: 백업 API 권한 경계

근거:

- `webhard-api/src/backup/backup.controller.ts:10`은 `@Controller('backup')`입니다.
- 같은 파일 `:11`에서 `@UseGuards(ApiKeyGuard)`만 사용합니다.
- `webhard-api/src/integration/auth/api-key.guard.ts:57` 이후 API Key가 유효하면 `request.user.userType = 'admin'`으로 설정합니다.
- Next 프록시 `src/app/api/admin/backup/[...path]/route.ts`는 별도로 관리자 세션을 확인하고 허용 path를 제한합니다.

문제:

- 프론트 프록시는 관리자만 통과시키지만, 백엔드 API 자체는 API Key만 있으면 백업 설정 조회/수정/실행까지 접근 가능합니다.
- 운영 배포에서 NestJS API가 외부 노출되거나 API Key가 넓은 권한으로 공유되면 위험합니다.

개선 방향:

1. `ApiKeyGuard`와 관리자 세션 권한을 분리합니다.
2. 백업 설정/실행은 `AdminGuard` 또는 전용 `BackupAdminGuard`를 추가합니다.
3. API Key에는 `permissions` 필드가 있으므로 `backup:read`, `backup:write`, `backup:execute` 같은 명시 권한을 검사합니다.
4. Next 프록시에서 쓰는 `MIGRATION_API_KEY`가 필요한 구조라면, 백엔드에서도 해당 key의 권한을 엄격히 제한합니다.

테스트 기준:

- API Key만 있는 요청은 `PUT /backup/settings`, `POST /backup/execute`에서 거부되어야 합니다.
- 관리자 세션은 허용되어야 합니다.
- 읽기/쓰기/실행 권한을 분리할 경우 권한별 access matrix 테스트가 필요합니다.

### 5.2 저장공간 breakdown의 `companyId=null` 포함 정책

근거:

- `webhard-api/src/storage/storage.service.ts:573`의 `getStorageBreakdown`에서 업체 사용자는 `OR: [{ companyId: user.companyId }, { companyId: null }]` 조건을 사용합니다.
- 반면 `folders.service.ts:1196`의 `verifyFolderAccess`는 업체 사용자가 `companyId=null` 폴더에 접근하는 것을 차단합니다.

문제:

- 파일의 `companyId=null`이 관리자 루트, 외부웹하드 미분류, 또는 공용 파일을 의미할 수 있습니다.
- 업체 저장공간 breakdown에 `companyId=null` 파일을 포함하는 정책이 명확하지 않습니다.

개선 방향:

1. `companyId=null` 파일의 의미를 문서화합니다.
2. 업체 화면에서 보여야 하는 null 파일과 절대 보여서는 안 되는 null 파일을 분리합니다.
3. 필요하다면 `folder.companyId` 또는 visibility 정책까지 함께 조인해서 필터링합니다.

테스트 기준:

- 업체 A가 업체 B 파일과 관리자 null 파일을 breakdown에서 보지 못하는 테스트를 추가합니다.
- 외부웹하드 라우팅 전 null 파일이 어떤 actor에게 보이는지 테스트명에 명시합니다.

### 5.3 활동 로그 작성 실패가 조용히 묻힘

근거:

- `webhard-api/src/activity-logs/activity-logs.service.ts:30`의 `create`는 실패 시 logger에 남기고 `{ id: null, success: false }`를 반환합니다.

문제:

- 활동 로그가 감사/모니터링 기준 데이터라면 실패가 호출자에게 강하게 전달되어야 할 수 있습니다.
- 현재 패턴은 사용자 기능은 계속 진행되지만, 운영자는 로그 유실을 놓칠 수 있습니다.

개선 방향:

1. 감사 필수 이벤트와 best-effort 이벤트를 나눕니다.
2. 필수 이벤트 실패는 호출자에게 실패를 전파하거나 dead-letter queue에 저장합니다.
3. 로그 실패율을 관리자 모니터링에 포함합니다.

테스트 기준:

- 감사 필수 이벤트 실패 시 API가 어떤 상태 코드를 반환해야 하는지 결정하고 테스트합니다.
- best-effort 이벤트는 사용자 기능을 막지 않되 실패 지표가 증가하는지 테스트합니다.

## 6. 관리자 모니터링 기능 평가

### 6.1 갖춰진 기능

관리자가 볼 수 있는 모니터링 기능은 이미 여러 곳에 있습니다.

- 웹하드 성능 페이지: `src/app/(admin)/admin/webhard/performance/page.tsx`
- 웹하드 활동 로그 페이지: `src/app/(admin)/admin/webhard/activity/page.tsx`
- 시스템 페이지의 성능/로그 탭: `src/app/(admin)/admin/system/page.tsx`
- 통합 프로그램 상태: `src/app/(admin)/admin/integration/programs/page.tsx`
- 프로그램 heartbeat: `webhard-api/src/integration/programs/programs.service.ts`
- sync log: `webhard-api/src/integration/sync-log/sync-log.service.ts`
- 백업 설정/상태/이력 UI: `src/app/(admin)/admin/integration/webhard/_components/BackupSettings.tsx`
- 백업 이력 모델: `BackupLog`

따라서 “관리자가 모니터링할 수 있는 기능이 있는가?”에 대한 답은 “있다”입니다.

### 6.2 정확도 문제: 24시간 활동 집계

근거:

- `src/app/api/webhard/performance/route.ts:85`는 `oneDayAgo`를 만들고 `/activity-logs?limit=10000&startDate=...`를 호출합니다.
- 하지만 `webhard-api/src/activity-logs/activity-logs.controller.ts:38`의 `findAll`은 `action`, `actorId`, `limit`, `offset`만 받습니다.
- `webhard-api/src/activity-logs/activity-logs.service.ts:68`의 `findAll`도 날짜 필터를 받지 않습니다.

문제:

- 화면에는 “최근 24시간 활동”처럼 보이지만 실제로는 최근 10,000개 로그 전체를 집계할 가능성이 큽니다.

개선 방향:

1. `ActivityLogsController`와 DTO에 `startDate`, `endDate`를 추가합니다.
2. Prisma `where.createdAt` 필터를 적용합니다.
3. 프론트 성능 페이지에서 “최근 24시간” 기준이 실제 API와 일치하는지 테스트합니다.

테스트 기준:

- 25시간 전 로그와 1시간 전 로그를 seed하고, 24시간 집계에서 25시간 전 로그가 제외되는지 확인합니다.

### 6.3 파이프라인 관측성 부족

현재 기능들은 개별 상태를 보여줍니다. 하지만 웹하드 운영에서 가장 중요한 흐름은 다음 파이프라인입니다.

```text
파일 업로드
  -> R2 저장
  -> DB 파일 생성
  -> 외부웹하드 폴더 라우팅
  -> 자동 문의 생성
  -> 문의/작업/업체 화면 반영
  -> 다운로드/확인 처리
```

부족한 점:

- 파일 하나가 어느 단계에서 멈췄는지 한 화면에서 추적하기 어렵습니다.
- `batchConfirmUpload`의 라우팅 실패는 warn 로그로 남지만, 관리자 UI에서 실패 큐로 보이지 않습니다.
- 자동 문의 생성 실패/스킵 사유를 모아서 보는 dead-letter 또는 backlog 화면이 부족합니다.
- R2 latency, DB latency, NestJS latency가 분리되어 보이지 않습니다.

개선 방향:

1. `pipeline_trace_id` 개념을 도입합니다.
   - 업로드 배치, 파일, 자동 문의, sync log를 하나의 id로 묶습니다.
2. 관리자 “웹하드 파이프라인 상태” 화면을 추가합니다.
   - 최근 실패
   - 라우팅 실패
   - 자동 문의 생성 실패
   - 미분류 파일 수
   - R2 업로드/다운로드 실패율
3. 경고 기준을 수치로 정합니다.
   - 예: 미다운로드 파일 100개 이상
   - 자동 문의 실패 10분 내 3건 이상
   - `/files` p95 300ms 초과

테스트 기준:

- 라우팅 실패를 강제로 발생시켜 pipeline trace가 실패 상태로 남는지 검증합니다.
- 관리자 대시보드가 실패 데이터를 정확히 집계하는지 service test와 route test를 작성합니다.

## 7. 프론트엔드 유지보수성

### 7.1 큰 컴포넌트 분리 필요

가장 큰 리스크는 컴포넌트와 서비스가 너무 큰 것입니다.

`src/app/webhard/components/WebhardMain.tsx`는 다음 역할을 동시에 갖고 있습니다.

- 파일 목록 쿼리
- 새 파일 무한 스크롤
- 폴더 전체 조회
- 프리페치
- 업로드 후 문의 연결 프롬프트
- 선택 상태
- 드래그/이동/삭제/다운로드/이름변경
- 컨텍스트 메뉴
- 파일 리스트 렌더링

이 구조는 기능 추가가 빠를 때는 편하지만, 장기적으로는 다음 문제가 생깁니다.

- 작은 기능 수정도 전체 컴포넌트 재렌더와 회귀를 고려해야 합니다.
- 테스트가 어려워집니다.
- 새 개발자가 어느 훅과 상태를 건드려야 하는지 파악하기 어렵습니다.

개선 방향:

1. 상태와 서버 데이터를 분리합니다.
   - `useWebhardFilesQuery`
   - `useWebhardFoldersQuery`
   - `useWebhardSelection`
   - `useWebhardDragAndDrop`
   - `useWebhardUploadPrompt`
2. 렌더링 컴포넌트는 props 중심으로 단순화합니다.
3. 파일 액션은 command 형태로 묶습니다.
   - rename
   - move
   - delete
   - download
   - link-to-contact

테스트 기준:

- 훅 단위 테스트: 선택, 드래그, 업로드 후 프롬프트.
- 컴포넌트 테스트: 빈 상태, 50개 이하, 50개 초과 virtual list.
- E2E: 업로드 후 문의 연결 프롬프트 노출.

### 7.2 중복 가상 리스트 정리

근거:

- 실제 웹하드 화면은 `src/app/webhard/components/VirtualizedFileList.tsx`를 사용합니다.
- 별도로 `src/app/webhard/components/VirtualFileList.tsx`가 존재합니다.
- 공용 패키지 쪽에도 `src/lib/webhard-ui/components/VirtualFileList.tsx`가 있습니다.

문제:

- 비슷한 이름의 가상 리스트가 여러 개라 어떤 것을 써야 하는지 혼란스럽습니다.
- 미사용 또는 실험용 컴포넌트가 남아 있으면 디자인/성능 수정이 분산됩니다.

개선 방향:

1. 실제 사용 컴포넌트를 하나로 정합니다.
2. 나머지는 삭제하거나 `deprecated` 문서와 제거 계획을 남깁니다.
3. `src/lib/webhard-ui`를 실제 웹하드 화면에서 사용할 공용 레이어로 승격할지 결정합니다.

테스트 기준:

- 컴포넌트 삭제 전 `rg`로 사용처 0건 확인.
- 삭제 후 `npx tsc --noEmit`과 웹하드 리스트 테스트 실행.

### 7.3 React Query key 일관성

근거:

- `src/lib/react-query/queryKeys.ts`에 `queryKeys.webhard` 팩토리가 있습니다.
- 그러나 다음 파일에는 raw key가 남아 있습니다.
  - `src/lib/hooks/useUndownloadedCount.ts`
  - `src/app/webhard/_lib/optimisticUpdates.ts`
  - `src/app/webhard/_lib/cacheHelpers.ts`
  - `src/app/webhard/components/WebhardSidebar.tsx`
  - `src/app/webhard/components/WebhardMain.tsx`

문제:

- invalidate 키와 fetch 키가 미묘하게 달라질 수 있습니다.
- 새 기능 추가 시 “어느 키를 invalidate해야 하는지” 찾기 어려워집니다.

개선 방향:

1. raw key를 모두 `queryKeys.webhard.*`로 통일합니다.
2. raw key 사용을 막는 lint 또는 테스트를 추가합니다.

테스트 기준:

- `rg "queryKey: \\[|\\['webhard'|\\[\"webhard\""`가 테스트 파일 제외 0건이어야 합니다.
- 뱃지 업데이트 regression test를 유지합니다.

### 7.4 reload 기반 복구와 silent catch

근거:

- `window.location.reload()` 사용:
  - `src/components/ErrorBoundary.tsx`
  - `src/app/worker/offline/page.tsx`
  - `src/lib/socket/useSocketNamespace.ts`
  - `src/app/webhard/components/WebhardErrorBoundary.tsx`
- `src/app/webhard/components/WebhardMain.tsx:766`의 업체명 조회는 실패를 `.catch(() => {})`로 무시합니다.

문제:

- reload는 상태 복구의 원인을 숨깁니다.
- silent catch는 운영 중 데이터 흐름 장애를 찾기 어렵게 만듭니다.

개선 방향:

1. reload 대신 query invalidation 또는 에러 경계의 reset callback을 사용합니다.
2. 실패가 사용자 기능에 영향을 주지 않더라도 logger에 원인과 context를 남깁니다.
3. 필수 데이터라면 fallback이 아니라 오류 상태를 명확히 표시합니다.

테스트 기준:

- 장애 상황에서 reload 없이 query reset으로 회복되는지 테스트합니다.
- 업체명 조회 실패 시 logger가 호출되는지 테스트합니다.

## 8. 디자인시스템 평가

### 8.1 갖춰진 것

디자인시스템 기반은 있습니다.

- `docs/specs/features/design-system.md`가 CSS 변수 기반 토큰과 CVA/Radix UI 방향을 정의합니다.
- `.claude/skills/design-system/SKILL.md`는 새 코드 작성 규칙을 명확히 둡니다.
- `@/components/ui` 아래 Button, Input, Badge, Modal, Select, Checkbox, Switch, Alert, Dropdown, Tabs, Tooltip 등의 primitive 사용 규칙이 있습니다.

따라서 “디자인시스템이 갖춰져 있는가?”의 답은 “문서와 기반 컴포넌트는 갖춰져 있다”입니다.

### 8.2 적용 상태는 아직 불완전

정적 검색 결과:

- `brand hex` 사용 라인: 688라인
- `dark:` 사용 라인: 372라인
- `@/components/ui` 언급 라인: 78라인

문제:

- 새 코드 규칙은 `dark:` 금지, `[#ED6C00]` 등 brand hex 금지입니다.
- 하지만 기존 코드와 스타일 상수에는 아직 하드코딩이 많이 남아 있습니다.
- `src/lib/styles/colors.ts`, `src/lib/styles/webhard.ts`, `src/lib/styles/navigation.ts`, `src/lib/styles/themes.ts` 같은 스타일 상수 파일에 `dark:`가 집중되어 있습니다.
- 일부 실제 화면 컴포넌트도 brand hex를 직접 사용합니다.

개선 방향:

1. 마이그레이션 기준을 “기존 허용”과 “새 코드 금지”로 나누되, 자동 검증을 추가합니다.
2. `src/lib/styles/colors.ts`의 deprecated key를 단계적으로 제거합니다.
3. 화면별로 brand hex를 token으로 치환합니다.
4. `@/components/ui` primitive를 우선 사용하도록 스토리/예시를 정리합니다.

테스트 기준:

- `tokens.test.ts`에 금지 색상/금지 `dark:` 검사 범위를 늘립니다.
- 신규/수정 파일에 대해서는 `dark:`와 brand hex가 0건이어야 합니다.
- 주요 화면에는 Playwright visual snapshot을 추가합니다.

### 8.3 주니어 개발자를 위한 판단 기준

새 UI를 만들 때는 다음 순서로 판단하면 됩니다.

1. `@/components/ui`에 이미 있는가?
   - 있으면 그 컴포넌트를 사용합니다.
2. 색상이 필요한가?
   - `#ED6C00` 직접 입력 금지.
   - `brand`, `text-foreground`, `bg-card`, `TEXT_COLOR.*`, `BG_COLOR.*`를 사용합니다.
3. 다크모드가 필요한가?
   - `dark:`를 붙이지 않습니다.
   - CSS 변수 토큰이 자동으로 바뀌게 둡니다.
4. 같은 UI가 두 번 이상 반복되는가?
   - 작은 컴포넌트로 분리합니다.

## 9. 테스트 가능성과 기능 추가 파이프라인

### 9.1 현재 테스트 기반

웹하드 관련 테스트는 이미 꽤 있습니다.

- `webhard-api/src/files/files.service.spec.ts`
- `webhard-api/src/files/__tests__/files.service.spec.ts`
- `webhard-api/src/folders/folders.service.spec.ts`
- `webhard-api/src/folders/__tests__/folders.service.cleanup-husk.spec.ts`
- `webhard-api/src/storage/__tests__/storage.service.spec.ts`
- `src/app/webhard/__tests__/*`
- `src/tests/unit/components/webhard/*`
- `src/__tests__/lib/react-query/queryKeys.test.ts`

좋은 점:

- 뱃지 전파, batch upload, 외부웹하드 후보, storage breakdown 같은 핵심 로직 테스트가 이미 존재합니다.
- 이 기반 위에 성능 regression test를 추가하기 좋습니다.

### 9.2 추가해야 할 테스트

아래 테스트를 추가하면 유지보수 파이프라인이 안정됩니다.

| 영역               | 테스트                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| 웹하드 폴더 트리   | 10,000개 폴더에서 루트 조회와 전체 트리 조회 성능 비교                      |
| 뱃지 카운트        | 대량 폴더/파일에서 `getBadgeCounts(includeFolderCounts=true)` 시간과 정확도 |
| 외부웹하드         | root 500개 기준 미매칭/빈 껍데기 후보 계산 쿼리 수                          |
| 폴더 이동/이름변경 | 5,000개 descendant path 갱신 성능과 롤백                                    |
| 백업 권한          | API Key-only, admin session, company session access matrix                  |
| 활동 로그          | `startDate/endDate` 필터가 실제로 적용되는지                                |
| React Query        | raw key 사용 금지 테스트                                                    |
| 디자인시스템       | `dark:`/brand hex 신규 사용 금지                                            |
| Next 프록시        | NestJS endpoint, method, auth header contract                               |

### 9.3 추천 CI 순서

최소 파이프라인:

```text
1. 정적 금지 규칙
   - raw query key
   - dark:
   - brand hex
   - frontend direct DB access

2. 타입 체크
   - npx tsc --noEmit
   - cd webhard-api && npx tsc --noEmit

3. 단위 테스트
   - 웹하드 파일/폴더/스토리지 서비스
   - React Query key
   - 웹하드 컴포넌트

4. 계약 테스트
   - Next route -> NestJS API proxy
   - 권한 매트릭스

5. 선택적 E2E
   - 업로드
   - 다운로드
   - 웹하드 탐색
   - 관리자 모니터링
```

## 10. 추천 리팩토링 로드맵

### Phase 1: 안전장치 먼저

목표: 기능을 바꾸기 전에 회귀를 잡을 수 있게 합니다.

작업:

- 백업 API 권한 테스트 추가
- 활동 로그 날짜 필터 테스트 추가
- raw React Query key 금지 테스트 추가
- 디자인시스템 금지 패턴 테스트 추가
- 웹하드 대량 fixture 성능 테스트 추가

완료 기준:

- 새 테스트가 현재 문제를 재현하거나, 최소한 현재 동작을 명확히 고정해야 합니다.

### Phase 2: 권한과 모니터링 정확도 수정

목표: 관리자 화면이 믿을 수 있는 값을 보여주게 합니다.

작업:

- 백업 API에 관리자/권한 guard 추가
- ActivityLog 날짜 필터 추가
- 성능 페이지의 “최근 24시간” 집계 정확도 수정
- API Key 권한 모델 문서화

완료 기준:

- 권한 매트릭스 테스트 통과
- 24시간 집계 테스트 통과

### Phase 3: 웹하드 폴더/뱃지 성능 개선

목표: 데이터가 커져도 웹하드 탐색이 느려지지 않게 합니다.

작업:

- `/folders` 기본 동작을 루트/자식 조회 중심으로 변경
- 전체 트리 endpoint 분리
- 뱃지 카운트 캐시/무효화 정책 도입
- 외부웹하드 후보 계산 bulk화
- 폴더 path 업데이트 set-based 처리 검토

완료 기준:

- 대량 fixture 기준 성능 목표 수치 충족
- 기존 웹하드 탐색 E2E 통과

### Phase 4: 프론트/백엔드 파일 분리

목표: 신규 기능이 들어올 때 수정 범위를 작게 만듭니다.

작업:

- `WebhardMain.tsx` 훅/컴포넌트 분리
- `ContactForm.tsx` 단계별 컴포넌트 분리
- `nestjs-server-client.ts` 도메인별 분리
- `folders.service.ts`, `files.service.ts` use-case service 분리

완료 기준:

- 각 파일이 한 가지 책임을 갖고, 테스트가 파일 단위로 붙어야 합니다.

### Phase 5: 디자인시스템 마이그레이션

목표: 새 UI가 일관된 토큰과 primitive로 만들어지게 합니다.

작업:

- `brand hex`를 token으로 치환
- `dark:`를 CSS 변수 토큰으로 제거
- 오래된 스타일 상수 deprecated 제거
- 공통 UI는 `@/components/ui` 또는 도메인 UI 라이브러리로 이동

완료 기준:

- 수정 파일 기준 금지 패턴 0건
- 핵심 관리자/웹하드 화면 visual regression 통과

## 11. 주니어 개발자를 위한 핵심 개념

### N+1 쿼리

목록 하나를 가져온 뒤, 각 항목마다 다시 DB를 조회하는 패턴입니다.

예:

```text
외부웹하드 root 500개 조회
  -> root마다 하위 폴더 조회
  -> root마다 파일 수 조회
  -> root마다 문의 수 조회
```

데이터가 적을 때는 괜찮아 보여도, 운영 데이터가 쌓이면 급격히 느려집니다.

### Materialized Path

폴더 구조를 `parentId`만으로 저장하지 않고 `/외부웹하드/업체명/문의번호` 같은 문자열 path로 함께 저장하는 방식입니다.

장점:

- 하위 트리를 `path LIKE '/외부웹하드/%'`로 찾기 쉽습니다.

단점:

- 폴더 이름 변경이나 이동 시 하위 폴더 path를 모두 바꿔야 합니다.

### Contract Test

프론트가 백엔드에 어떤 endpoint, method, header, body로 요청하는지 고정하는 테스트입니다.

왜 필요한가:

- Next API route와 NestJS API가 둘 다 있으면, 한쪽이 바뀌었을 때 다른 쪽이 조용히 깨질 수 있습니다.

### Observability

운영 중 문제가 생겼을 때 “어디서 멈췄는지” 볼 수 있게 만드는 장치입니다.

웹하드에서는 다음 질문에 답할 수 있어야 합니다.

- 파일은 R2에 올라갔는가?
- DB 파일 레코드는 생성됐는가?
- 외부웹하드 폴더가 업체 폴더로 라우팅됐는가?
- 자동 문의가 생성됐는가?
- 실패했다면 왜 실패했는가?

## 12. 검증 로그

실행한 검증:

- `git status --short`
- `git switch -c codex/project-audit-report`
- 기준 문서 및 스펙 확인
- `rg` 기반 코드 구조/금지 패턴/데이터 흐름 검색
- 웹하드 핵심 범위 anti-slop high severity scan
  - 대상: `src/app/webhard`, `webhard-api/src/files`, `webhard-api/src/folders`, `webhard-api/src/storage`, `webhard-api/src/backup`
  - 결과: 107파일, high severity finding 0건

제한:

- 전체 `src webhard-api docs` anti-slop JSON 스캔은 시간 제한으로 완료하지 못했습니다.
- 이번 작업은 문서 작성만 요청되었으므로 타입체크/테스트 전체 실행은 하지 않았습니다.
- 비밀값 보호를 위해 `.env.local` 등 환경 파일은 열람하지 않았습니다.

## 13. 최종 판단

이 프로젝트는 “작동하는 기능”은 많이 갖춰져 있지만, 다음 단계의 핵심은 기능 추가보다 먼저 **경계 정리와 검증 자동화**입니다.

가장 먼저 해야 할 일은 다음입니다.

1. 백업/관리 API 권한 테스트와 guard 정리
2. 웹하드 성능 병목을 재현하는 대량 fixture 테스트 추가
3. ActivityLog 24시간 집계 정확도 수정
4. raw query key, `dark:`, brand hex 금지 규칙을 CI에 추가
5. `WebhardMain.tsx`와 `nestjs-server-client.ts`부터 책임 분리

이 순서로 진행하면 신규 기능 파이프라인을 만들 때도 기존 웹하드/문의/관리자 흐름을 깨뜨릴 가능성을 줄일 수 있습니다.
