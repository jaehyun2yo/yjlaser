# 외부웹하드 폴더 통째 이전 + 신규 동기화 routing + UI 통합 (task 26) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 업체와 매칭되는 외부웹하드 폴더의 (1) 신규 동기화 시 처음부터 업체 폴더로 R2 PUT 되도록 서버 측 routing 추가, (2) 기존 누적분의 폴더 트리 통째 이전 + 빈 외부 폴더 cascade 삭제, (3) admin UI 를 `/admin/integration/companies` 로 통합 + 매뉴얼 매핑 폼 + 미매칭 폴더 목록 패널 추가.

**Architecture:** Phase 1 백엔드 backfill 메서드 (폴더 트리 이전 + cascade 삭제 + 미분류 강제 이동) → Phase 1.5 신규 동기화 routing (`/files/presigned-url` + Electron 응답 folderId 사용) → Phase 2 미매칭 폴더 endpoint → Phase 3 프론트 UI 통합 + 매뉴얼 폼 → Phase 4 업체 상세 보강 (선택) → Phase 5 문서 + CHANGELOG + service-level integration.

**Tech Stack:** NestJS + Prisma + PostgreSQL (Supabase) + Jest + supertest + Next.js 15 + React Query + Electron (외부웹하드동기화프로그램).

**Spec:**

- `docs/specs/features/external-folder-migration.md` (정책·백엔드)
- `docs/specs/features/admin-folder-mapping-ui.md` (UI)

**Branch:** `feat/task-26-external-folder-migration` (worktree at `.worktrees/task-26-external-folder-migration/`)

**Sanity check (run before Phase 1):**

```bash
cd .worktrees/task-26-external-folder-migration && git branch --show-current
# Expected: feat/task-26-external-folder-migration
```

---

## 결정사항 요약 (이전 세션 합의)

| #           | 결정                                                                 | 적용 위치                                                 |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| 1           | 미분류 Contact 위치 = **A 업체 루트 직하** (`{업체}/{원본 폴더명}/`) | Phase 1 `migrateExternalFolderTreeToCompany` step 4·6     |
| 2           | 롤백 단위 = **(c) alias 1건당 1 tx**                                 | Phase 1 `createApprovedAlias` / `approve` 트랜잭션 경계   |
| 3           | 옛 URL 처리 = **(b) 6개월 redirect**                                 | Phase 3 `/admin/integration/folder-aliases/page.tsx`      |
| 4           | 기존 누적분 R2 처리 = **(i) DB 메타만**                              | Phase 1 — R2 COPY/DELETE 안 함, key 불변 정책 유지        |
| 신규 동기화 | **옵션 2 서버 routing** 채택                                         | Phase 1.5 `getPresignedUrl` + Electron 응답 folderId 사용 |

---

## File Structure

| 변경/생성 | 경로                                                                                                                 | 책임                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Modify    | `webhard-api/src/contacts/contact-folder-sync.service.ts`                                                            | `migrateExternalFolderTreeToCompany` 신규 + `relocateAfterAliasApproved` 미분류 정책 변경 |
| Modify    | `webhard-api/src/contacts/contact-folder-sync.service.spec.ts`                                                       | M1-M9 단위 테스트 추가                                                                    |
| Modify    | `webhard-api/src/companies/folder-alias.service.ts`                                                                  | `approve` / `createApprovedAlias` 에서 chained call (relocate + migrate) 추가             |
| Modify    | `webhard-api/src/companies/folder-alias.service.spec.ts`                                                             | A8 (chained migration) 단위 테스트 추가                                                   |
| Modify    | `webhard-api/src/files/files.service.ts`                                                                             | `getPresignedUrl` routing 로직 (`ensureRoutingTarget` private helper)                     |
| Modify    | `webhard-api/src/files/__tests__/files.service.spec.ts`                                                              | R1-R5 단위 테스트 추가                                                                    |
| Modify    | `webhard-api/src/files/dto/presigned-url.dto.ts`                                                                     | 응답 DTO 에 `folderId`, `redirected` 필드 추가                                            |
| Modify    | `webhard-api/src/folders/folders.service.ts`                                                                         | `getExternalUnmatchedFolders` 신규 메서드                                                 |
| Modify    | `webhard-api/src/folders/folders.controller.ts`                                                                      | `GET /folders/external-unmatched` endpoint                                                |
| Modify    | `webhard-api/src/folders/folders.service.spec.ts`                                                                    | F1-F2 단위 테스트 추가                                                                    |
| Modify    | `외부웹하드동기화프로그램/src/core/types/webhard-uploader.types.ts`                                                  | `PresignedUrlResponse` 타입에 `folderId?`, `redirected?` 필드 추가                        |
| Modify    | `외부웹하드동기화프로그램/src/core/webhard-uploader/yjlaser-uploader.ts`                                             | `uploadFile` 의 `confirm body.folderId` 를 응답에서 받은 값으로 사용                      |
| Create    | `src/app/(admin)/admin/integration/companies/_components/FolderMappingSection.tsx`                                   | 매핑 통합 섹션 (4 패널 wrapping)                                                          |
| Move      | `src/app/(admin)/admin/integration/folder-aliases/_components/PendingAliasesPanel.tsx` → `companies/_components/`    | import 경로만 수정                                                                        |
| Move      | `src/app/(admin)/admin/integration/folder-aliases/_components/RegisteredAliasesPanel.tsx` → `companies/_components/` | 동일                                                                                      |
| Move      | `src/app/(admin)/admin/integration/folder-aliases/_lib/api.ts` → `companies/_lib/folder-alias-api.ts`                | 동일                                                                                      |
| Create    | `src/app/(admin)/admin/integration/companies/_components/UnmatchedFoldersPanel.tsx`                                  | 미매칭 외부 폴더 목록 + 행 클릭 → 폼 채움                                                 |
| Create    | `src/app/(admin)/admin/integration/companies/_components/ManualMappingForm.tsx`                                      | 업체 콤보 + 폴더명 + cascadeBackfill                                                      |
| Create    | `src/app/(admin)/admin/integration/companies/_lib/external-unmatched-api.ts`                                         | `GET /folders/external-unmatched` 클라이언트                                              |
| Modify    | `src/app/(admin)/admin/integration/companies/page.tsx`                                                               | `<FolderMappingSection>` 추가                                                             |
| Modify    | `src/app/(admin)/admin/integration/_components/IntegrationNav.tsx`                                                   | "폴더 별칭" 탭 항목 제거                                                                  |
| Modify    | `src/app/(admin)/admin/integration/folder-aliases/page.tsx`                                                          | 1줄 redirect 로 교체                                                                      |
| Delete    | `src/app/(admin)/admin/integration/folder-aliases/_components/`                                                      | 컴포넌트 이동 후 빈 디렉토리 삭제                                                         |
| Delete    | `src/app/(admin)/admin/integration/folder-aliases/_lib/`                                                             | 동일                                                                                      |
| Modify    | `src/lib/react-query/queryKeys.ts`                                                                                   | `externalUnmatchedFolders` 신규 namespace                                                 |
| Modify    | `docs/specs/api/endpoints/integration.md`                                                                            | `POST /files/presigned-url` 응답 변경 + `GET /folders/external-unmatched` 신규            |
| Modify    | `docs/specs/api/endpoints/webhard.md`                                                                                | 동일                                                                                      |
| Modify    | `docs/specs/api/nestjs-endpoints.md`                                                                                 | endpoint 표 갱신                                                                          |
| Modify    | `docs/specs/features/external-sync-company-folder.md`                                                                | task 26 cross-link 추가                                                                   |
| Modify    | `docs/specs/features/contact-webhard-folder.md`                                                                      | 동일                                                                                      |
| Modify    | `docs/specs/features/drawing-workflow.md` §W.1                                                                       | task 26 의 routing 정책 cross-link 추가 (R2 key 정책 그대로 유지 명시)                    |
| Modify    | `docs/changelog/CHANGELOG.md`                                                                                        | task 26 entry                                                                             |
| Modify    | `docs/features-list.md`                                                                                              | task 26 entry                                                                             |

---

## Phase 1 — 백엔드: 폴더 트리 이전 + cascade 삭제 + 미분류 강제 이동

### Task 1.1 — `migrateExternalFolderTreeToCompany` 메서드 신규

**Files:**

- Modify: `webhard-api/src/contacts/contact-folder-sync.service.ts`
- Test: `webhard-api/src/contacts/contact-folder-sync.service.spec.ts` (M1-M9)

- [ ] **Step 1**: 시그너처 정의 + tx 매개변수 + 반환 타입 (`{ movedFolders, movedFiles, deletedExternalFolders, conflicts }`).
- [ ] **Step 2**: external root 검증 (`path startsWith '/외부웹하드/'`, depth=2). 아니면 `BadRequestException`.
- [ ] **Step 3**: BFS 로 root 의 모든 하위 (folder + file) 수집. depth 무제한, `deletedAt: null`.
- [ ] **Step 4**: 가입 업체 root folder 확보 (`resolveCompanyRoot` + `initializeCompanyFolders` lazy fallback).
- [ ] **Step 5**: 폴더별 처리 분기:
  - template 세그먼트 일치 → 동명 template 폴더로 자식 병합
  - `folderKind='inquiry'` → 업체 루트 하위 `문의/` 로 이동
  - 그 외 임의 폴더 → 업체 루트 직하, 충돌 시 `(1)`/`(2)` 자동 rename
- [ ] **Step 6**: `WebhardFolder.companyId/parentId/path` 갱신 + `updateDescendantPaths`.
- [ ] **Step 7**: `WebhardFile.companyId` 갱신 (folderId 는 부모 따라감).
- [ ] **Step 8**: Contact 갱신 (companyId IS NULL 조건으로 멱등 유지).
- [ ] **Step 9**: 비워진 외부 폴더 트리 cascade soft delete.
- [ ] **Step 10**: `eventsGateway.emitGlobal({ type: 'folder:migrated', ... })` 1회 발행.
- [ ] **Step 11**: 단위 테스트 M1-M9 통과 확인.

### Task 1.2 — `relocateAfterAliasApproved` 미분류 정책 변경

**Files:**

- Modify: `webhard-api/src/contacts/contact-folder-sync.service.ts:219`
- Test: 동일 spec 파일에 미분류 케이스 추가

- [ ] **Step 1**: 기존 `if (!contact.inquiryType) { skipped++; continue; }` 분기 제거.
- [ ] **Step 2**: 미분류 contact 도 `contact.companyId/companyName` 갱신 + 폴더는 `migrateExternalFolderTreeToCompany` 가 후속 처리하도록 위임.
- [ ] **Step 3**: 응답 형식 변경 — `skipped` 카운트는 "이미 companyId 가 채워진 contact" 만 의미하도록 정정.
- [ ] **Step 4**: spec/test 갱신.

### Task 1.3 — `folder-alias.service.ts` chained call 추가

**Files:**

- Modify: `webhard-api/src/companies/folder-alias.service.ts:53,122`
- Test: `webhard-api/src/companies/folder-alias.service.spec.ts` (A8)

- [ ] **Step 1**: `approve` 의 `if (dto.cascadeBackfill)` 블록 안에 `migrateExternalFolderTreeToCompany` 호출 추가. external root folder 조회 (해당 alias.folderName 의 root) 우선 필요.
- [ ] **Step 2**: 응답 타입에 `migration` 필드 추가 (선택적 — backfill 객체 안에 통합).
- [ ] **Step 3**: `createApprovedAlias` 에 동일 로직.
- [ ] **Step 4**: 트랜잭션 경계 검증 — alias upsert + relocate + migrate 가 단일 `$transaction` 안에서 실행, 1건 throw 시 모두 롤백 (결정 #2).
- [ ] **Step 5**: A8 테스트 통과 — chained migration 호출 후 폴더 트리 이동 + cascade 삭제 결과 검증.

---

## Phase 1.5 — 신규 동기화 routing

### Task 1.5.1 — `getPresignedUrl` routing 로직

**Files:**

- Modify: `webhard-api/src/files/files.service.ts`
- Modify: `webhard-api/src/files/dto/presigned-url.dto.ts` (응답 DTO)
- Test: `webhard-api/src/files/__tests__/files.service.spec.ts` (R1-R5)

- [ ] **Step 1**: 응답 DTO 에 `folderId: string`, `redirected: boolean` 추가.
- [ ] **Step 2**: `getPresignedUrl` 진입점에서 folder 조회 후 `path startsWith '/외부웹하드/'` 검증.
- [ ] **Step 3**: external 일 때 root segment 추출 → `matchCompanyInfo(rootSegment)` 호출 (auto-contact.service 의 메서드 재사용 또는 리팩토링).
- [ ] **Step 4**: `ensureRoutingTarget(matched.id, folder)` private helper — template/inquiry/임의 폴더 분기.
- [ ] **Step 5**: 새 folderId/key 로 R2 presigned URL 발급 + 응답에 `redirected: true`.
- [ ] **Step 6**: matching 실패 또는 routing 예외 → 기존 흐름 fallback (응답 `redirected: false`, 요청 folderId echo).
- [ ] **Step 7**: R1-R5 테스트 통과.

### Task 1.5.2 — Electron 응답 folderId 사용

**Files:**

- Modify: `외부웹하드동기화프로그램/src/core/types/webhard-uploader.types.ts`
- Modify: `외부웹하드동기화프로그램/src/core/webhard-uploader/yjlaser-uploader.ts:341`

- [ ] **Step 1**: `PresignedUrlResponse` 타입에 `folderId?: string`, `redirected?: boolean` 필드 추가 (옵셔널 — 구버전 서버 호환).
- [ ] **Step 2**: `uploadFile` 에서 `presignRes.folderId ?? params.folderId` 로 `actualFolderId` 결정.
- [ ] **Step 3**: `confirmBody.folderId` 를 `actualFolderId` 로 교체.
- [ ] **Step 4**: routing 발생 시 logger info (운영 추적).
- [ ] **Step 5**: 빌드 + Electron 자동 업데이트 사이클 (운영 절차).

---

## Phase 2 — 미매칭 외부 폴더 endpoint

### Task 2.1 — `GET /folders/external-unmatched` 신규

**Files:**

- Modify: `webhard-api/src/folders/folders.service.ts` (`getExternalUnmatchedFolders` 메서드)
- Modify: `webhard-api/src/folders/folders.controller.ts` (endpoint)
- Test: `webhard-api/src/folders/folders.service.spec.ts` (F1-F2)

- [ ] **Step 1**: `getExternalUnmatchedFolders()` 메서드 — `path startsWith '/외부웹하드/'` + `companyId IS NULL` + `deletedAt IS NULL` + `folderKind IN ('root', 'generic')` + depth=2 + 미매핑 alias 조건.
- [ ] **Step 2**: 각 폴더의 `contactCount`, `fileCount` BFS 누적 계산.
- [ ] **Step 3**: 컨트롤러 endpoint `@UseGuards(AdminGuard)`. API key 호출 차단.
- [ ] **Step 4**: F1-F2 테스트 통과.

---

## Phase 3 — 프론트: `/admin/integration/companies` 통합

### Task 3.1 — 컴포넌트 이동

**Files:**

- Move: `folder-aliases/_components/{PendingAliasesPanel,RegisteredAliasesPanel}.tsx` → `companies/_components/`
- Move: `folder-aliases/_lib/api.ts` → `companies/_lib/folder-alias-api.ts`

- [ ] **Step 1**: 파일 이동 (`git mv`).
- [ ] **Step 2**: 이동된 파일들의 import 경로 수정 (`../_lib/api` → `../_lib/folder-alias-api`).
- [ ] **Step 3**: 기존 `folder-aliases/page.tsx` 의 import 경로도 동시 갱신 (다음 task 에서 redirect 로 교체될 예정이지만 중간 빌드 통과를 위해).

### Task 3.2 — `<UnmatchedFoldersPanel>` + 클라이언트 API

**Files:**

- Create: `companies/_components/UnmatchedFoldersPanel.tsx`
- Create: `companies/_lib/external-unmatched-api.ts`
- Modify: `src/lib/react-query/queryKeys.ts`

- [ ] **Step 1**: API 클라이언트 (`fetchExternalUnmatched()`).
- [ ] **Step 2**: `queryKeys.externalUnmatchedFolders` namespace 추가.
- [ ] **Step 3**: 패널 컴포넌트 — 행에 폴더명 + path + 통계 + "이 폴더 매핑" 버튼.
- [ ] **Step 4**: 행 클릭 → props callback `onSelect(folderName)` 으로 ManualMappingForm 의 folderName 채움.

### Task 3.3 — `<ManualMappingForm>` 컴포넌트

**Files:**

- Create: `companies/_components/ManualMappingForm.tsx`

- [ ] **Step 1**: state — `folderName`, `companyId`, `cascadeBackfill: true`.
- [ ] **Step 2**: 업체 검색 콤보박스 (`queryKeys.companies.all` 재사용).
- [ ] **Step 3**: 제출 → `folderAliasApi.createApproved()` 호출.
- [ ] **Step 4**: 응답의 `migration` 카운트 toast 노출.
- [ ] **Step 5**: invalidate — `folderAliases.all` + `externalUnmatchedFolders.all`.

### Task 3.4 — `<FolderMappingSection>` wrapper + 페이지 통합

**Files:**

- Create: `companies/_components/FolderMappingSection.tsx`
- Modify: `companies/page.tsx`

- [ ] **Step 1**: 4 패널을 순서대로 렌더링하는 wrapper.
- [ ] **Step 2**: `UnmatchedFoldersPanel` 의 `onSelect` 를 `ManualMappingForm` state setter 로 연결 (state lifting 또는 zustand 미니 스토어).
- [ ] **Step 3**: `companies/page.tsx` 에서 `<CompaniesList>` 아래에 `<FolderMappingSection>` 렌더.

### Task 3.5 — 옛 URL redirect + 탭 제거

**Files:**

- Modify: `folder-aliases/page.tsx` → 1줄 redirect
- Delete: `folder-aliases/_components/`, `folder-aliases/_lib/` (빈 디렉토리)
- Modify: `IntegrationNav.tsx` — 탭 항목 제거

- [ ] **Step 1**: `redirect('/admin/integration/companies')`.
- [ ] **Step 2**: 빈 디렉토리 삭제.
- [ ] **Step 3**: nav 탭 제거.
- [ ] **Step 4**: 6개월 후 (2026-10) redirect 페이지 자체 삭제 task 별도 등록 (CHANGELOG 에 메모).

---

## Phase 4 — 업체 상세 강화 (선택)

### Task 4.1 — 업체별 alias 카드

**Files:**

- Modify: `companies/[id]/page.tsx`
- Create: `companies/[id]/_components/CompanyAliasesCard.tsx`

- [ ] **Step 1**: 업체 상세 페이지에 "연결된 외부 폴더" 카드 추가.
- [ ] **Step 2**: `GET /companies/folder-aliases?companyId=...` (필요 시 endpoint 확장).
- [ ] **Step 3**: "이 업체에 폴더 매핑 추가" 버튼 → `<ManualMappingForm>` 모달, companyId 자동 채움.

> Phase 4 는 우선순위 낮음 — Phase 1~3 완료 후 별도 PR 가능.

---

## Phase 5 — 문서 + service-level integration

### Task 5.1 — service-level integration 테스트

**Files:**

- Modify: `webhard-api/src/companies/folder-alias.service.spec.ts` (E2E-1) 또는 별도 `.integration-spec.ts`

- [ ] **Step 1**: 대성목형 시나리오 simulation 테스트 — Contact 5건 + 폴더 N개 + 파일 M개 → 매뉴얼 매핑 → migration 결과 검증 + 신규 동기화 1건 routing 검증.
- [ ] **Step 2**: 멱등성 검증 (E2E-2).

### Task 5.2 — 문서 sync

**Files:**

- Modify: `docs/specs/api/endpoints/integration.md` — `POST /files/presigned-url` 응답 + `GET /folders/external-unmatched` 신규
- Modify: `docs/specs/api/endpoints/webhard.md` — 동일
- Modify: `docs/specs/api/nestjs-endpoints.md` — endpoint 표
- Modify: `docs/specs/features/external-sync-company-folder.md` — task 26 cross-link
- Modify: `docs/specs/features/contact-webhard-folder.md` — 동일
- Modify: `docs/specs/features/drawing-workflow.md` §W.1 — routing 정책 cross-link + R2 key 정책 명시
- Modify: `docs/changelog/CHANGELOG.md` — task 26 entry
- Modify: `docs/features-list.md` — task 26 entry

### Task 5.3 — 운영 검증 (배포 후)

- [ ] **Step 1**: 대성목형 매뉴얼 매핑 1회 실행 + 결과 확인 (Contact·폴더·파일 카운트).
- [ ] **Step 2**: 신규 LGU+ 파일 1건 동기화 → R2 key 가 업체 폴더 경로로 박히는지 검증 (admin → R2 콘솔 또는 logger).
- [ ] **Step 3**: 외부웹하드 트리에 `대성목형/` 사라졌는지 확인.

---

## 호환성

- **Prisma schema 변경 없음** — 기존 `WebhardFolder.deletedAt` / `Contact.companyId` / `CompanyFolderAlias` 모델 그대로 사용.
- **R2 key 정책 변경 없음** — 폴더 이동·rename 시 key 불변, 신규 PUT 시점의 폴더 위치만 반영.
- **기존 endpoint 호환** — `POST /files/presigned-url` 응답에 옵셔널 필드 추가만 (구버전 Electron client 도 정상 동작).
- **기존 `POST /folder-aliases/:id/approve` 동작 보강** — `migration` 결과가 backfill 객체에 포함, 기존 `relocated/skipped` 필드 무변경.

## 위험·완화

| 위험                                        | 완화                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| migration 도중 다른 admin 이 동일 폴더 조작 | alias 1건당 1 tx 로 직렬화 (결정 #2). 동시 실행 시 한쪽만 성공, 다른 쪽 자동 멱등 skip                                            |
| Electron 구버전이 응답 folderId 무시        | 옵셔널 필드 + fallback `?? params.folderId`. 신규 routing 미발동 시 기존 흐름. 효과는 Electron 업데이트 후부터                    |
| BFS 가 거대한 외부 폴더에서 timeout         | alias 1건당 1 tx 가 그 폴더 트리만 처리 — 다른 alias 영향 없음. 한 트리가 정말 크면 운영자가 미리 외부에서 일부 정리 후 매핑 권장 |
| routing target lazy create 중 race          | findFirst → create 패턴, unique 제약은 없으므로 동명 폴더 2개 생기는 케이스만 차단 — `(1)` rename 로 자동 처리                    |
| 미분류 강제 이동으로 운영자 혼란            | spec 의 운영 절차 + UI toast 메시지 명시. 분류 작업 동선이 업체 폴더 직하라 오히려 명확                                           |

## 참조

- Spec: `docs/specs/features/external-folder-migration.md`, `docs/specs/features/admin-folder-mapping-ui.md`
- 이전 task plan: `docs/superpowers/plans/2026-04-27-webhard-visibility-and-external-inquiry-fix.md` (task 25)
- 이전 task spec: `docs/specs/features/external-sync-company-folder.md` (task 24), `docs/specs/features/webhard-visibility-and-external-inquiry-fix.md` (task 25)
- 외부 동기화 프로그램: `외부웹하드동기화프로그램/src/core/webhard-uploader/yjlaser-uploader.ts`
