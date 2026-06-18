# Task 27 — 외부웹하드 husk 정책 + admin 정리 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** task 26 의 cascade soft-delete 정책이 외부웹하드 동기화 (Electron) 의 routing 진입을 막는 회귀를 정리. 외부 폴더 row 는 husk (빈 껍데기) 로 유지하고, 회사 폴더로의 redirect 는 task 26 Phase 1.5 routing 그대로 사용. husk 정리는 admin 명시 액션으로 분리.

**Architecture:** (1) 1회성 SQL 로 stuck 폴더 트리 deletedAt 복원 → sync 즉시 회복. (2) `migrateExternalFolderTreeToCompany` 의 step 7 (cascade soft-delete) 제거 → 향후 마이그레이션은 husk 유지. (3) `DELETE /api/v1/folders/external-husk/:rootId` 신규 endpoint + admin UI 패널 → 운영자가 명시적으로 husk 정리. **빈 husk 만 삭제 가능** (자식·파일 ≥1 이면 거절) — 안전 장치.

**Tech Stack:** NestJS 10, Prisma, Postgres (Supabase), React 19, Next.js 15 App Router, React Query, Tailwind 4.

---

## 배경 — 새 세션 worker 가 알아야 할 컨텍스트

### task 26 의 두 사이드이펙트 정책 충돌

task 26 (`docs/specs/features/external-folder-migration.md`) 는 두 가지를 했다:

1. **Phase 1**: alias 승인 시 외부웹하드 폴더 트리를 가입 업체 폴더로 통째 이전 (`migrateExternalFolderTreeToCompany`). step 7 에서 비워진 외부 폴더를 cascade soft-delete.
2. **Phase 1.5**: 신규 동기화의 `POST /files/presigned-url` 응답에 routing 추가 — 외부웹하드 path 의 folderId 를 받으면 가입 업체 폴더 ID 로 redirect (`tryRouteExternalUpload` in `webhard-api/src/files/files.service.ts:255-279`).

문제: Phase 1 의 cascade soft-delete 가 Phase 1.5 의 routing 진입을 막음. Electron 의 `ensureFolderPath('/외부웹하드/대성목형(2265-1295)/...')` 가 deletedAt 으로 폴더를 못 찾아 unique constraint 충돌 또는 404 → POST /files/presigned-url 자체 실패.

근본 원인: routing 은 외부 folderId 가 살아있어야 작동하지만, cascade delete 가 그걸 죽임.

### 결정된 정책 (2026-04-30 사용자 합의)

| 영역                | 변경 전 (task 26)                                 | 변경 후 (task 27)                                                         |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 마이그레이션 동작   | 파일·Contact 이동 + 외부 폴더 cascade soft-delete | 파일·Contact 이동만, 외부 폴더 row 는 husk 로 유지                        |
| 신규 동기화 routing | husk 가 deletedAt 으로 죽어 lookup 실패           | husk 가 살아있어 routing 정상 진입                                        |
| husk 정리           | 자동 cascade delete                               | **admin 명시 액션** — `DELETE /folders/external-husk/:rootId` 호출 시에만 |
| husk 안전 가드      | 없음 (어차피 자동)                                | **빈 husk 만 삭제 허용** (자식 폴더 0 + 직접 파일 0) — 위반 시 422        |

근거: routing 이 동작하면 husk 에는 새 파일이 안 쌓임 → cleanup 우선순위 낮음. companyVisibilityFilter (task 25) 가 회사 사용자에게 외부웹하드 차단하므로 husk 가 살아있어도 회사 화면엔 안 보임.

### 현재 stuck 상태 (Phase A 의 회복 대상)

`/외부웹하드/대성목형(2265-1295)/` 트리가 첫 번째 [재마이그레이션] 클릭 (2026-04-30 09:57) 으로 cascade soft-delete 됨. Electron sync 가 이 path 로 신규 파일 업로드 시도 → POST /files/presigned-url 실패. SQL 로 deletedAt 복원 필요.

---

## 파일 구조 — 변경 영향

### Phase A — 1회성 데이터 패치

- **신규**: `webhard-api/scripts/restore-external-husk-2026-04-30.sql` — 검증용 + 실행용 SQL
- **MCP 또는 psql 로 직접 실행** (실제 DB 적용)

### Phase B — 정책 코드화 (cascade soft-delete 제거)

- **수정**: `webhard-api/src/contacts/contact-folder-sync.service.ts` (step 7 제거 + comment 갱신)
- **수정**: `webhard-api/src/contacts/contact-folder-sync.service.spec.ts` (M5 테스트 갱신: cascade delete → husk 유지 검증)
- **수정**: `webhard-api/src/companies/folder-alias.service.ts` (runCascadeBackfill — `deletedExternalFolders` 항상 0 으로 응답하거나 의미 변경)
- **수정**: `webhard-api/src/companies/folder-alias.service.spec.ts` (E2E-1, A8-1, A8-3, E2E-2, E2E-3 — `deletedExternalFolders=0` 으로 갱신)
- **수정**: `src/app/(admin)/admin/integration/companies/_lib/folder-alias-api.ts` (interface docstring 갱신)
- **수정**: `src/app/(admin)/admin/integration/companies/_components/ManualMappingForm.tsx` (토스트 메시지 — "외부 폴더 정리" 문구 제거)
- **수정**: `src/app/(admin)/admin/integration/companies/_components/RegisteredAliasesPanel.tsx` (재마이그레이션 토스트 메시지 갱신 + husk 정리는 별도 패널 안내 추가)
- **수정**: `docs/specs/features/external-folder-migration.md` (결정 #3 섹션 업데이트)
- **수정**: `docs/changelog/CHANGELOG.md` (task 27 항목 추가)

### Phase C — admin husk 정리 endpoint + UI

- **신규**: `webhard-api/src/folders/_lib/cleanup-external-husk.util.ts` — 안전 검증 + cascade soft-delete 헬퍼
- **수정**: `webhard-api/src/folders/folders.service.ts` (`cleanupEmptyExternalHusk` 메서드 추가)
- **수정**: `webhard-api/src/folders/folders.controller.ts` (`DELETE /external-husk/:rootId` endpoint 추가, AdminGuard)
- **수정**: `webhard-api/src/folders/folders.service.ts` (`getEmptyExternalHusks` 메서드 추가 — 정리 후보 목록)
- **수정**: `webhard-api/src/folders/folders.controller.ts` (`GET /external-husk` endpoint — 정리 후보 목록)
- **신규**: `webhard-api/src/folders/__tests__/folders.service.cleanup-husk.spec.ts` — 단위 테스트
- **신규**: `src/app/(admin)/admin/integration/companies/_lib/external-husk-api.ts` — client API 헬퍼 (CSRF 헤더 포함)
- **신규**: `src/app/(admin)/admin/integration/companies/_components/ExternalHusksPanel.tsx` — admin UI 패널
- **수정**: `src/app/(admin)/admin/integration/companies/_components/FolderMappingSection.tsx` (5번째 패널로 추가)
- **수정**: `src/lib/react-query/queryKeys.ts` (externalHusks namespace 추가)
- **수정**: `docs/specs/features/external-folder-migration.md` (Phase C 정책 추가)
- **수정**: `docs/specs/api/endpoints/webhard.md` (신규 endpoint 등록)
- **수정**: `docs/changelog/CHANGELOG.md` (task 27 Phase C 항목)

---

# Phase A — 1회성 데이터 패치 (즉시 회복)

### Task A1: stuck 폴더 트리 진단 SQL 작성

**Files:**

- Create: `webhard-api/scripts/restore-external-husk-2026-04-30.sql`

**작업 컨텍스트:**

- 사용자가 첫 [재마이그레이션] 클릭으로 `/외부웹하드/대성목형(2265-1295)/` 트리가 cascade soft-delete 됨.
- Supabase MCP 로 확인된 root id: `07db59ec-be7d-4502-b584-87b4e100acbf`
- 자식 폴더 들 (2026-04-30 09:57 직후 deletedAt set 된 row):
  - `1739d340-ac38-46c6-bb9c-70fd3cdd27af` (목형의뢰)
  - `673ebc70-8f60-4876-9261-01727e50aa8b` (완료)
  - `85dc80c6-9147-4da1-935e-59cc33b70e29` (칼선의뢰)
  - `abde5284-334c-4715-bead-7b5fdf41ef41` (테스트)
  - `7c2b4fc7-c195-4b74-9aa8-be56756cf8e3` (1)
  - `eeccc46b-9227-4c10-9294-b6c3ebe376c3` (2)
  - `92682e90-a916-4018-ab1f-5bd626e31df8` (ㅇ)

**중요:** 위 ID 는 dev DB 또는 사용자 환경의 ID. **실행 전 반드시 현재 DB 상태 확인**.

- [ ] **Step 1: SQL 파일 작성**

```sql
-- restore-external-husk-2026-04-30.sql
-- task 27 Phase A — task 26 cascade soft-delete 회귀 회복
-- 대성목형(2265-1295) 외부웹하드 트리 deletedAt 복원

-- 0. 사전 확인 — 복원 대상 트리 조회
SELECT id, name, path, parent_id, folder_kind, company_id, deleted_at
FROM webhard_folders
WHERE path LIKE '/외부웹하드/대성목형(2265-1295)%'
  AND deleted_at IS NOT NULL
ORDER BY path;

-- 1. 복원 — deletedAt 을 NULL 로
-- 안전: 2026-04-30 09:00 ~ 10:00 사이에 deletedAt 이 set 된 행만 대상.
--      만약 이 시각 외 다른 cascade 실행이 있었다면 시간 범위 조정 필요.
UPDATE webhard_folders
SET deleted_at = NULL,
    updated_at = NOW()
WHERE path LIKE '/외부웹하드/대성목형(2265-1295)%'
  AND deleted_at >= '2026-04-30 00:00:00+00'
  AND deleted_at <  '2026-04-30 23:59:59+00';

-- 2. 사후 검증 — 트리 deletedAt 모두 NULL 인지 확인
SELECT id, name, path, deleted_at
FROM webhard_folders
WHERE path LIKE '/외부웹하드/대성목형(2265-1295)%'
ORDER BY path;
-- 기대: 모든 행 deleted_at = NULL
```

- [ ] **Step 2: 사용자 dev 환경에서 첫 SELECT 실행해 정확한 root id + 자식 id 확인**

명령:

```bash
# (사용자 환경) — psql 또는 Supabase MCP 로 실행
SELECT id, name, path, deleted_at FROM webhard_folders WHERE path LIKE '/외부웹하드/대성목형(2265-1295)%';
```

기대: 8개 row (root + 7 children), 모두 deleted_at IS NOT NULL.

- [ ] **Step 3: UPDATE 실행**

위 SQL 파일의 UPDATE 문 실행. 결과 row 수 출력 확인 (예상: 8 rows updated).

- [ ] **Step 4: 사후 SELECT 로 복원 확인**

기대: 모든 row 의 `deleted_at = NULL`.

- [ ] **Step 5: Electron sync 1건 트리거 → 업로드 성공 확인**

사용자 측 — 외부웹하드 동기화 프로그램에서 1건 업로드 시뮬 또는 자연 동기화 발생 시 로그 확인.
기대: POST /files/presigned-url 200 응답 + 응답에 `redirected: true`, `folderId: <대성목형 회사 폴더 ID>`.

- [ ] **Step 6: 커밋**

```bash
git add webhard-api/scripts/restore-external-husk-2026-04-30.sql
git commit -m "fix(task 27 Phase A): 대성목형(2265-1295) 외부 폴더 트리 deletedAt 복원 스크립트

task 26 의 cascade soft-delete 가 task 26 Phase 1.5 routing 진입을 막음.
1회성 SQL 로 deletedAt 복원 — Electron sync 즉시 회복 가능."
```

---

# Phase B — cascade soft-delete 제거 (정책 코드화)

### Task B1: `migrateExternalFolderTreeToCompany` step 7 제거

**Files:**

- Modify: `webhard-api/src/contacts/contact-folder-sync.service.ts:480-496`

**현재 코드 (제거 대상)**:

```ts
// Step 7: 비워진 외부 폴더 cascade soft delete — 여전히 '/외부웹하드/' path 트리에 남아있는 것만
const remainingExternal = await tx.webhardFolder.findMany({
  where: {
    id: { in: externalFolderIds },
    deletedAt: null,
    path: { startsWith: '/외부웹하드/' },
  },
  select: { id: true },
});
let deletedExternalFolders = 0;
if (remainingExternal.length > 0) {
  const r = await tx.webhardFolder.updateMany({
    where: { id: { in: remainingExternal.map((f) => f.id) } },
    data: { deletedAt: new Date() },
  });
  deletedExternalFolders = r.count;
}
```

- [ ] **Step 1: spec 으로 깨질 회귀 테스트 (M5) 미리 갱신**

먼저 `webhard-api/src/contacts/contact-folder-sync.service.spec.ts` 의 M5 테스트 (cascade soft-delete 검증) 를 찾아 새 정책으로 갱신:

```ts
it('M5 (task 27 갱신): 외부 폴더는 husk 로 유지 (deletedAt=null) — cascade delete 정책 제거', async () => {
  // ... 기존 setup 그대로 ...
  const result = await service.migrateExternalFolderTreeToCompany(externalRootId, companyId);

  // task 27 변경: 외부 폴더 husk 유지
  expect(result.deletedExternalFolders).toBe(0);

  // 외부 root 와 자식들 모두 deletedAt IS NULL
  const externalRootAfter = await prisma.webhardFolder.findUnique({
    where: { id: externalRootId },
  });
  expect(externalRootAfter?.deletedAt).toBeNull();

  // 단, 외부 폴더는 모두 비어있어야 함 (자식 0, 직접 파일 0)
  const childCount = await prisma.webhardFolder.count({
    where: { parentId: externalRootId, deletedAt: null },
  });
  expect(childCount).toBe(0);
});
```

- [ ] **Step 2: 변경 전 테스트 실행 → 실패 확인**

```bash
cd webhard-api && npx jest src/contacts/contact-folder-sync.service.spec.ts -t "M5"
```

기대: FAIL — 현재 코드는 `deletedExternalFolders > 0` 으로 동작.

- [ ] **Step 3: step 7 코드 제거 + 응답 shape 유지**

`contact-folder-sync.service.ts:480-496` 영역을 다음으로 교체:

```ts
// Step 7 (task 27 정책 변경): cascade soft-delete 제거.
// 외부 폴더는 husk (빈 껍데기) 로 유지하여 신규 동기화의 routing 진입을 보장한다
// (`task 26 Phase 1.5`: tryRouteExternalUpload 가 deletedAt=null folder 만 lookup).
// husk 정리는 admin 의 명시 액션 (`DELETE /folders/external-husk/:rootId`) 으로 분리.
const deletedExternalFolders = 0;
```

응답 객체의 `deletedExternalFolders: 0` 그대로 — interface 호환 유지.

- [ ] **Step 4: 메서드 docstring 갱신**

`contact-folder-sync.service.ts:284-303` 의 docstring 블록 중 정책 설명 부분을 task 27 반영해 갱신:

```ts
/**
 * task 26 + task 27: 외부웹하드 root 폴더 트리를 가입 업체 폴더로 통째 이전.
 *
 * `relocateAfterAliasApproved` 가 Contact 단위 통합을 마친 직후 chained call 로 호출된다.
 * 외부 폴더 트리의 모든 폴더·파일을 가입 업체 폴더로 옮긴다.
 *
 * task 27 정책 변경 (2026-04-30):
 * - 외부 폴더 row 는 **husk 로 유지** (deletedAt=null). cascade soft-delete 제거.
 * - 근거: task 26 Phase 1.5 의 `tryRouteExternalUpload` routing 이 외부 folder 가
 *   살아있을 때만 lookup 가능. cascade delete 가 routing 진입을 막아 Electron sync 회귀 발생.
 * - husk 정리는 admin 명시 액션 (`DELETE /folders/external-husk/:rootId`) 으로 분리.
 *
 * 처리 분기 (직접 자식 폴더 기준): (변동 없음)
 * - template 세그먼트 (...) → 업체 루트 동명 template 폴더로 자식 병합
 * - folderKind='inquiry' → 업체 루트 하위 `문의/`
 * - 그 외 임의 폴더 → 업체 루트 직하 (충돌 시 (1)/(2) rename)
 *
 * 불변 규칙: (변동 없음)
 * - WebhardFile.path (R2 key) 는 변경하지 않음
 * - 폴더 이동 시 path 재계산
 * - `Contact.companyId IS NULL` 필터로 멱등성
 */
```

- [ ] **Step 5: 갱신된 M5 테스트 실행 → 통과 확인**

```bash
cd webhard-api && npx jest src/contacts/contact-folder-sync.service.spec.ts -t "M5"
```

기대: PASS.

- [ ] **Step 6: 영향 받는 다른 테스트 (M1, M2, M3 등) 전부 갱신**

**중요**: M5 외에도 cascade soft-delete 동작을 검증하는 테스트가 더 있다. 실제 코드 (2026-04-30 기준):

- `M1: template 세그먼트 (`칼선의뢰`) 자식 병합` (line ~905): `expect(extCutting?.deletedAt).not.toBeNull()` + `expect(extRoot?.deletedAt).not.toBeNull()` + `expect(result.deletedExternalFolders).toBeGreaterThanOrEqual(2)`

**갱신 패턴**: `not.toBeNull()` → `toBeNull()`, `toBeGreaterThanOrEqual(N)` → `toBe(0)`.

```bash
cd webhard-api && npx jest src/contacts/contact-folder-sync.service.spec.ts 2>&1 | grep -E "(FAIL|PASS|✓|✗|deletedAt|deletedExternal)" | head -50
```

각 fail 케이스마다 다음과 같이 갱신:

```ts
// 변경 전
expect(extCutting?.deletedAt).not.toBeNull();
expect(extRoot?.deletedAt).not.toBeNull();
expect(result.deletedExternalFolders).toBeGreaterThanOrEqual(2);

// 변경 후 (task 27 husk 유지)
expect(extCutting?.deletedAt).toBeNull();
expect(extRoot?.deletedAt).toBeNull();
expect(result.deletedExternalFolders).toBe(0);
```

**갱신 대상 테스트 (예상)**:

- **M1** (template 자식 병합 후 외부 `칼선의뢰/` + extRoot cascade delete 검증) → husk 유지
- **M2** (`folderKind='inquiry'` → 업체 `문의/` 이동 후 외부 폴더 delete 검증) → husk 유지
- **M3** (충돌 rename 후 cascade delete 검증) → husk 유지
- **M5** (cascade delete 메인 테마) → 의미 변경 — husk 유지로 재정의 (이미 step 1 에서 작성)
- **M6** (멱등) → husk 유지여도 contact `companyId IS NULL` 로 0건 처리 (그대로)
- **M4, M7, M8, M9** — cascade 와 무관할 가능성. 실제 grep 결과 보고 판단.

각 테스트의 docstring / comment 에서 "cascade soft delete" 언급 부분도 "husk 유지" 로 갱신 (의미 일치).

- [ ] **Step 7: 전체 spec 회귀**

```bash
cd webhard-api && npx jest src/contacts/contact-folder-sync.service.spec.ts
```

기대: 전체 PASS. 9개 테스트 모두 husk 유지 정책 반영.

- [ ] **Step 8: 커밋**

```bash
git add webhard-api/src/contacts/contact-folder-sync.service.ts webhard-api/src/contacts/contact-folder-sync.service.spec.ts
git commit -m "refactor(task 27 Phase B-1): migrateExternalFolderTreeToCompany cascade soft-delete 제거

근거: task 26 Phase 1.5 의 tryRouteExternalUpload routing 이 외부 folder 가
deletedAt=null 일 때만 lookup 가능. cascade delete 가 routing 진입을 막아
Electron sync 회귀 발생.

- step 7 제거 — 외부 folder 는 husk 로 유지
- M1/M2/M3/M5 테스트 cascade delete 가정 → husk 유지 검증으로 변경
- 응답 shape (deletedExternalFolders 필드) 호환 유지 — 항상 0"
```

---

### Task B2: `runCascadeBackfill` 응답 의미 변경 + 테스트 갱신

**Files:**

- Modify: `webhard-api/src/companies/folder-alias.service.ts:215-273`
- Modify: `webhard-api/src/companies/folder-alias.service.spec.ts` (E2E-1, A8-1, A8-3, E2E-2, E2E-3 5개 테스트)

- [ ] **Step 1: folder-alias.service.ts docstring 갱신**

`folder-alias.service.ts:215-227` 의 docstring 블록을 갱신:

```ts
/**
 * task 26 + task 27: cascadeBackfill 흐름 — relocate (contact 단위) → migrate (폴더 트리 통째 이전)
 * 두 단계를 단일 tx 안에서 chained 실행. 동일 alias 1건당 1 tx 원칙 유지.
 *
 * - relocate: 미통합 Contact 의 companyId/companyName 갱신, 분류된 contact 는 폴더 hooks 위임
 * - migrate: 외부웹하드 root 폴더 트리를 가입 업체 폴더로 통째 이전 (root 미존재 시 0 반환)
 *
 * task 27 변경: migrate 가 외부 폴더를 husk 로 유지 → `deletedExternalFolders` 는 항상 0.
 * husk 정리는 admin 명시 액션 (`DELETE /folders/external-husk/:rootId`) 으로 분리.
 *
 * 외부 root lookup (depth=2 정확 매칭): (변동 없음)
 * ...
 */
```

- [ ] **Step 2: 영향 받는 테스트 5개 갱신**

`folder-alias.service.spec.ts` 의 다음 테스트들의 `expect(result.backfill).toEqual(...)` 항목에서 `deletedExternalFolders: N` (N>0 인 경우) 을 모두 `deletedExternalFolders: 0` 으로 변경:

- A8-1: line ~600 — `deletedExternalFolders: 3` → `deletedExternalFolders: 0`
- A8-3: line ~720 — `deletedExternalFolders: 1` → `deletedExternalFolders: 0`
- E2E-1: line ~786 — `deletedExternalFolders: 3` → `deletedExternalFolders: 0`

A8-2, E2E-2, E2E-3 은 외부 root 미존재 케이스라 이미 0 으로 설정되어 있어 변동 없음.

각 테스트의 mock `migrateExternalFolderTreeToCompany.mockResolvedValueOnce({ ..., deletedExternalFolders: 0, ... })` 도 동기화.

- [ ] **Step 3: 테스트 실행 → 통과 확인**

```bash
cd webhard-api && npx jest src/companies/folder-alias.service.spec.ts
```

기대: 25/25 PASS.

- [ ] **Step 4: 커밋**

```bash
git add webhard-api/src/companies/folder-alias.service.ts webhard-api/src/companies/folder-alias.service.spec.ts
git commit -m "refactor(task 27 Phase B-2): runCascadeBackfill docstring + 테스트 husk 정책 반영

deletedExternalFolders 응답 필드는 호환을 위해 유지하되, task 27 정책상
migrate 가 cascade delete 를 안 하므로 항상 0. 5개 테스트 expectation 동기화."
```

---

### Task B3: 프론트 토스트 메시지 갱신

**Files:**

- Modify: `src/app/(admin)/admin/integration/companies/_lib/folder-alias-api.ts` (interface docstring)
- Modify: `src/app/(admin)/admin/integration/companies/_components/ManualMappingForm.tsx` (success 토스트)
- Modify: `src/app/(admin)/admin/integration/companies/_components/RegisteredAliasesPanel.tsx` (재마이그레이션 토스트)

- [ ] **Step 1: folder-alias-api.ts interface docstring 갱신**

`src/app/(admin)/admin/integration/companies/_lib/folder-alias-api.ts:36-52` 의 `FolderAliasBackfillResult` docstring 갱신:

```ts
/**
 * task 26 + task 27: alias 승인 / 매뉴얼 등록 시 발생하는 backfill 결과.
 * - relocated/skipped: 미통합 Contact 일괄 통합 결과
 * - movedFolders/movedFiles: 외부 폴더 트리 이전 결과
 * - deletedExternalFolders: task 27 부터 항상 0. 외부 폴더 husk 는 유지되며
 *   정리는 admin 명시 액션 (`/admin/integration/companies` 의 외부 husk 패널) 으로 분리.
 * - conflicts: 임의 폴더 이동 시 충돌 rename 결과
 * - externalRootFound: depth=2 root 가 존재했는지 — false 면 migrate skip + 카운트 0.
 */
```

- [ ] **Step 2: ManualMappingForm 토스트 success 메시지 갱신**

`src/app/(admin)/admin/integration/companies/_components/ManualMappingForm.tsx` 의 onSuccess success 분기:

```tsx
showMessage(
  'success',
  `${resp.alias.folderName} → ${selectedCompany?.companyName ?? '업체'} 매핑 완료 — Contact ${b.relocated}건, 폴더 ${b.movedFolders}개, 파일 ${b.movedFiles}개 이동.${conflicts} 외부 husk 는 유지됩니다 — 정리는 husk 패널에서.`,
  10000
);
```

- [ ] **Step 3: RegisteredAliasesPanel 재마이그레이션 토스트 success 메시지 갱신**

`src/app/(admin)/admin/integration/companies/_components/RegisteredAliasesPanel.tsx` 의 remigrateMutation onSuccess success 분기:

```tsx
showMessage(
  'success',
  `재마이그레이션 완료 — Contact ${b.relocated}건, 폴더 ${b.movedFolders}개, 파일 ${b.movedFiles}개 이동.${conflicts} 외부 husk 는 유지됩니다.`,
  10000
);
```

- [ ] **Step 4: 타입체크**

```bash
npx tsc --noEmit
```

기대: exit 0.

- [ ] **Step 5: 커밋**

```bash
git add src/app/(admin)/admin/integration/companies/_lib/folder-alias-api.ts src/app/(admin)/admin/integration/companies/_components/ManualMappingForm.tsx src/app/(admin)/admin/integration/companies/_components/RegisteredAliasesPanel.tsx
git commit -m "ui(task 27 Phase B-3): 토스트 메시지 husk 정책 반영

deletedExternalFolders 가 항상 0 이므로 '외부 폴더 정리' 문구 제거.
대신 'husk 는 유지됩니다' 안내 — 정리는 별도 패널 (Phase C) 안내."
```

---

### Task B4: spec doc + CHANGELOG 갱신

**Files:**

- Modify: `docs/specs/features/external-folder-migration.md`
- Modify: `docs/changelog/CHANGELOG.md`

- [ ] **Step 1: spec doc 결정 #3 섹션 갱신**

`docs/specs/features/external-folder-migration.md` 의 "빈 외부 폴더 cascade 삭제 (결정 #3)" 섹션을 다음으로 교체:

```markdown
### 빈 외부 폴더 husk 정책 (결정 #3 — task 27 갱신 2026-04-30)

**변경 전 (task 26 원안)**: `migrateExternalFolderTreeToCompany` step 7 에서 외부 폴더 cascade soft-delete.

**변경 후 (task 27)**: cascade soft-delete 제거. 외부 폴더 row 는 **husk (빈 껍데기) 로 유지**.

**근거**: task 26 Phase 1.5 의 `tryRouteExternalUpload` routing 이 외부 folder 가 deletedAt=null 일 때만 lookup 가능. cascade delete 가 routing 진입을 막아 Electron sync 회귀 발생 (POST /files/presigned-url 실패).

**husk 정리 정책**:

- 자동 정리 없음 (admin UI 의 명시 액션 으로만)
- `DELETE /api/v1/folders/external-husk/:rootId` endpoint (task 27 Phase C)
- 안전 가드: 자식 폴더 0 + 직접 파일 0 인 husk 만 삭제 가능. 위반 시 422.
- 회사 사용자에게는 companyVisibilityFilter 가 외부웹하드 자체를 차단하므로 husk 가 살아있어도 노출 안 됨. admin 만 husk 봄.

**husk 가 살아있어도 안전한 이유**:

- companyId IS NULL 그대로 → admin 외 노출 안 됨
- 빈 husk 라 자식·파일 0 → 신규 동기화의 routing 이 redirect 시켜 husk 에 새 파일 안 쌓임
- 데이터 정합성 영향 없음 (Contact / WebhardFile 모두 회사 폴더 참조)
```

응답 형식 변경 섹션도 갱신:

```markdown
### `POST /api/v1/companies/folder-aliases` 응답

(...기존 내용...)

**task 27 변경 (2026-04-30)**: `deletedExternalFolders` 는 호환을 위해 유지하되 항상 `0`. 외부 husk 가 cascade delete 되지 않기 때문. 운영 토스트는 `movedFolders / movedFiles` 만 의미 있음.
```

- [ ] **Step 2: CHANGELOG 항목 추가**

`docs/changelog/CHANGELOG.md` 의 `## [Unreleased]` 섹션 최상단에 추가:

```markdown
### 2026-04-30 — external-husk-policy (task 27 Phase B)

**Scope**: task 26 의 cascade soft-delete 가 task 26 Phase 1.5 routing 의 진입을 막는 회귀 정리. 외부 폴더 row 를 husk 로 유지하여 신규 동기화가 routing 으로 회사 폴더에 직행할 수 있게 함.

**버그 수정**:

- **migrate cascade soft-delete 제거** (`webhard-api/src/contacts/contact-folder-sync.service.ts:480-496`): step 7 (외부 폴더 cascade 삭제) 제거. 외부 폴더 row 를 husk 로 유지. 근거 — `tryRouteExternalUpload` 가 deletedAt=null folder 만 lookup. cascade delete 가 Electron sync 의 `ensureFolderPath` 호출을 막아 POST /files/presigned-url 실패 회귀 발생.

**API 변경 (호환)**:

- `POST /companies/folder-aliases` 응답 `backfill.deletedExternalFolders` 는 호환을 위해 유지하되 **항상 0**. 외부 husk 정리는 admin 명시 액션 (Phase C 도입 예정) 으로 분리.

**테스트**:

- M5 (`migrateExternalFolderTreeToCompany` cascade delete 검증) → husk 유지 검증으로 갱신.
- A8-1, A8-3, E2E-1 의 `deletedExternalFolders` 기대값 N>0 → 0 동기화.

**불변 규칙**: task 26 본문 그대로. R2 key 불변, 단일 진입점, alias 1건당 1 tx, 멱등성.

---
```

- [ ] **Step 3: 커밋**

```bash
git add docs/specs/features/external-folder-migration.md docs/changelog/CHANGELOG.md
git commit -m "docs(task 27 Phase B-4): cascade soft-delete 제거 정책 spec/CHANGELOG 동기화"
```

---

# Phase C — admin husk 정리 endpoint + UI

### Task C1: `cleanupEmptyExternalHusk` 안전 검증 헬퍼

**Files:**

- Create: `webhard-api/src/folders/_lib/cleanup-external-husk.util.ts`
- Test: 다음 task 에서 service spec 으로 함께

- [ ] **Step 1: 헬퍼 작성**

```ts
// webhard-api/src/folders/_lib/cleanup-external-husk.util.ts

import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface HuskCheckResult {
  /** 빈 husk 여부 — 자식 폴더 0 + 직접 파일 0 + path startsWith /외부웹하드/ + companyId IS NULL */
  empty: boolean;
  /** depth=2 root husk 인지 (UI 후보 목록 필터용) */
  isExternalRoot: boolean;
  childFolderCount: number;
  directFileCount: number;
  reason?: string;
}

/**
 * task 27 Phase C: 외부웹하드 husk (빈 껍데기) 안전 검증.
 *
 * husk 정의: `path startsWith '/외부웹하드/'` + `companyId IS NULL` + `deletedAt IS NULL`.
 * 정리 가능 조건: 자식 폴더 0 + 직접 파일 0.
 *
 * @returns HuskCheckResult — empty=false 면 reason 에 사유 포함.
 */
export async function checkEmptyHusk(
  tx: Prisma.TransactionClient,
  folderId: string
): Promise<HuskCheckResult> {
  const folder = await tx.webhardFolder.findUnique({
    where: { id: folderId },
    select: {
      id: true,
      name: true,
      path: true,
      companyId: true,
      deletedAt: true,
    },
  });

  if (!folder) {
    throw new BadRequestException(`Folder ${folderId} not found`);
  }

  if (folder.deletedAt) {
    throw new BadRequestException(
      `Folder ${folderId} already soft-deleted (deletedAt=${folder.deletedAt.toISOString()})`
    );
  }

  if (!folder.path?.startsWith('/외부웹하드/')) {
    throw new BadRequestException(
      `Folder ${folderId} is not under /외부웹하드/ (path=${folder.path ?? 'null'})`
    );
  }

  if (folder.companyId !== null) {
    throw new BadRequestException(
      `Folder ${folderId} has companyId=${folder.companyId} — not a husk (companyId must be NULL)`
    );
  }

  const segments = folder.path.split('/').filter((s) => s.length > 0);
  const isExternalRoot = segments.length === 2;

  const [childFolderCount, directFileCount] = await Promise.all([
    tx.webhardFolder.count({
      where: { parentId: folderId, deletedAt: null },
    }),
    tx.webhardFile.count({
      where: { folderId, deletedAt: null },
    }),
  ]);

  if (childFolderCount > 0 || directFileCount > 0) {
    return {
      empty: false,
      isExternalRoot,
      childFolderCount,
      directFileCount,
      reason: `not empty (children=${childFolderCount}, files=${directFileCount})`,
    };
  }

  return {
    empty: true,
    isExternalRoot,
    childFolderCount: 0,
    directFileCount: 0,
  };
}

/**
 * task 27 Phase C: 검증 통과 후 husk 를 cascade soft-delete.
 *
 * 단일 폴더 + 확인된 자식 0 인 케이스만 처리하므로 BFS cascade 불필요.
 * deletedAt=NOW() set + WebhardFolder.updatedAt 갱신.
 */
export async function softDeleteHusk(
  tx: Prisma.TransactionClient,
  folderId: string
): Promise<void> {
  const now = new Date();
  await tx.webhardFolder.update({
    where: { id: folderId },
    data: { deletedAt: now, updatedAt: now },
  });
}

/**
 * task 27 Phase C: depth=2 husk 의 빈 자식 트리 cascade soft-delete.
 *
 * UI 시나리오: depth=2 root 가 husk 인데 그 아래 빈 자식 husk (template) 들이 남아있는 경우,
 * root 와 자식들 모두 deletedAt set. 검증: BFS 로 모든 descendants 가 빈 husk 인지 확인 후
 * 한 번에 deletedAt set.
 *
 * 위반 (자식 트리 어딘가에 파일·companyId!=null·외부 외 path) 시 throw.
 */
export async function cleanupEmptyExternalRootHusk(
  tx: Prisma.TransactionClient,
  rootId: string
): Promise<{ deletedFolderIds: string[] }> {
  // 1. root 자체 검증 (depth=2 husk)
  const rootCheck = await checkEmptyHusk(tx, rootId);
  if (!rootCheck.isExternalRoot) {
    throw new BadRequestException(
      `Folder ${rootId} is not an external root (depth=2 under /외부웹하드/)`
    );
  }

  // 2. BFS 로 descendants 수집
  const allIds: string[] = [rootId];
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const children = await tx.webhardFolder.findMany({
      where: { parentId: cur, deletedAt: null },
      select: { id: true, companyId: true, path: true },
    });
    for (const c of children) {
      // descendants 도 husk 조건 (companyId IS NULL + path startsWith /외부웹하드/) 만족해야 안전
      if (c.companyId !== null) {
        throw new UnprocessableEntityException(
          `Descendant ${c.id} has companyId=${c.companyId} — abort cleanup (data inconsistency)`
        );
      }
      if (!c.path?.startsWith('/외부웹하드/')) {
        throw new UnprocessableEntityException(
          `Descendant ${c.id} path=${c.path ?? 'null'} is not under /외부웹하드/ — abort cleanup`
        );
      }
      allIds.push(c.id);
      queue.push(c.id);
    }
  }

  // 3. 모든 descendants 가 빈지 확인 (직접 파일 0)
  const directFileCount = await tx.webhardFile.count({
    where: { folderId: { in: allIds }, deletedAt: null },
  });
  if (directFileCount > 0) {
    throw new UnprocessableEntityException(
      `External husk root ${rootId} contains ${directFileCount} active files — abort cleanup`
    );
  }

  // 4. cascade soft-delete
  const now = new Date();
  await tx.webhardFolder.updateMany({
    where: { id: { in: allIds } },
    data: { deletedAt: now, updatedAt: now },
  });

  return { deletedFolderIds: allIds };
}
```

- [ ] **Step 2: 커밋**

```bash
git add webhard-api/src/folders/_lib/cleanup-external-husk.util.ts
git commit -m "feat(task 27 Phase C-1): 외부 husk 안전 검증 + cascade soft-delete 헬퍼"
```

---

### Task C2: FoldersService 에 husk 메서드 + 단위 테스트

**Files:**

- Modify: `webhard-api/src/folders/folders.service.ts` (메서드 추가)
- Create: `webhard-api/src/folders/__tests__/folders.service.cleanup-husk.spec.ts`

- [ ] **Step 1: 실패 테스트 먼저 작성**

```ts
// webhard-api/src/folders/__tests__/folders.service.cleanup-husk.spec.ts

import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { FoldersService } from '../folders.service';

function makePrisma() {
  return {
    webhardFolder: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    webhardFile: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
    executeWithRetry: jest.fn(<T>(fn: () => Promise<T>) => fn()),
  };
}

describe('FoldersService — Phase C cleanupEmptyExternalHusk', () => {
  let service: FoldersService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return undefined;
    });
    service = new FoldersService(prisma as never, undefined as never, undefined as never);
  });

  describe('getEmptyExternalHusks', () => {
    it('H1: 빈 husk 만 후보로 반환 — companyId IS NULL + 자식·파일 0', async () => {
      prisma.webhardFolder.findMany.mockResolvedValueOnce([
        { id: 'h1', name: 'A업체(123)', path: '/외부웹하드/A업체(123)', createdAt: new Date() },
        { id: 'h2', name: 'B업체', path: '/외부웹하드/B업체', createdAt: new Date() },
      ]);
      // h1: 자식 0, 파일 0 → husk
      // h2: 자식 1 → 제외
      prisma.webhardFolder.count
        .mockResolvedValueOnce(0) // h1 children
        .mockResolvedValueOnce(1); // h2 children
      prisma.webhardFile.count.mockResolvedValueOnce(0); // h1 files

      const result = await service.getEmptyExternalHusks();

      expect(result).toEqual([expect.objectContaining({ id: 'h1', name: 'A업체(123)' })]);
    });
  });

  describe('cleanupEmptyExternalHusk', () => {
    it('H2: depth=2 root husk + 자식 0 → cascade soft-delete', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: null,
      });
      // checkEmptyHusk 의 child / file count
      prisma.webhardFolder.count.mockResolvedValueOnce(0); // child folders
      prisma.webhardFile.count
        .mockResolvedValueOnce(0) // direct files (root)
        .mockResolvedValueOnce(0); // descendants files
      // BFS 자식 없음
      prisma.webhardFolder.findMany.mockResolvedValueOnce([]);
      // updateMany cascade
      prisma.webhardFolder.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.cleanupEmptyExternalHusk('h1');

      expect(result.deletedFolderIds).toEqual(['h1']);
      expect(prisma.webhardFolder.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['h1'] } },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
    });

    it('H3: 자식 폴더 ≥1 → UnprocessableEntityException (안전 가드)', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: null,
      });
      prisma.webhardFolder.count.mockResolvedValueOnce(2); // 2 children → not empty
      prisma.webhardFile.count.mockResolvedValueOnce(0);

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(
        UnprocessableEntityException
      );
    });

    it('H4: depth=2 아닌 폴더 → BadRequestException', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: '칼선의뢰',
        path: '/외부웹하드/A업체/칼선의뢰', // depth=3
        companyId: null,
        deletedAt: null,
      });
      prisma.webhardFolder.count.mockResolvedValueOnce(0);
      prisma.webhardFile.count.mockResolvedValueOnce(0);

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(BadRequestException);
    });

    it('H5: companyId IS NOT NULL → BadRequestException (husk 아님)', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: 5, // ← 회사 폴더
        deletedAt: null,
      });

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(BadRequestException);
    });

    it('H6: 이미 deletedAt set → BadRequestException', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: new Date(),
      });

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(BadRequestException);
    });

    it('H7: descendants 에 파일 ≥1 → UnprocessableEntityException', async () => {
      prisma.webhardFolder.findUnique.mockResolvedValueOnce({
        id: 'h1',
        name: 'A업체',
        path: '/외부웹하드/A업체',
        companyId: null,
        deletedAt: null,
      });
      prisma.webhardFolder.count.mockResolvedValueOnce(0); // root 직접 자식 0
      prisma.webhardFile.count
        .mockResolvedValueOnce(0) // root 직접 파일 0
        .mockResolvedValueOnce(3); // descendants 파일 3건 → 거절
      prisma.webhardFolder.findMany.mockResolvedValueOnce([]);

      await expect(service.cleanupEmptyExternalHusk('h1')).rejects.toThrow(
        UnprocessableEntityException
      );
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd webhard-api && npx jest src/folders/__tests__/folders.service.cleanup-husk.spec.ts
```

기대: FAIL — `getEmptyExternalHusks` / `cleanupEmptyExternalHusk` 메서드 미존재.

- [ ] **Step 3: FoldersService 에 메서드 추가**

`webhard-api/src/folders/folders.service.ts` 파일 끝부분 (마지막 메서드 다음, `}` 직전) 에 추가:

```ts
  /**
   * task 27 Phase C: 외부웹하드 husk (빈 껍데기) 정리 후보 목록.
   *
   * 조건:
   * - path startsWith '/외부웹하드/'
   * - depth=2 (직하 root)
   * - companyId IS NULL
   * - deletedAt IS NULL
   * - 자식 폴더 0 + 직접 파일 0 (자손 트리 검증은 cleanup 시점에)
   *
   * @returns admin UI 의 husk 정리 패널 후보 목록.
   */
  async getEmptyExternalHusks(): Promise<
    Array<{ id: string; name: string; path: string | null; createdAt: string }>
  > {
    const candidates = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findMany({
          where: {
            path: { startsWith: '/외부웹하드/' },
            companyId: null,
            deletedAt: null,
          },
          select: { id: true, name: true, path: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      { operationName: 'getEmptyExternalHusks.candidates' }
    );

    // depth=2 만 필터 + 자식·파일 0 검증
    const result: Array<{
      id: string;
      name: string;
      path: string | null;
      createdAt: string;
    }> = [];
    for (const f of candidates) {
      const segments = (f.path ?? '').split('/').filter((s) => s.length > 0);
      if (segments.length !== 2) continue;
      const [childCount, fileCount] = await Promise.all([
        this.prisma.webhardFolder.count({
          where: { parentId: f.id, deletedAt: null },
        }),
        this.prisma.webhardFile.count({
          where: { folderId: f.id, deletedAt: null },
        }),
      ]);
      if (childCount === 0 && fileCount === 0) {
        result.push({
          id: f.id,
          name: f.name,
          path: f.path,
          createdAt: f.createdAt.toISOString(),
        });
      }
    }
    return result;
  }

  /**
   * task 27 Phase C: 단일 husk root 정리 (cascade soft-delete).
   *
   * 안전 가드:
   * - depth=2 외부웹하드 root 만 허용
   * - companyId IS NULL 만 허용
   * - 자식 폴더·파일 0 만 허용 (descendants 트리 BFS 검증)
   * - 위반 시 BadRequestException / UnprocessableEntityException
   *
   * 트랜잭션 1회 — root + descendants 모두 deletedAt 갱신.
   */
  async cleanupEmptyExternalHusk(rootId: string): Promise<{ deletedFolderIds: string[] }> {
    const { cleanupEmptyExternalRootHusk } = await import('./_lib/cleanup-external-husk.util');
    return this.prisma.$transaction((tx) => cleanupEmptyExternalRootHusk(tx, rootId));
  }
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

```bash
cd webhard-api && npx jest src/folders/__tests__/folders.service.cleanup-husk.spec.ts
```

기대: 7 PASS.

- [ ] **Step 5: 회귀 — 전체 folders.service.spec 실행**

```bash
cd webhard-api && npx jest src/folders
```

기대: 전체 PASS.

- [ ] **Step 6: 커밋**

```bash
git add webhard-api/src/folders/folders.service.ts webhard-api/src/folders/__tests__/folders.service.cleanup-husk.spec.ts
git commit -m "feat(task 27 Phase C-2): FoldersService cleanupEmptyExternalHusk + getEmptyExternalHusks

빈 husk 만 정리 가능 — depth=2, companyId IS NULL, 자식·파일 0.
위반 시 BadRequest/Unprocessable. 7건 회귀 가드 테스트."
```

---

### Task C3: FoldersController endpoint 2개

**Files:**

- Modify: `webhard-api/src/folders/folders.controller.ts`

- [ ] **Step 1: GET /external-husk + DELETE /external-husk/:rootId 추가**

기존 `getExternalUnmatchedFolders` 메서드 (이미 등록된) 다음에 추가:

```ts
  /**
   * task 27 Phase C: GET /folders/external-husk
   *
   * 외부웹하드 직하의 정리 가능한 husk 목록 (자식·파일 0).
   * AdminGuard — admin 세션만 접근. API key 호출은 차단.
   */
  @Get('external-husk')
  @UseGuards(AdminGuard)
  async getEmptyExternalHusks() {
    return this.foldersService.getEmptyExternalHusks();
  }

  /**
   * task 27 Phase C: DELETE /folders/external-husk/:rootId
   *
   * 단일 husk root cascade soft-delete. 안전 가드:
   * - depth=2 외부웹하드 root + companyId IS NULL + 자식·파일 0 만 허용.
   * - 위반 시 400 / 422.
   */
  @Delete('external-husk/:rootId')
  @UseGuards(AdminGuard)
  async cleanupEmptyExternalHusk(@Param('rootId') rootId: string) {
    return this.foldersService.cleanupEmptyExternalHusk(rootId);
  }
```

`Delete` import 가 빠져있으면 `@nestjs/common` import 에 추가.

- [ ] **Step 2: controller spec 회귀 (있으면)**

```bash
cd webhard-api && npx jest src/folders/folders.controller
```

기대: PASS (또는 spec 없으면 skip).

- [ ] **Step 3: 커밋**

```bash
git add webhard-api/src/folders/folders.controller.ts
git commit -m "feat(task 27 Phase C-3): GET/DELETE /folders/external-husk endpoint

AdminGuard 보호. 운영자가 정리 후보 조회 + 단일 husk 정리 호출."
```

---

### Task C4: client API 헬퍼 + queryKey

**Files:**

- Create: `src/app/(admin)/admin/integration/companies/_lib/external-husk-api.ts`
- Modify: `src/lib/react-query/queryKeys.ts`

- [ ] **Step 1: queryKey namespace 추가**

`src/lib/react-query/queryKeys.ts` 의 `queryKeys` 객체에 `externalHusks` namespace 추가:

```ts
export const queryKeys = {
  // ... 기존 ...
  externalHusks: {
    all: ['externalHusks'] as const,
    list: () => [...queryKeys.externalHusks.all, 'list'] as const,
  },
  // ... 기존 ...
};
```

(파일 안에 `externalUnmatchedFolders` 가 이미 있다면 그 직후에 배치).

- [ ] **Step 2: client API 헬퍼 작성**

```ts
// src/app/(admin)/admin/integration/companies/_lib/external-husk-api.ts

/**
 * task 27 Phase C: 외부웹하드 husk 정리 API 호출 헬퍼.
 * NestJS `/api/v1/folders/external-husk` endpoint 와 통신.
 *
 * 글로벌 CsrfGuard 정책 (`feedback_csrf_token_required`):
 * 모든 mutation 에 `x-csrf-token` 헤더 자동 부착.
 */

import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';

const EXTERNAL_HUSK_BASE = `${NESTJS_CLIENT_API_BASE}/folders/external-husk`;

export interface ExternalHusk {
  id: string;
  name: string;
  path: string | null;
  createdAt: string;
}

export interface CleanupHuskResponse {
  deletedFolderIds: string[];
}

function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match?.[1];
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const csrfToken = getCsrfToken();
  const res = await fetch(`${EXTERNAL_HUSK_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'x-csrf-token': csrfToken }),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const externalHuskApi = {
  list: (): Promise<ExternalHusk[]> => apiFetch<ExternalHusk[]>(''),

  cleanup: (rootId: string): Promise<CleanupHuskResponse> =>
    apiFetch<CleanupHuskResponse>(`/${rootId}`, { method: 'DELETE' }),
};
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit
```

기대: exit 0.

- [ ] **Step 4: 커밋**

```bash
git add src/app/(admin)/admin/integration/companies/_lib/external-husk-api.ts src/lib/react-query/queryKeys.ts
git commit -m "feat(task 27 Phase C-4): external-husk client API + queryKey

CSRF 헤더 자동 부착 (feedback_csrf_token_required 패턴 준수)."
```

---

### Task C5: ExternalHusksPanel UI

**Files:**

- Create: `src/app/(admin)/admin/integration/companies/_components/ExternalHusksPanel.tsx`
- Modify: `src/app/(admin)/admin/integration/companies/_components/FolderMappingSection.tsx`

- [ ] **Step 1: ExternalHusksPanel 컴포넌트 작성**

```tsx
// src/app/(admin)/admin/integration/companies/_components/ExternalHusksPanel.tsx

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { externalHuskApi, type ExternalHusk } from '../_lib/external-husk-api';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('ExternalHusksPanel');

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * task 27 Phase C: 외부웹하드 husk (빈 껍데기) 정리 패널.
 *
 * 마이그레이션 후 비워진 외부 폴더 목록 (자식·파일 0). admin 명시 액션 으로 cascade soft-delete.
 * 안전 가드: 자식 폴더 0 + 직접 파일 0 만 후보. 동기화로 새 파일이 들어오면 후보에서 자동 제외.
 */
export function ExternalHusksPanel() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();

  const showMessage = (type: 'success' | 'error', text: string, ms = 5000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), ms);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.externalHusks.list(),
    queryFn: () => externalHuskApi.list(),
  });

  const cleanupMutation = useMutation({
    mutationFn: (rootId: string) => externalHuskApi.cleanup(rootId),
    onSuccess: (resp) => {
      showMessage(
        'success',
        `정리 완료 — 폴더 ${resp.deletedFolderIds.length}개 cascade soft-delete.`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.externalHusks.all });
    },
    onError: (e: Error) => {
      log.error('husk 정리 실패', e);
      showMessage('error', e.message || 'husk 정리 실패');
    },
  });

  const handleCleanup = (husk: ExternalHusk) => {
    const ok = window.confirm(
      `"${husk.name}" husk 를 cascade soft-delete 합니다.\n\n자식 폴더·파일이 모두 비어있는 것이 검증된 후 일괄 deletedAt set 됩니다. 위반 시 422 에러로 거절됩니다.\n\n계속하시겠습니까?`
    );
    if (!ok) return;
    cleanupMutation.mutate(husk.id);
  };

  const isRowPending = (huskId: string) =>
    cleanupMutation.isPending && cleanupMutation.variables === huskId;

  return (
    <section className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>외부 husk 정리</h2>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            마이그레이션 후 비워진 외부웹하드 폴더입니다. 자식·파일이 모두 0 인 husk 만 후보로
            표시되며, 정리 클릭 시 안전 검증 후 cascade soft-delete 됩니다. 신규 동기화로 새 파일이
            들어오면 후보에서 자동 제외됩니다.
          </p>
        </div>
        {message && (
          <span
            className={`text-xs ${
              message.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error
            }`}
          >
            {message.text}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>로딩 중...</p>
      ) : isError ? (
        <p className={`text-sm ${TEXT_COLOR.error}`}>목록 조회 실패</p>
      ) : !data || data.length === 0 ? (
        <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>정리 가능한 husk 가 없습니다.</p>
      ) : (
        <div className={`overflow-x-auto border rounded-lg ${BORDER_COLOR.default}`}>
          <table className="w-full text-sm">
            <thead className={BG_COLOR.muted}>
              <tr className={`border-b ${BORDER_COLOR.default}`}>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                  폴더명
                </th>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>경로</th>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                  최초 등록
                </th>
                <th className={`text-right px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>작업</th>
              </tr>
            </thead>
            <tbody>
              {data.map((husk: ExternalHusk) => {
                const rowPending = isRowPending(husk.id);
                return (
                  <tr key={husk.id} className={`border-b last:border-b-0 ${BORDER_COLOR.default}`}>
                    <td className={`px-4 py-2 font-mono ${TEXT_COLOR.primary}`}>{husk.name}</td>
                    <td className={`px-4 py-2 font-mono text-xs ${TEXT_COLOR.secondary}`}>
                      {husk.path}
                    </td>
                    <td className={`px-4 py-2 ${TEXT_COLOR.secondary}`}>
                      {formatDate(husk.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="danger"
                        type="button"
                        disabled={rowPending}
                        onClick={() => handleCleanup(husk)}
                      >
                        {rowPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        정리
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: FolderMappingSection 에 5번째 패널로 추가**

`src/app/(admin)/admin/integration/companies/_components/FolderMappingSection.tsx` 수정:

```tsx
'use client';

import { useState } from 'react';
import { TEXT_COLOR } from '@/lib/styles';
import { PendingAliasesPanel } from './PendingAliasesPanel';
import { UnmatchedFoldersPanel } from './UnmatchedFoldersPanel';
import { ManualMappingForm } from './ManualMappingForm';
import { RegisteredAliasesPanel } from './RegisteredAliasesPanel';
import { ExternalHusksPanel } from './ExternalHusksPanel';

/**
 * task 26 + task 27: 폴더 매핑 통합 섹션.
 *
 * 5 패널 순서:
 *   1. PendingAliasesPanel — 자동 등록된 후보 검수
 *   2. UnmatchedFoldersPanel — 자동 매칭 불가능한 외부 폴더
 *   3. ManualMappingForm — 직접 등록 폼
 *   4. RegisteredAliasesPanel — 등록 완료 매핑 (재마이그레이션 / 삭제)
 *   5. ExternalHusksPanel (task 27 Phase C) — 마이그레이션 후 빈 husk 정리
 */
export function FolderMappingSection() {
  const [folderName, setFolderName] = useState('');

  return (
    <div className="space-y-6">
      <header>
        <h2 className={`text-xl font-bold ${TEXT_COLOR.primary}`}>외부웹하드 폴더 매핑</h2>
        <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
          외부 동기화 폴더 ↔ 가입 업체 매핑 통합 관리. 매핑 등록 시 외부 누적분이 업체 폴더로
          이전됩니다. 외부 폴더 row 는 husk 로 유지되며 신규 동기화는 자동으로 회사 폴더에 redirect
          됩니다. 빈 husk 정리는 가장 아래 패널에서 수동으로.
        </p>
      </header>

      <PendingAliasesPanel />
      <UnmatchedFoldersPanel onSelect={setFolderName} />
      <ManualMappingForm folderName={folderName} onFolderNameChange={setFolderName} />
      <RegisteredAliasesPanel />
      <ExternalHusksPanel />
    </div>
  );
}
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit
```

기대: exit 0.

- [ ] **Step 4: dev 서버에서 시각 확인 (사용자 작업)**

```bash
pnpm dev:all
```

브라우저: `/admin/integration/companies` → 가장 아래 "외부 husk 정리" 패널 노출 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/(admin)/admin/integration/companies/_components/ExternalHusksPanel.tsx src/app/(admin)/admin/integration/companies/_components/FolderMappingSection.tsx
git commit -m "feat(task 27 Phase C-5): ExternalHusksPanel admin UI

5번째 패널로 추가. 빈 husk 만 후보 표시 + [정리] 버튼.
확인 다이얼로그 + 422 에러 토스트 분기."
```

---

### Task C6: spec doc + API endpoint doc + CHANGELOG

**Files:**

- Modify: `docs/specs/features/external-folder-migration.md`
- Modify: `docs/specs/api/endpoints/webhard.md`
- Modify: `docs/changelog/CHANGELOG.md`

- [ ] **Step 1: spec doc 에 Phase C 섹션 추가**

`docs/specs/features/external-folder-migration.md` 의 "결정 #3" 섹션 다음에 추가:

```markdown
### Phase C — admin husk 정리 UI (task 27)

**API**:

- `GET /api/v1/folders/external-husk` (AdminGuard) — 정리 후보 목록 (depth=2 + companyId IS NULL + 자식·파일 0)
- `DELETE /api/v1/folders/external-husk/:rootId` (AdminGuard) — 단일 husk cascade soft-delete

**안전 가드**:

| 위반                        | 응답                      |
| --------------------------- | ------------------------- |
| folder 미존재               | 400 (BadRequest)          |
| 이미 deletedAt set          | 400                       |
| path 가 `/외부웹하드/` 아님 | 400                       |
| companyId IS NOT NULL       | 400                       |
| depth ≠ 2                   | 400                       |
| 자식 폴더 ≥ 1               | 422 (UnprocessableEntity) |
| 직접 파일 ≥ 1               | 422                       |
| descendants 트리에 파일 ≥ 1 | 422                       |

**UI**: `/admin/integration/companies` 의 5번째 패널 `ExternalHusksPanel`. [정리] 버튼 → 확인 다이얼로그 → DELETE 호출 → 결과 토스트.

**근거**: husk 자동 정리는 routing 진입을 막아 회귀 발생 (`task 26 → task 27` Phase A/B). admin 명시 액션 으로 분리 — 자식·파일 0 검증 후에만 cascade soft-delete. 신규 동기화로 husk 에 새 파일이 들어오면 후보에서 자동 제외.
```

- [ ] **Step 2: API endpoint doc 갱신**

`docs/specs/api/endpoints/webhard.md` 에 `external-husk` endpoint 등록 (기존 endpoint 형식 따름).

- [ ] **Step 3: CHANGELOG 항목 추가**

`docs/changelog/CHANGELOG.md` 의 `## [Unreleased]` 섹션에 추가 (Phase B 항목 위 또는 아래):

```markdown
### 2026-04-30 — external-husk-cleanup-ui (task 27 Phase C)

**Scope**: task 27 Phase B 의 husk 유지 정책에 운영자 정리 경로를 분리. admin UI 패널에서 후보 조회 + 명시 정리.

**신규 동작**:

- **`GET /api/v1/folders/external-husk`** (AdminGuard): 정리 가능한 husk 후보 (depth=2 + companyId IS NULL + 자식·파일 0).
- **`DELETE /api/v1/folders/external-husk/:rootId`** (AdminGuard): 단일 husk cascade soft-delete. 안전 가드 (자식·파일 0 + companyId IS NULL + depth=2) 위반 시 400/422.
- **ExternalHusksPanel**: `/admin/integration/companies` 의 5번째 패널. 빈 husk 목록 + [정리] 버튼.

**테스트**:

- H1-H7: `getEmptyExternalHusks` (후보 필터) + `cleanupEmptyExternalHusk` (5가지 거절 케이스 + 1 정상 케이스).

**불변 규칙**:

- `cascadeBackfill` 응답 shape 무변경 (호환).
- companyVisibilityFilter (task 25) 그대로 — 회사 사용자에게 husk 노출 안 됨.
```

- [ ] **Step 4: 커밋**

```bash
git add docs/specs/features/external-folder-migration.md docs/specs/api/endpoints/webhard.md docs/changelog/CHANGELOG.md
git commit -m "docs(task 27 Phase C-6): husk 정리 endpoint spec/API doc/CHANGELOG 동기화"
```

---

# 검증 체크리스트 (전체)

모든 Phase 완료 후 최종 검증:

- [ ] **빌드/타입체크 모두 통과**
  - `npx tsc --noEmit` (Next.js root) → exit 0
  - `cd webhard-api && npx tsc --noEmit` → exit 0

- [ ] **테스트 모두 통과**
  - `cd webhard-api && pnpm test` → 전체 PASS
  - 신규/변경 테스트:
    - M5 husk 유지 (변경)
    - A8-1, A8-3, E2E-1 deletedExternalFolders=0 (변경)
    - H1-H7 husk cleanup (신규)

- [ ] **lint 통과**
  - `pnpm lint` → 에러 없음

- [ ] **운영 시나리오 수동 검증** (사용자 측, dev 환경):
  - Phase A SQL 적용 → Electron sync 1건 시뮬 → POST /files/presigned-url 200 + redirected=true
  - 새 alias 1건 등록 → 폴더 husk 유지 확인 (DB 직접 조회)
  - admin UI 의 ExternalHusksPanel 진입 → husk 후보 노출 확인
  - 빈 husk 1건에 [정리] 클릭 → 200 + DB deletedAt set 확인
  - 자식 1개 있는 husk 에 [정리] 클릭 → 422 토스트 확인

- [ ] **CHANGELOG / spec 동기화 검증**
  - `docs/specs/features/external-folder-migration.md` 결정 #3 + Phase C 섹션 추가
  - `docs/changelog/CHANGELOG.md` task 27 Phase B + Phase C 항목 등재
  - `docs/specs/api/endpoints/webhard.md` external-husk endpoint 등록

- [ ] **memory 갱신 검토** (선택)
  - 새 패턴 / 결정사항 중 향후 작업에 도움될 것 있으면 `~/.claude/projects/.../memory/` 에 추가
  - 후보: "husk 정책 — 외부 폴더 cascade delete 금지 (routing 진입 차단 회귀)"

---

# 참조

- `docs/specs/features/external-folder-migration.md` — task 26 본 spec
- `docs/specs/features/webhard-visibility-and-external-inquiry-fix.md` — task 25 (companyVisibilityFilter)
- `webhard-api/src/files/files.service.ts:185-279` — Phase 1.5 routing (`getUploadPresignedUrl`, `tryRouteExternalUpload`)
- `webhard-api/src/contacts/contact-folder-sync.service.ts:284-524` — `migrateExternalFolderTreeToCompany` (수정 대상)
- `webhard-api/src/companies/folder-alias.service.ts:215-273` — `runCascadeBackfill` (응답 shape)
- `webhard-api/src/folders/folders.service.ts:1841-1946` — `getExternalUnmatchedFolders` (참조 패턴)
- memory `feedback_csrf_token_required` — 클라이언트 fetch 헬퍼의 CSRF 헤더 필수 패턴
