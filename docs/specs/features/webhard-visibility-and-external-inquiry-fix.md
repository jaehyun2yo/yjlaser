# 웹하드 가시성 회복 + 외부 폴더명 alias 매핑 + 미가입 업체 문의 폴더 자동화 (task 25)

> 본 spec 은 2026-04-27 dev DB 직접 진단 결과 기반으로 두 차례 수정됨.
> 1차 가설 (PR #17 마이그레이션 미적용) 은 dev/prod 모두에서 마이그레이션이 이미 적용됐음을 확인하고 폐기.
> 2차 진단으로 Bug 2 의 진짜 원인이 드러남: 폴더명 정규화 매칭 실패.

## 개요·배경

운영자 보고로 동시에 드러난 3건을 한 번에 묶어 정리한다. 세 건 모두 웹하드 ↔ 외부 동기화 흐름의 동일 코드 경로에 영향.

| #   | 증상                                                                                         | 진단 결과 (근본 원인)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 관리자가 업체 폴더에 업로드한 파일이 업체 사용자에게 보이지 않음                             | `FilesService.confirmUpload`/`batchConfirmUpload`/`getUploadPresignedUrl` 가 admin 업로드 시 `effectiveCompanyId = dto.companyId ?? null` 로 폴더 소유자(`folder.companyId`) 와 무관하게 `companyId=null` 저장. `getFiles` 의 회사 격리 필터(`where.companyId = user.companyId`) 가 `null` 파일을 제외함. (`getFolderDetail` 만 `OR null` 로 우회 — 일관성 깨짐) dev DB 에서 정확히 재현 확인 — 폴더 `f78e1ea0...`(`/대성목형`, companyId=4) 안에 `기타_테스트.DXF` (companyId=null) 존재. |
| 2   | 대성목형 외부웹하드 sync 가 가입 업체 폴더로 통합되지 않음                                   | 가입 업체 `대성목형` (Company.id=4) 와 외부웹하드 폴더명 `대성목형(2265-1295)` 의 `normalizeCompanyName` 결과가 다름 (`대성목형` vs `대성목형22651295`). 0차/1차/2차 매칭 모두 실패 + 3차 정규화 후보도 0개 → alias 자동 등록 안 됨 → 폴더명 원본으로 contact 생성 (companyId=null), 외부웹하드 트리에 머무름. 운영자 인식 "contact 가 안 만들어진다" 는 부정확 — 실제는 "별도 entity 로 만들어지고 가입 업체 폴더로 통합 안 됨".                                                          |
| 3   | 자체웹하드에 등록되지 않은 업체는 외부웹하드 폴더 내에서 문의 폴더가 자동 생성·관리되지 않음 | 미가입 업체 contact 가 분류 확정 (칼선/목형 segment 인식) 시 `외부웹하드/{미가입업체}/문의/{title-O번호}/` 폴더가 자동 생성되어야 한다. 현재 코드 path (`resolveCompanyRoot` fallback + `ensureInquiryRootFolder` companyId=null 허용) 는 이미 동작 가능하지만 회귀 가드 테스트가 없어 운영자 입장에선 "동작하지 않는다" 로 보임. dev DB 확인 결과 다수 미가입 업체 폴더 (외부웹하드/(주)신영피앤피, /태인프린팅, /디자인삼진 등) 평면 구조로 머무름.                                      |

## 정책 — Bug 1: 업로드 시 `companyId` 상속 + 백필

### 저장 시점 정정 (`webhard-api/src/files/files.service.ts`)

세 진입점에서 `effectiveCompanyId` 계산을 다음과 같이 변경한다.

| 메서드                  | 현재 동작                                                                | 변경 동작                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `getUploadPresignedUrl` | `user.userType === 'company' ? user.companyId : (dto.companyId ?? null)` | admin + `dto.folderId` 존재 시 폴더 조회 → `dto.companyId` 가 명시되지 않았으면 `folder.companyId` 상속                    |
| `confirmUpload`         | 동일                                                                     | 동일 정정. 폴더 조회는 `verifyFolderAccess` 가 이미 함 — 그 결과에서 `companyId` 추출 가능                                 |
| `batchConfirmUpload`    | 동일                                                                     | 항목별 `f.folderId` 가 있으면 그 폴더의 `companyId` 를 상속 (이미 `folderAccessMap` 조회용으로 1회 fetch 함 — 결과 재활용) |

규칙:

1. **명시값 우선**: admin 이 `dto.companyId` 를 명시적으로 전달하면 그 값 사용 (특수 운영 케이스 보존).
2. **폴더 없음 (root)**: `folderId` 가 없으면 기존 동작 유지 (`dto.companyId ?? null`).
3. **폴더의 `companyId === null`** (외부웹하드 / 공용 폴더): 기존 동작 유지 — file 도 `companyId=null`.
4. **`folder.deletedAt !== null`**: 기존 동작 (`NotFoundException`) 유지.

### 백필 (1회 마이그레이션)

`webhard-api/prisma/migrations/{TS}_backfill_webhard_files_company_id/migration.sql` 신규:

```sql
UPDATE webhard_files f
SET company_id = wf.company_id
FROM webhard_folders wf
WHERE f.folder_id = wf.id
  AND f.company_id IS NULL
  AND wf.company_id IS NOT NULL
  AND f.deleted_at IS NULL;
```

idempotent — `company_id IS NULL` 조건으로만 UPDATE.

## 정책 — Bug 2: admin 수동 alias 매핑 endpoint + 즉시 적용

### 배경

3차 정규화 후보 등록은 `normalizeCompanyName(folderName) === normalizeCompanyName(companyName)` 인 경우만 동작. `대성목형(2265-1295)` 처럼 정규화 후에도 매칭 안 되는 폴더는 후보 등록 자체가 안 됨 → 운영자가 수동으로 alias 를 등록할 방법이 없음 (현재 endpoint 는 approve/reject/delete 만).

### 신규 endpoint — `POST /api/v1/companies/folder-aliases`

`webhard-api/src/companies/companies.controller.ts` 에 추가 (`AdminSessionGuard` — admin 세션 한정, 외부 X-API-Key 호출 차단):

- body: `{ folderName: string, companyId: number, cascadeBackfill?: boolean }` (`cascadeBackfill` 기본 `true` — 운영자 의도적 매핑이므로 즉시 백필이 합리적 default)
- 동작:
  1. `(folderName, companyId)` 로 `CompanyFolderAlias.upsert` (status `approved`, `approvedBy = req.user.userId ?? 'admin'`, `approvedAt = now`).
  2. 동일 `folderName` 의 다른 `pending` row 는 자동 `rejected` (기존 approve 정책과 동일).
  3. `cascadeBackfill: true` 면 `ContactFolderSyncService.relocateAfterAliasApproved(folderName, companyId, tx)` 호출.
- 응답: `{ alias, backfill? }` — `alias` 는 upsert 결과, `backfill` 은 `cascadeBackfill=true` 일 때만 `{ relocated: number, skipped: number }`.
- 멱등: 동일 `(folderName, companyId)` 재호출 시 alias status 변경 없이 보존 + `cascadeBackfill: true` 면 백필만 멱등 추가 실행 (`relocateAfterAliasApproved` 가 `companyId IS NULL` 조건으로 필터하므로 이미 이동된 contact 는 자동 제외).
- 비존재 `companyId` → `NotFoundException`.

### 즉시 적용 (대성목형 케이스)

배포 후 admin 세션으로 다음 호출:

```
POST /api/v1/companies/folder-aliases
{ folderName: '대성목형(2265-1295)', companyId: 4, cascadeBackfill: true }
```

기대 결과: 7건 contact (`260427-F-006`~`F-010` 외) 중 `inquiryType ≠ null` 항목들이 가입 업체 폴더 트리 (`/대성목형/문의/{title-O번호}/`) 로 이동. inquiryType=null 항목은 skipped 카운트.

### 운영 안내

`docs/specs/features/external-sync-company-folder.md` 에 운영 절차로 등재 — 향후 동일한 폴더명 차이 케이스 (`{업체명}({사이즈})`, `{업체명}_old`, `{업체명}-임시` 등) 발생 시 admin 이 같은 endpoint 로 즉시 매핑.

## 정책 — Bug 3: 미가입 업체 외부 sync 통합 회귀 가드

### 사용자 확정 정책

> 미분류 상태일 때는 문의 생성 X → 칼선/목형 segment 인식 시 그때 해당 상태에 맞는 문의 폴더 생성.

### 현재 동작 (검증 결과)

`외부웹하드/{미가입업체}/칼선의뢰/file.dxf` 업로드 시:

1. `confirmUpload` → `triggerAutoContact` → `resolveCompanyFolder` 가 폴더 hierarchy 상향 탐색. 단, "칼선의뢰" 는 `excludedFolders` 에 포함되어 skip → 다음 상위 `{미가입업체}` 반환.
2. `detectAndCreate` → `classifyByFolderPath('/외부웹하드/{미가입업체}/칼선의뢰')` → `cutting_request` 반환.
3. `matchCompanyInfo('{미가입업체}')` → 0차/1차/2차/3차 모두 fail → 결과 null. `resolvedCompanyName = dto.companyName.trim()`.
4. Contact 생성 (`companyName='{미가입업체}'`, `companyId=null`, `inquiryType='cutting_request'`, `inquiryNumber='YYMMDD-O-NNN'`, `source='webhard'`).
5. `onContactCreated` → `inquiryType` 확정 → `ensureInquiryFolder` → `resolveCompanyRoot('{미가입업체}')` 가 fallback (2단계 name 완전 일치) 로 `외부웹하드/{미가입업체}` 폴더 (companyId=null) 를 root 로 반환 → `ensureInquiryRootFolder(rootFolderId, companyId=null)` 가 `외부웹하드/{미가입업체}/문의/` 확보 → `외부웹하드/{미가입업체}/문의/{inquiryTitle-O번호}/` 생성.
6. `relocateContactFiles` 가 file 을 그쪽으로 이동.

본 흐름은 **현재 코드 그대로 동작 가능**해야 한다. Bug 3 의 작업은 회귀 가드 테스트 추가만.

### 운영 안내 — `webhard_auto_contact_excluded_folders`

DB 설정값 `webhard_auto_contact_excluded_folders = ["ㄱ 내리기전용"]` 때문에 경로 segment 에 `ㄱ 내리기전용` 이 있으면 자동 contact 생성 스킵. 의도된 정책이므로 본 task 가 변경하지 않음. Bug 3 검증 시 외부웹하드/{업체} 가 `ㄱ 내리기전용` / `ㄱ 올리기전용` 하위가 아닌 평면 위치인 케이스 사용.

### 외부웹하드 root 가시성 (불변)

`folders.service.ts` 의 `EXTERNAL_WEBHARD_FOLDERS = ['외부웹하드', '올리기전용', '내리기전용']` 차단 정책. 새로 만들어지는 `외부웹하드/{업체}/문의/...` 도 admin 만 노출. 회사 사용자 (`getFolderTree` / `getChildFolders`) 분기는 `companyVisibilityFilter` helper 로 일원화 — 이름 매칭(root) + `path` startsWith(하위) 두 조건을 OR 로 묶어 차단.

## 불변 규칙

1. **단일 진입점 보존**: `ContactFolderSyncService` 외부에서 직접 `ensureInquiryFolder` / `renameInquiryFolderForContact` / `relocateContactFiles` 호출 금지. Bug 2 의 새 endpoint 도 `relocateAfterAliasApproved` 만 호출하고 내부 메서드는 직접 부르지 않는다.
2. **백필 멱등성**: Bug 1 의 백필 SQL 은 `company_id IS NULL` 조건으로만 UPDATE — 두 번 실행해도 동일 결과.
3. **명시값 우선**: Bug 1 의 companyId 상속은 admin 이 `dto.companyId` 를 명시적으로 전달하지 않은 경우에만 발동.
4. **alias 매핑 멱등성**: Bug 2 의 새 endpoint 는 동일 `(folderName, companyId)` 재호출 시 alias status 변경 없이 backfill 만 멱등하게 추가 실행. 다른 pending 의 자동 reject 는 기존 approve endpoint 와 동일.
5. **alias 자동 cascadeBackfill**: 새 endpoint 의 `cascadeBackfill` 기본 `true`. 기존 `POST :id/approve` 의 default `false` 와 차이가 있으나, 새 endpoint 는 운영자의 명시적 의도 매핑이므로 default `true` 가 적절. 호출자가 `false` 명시 가능.
6. **외부웹하드 root 가시성 (Bug 3 부수)**: `EXTERNAL_WEBHARD_FOLDERS` 차단 정책. 회사 사용자에게는 root + 모든 하위 폴더 (가상 업체 / 문의 / 문의-{O} 등) 차단. `getFolderTree` / `getChildFolders` 두 진입점에서 `companyVisibilityFilter` helper 가 name in EXTERNAL_WEBHARD_FOLDERS OR path startsWith `/<root>/` 두 조건을 OR 로 묶어 차단. admin 분기는 필터 미적용 (전체 노출 보존).
7. **`getFolderDetail` vs `getFiles` 가시성 차이**: 본 task 가 변경하지 않는다 (Bug 1 백필 후 정합성 회복되므로 visibility relaxation 불필요).

## 테스트 케이스 list

### Bug 1 — `files.service.spec.ts` (단위) + service-level integration

> **운영 방식 결정 (2026-04-28)**: webhard-api 에 e2e 인프라 (jest-e2e.json + DB seed/cleanup) 가 부재하여 본 task 의 F7 / A7 / E2E-1 은 service-level integration test 로 대체. NestJS Test bootstrap + Prisma mock 또는 service.spec 레벨에서 ContactFolderSyncService / FilesService 결합 검증. 동일 회귀 가드 효과를 단위/통합 테스트로 제공.

- **F1** — `confirmUpload` 단위: admin 세션 + `folderId=X (companyId=42)` + `dto.companyId` 미전달 → 생성된 row `companyId === 42`.
- **F2** — `confirmUpload` 단위: admin 세션 + `dto.companyId=99` 명시 → 생성된 row `companyId === 99` (명시값 우선).
- **F3** — `confirmUpload` 단위: admin 세션 + `folderId` 없음 → `companyId === null` (root 업로드).
- **F4** — `confirmUpload` 단위: admin 세션 + `folderId=X (companyId=null)` (외부웹하드) → `companyId === null`.
- **F5** — `batchConfirmUpload` 단위: admin 세션 + 항목 5개 (3개 companyId=42 폴더, 2개 companyId=null 폴더) → 3개 42, 2개 null. 폴더 조회 1회 (folderAccessMap 재활용).
- **F6** — `getUploadPresignedUrl` 단위: admin 세션 + `dto.folderId=X (companyId=42)` → 생성된 storage key 가 `webhard/company-42/...` prefix.
- **F7** — service-level integration: `FilesService.confirmUpload` (admin 세션, folder cid=42) → `getFiles` (회사 세션, 같은 폴더) 응답 배열에 방금 생성된 file 포함. 단일 service 인스턴스 + Prisma mock 으로 두 메서드 동일 store 공유.
- **F8** — 백필 후: 기존 `companyId=null` + 부모 폴더 `companyId=42` 인 row 가 `companyId=42` 로 업데이트. 회사 사용자 `getFiles` 에서 가시.
- **F9** — 백필 멱등: 두 번째 실행 시 0 row affected.

### Bug 2 — `folder-alias.service.spec.ts` (단위) + service-level integration (대성목형 즉시 적용 시나리오)

- **A1** — `POST /folder-aliases` 단위: 신규 `(folderName, companyId)` 호출 → row insert (status='approved', approvedBy/At 기록).
- **A2** — `POST /folder-aliases` 단위: 동일 folderName 의 다른 pending 자동 `rejected` 처리.
- **A3** — `POST /folder-aliases` 단위: `cascadeBackfill: true` (default) → `relocateAfterAliasApproved` 호출 + 응답에 `backfill: { relocated, skipped }`.
- **A4** — `POST /folder-aliases` 단위: `cascadeBackfill: false` → `relocateAfterAliasApproved` 미호출 + 응답에 `backfill === undefined`.
- **A5** — `POST /folder-aliases` 멱등: 동일 `(folderName, companyId)` 재호출 → alias status 변경 없음, `cascadeBackfill: true` 면 백필만 멱등 추가 실행.
- **A6** — `POST /folder-aliases` 단위: 비존재 companyId → `NotFoundException`.
- **A7** — service-level integration: 사전 시드 mock (대성목형(2265-1295) 폴더 + companyId=null contact 3건) → `FolderAliasService.createApprovedAlias` 호출 → 3건 모두 companyId=4 갱신 + `ContactFolderSyncService.relocateAfterAliasApproved` 가 의도대로 호출돼 폴더 이동 시뮬레이션. service-level 단일 트랜잭션 mock 으로 검증.
- **A8** — `AdminSessionGuard` 단위 (`webhard-api/src/auth/guards/admin-session.guard.spec.ts`): admin 세션 user 통과, user 없음 / company 세션 → `ForbiddenException ('Admin access required')`, X-API-Key 인증 (`apiKeyInfo` 존재) → `ForbiddenException ('Admin session required (API key not allowed)')`. PR review 에서 발견된 AdminGuard 우회 가능성 (`ApiKeyGuard` 가 외부 키에 `userType: 'admin'` 부여) 차단의 회귀 가드.

### Bug 3 — `auto-contact.service.spec.ts` + `contact-folder-sync.service.spec.ts` + `folders.service.spec.ts`

- **U1** — `외부웹하드/{미가입업체}/칼선의뢰/file.dxf` 업로드 → contact 생성 (`inquiryType=cutting_request`) + `onContactCreated` 호출 (mock).
- **U2** — `외부웹하드/{미가입업체}/file.dxf` (평면) → contact 생성 (`inquiryType=null`), 폴더 생성 X (relocateContactFiles 미호출).
- **U3** — `onInquiryTypeClassified` 가 미가입 업체 contact 도 `ensureInquiryFolder` + `relocateContactFiles` 정상 호출.
- **U4** — `외부웹하드/{미가입업체}/목형의뢰/file.dxf` → `inquiryType='mold_request'` + `workNumber='YYMMDD-F-NNN'` 부여.
- **U5** — `getFolderTree` 회사 사용자 응답에서 `외부웹하드` root + 그 하위 (`외부웹하드/{미가입업체}/문의/...` 포함) 모두 제외.
- **U5b** — `getFolderTree` admin 사용자 응답에서 `외부웹하드` root + 모든 하위 가시 (회사 분기 차단이 admin 트리를 깨지 않는 회귀 가드).

### Service-level Integration

- **E2E-1** — Bug 2 + Bug 3 회귀 가드 통합 (service-level): `FolderAliasService.createApprovedAlias` 적용 → 기존 외부웹하드 contact 가입 업체 트리로 이동 (mock 으로 폴더 트리 reshape 시뮬) + `AutoContactService.detectAndCreate` 미가입 업체 신규 sync 시 `ensureInquiryRootFolder` 호출이 `companyId=null` root 로 fallback 하여 `외부웹하드/{미가입업체}/문의/...` 자동 생성됨을 service mock 호출 시퀀스로 검증.

## Follow-up (별도 task — 본 task 범위 외)

- **task 25-fu1**: `AutoContactService.detectAndCreate` 의 `try/catch` 좁힘 + Prisma engine 에러 admin notification + rethrow (재발 방지). 본 task 의 즉각 증상 해소에는 기여 X 이지만 future schema drift 가드 가치 있음.
- **task 25-fu2**: `normalizeCompanyName` 강화 — 괄호+숫자 패턴 (`(2265-1295)`, `[old]`) 등 자동 흡수. Bug 2 와 같은 케이스 자동 매칭. Trade-off: 의도된 폴더명 차이 (예: `(주)A` vs `A`) 오동작 위험. 별도 RFC 권장.
- **task 25-fu3 (보안)**: `ApiKeyGuard` 가 외부 X-API-Key 인증 시 `userType: 'admin'` 을 부여하므로 (api-key.guard.ts:62-67) 단순 `AdminGuard` 가 적용된 다른 12+ endpoint (companies/contacts/tasks/workers/folders/machines/storage/sessions/access-logs/api-key) 가 외부 통합 프로그램 호출에 우회된다. 본 task 25 PR 은 새 `POST /folder-aliases` 만 `AdminSessionGuard` 로 차단. 시스템 전반은 별도 RFC + 외부 프로그램 (LGU+ sync, 관리프로그램 등) 호환성 검증 필요. 검토 방향: (a) `ApiKeyGuard` 의 admin userType 부여 정책 재설계 — 외부 키 인증 시 별도 userType (`'integration'`) 부여 + AdminGuard 강화, (b) 또는 `AdminGuard` 자체를 `apiKeyInfo` 존재 시 거절로 강화 + 영향 endpoint 의 외부 호출 의도 검증.

## 변경 이력

- 2026-04-27 (1차) — task 25 신규 (가설 1: 마이그레이션 미적용).
- 2026-04-27 (2차) — dev DB 직접 진단 후 Bug 2 진단 폐기 + 폴더명 정규화 매칭 실패로 재진단. Phase 0 (마이그레이션 회복) 제거. Bug 2 정책을 admin 수동 alias 매핑 endpoint + 즉시 적용으로 교체.
- 2026-04-28 — `getFolderTree` 차단 강화 (U5 첫 실행 FAIL 발견 후 코드 수정 추가). 기존 `name in EXTERNAL_WEBHARD_FOLDERS` 만으론 root 만 차단되고 하위 폴더가 회사 사용자에게 누수됨. `companyVisibilityFilter` helper 도입 (`getFolderTree` + `getChildFolders` 공유) — name 매칭 + path startsWith 의 OR 로 root + 모든 하위 차단. admin 분기는 무영향. U5b 회귀 가드 추가.
- 2026-04-28 (review fix) — code-reviewer 가 발견한 AdminGuard 우회 가능성 (`ApiKeyGuard` 가 외부 X-API-Key 에 `userType: 'admin'` 부여) 차단. `AdminSessionGuard` 신설 (`webhard-api/src/auth/guards/admin-session.guard.ts`) + 새 `POST /folder-aliases` 에 적용. A8 회귀 가드 (Guard unit test) 추가. 다른 12+ endpoint 의 동일 취약점은 task 25-fu3 으로 분리.

## 참조

- `webhard-api/src/files/files.service.ts` — `confirmUpload` (line 210-281), `batchConfirmUpload` (line 287-400), `getUploadPresignedUrl` (line 164-189).
- `webhard-api/src/integration/orders/auto-contact.service.ts` — `matchCompanyInfo` (line 159-228), `createNewContact` (line 247-399).
- `webhard-api/src/contacts/contact-folder-sync.service.ts` — `onContactCreated` (line 48-78), `onInquiryTypeClassified` (line 84-111), `relocateAfterAliasApproved` (line 219-271).
- `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder` (line 1336-1464), `EXTERNAL_WEBHARD_FOLDERS` (line 36), `companyVisibilityFilter` (helper, getFolderTree + getChildFolders 공유).
- `webhard-api/src/folders/_lib/resolve-company-root.util.ts` — fallback 매칭 (companyId=null).
- `webhard-api/src/folders/_lib/company-name-match.util.ts` — `normalizeCompanyName`.
- `webhard-api/src/companies/companies.controller.ts` — `folder-aliases` endpoint 4개 + 본 task 의 신규 `POST /folder-aliases`.
- `webhard-api/src/companies/folder-alias.service.ts` — alias 서비스 + 신규 manual create 메서드.
- `docs/specs/features/external-sync-company-folder.md` — task 24, 본 task 의 직접 전제.
- `docs/specs/features/contact-webhard-folder.md` — `ContactFolderSyncService` 단일 진입점 정책.
- `docs/specs/features/webhard-system.md` — 회사 격리 / 폴더 가시성 reference.
- `docs/specs/features/auto-contact-exclude.md` — `webhard_auto_contact_excluded_folders` 정책 (변경 없음).
