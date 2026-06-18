# 외부웹하드 폴더 → 가입 업체 폴더 통째 이전 + 신규 동기화 routing (task 26)

## 개요·배경

task 24 (external-sync-company-folder) 가 alias 승인 시 미통합 Contact 의 파일을 업체 폴더로 이동하도록 했고, task 25 (webhard-visibility-and-external-inquiry-fix) 가 admin 매뉴얼 매핑 endpoint 를 도입했지만, 두 task 모두 다음 두 가지를 남겨두었다:

1. **외부웹하드 트리에 빈 폴더 잔존**: `relocateAfterAliasApproved` 가 Contact 단위 파일 이동만 수행 → `WebhardFolder` row (예: `외부웹하드/대성목형/`, `외부웹하드/대성목형/칼선의뢰/`) 와 그 하위 빈 폴더 트리는 그대로 남는다.
2. **신규 동기화도 항상 외부웹하드 경로 경유**: Electron 의 `yjlaser-uploader.ts:311` `ensureFolderPath` 가 `[UPLOAD_ROOT_FOLDER, ...rawSegments]` 로 무조건 `외부웹하드/...` prefix 를 붙여 R2 PUT → 직후 DB 메타만 `{업체}/문의/...` 로 옮김. 매칭이 이미 성공할 수 있는 가입 업체 파일도 한 번 외부웹하드 트리에 들어갔다가 옮겨지는 atomic-but-2-step 흐름.

본 task 는 두 가지를 단일 흐름으로 정리한다:

- 신규 동기화: 매칭된 가입 업체 파일은 **처음부터 업체 폴더로 직접 R2 PUT** (`/files/presigned-url` endpoint 의 서버 측 routing).
- 기존 누적분: alias 승인 시 폴더 트리 통째로 가입 업체 폴더에 합치고 빈 외부 폴더는 cascade soft delete.

운영 진입점은 `/admin/integration/companies` (업체관리 페이지) 로 통합. 별도 `/admin/integration/folder-aliases` 탭은 동일 페이지로 redirect (UI spec 별도: `admin-folder-mapping-ui.md`).

## 정책 — 신규 동기화 routing (Phase 1.5)

`POST /api/v1/files/presigned-url` 의 서버 측에서 매칭 시도 → 성공 시 다른 folderId/key 로 응답. Electron 은 응답의 `folderId` 를 `confirm` 호출에 그대로 사용.

### 라우팅 알고리즘

```
client → POST /files/presigned-url { filename, contentType, size, folderId }
  ↓
서버:
  folder = WebhardFolder.findUnique(folderId)
  isExternalSubtree = folder.path startsWith '/외부웹하드/'
  if !isExternalSubtree → 기존 흐름 (folderId 그대로)
  else:
    rootSegment = folder.path.split('/')[2]   # '외부웹하드/{X}/...' 의 X
    matched = matchCompanyInfo(rootSegment)
    if !matched → 기존 흐름 (외부웹하드 경로 그대로)
    else:
      targetFolderId = ensureRoutingTarget(matched.id, folder)
      key = computeR2Key(targetFolderId, filename)
      url = R2.presign(key)
      return { url, key, folderId: targetFolderId, redirected: true }
```

`ensureRoutingTarget` 정책:

- folder 의 path 마지막 segment 가 `'칼선의뢰' | '목형의뢰' | '문의'` 등 inquiryType 분류 가능한 세그먼트면 → 업체 루트 하위 동명 template 폴더 보장 후 그 id 반환
- 그 외 (분류 불가능한 임의 segment) → **업체 루트 직하** (folder.name 그대로 mirror) 반환. 폴더가 없으면 lazy create (`folderKind='generic'`).

### 응답 형식 변경

`PresignedUrlResponse` (`webhard-api/src/files/files.service.ts`):

```ts
// 기존
interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresAt: string;
}

// 변경 후
interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresAt: string;
  folderId: string; // 서버가 routing 한 결과 (변경되었으면 새 id, 아니면 요청값 echo)
  redirected: boolean; // routing 발동 여부 (운영·디버깅 시 추적용)
}
```

### Electron 측 변경

`외부웹하드동기화프로그램/src/core/webhard-uploader/yjlaser-uploader.ts:341` `uploadFile`:

- presigned URL 응답에서 `folderId` 를 받아 `confirm` body 의 `folderId` 로 사용.
- 응답에 `folderId` 가 없으면 (구버전 서버 호환) 기존 `params.folderId` fallback.

```diff
const { data: presignRes } = await this.apiPost<PresignedUrlResponse>(
  '/files/presigned-url',
  { ... folderId: params.folderId }
)
+ const actualFolderId = presignRes.folderId ?? params.folderId

// PUT 변경 없음

const confirmBody = {
  key: presignRes.key,
  ...
- folderId: params.folderId,
+ folderId: actualFolderId,
}
```

## 정책 — 기존 누적분 통째 이전 (Phase 1)

### `migrateExternalFolderTreeToCompany` 신규 메서드

`webhard-api/src/contacts/contact-folder-sync.service.ts` 에 신규 추가. `relocateAfterAliasApproved` 가 Contact 단위 파일 이동을 마친 직후 호출되어 폴더 트리 자체를 옮긴다.

**시그너처:**

```ts
async migrateExternalFolderTreeToCompany(
  externalRootFolderId: string,
  targetCompanyId: number,
  tx?: Prisma.TransactionClient
): Promise<{
  movedFolders: number;
  movedFiles: number;
  deletedExternalFolders: number;
  conflicts: Array<{ originalName: string; renamedTo: string }>;
}>
```

**알고리즘 (BFS):**

1. `externalRootFolderId` 가 `외부웹하드/{X}/` root 인지 검증 (`path startsWith '/외부웹하드/'`, depth=2). 아니면 `BadRequestException`.
2. 해당 root 의 모든 하위 (folder + file) 를 BFS 로 수집 (depth 무제한, deletedAt=null).
3. 가입 업체의 root folder 확보 (`resolveCompanyRoot` + `initializeCompanyFolders` lazy fallback).
4. 하위 폴더별 처리:
   - **이름이 template 세그먼트** (`'칼선의뢰' | '목형의뢰' | '문의' | '완료'`) 와 일치 → 업체 루트 하위 동명 template 폴더와 **병합** (자식들의 parentId 만 갱신).
   - **이름이 inquiry-{O} 형태** (`folderKind='inquiry'`) → 업체 루트 하위 `문의/` 폴더 아래로 이동.
   - **그 외 임의 폴더** → 업체 루트 직하로 이동. 충돌 시 `(1)`, `(2)` 자동 rename (기존 `moveFolder` 로직 재사용).
5. 폴더별 `WebhardFolder.companyId / parentId / path` 갱신 + `updateDescendantPaths` 호출 (R2 key 영향 없음).
6. 파일별 `WebhardFile.companyId` 갱신 (folderId 는 부모 폴더가 옮겨지면 자동 정합).
7. Contact 가 해당 폴더 트리를 참조하는 경우 `Contact.companyId / companyName` 갱신 — `relocateAfterAliasApproved` 가 이미 처리한 contact 는 멱등하게 skip (`companyId IS NULL` 조건).
8. 모든 자식이 비워진 외부 폴더 (`외부웹하드/{X}/...` 트리 전체) 를 cascade soft delete (`deletedAt = now`). root 자체도 포함.
9. `eventsGateway.emitGlobal({ type: 'folder:migrated', ... })` 1회 발행.

### 미분류 Contact 처리 — 업체 루트 직하 (결정 #1)

`relocateAfterAliasApproved` 의 기존 정책 (task 24): `inquiryType=null` Contact 는 skip 카운트로 분리하고 외부웹하드에 그대로 두었다.

본 task 에서 변경: **`inquiryType=null` Contact 도 강제 이동**. 이동 위치는 분류 확정된 contact 와 다르게 결정한다:

| inquiryType                                          | 정착 위치                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `cutting_request` / `mold_request` / `laser_cutting` | `{업체}/문의/문의-{O}/` (기존 `ensureInquiryFolder` 경로)                                                          |
| `null` (미분류)                                      | **`{업체}/{원본 폴더명}/` 업체 루트 직하** (`migrateExternalFolderTreeToCompany` 의 그 외 임의 폴더 케이스에 포함) |

근거: 운영자가 분류 작업할 때 한눈에 보고 후속 분류·이동을 결정하기 위함. `문의/` 하위 임시 컨테이너에 두면 이미 분류 확정된 contact 와 섞여 혼란.

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

### Phase C — admin husk 정리 UI (task 27)

**API**:

- `GET /api/v1/folders/external-husk` (AdminGuard) — 정리 후보 목록 (depth=2 + companyId IS NULL + 자식·파일 0)
- `DELETE /api/v1/folders/external-husk/:rootId` (AdminGuard) — 단일 husk cascade soft-delete

**2026-05-10 audit update**: 후보 목록 조회는 root별 count 루프를 쓰지 않는다. `GET /folders/external-unmatched`는 외부 subtree 관계를 bulk 조회하고 `webhardFile`/`Contact` groupBy로 root별 누적 count를 계산한다. `GET /folders/external-husk`는 목록 후보 판정만 수행하므로 depth=2 root의 **직접 자식/직접 파일 0** 조건을 bulk로 검사하고, descendants 파일 검증은 `DELETE` 안전 가드에서 수행한다.

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

### task 28 — confirm-routing-consistency (2026-04-30)

**문제**: task 26 Phase 1.5 의 `tryRouteExternalUpload` 가 `getUploadPresignedUrl` 응답에는 redirected folderId 를 박지만, 후속 `confirmUpload` 가 원본 husk folderId 를 사용해 R2 path 와 DB row 가 분리되는 split-brain 결함.

**해결**: `confirmUpload` 와 `batchConfirmUpload` 에 동일 routing 적용. 두 endpoint 가 독립적으로 routing 검사 → R2 와 DB 일관성 보장.

**구현**:

- `confirmUpload`: dto.folderId 로 `tryRouteExternalUpload` 호출 → routed 값 있으면 `WebhardFile.create` 의 folderId/companyId 사용
- `batchConfirmUpload`: per-file routing 캐시 (배치 내 동일 folderId 는 1회만 lookup) → createMany 의 data 행마다 effective folderId/companyId 적용
- 실패 정책 (양쪽): try/catch + warn 로그 + 원본 folderId fallback (R2 PUT 이미 완료라 confirm 막지 않음)
- emitToFolder / emitToFolderBatched / propagateUpdatedAt 모두 effective folderId 기준

**불변 규칙** (변경 없음):

- task 27 husk 정책 — husk 는 deletedAt=null 유지
- R2 path 미변경 (이미 회사 경로로 박힌 파일 그대로)
- presigned-url 흐름 — task 26 R1~R5 그대로
- companyId 상속 precedence — task 25 F1~F5 그대로 (redirected 시 routed.companyId 가 우선)

**기존 misrouted 파일 회복**: admin UI `/admin/integration/companies` → "등록된 매핑" 패널의 [재마이그레이션] 클릭. `migrateExternalFolderTreeToCompany` BFS 가 husk 트리 순회 → folderId=husk 인 파일 모두 회사 폴더로 이동 (R2 path 미변경).

**회복 검증 SQL**:

```sql
SELECT f.id, f.name, f.path, f.folder_id, fold.path AS folder_path, f.company_id
FROM webhard_files f
LEFT JOIN webhard_folders fold ON fold.id = f.folder_id
WHERE f.path LIKE 'webhard/company-%'
  AND fold.path LIKE '/외부웹하드/%'
  AND f.deleted_at IS NULL;
```

배포 + [재마이그레이션] 후 0건이면 회복 완료.

### task 30 — external-batch-auto-contact-observability (2026-05-08)

**문제**: task 28 에서 `batchConfirmUpload` 가 외부웹하드 husk folderId 를 업체 folderId 로 redirect 하도록 고쳤지만, 자동문의 배치 훅에는 원본 `folderInfoMap` 만 전달했다. 그 결과 `data.folderId` 는 routed folderId 인데 `folderMap.get(item.folderId)` 는 실패하고, `batchTriggerAutoContact` 가 해당 파일을 조용히 skip 할 수 있었다. 외부웹하드 동기화처럼 batch confirm 을 쓰는 경로에서 “파일은 업체 웹하드에 업로드됐지만 문의가 생성되지 않음”으로 보인다.

**해결**:

- `batchConfirmUpload` 가 `data` 생성 후 실제 저장된 folderId 목록을 기준으로 routed folder metadata 를 추가 조회하고, 원본 map 과 병합한 `autoContactFolderMap` 을 `batchTriggerAutoContact` 에 전달한다.
- `batchTriggerAutoContact` 는 folder metadata 누락 시 warn 로그를 남긴 뒤 skip 한다.
- `AutoContactService.createNewContact` 는 매칭된 Company id 또는 confirm 단계에서 전달된 `companyId` 를 `Contact.companyId` 에 기록한다. 미가입 업체는 기존처럼 null 유지.
- presign/confirm/batch confirm/AutoContact detect·classify·company resolve·create·folder sync 단계에 운영 로그를 추가한다. presigned URL, token, API key 는 로그에 남기지 않는다.

**검증**:

- `FilesService.batchConfirmUpload routing consistency` BC3: redirected batch file 의 routed folder metadata 가 AutoContact 훅에 전달됨.
- `AutoContactService.createNewContact — matchCompanyInfo` A1: alias 매칭 시 `Contact.companyId` 가 alias company id 로 저장됨.

### 롤백 단위 — alias 1건당 1 tx (결정 #2)

`createApprovedAlias` / `approve` 가 단일 `prisma.$transaction` 으로 묶어 호출:

```
$transaction:
  alias upsert (status='approved')
  relocateAfterAliasApproved(folderName, companyId, tx)
  migrateExternalFolderTreeToCompany(externalRootFolderId, companyId, tx)
```

- alias 1건 처리 도중 어느 단계에서든 throw → 그 alias 만 롤백.
- 일괄 승인 (admin UI 에서 여러 pending 한꺼번에 처리) 시 alias 사이는 트랜잭션 분리 — 1건 실패해도 다른 alias 는 진행.
- 응답에 `{ alias, backfill: { relocated, skipped, movedFolders, movedFiles, deletedExternalFolders, conflicts } }` 형태로 결과 반환.

## DB 모델 변경

없음. 기존 모델 그대로 사용:

- `WebhardFolder.parentId / companyId / path / deletedAt` 갱신
- `WebhardFile.folderId / companyId` 갱신 (path 는 변경 없음 — R2 key 의미)
- `Contact.companyId / companyName` 갱신
- `CompanyFolderAlias` 변경 없음

## API 변경

### `POST /api/v1/files/presigned-url` — routing 추가

응답 형식 확장 (`folderId`, `redirected` 필드 추가). 기존 응답 fields 는 무변경.

### `POST /api/v1/companies/folder-aliases` 와 `POST /:id/approve` 동작 보강

응답에 `migration` 필드 추가:

```ts
interface ApproveResponse {
  alias: CompanyFolderAlias;
  backfill?: {
    relocated: number;
    skipped: number;
    // 신규 (task 26):
    movedFolders: number;
    movedFiles: number;
    deletedExternalFolders: number;
    conflicts: Array<{ originalName: string; renamedTo: string }>;
    // 신규 (task 26 hardening — 2026-04-30):
    externalRootFound: boolean;
  };
}
```

`externalRootFound` 의미:

- `true` — `/외부웹하드/{folderName}` depth=2 root 폴더가 존재해 migrate 단계가 실행됨.
- `false` — root 미존재 (이름 불일치 또는 이미 cascade soft delete 됨). migrate skip + 카운트 0. 운영 UI 는 이 신호로 "외부 폴더 트리를 찾지 못했습니다" 가이드 표시.

**task 27 변경 (2026-04-30)**: `deletedExternalFolders` 는 호환을 위해 유지하되 항상 `0`. 외부 husk 가 cascade delete 되지 않기 때문. 운영 토스트는 `movedFolders / movedFiles` 만 의미 있음.

### Lookup 정책 hardening (2026-04-30)

`runCascadeBackfill` 의 외부 root lookup 은 **depth=2 정확 매칭**:

```ts
// 변경 전 (느슨)
where: { name: folderName, path: { startsWith: '/외부웹하드/' }, deletedAt: null }
// 변경 후 (정확)
where: { name: folderName, path: `/외부웹하드/${folderName}`, deletedAt: null }
```

근거: 외부웹하드 트리 깊은 경로 (`/외부웹하드/foo/{folderName}`) 에 동명 폴더가 있으면 이전 쿼리는 root 가 아닌 폴더를 잡아 `migrateExternalFolderTreeToCompany` 의 segments.length !== 2 검증에서 throw 가능. depth=2 path 정확 매칭으로 false-match 차단.

신규 endpoint 없음.

## 불변 규칙

1. **단일 진입점 보존**: 외부에서 `migrateExternalFolderTreeToCompany` / `ensureInquiryFolder` / `relocateContactFiles` 직접 호출 금지. `relocateAfterAliasApproved` 만 진입점 — 본 task 의 신규 메서드도 같은 서비스 내부에서 chained call.
2. **R2 key 불변 정책 유지**: 폴더 이동·rename 시 `WebhardFile.path` (R2 object key) 는 변경하지 않는다. 이미 발급된 presigned URL 은 계속 유효. 이건 task 18 의 §W.1 규칙 그대로.
3. **신규 동기화 routing 의 R2 key**: routing 발동 시 새로 발급되는 key 는 업체 폴더 경로 (`대성목형/...`). routing 미발동 (매칭 실패) 시 기존 외부웹하드 경로 그대로. 즉 **R2 key 는 PUT 시점의 폴더 위치를 반영**한다 — 이후 폴더 이동·rename 에는 영향받지 않는다.
4. **alias 단위 멱등성**: `migrateExternalFolderTreeToCompany` 도 멱등 — 이미 옮겨진 contact·폴더는 자동 skip (`Contact.companyId IS NULL`, `WebhardFolder.deletedAt IS NULL` + path startsWith '/외부웹하드/' 조건).
5. **routing 의 fallback**: `getPresignedUrl` 에서 매칭 실패 또는 `ensureRoutingTarget` 예외 → 기존 흐름 (외부웹하드 경로) 그대로 진행. routing 실패가 업로드 자체를 막지 않는다.
6. **외부웹하드 가시성 정책 유지**: task 25 의 `companyVisibilityFilter` 그대로 — 회사 사용자에게 외부웹하드 root 와 모든 하위 차단. 본 task 가 외부 폴더를 soft delete 한 이후에도 deletedAt 조건으로 자연스럽게 제외됨.

## 테스트 케이스 list

### Phase 1 — `contact-folder-sync.service.spec.ts`

- **M1** — `migrateExternalFolderTreeToCompany` template 폴더 병합: 외부 `칼선의뢰/` → 업체 루트 동명 폴더로 자식 이동, 외부 `칼선의뢰/` soft delete.
- **M2** — `migrateExternalFolderTreeToCompany` inquiry 폴더 이동: `folderKind='inquiry'` 폴더 → 업체 루트 하위 `문의/` 로 이동.
- **M3** — `migrateExternalFolderTreeToCompany` 임의 폴더 충돌 rename: 업체 루트에 동명 폴더 있으면 `(1)`, `(2)` 자동 suffix.
- **M4** — 미분류 Contact 강제 이동 (결정 #1): `inquiryType=null` Contact 의 폴더가 `{업체}/{원본명}/` 으로 이동, `companyId / companyName` 갱신.
- **M5** — 빈 외부 폴더 cascade soft delete: 자식이 모두 빠진 후 외부 root 부터 leaf 까지 모두 `deletedAt` 설정.
- **M6** — 멱등성: 동일 alias 재호출 시 `migrated=0`, `skipped=N` (이미 처리된 항목 자동 제외).
- **M7** — 트랜잭션 롤백 (결정 #2): step 7 에서 throw 시 step 1~6 모두 롤백 (folder/file/contact 원상복구).
- **M8** — `WebhardFile.path` (R2 key) 불변 검증: 이동 후 R2 key 가 외부웹하드 경로 그대로 유지.
- **M9** — `Contact.webhardFolderId` 참조 정합: 폴더 soft delete 후에도 contact 가 폴더 참조 유지 (deletedAt 으로 자연스럽게 제외).

### Phase 1.5 — `files.service.spec.ts`

- **R1** — `getPresignedUrl` routing: 외부웹하드 하위 folderId + 매칭 성공 → 응답에 `folderId` 가 업체 폴더 id, `redirected=true`.
- **R2** — routing fallback: 매칭 실패 → 응답 `folderId` 가 요청값 echo, `redirected=false`.
- **R3** — routing target lazy create: 업체 루트에 동명 template 폴더 없으면 자동 생성.
- **R4** — non-external folderId: `/외부웹하드/` 하위 아닌 folderId 는 routing 발동 안 함.
- **R5** — `ensureRoutingTarget` 예외 흡수: 내부 throw 시 기존 흐름 fallback (응답에 `redirected=false`, 요청 folderId echo).

### Phase 2 — `folders.controller.spec.ts` + `folders.service.spec.ts`

- **F1** — `GET /folders/external-unmatched` 반환 조건: `companyId IS NULL` + `path startsWith '/외부웹하드/'` + `folderKind in (root, generic)` + `approved alias 없음`.
- **F2** — 각 폴더의 통계 (Contact 누적 수, 파일 누적 수) 정확성.

### Phase 3 — `companies/_components/*.test.tsx`

- **U1** — `FolderMappingSection` pending/approved/unmatched 패널 렌더 + 매뉴얼 폼 동작.
- **U2** — 매뉴얼 등록 → 응답의 `migration` 카운트 toast 노출.

### Phase 5 — service-level integration

- **E2E-1** — 대성목형 시나리오: ① 외부 동기화로 contact 5건 누적 (companyId=null). ② admin 이 `/admin/integration/companies` 에서 매뉴얼 매핑 (folderName='대성목형', companyId=4, cascadeBackfill=true). ③ 응답: `{ relocated: 5, movedFolders: N, movedFiles: M, deletedExternalFolders: N }`. ④ 업체 폴더 트리 조회 시 `대성목형/문의/...` 와 `대성목형/원본임의폴더/` 모두 보임. ⑤ 외부웹하드 트리에 `대성목형/` 사라짐 (deletedAt). ⑥ 신규 동기화 1건 → R2 key 가 `대성목형/문의/...` 로 박힘 (routing 동작). ⑦ 외부웹하드 폴더 재생성 안 됨.
- **E2E-2** — admin 매뉴얼 등록 멱등: 동일 (folderName, companyId) 재호출 시 alias status 변동 없음, migration 카운트 모두 0.

## 운영 절차

1. admin 이 `/admin/integration/companies` 진입.
2. "외부웹하드 폴더 매핑" 섹션의 `UnmatchedFoldersPanel` 에서 미매칭 외부 폴더 확인.
3. "이 업체에 매핑" 버튼 클릭 → 업체 검색 → 확인.
4. 응답 toast 로 이동 결과 확인 (Contact N건, 폴더 M개, 파일 K개).
5. 업체 상세 페이지 (`/admin/integration/companies/[id]`) 에서 매핑된 alias 와 통계 확인.

## 변경 이력

- 2026-04-29 — task 26 신규: 외부 폴더 통째 이전 + 신규 동기화 routing + 미분류 강제 이동 + cascade 삭제 정책.
- 2026-04-30 — task 27: husk 정책 (cascade soft-delete 제거) + admin husk 정리 UI.
- 2026-04-30 — task 28: confirm-routing-consistency. `confirmUpload` / `batchConfirmUpload` 에도 routing 적용 → R2 path 와 DB folder_id split-brain 회복.

## 참조

- `webhard-api/src/contacts/contact-folder-sync.service.ts:219` `relocateAfterAliasApproved` (task 24).
- `webhard-api/src/folders/folders.service.ts:1357` `ensureInquiryFolder`, `:1654` `relocateContactFiles`.
- `webhard-api/src/files/files.service.ts` `getPresignedUrl` (Phase 1.5 routing 추가 위치).
- `외부웹하드동기화프로그램/src/core/webhard-uploader/yjlaser-uploader.ts:341` `uploadFile` (Phase 1.5 응답 folderId 사용).
- `webhard-api/src/companies/folder-alias.service.ts:53,122` `approve`, `createApprovedAlias` (Phase 1 chained call 추가).
- `docs/specs/features/external-sync-company-folder.md` — task 24 정책 (본 task 가 폴더 트리 이전 + 신규 routing 으로 보강).
- `docs/specs/features/webhard-visibility-and-external-inquiry-fix.md` — task 25 정책 (본 task 가 cascade 삭제 + routing 으로 잔존 외부 폴더 정리).
- `docs/specs/features/contact-webhard-folder.md` — 단일 진입점 정책. 본 task 가 그 위에 외부 폴더 이전 step 을 추가.
- `docs/specs/features/drawing-workflow.md` §W.1 — R2 key 불변 정책 그대로 유지.
- `docs/specs/features/admin-folder-mapping-ui.md` — 본 task 의 UI/UX 정책 (별도 spec).
