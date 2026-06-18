# Google Drive 웹하드 저장소 전환 설계

## 상태

2026-05-29 브레인스토밍과 엔지니어링 리뷰를 거쳐 정리한 한국어 검토용 설계 문서입니다.

실행 계획, 코드 식별자, API route, 환경변수, 클래스명, DB field 이름은 영어 원문을 유지합니다.

2026-05-29 1차 구현 상태: `codex/google-drive-webhard-implementation` 브랜치에서 schema/migration, Drive storage provider, 업체 provisioning/retry, 업로드/다운로드/ZIP/share/trash/backup 분기, 주요 문의/도면/납품 웹하드 생산자, Next.js proxy, 개발 reset script까지 반영했습니다. 배포 전에는 실제 Shared Drive service account 환경변수로 migration/reset/provisioning/upload/download E2E 검증이 필요합니다.

## 목표

현재 자체웹하드의 저장소 backend를 Google Drive로 교체합니다. 단, YJ Laser 웹하드의 기존 제품 동작은 유지합니다.

이 변경은 Google Drive 공유 기능을 만드는 것이 아닙니다. 업체는 계속 YJ 웹하드 UI만 사용합니다. 접근 제어 경계는 계속 YJ 애플리케이션의 `companyId`, worker access check, admin guard입니다. Google Drive는 서버 내부 저장소 provider로만 사용합니다.

## 확정 결정

- 저장 위치는 Google Shared Drive를 사용합니다.
- 서버 API 접근은 Shared Drive 멤버로 추가된 service account를 사용합니다.
- service account JSON은 `GOOGLE_SERVICE_ACCOUNT_JSON`에 저장합니다.
- Shared Drive id는 `GOOGLE_DRIVE_SHARED_DRIVE_ID`에 저장합니다.
- 업체 사용자에게 Google Drive 직접 권한을 부여하지 않습니다.
- 업체 사용자에게 Google Drive 링크를 노출하지 않습니다.
- 신규 webhard 파일은 모두 Google Drive에 저장합니다.
- 현재 폴더 구조 규칙, `folderKind`, 업체 root, 문의 폴더, 완료 폴더, alias 규칙은 유지합니다.
- 프로젝트가 아직 운영 중이 아니므로 개발 데이터 reset을 허용합니다.
- 기존 R2 파일은 Google Drive로 마이그레이션하지 않습니다.
- 기존 개발용 webhard 파일, 폴더, 문의, 작업, 도면, 납품증빙 데이터는 reset합니다.
- 업체 계정과 업체 record는 보존합니다.
- 구현은 storage adapter architecture로 진행합니다.
- 내부 이름은 Drive 기준으로 명확히 전환합니다. 기존 R2, presigned, key 용어는 임시 compatibility layer에서만 허용하고 최종 cleanup phase에서 제거합니다.

## 범위 제외

- 기존 R2 파일을 Google Drive로 옮기지 않습니다.
- 업체에게 Google Drive 폴더 직접 접근 권한을 주지 않습니다.
- 업체가 Google Drive UI에서 직접 업로드하는 흐름은 지원하지 않습니다.
- Google Drive를 제품 UI로 사용하지 않습니다.
- 1차 범위에서 Drive UI 직접 변경 감지는 지원하지 않습니다.
- 고객에게 Drive share link를 노출하지 않습니다.
- production에서 destructive reset script를 실행하지 않습니다.
- 오래된 개발용 문의, 작업, 도면, 납품증빙 test data는 보존하지 않습니다.

## 현재 자체웹하드가 담당하는 기능

현재 웹하드는 단순 object storage가 아닙니다.

- `companyId` 기반 업체별 파일/폴더 접근 제어
- 관리자 전체 업체 접근
- 문의 visibility 기반 worker 파일 접근
- folder tree, breadcrumb, `folderKind`, materialized path
- 업체 root 및 기본 template folder 생성
- 문의 폴더 생성 및 파일 relocate
- 납품 완료 후 `{company}/문의/완료/` 하위로 이동
- upload confirm 및 `WebhardFile` metadata 생성
- download authorization 및 downloaded state 추적
- 미다운로드 badge 및 folder count 전파
- storage usage 표시
- file/folder rename, move, soft delete, restore, permanent delete
- search
- activity log
- share link
- preview route
- AutoContact
- 외부웹하드 sync routing 및 company alias mapping
- 공개 contact form attachment 등록
- DrawingRevision `webhardFileIds`
- Worker drawing upload/download
- delivery proof file 등록
- dashboard `웹하드` link 및 `/webhard?folderId=&fileId=` highlight

저장소 provider 변경 후에도 위 동작은 모두 유지되어야 합니다.

## 아키텍처

Browser 요청 흐름은 기존처럼 Next.js와 NestJS를 거칩니다.

```text
Browser
  -> Next.js /api/webhard/*
  -> NestJS /api/v1/files | folders | storage | contacts
  -> Storage provider boundary
     -> GoogleDriveStorageProvider
     -> R2StorageProvider only for temporary compatibility if needed
  -> Google Shared Drive
```

Google Drive API client는 storage provider 구현체에서만 import할 수 있습니다. `FilesService`, `FoldersService`, `ContactsService`, Worker service, Delivery service는 raw Drive client가 아니라 storage interface 또는 orchestration service에 의존해야 합니다.

## 데이터 모델

`webhard_files`와 `webhard_folders`는 계속 애플리케이션의 source of truth입니다. `path`에 Drive id를 억지로 넣지 않고 Drive 식별자를 별도 field로 추가합니다.

### `webhard_files`

추가 field:

- `storageProvider`: `google_drive` | `r2`
- `driveFileId`: nullable string
- `driveMimeType`: nullable string

유지 field:

- `id`
- `name`
- `originalName`
- `size`
- `mimeType`
- `folderId`
- `companyId`
- `uploadedBy`
- `inquiryNumber`
- `isDownloaded`
- `deletedAt`

`path`는 Drive id가 되면 안 됩니다. Drive-backed file의 storage operation은 `storageProvider + driveFileId`를 사용합니다. `path`는 logical/display path 또는 compatibility field로만 남길 수 있습니다.

### `webhard_folders`

추가 field:

- `storageProvider`: `google_drive` | `r2`
- `driveFolderId`: nullable string

유지 field:

- `id`
- `name`
- `parentId`
- `companyId`
- `path`
- `folderKind`
- `contactId`
- `deletedAt`

`path`는 breadcrumb, search, display를 위한 YJ logical materialized path로 유지합니다. Drive folder operation은 `driveFolderId`를 사용합니다.

### 업체 Drive provisioning

`companies`에 field를 추가하거나 별도 `company_drive_folders` table을 둡니다.

- `companyId`
- `driveRootFolderId`
- `driveProvisioningStatus`: `pending` | `ready` | `failed`
- `driveProvisioningError`
- `driveProvisioningLastAttemptAt`
- `driveProvisionedAt`

업체 승인은 Drive provisioning과 분리합니다. `driveProvisioningStatus=ready`가 되기 전까지 웹하드 접근은 fail-closed입니다.

## Google Drive API 요구사항

- Google Cloud project에서 Google Drive API를 enable합니다.
- service account를 생성합니다.
- service account를 대상 Shared Drive 멤버로 추가합니다.
- server auth는 `GOOGLE_SERVICE_ACCOUNT_JSON`을 읽습니다.
- Shared Drive 대상 호출은 `supportsAllDrives=true`를 포함합니다.
- Drive 범위 list/search 호출은 필요 시 `driveId`, `corpora=drive`를 사용합니다.
- Folder 생성은 MIME type `application/vnd.google-apps.folder`를 사용합니다.
- File/folder 배치는 `parents: [driveFolderId]`를 사용합니다.
- Upload는 Drive resumable upload session을 사용합니다.
- Blob download는 server를 통해 Drive file download를 수행합니다.
- 403/429 응답에는 exponential backoff를 적용합니다.

참고 공식 문서:

- https://developers.google.com/workspace/guides/create-credentials
- https://developers.google.com/workspace/drive/api/guides/about-shareddrives
- https://developers.google.com/workspace/drive/api/guides/enable-shareddrives
- https://developers.google.com/workspace/drive/api/guides/folder
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/guides/manage-sharing
- https://developers.google.com/workspace/drive/api/guides/limits

## Storage interface

기능 service를 바꾸기 전에 storage-neutral contract를 먼저 정의합니다.

핵심 operation:

- `createFolder`
- `renameFolder`
- `moveFolder`
- `deleteFolder`
- `createUploadSession`
- `confirmUploadedFile`
- `downloadFile`
- `getFileMetadata`
- `renameFile`
- `moveFile`
- `trashFile`
- `restoreFile`
- `deleteFile`

신규 file/folder의 기본 구현은 Google Drive입니다.

`presignedUrl`, `objectKey`, `multipart`, `path-as-key` 같은 R2 전용 개념은 새 Drive code로 새면 안 됩니다. migration 중 필요한 경우에만 temporary compatibility adapter에서 허용합니다.

## Provisioning flow

Provisioning은 관리자가 업체를 승인할 때 실행됩니다.

```text
Admin approves company
  -> update company approval state
  -> DriveProvisioningService.ensureCompanyDriveRoot(companyId)
  -> create or reuse company root folder in Shared Drive
  -> create default template folders
  -> create matching webhard_folders rows
  -> set driveProvisioningStatus=ready
```

기본 폴더는 기존 webhard template과 folder rule을 따릅니다.

```text
{company}/
  문의/
    완료/
  칼선의뢰/
  목형의뢰/
  ...
```

Provisioning은 멱등이어야 합니다.

- 기존 `driveRootFolderId`가 있으면 재사용합니다.
- 동일 logical path의 기존 `webhard_folders` row가 있으면 재사용합니다.
- Drive 이름 검색을 매번 하지 않고 저장된 `driveFolderId`를 재사용합니다.
- 실패 상세는 민감정보 없이 sanitized 형태로 기록합니다.

실패 동작:

- 업체 승인 상태는 유지합니다.
- `driveProvisioningStatus=failed`로 저장합니다.
- `driveProvisioningError`에는 안전한 요약만 저장합니다.
- 관리자 UI에는 실패 이유와 retry action을 표시합니다.
- 업체 웹하드 접근은 `ready` 전까지 fail-closed입니다.
- secret, service account JSON, token, upload session URL은 log나 UI에 절대 노출하지 않습니다.

## Upload flow

`WebhardFile`로 등록되는 모든 신규 파일은 Google Drive를 사용합니다.

```text
POST /files/upload-session or updated existing upload route
  -> validate actor and target folder access
  -> resolve webhard_folder.driveFolderId
  -> create Drive resumable upload session
  -> browser uploads file to session URL
  -> POST confirm endpoint
  -> verify Drive file metadata
  -> create drive-backed WebhardFile row
  -> run existing side effects
```

반드시 유지할 side effect:

- AutoContact trigger
- realtime `file:created` event
- badge invalidation
- storage usage invalidation
- folder updated timestamp propagation
- upload notification
- activity log entry

Batch upload도 같은 규칙을 따르며 bounded concurrency를 적용합니다.

## Download 및 preview flow

Download authorization은 계속 YJ application check로 처리합니다.

```text
GET /files/:id/download
  -> load WebhardFile
  -> verify admin/company/worker access
  -> stream or proxy Drive file from driveFileId
  -> client downloads with existing display filename rules
```

업체 사용자에게 durable Drive share link를 주지 않습니다. Preview route는 server-side로 Drive file을 읽고 YJ route 응답으로 preview를 반환합니다.

Downloaded state는 계속 DB의 `isDownloaded`와 `markDownloaded`가 소유합니다.

## 파일 및 폴더 작업

### 파일 작업

- Rename: Drive file rename + DB name update
- Move: Drive parent change + DB `folderId/companyId` update
- Batch move: 제한된 Drive operation + DB update + source/target folder realtime event
- Soft delete: DB `deletedAt`가 primary. Drive trash 사용 여부는 restore 정책과 충돌하지 않을 때만 선택
- Restore: DB row restore + Drive file location 검증
- Permanent delete: Drive file delete + DB hard delete

### 폴더 작업

- Create: Drive folder create + `webhard_folders` row 생성
- Rename: Drive folder rename + DB materialized path update
- Move: Drive parent change + DB materialized path update
- Delete: 기존 recursive soft delete semantics 유지 + Drive trash/delete 정책 일관 적용

Folder rename/move는 기존 slash-boundary descendant path update rule을 보존해야 합니다.

## 연동 시스템 요구사항

`WebhardFile` 또는 `WebhardFolder`를 생성하는 모든 경로는 Drive-backed로 전환되어야 합니다.

- `/webhard` upload
- folder upload
- public contact form attachment
- Contact creation
- inquiry type classification 및 file relocation
- DrawingRevision upload
- Worker drawing upload
- Worker file download
- Delivery proof upload
- Company dashboard webhard button
- Admin 및 Worker `웹하드에서 열기`
- AutoContact
- External webhard sync routing
- Folder alias mapping
- Search
- Undownloaded badge
- Storage usage
- Activity log
- Preview
- Share link
- Backup policy

URL 동작은 유지합니다.

```text
/webhard?folderId={webhardFolderId}&fileId={webhardFileId}
```

위 URL의 ID는 Google Drive ID가 아니라 YJ database ID입니다.

## 외부웹하드 sync

외부 sync program은 upload를 Drive-backed target folder로 routing해야 합니다.

요구사항:

- presign/upload-session route는 Drive upload session data와 target `folderId`를 반환합니다.
- confirm route는 같은 routing 결과를 독립적으로 검증하고 적용합니다.
- company alias matching은 계속 `CompanyFolderAlias` DB 정책이 소유합니다.
- 기존 external husk cleanup rule은 재검토합니다. Drive-backed implementation에서는 같은 husk 동작이 필요 없을 수 있지만 visibility와 routing guarantee는 유지해야 합니다.
- AutoContact는 Drive-backed batch confirm 이후 routed folder metadata를 받아야 합니다.

## 개발 데이터 reset

프로젝트가 아직 production 운영 전이므로 개발 데이터 reset을 허용합니다.

Reset이 보존하는 것:

- Company account
- Company record
- 명시 범위에 포함하지 않는 admin/worker account

Reset이 제거하는 것:

- 기존 `webhard_files`
- 기존 `webhard_folders`
- old webhard file/folder에 의존하는 inquiry/work/drawing/delivery proof development data
- 필요한 경우 test-only webhard log/sync state

Reset은 기존 R2 파일을 Google Drive로 마이그레이션하지 않습니다.

안전 요구사항:

- code-level production execution block
- 기본값은 dry-run
- destructive execution은 명시적 `--apply` 필요
- apply 전 deletion count 출력
- secret 출력 금지
- target Shared Drive 내 기존 YJ test folder cleanup은 explicit confirmation 후에만 실행

## Consistency 및 repair

Drive API call과 DB transaction은 함께 원자적으로 묶을 수 없습니다. 따라서 복구 가능한 consistency handling이 필요합니다.

`storage_sync_jobs` table을 새로 만들거나, 필요한 상태를 명확히 표현할 수 있다면 기존 `sync_logs`를 확장합니다.

최소 기록 항목:

- operation type
- entity type
- 가능한 경우 webhard file/folder id
- 가능한 경우 Drive file/folder id
- target folder id
- status
- retry count
- sanitized error
- next retry time

적용 대상:

- Drive file created but DB insert failed
- DB row created but Drive metadata verification failed
- Drive move/delete/rename failed after DB intent
- provisioning partial failure

## Error handling

- Google 403/429: exponential backoff 및 retry
- Google auth failure: fail closed + sanitized admin error
- `driveFolderId` 누락: empty folder fallback이 아니라 provisioning/config error
- `driveFileId` 누락: Drive-backed file이면 fail closed
- Drive metadata 없는 upload confirm: fail + repair job 기록
- Download failure: controlled API error 반환, Drive 내부 정보 노출 금지
- Worker/company auth failure: 기존 401/403 동작 유지

## Security

- `GOOGLE_SERVICE_ACCOUNT_JSON`을 log에 남기지 않습니다.
- access token을 log에 남기지 않습니다.
- Drive upload session URL을 log에 남기지 않습니다.
- company user에게 Drive permanent link를 반환하지 않습니다.
- company access는 YJ `companyId`로 제한합니다.
- admin/company/worker/API-key auth path는 분리 유지합니다.
- API-key integration endpoint는 명시적으로 허용된 endpoint만 사용합니다. generic list access를 허용하지 않습니다.
- reset script는 production 차단을 유지합니다.
- admin-facing provisioning error는 sanitized 형태만 표시합니다.

## Test plan

### Backend unit 및 contract test

Drive provider:

- service account JSON parsing
- Shared Drive id usage
- `supportsAllDrives=true` usage
- folder create/reuse
- upload session creation
- metadata fetch after upload
- download stream
- rename/move/delete
- 403/429 retry/backoff

Files/Folders services:

- Drive-backed `WebhardFile` creation
- Drive-backed `WebhardFolder` creation
- upload confirm side effect
- batch upload/confirm
- download by `driveFileId`
- rename/move/delete가 Drive와 DB를 함께 갱신
- company user가 다른 업체 file에 접근하지 못함
- folder path update가 slash-boundary rule을 보존
- badge 및 storage usage는 계속 DB-owned

Provisioning/reset:

- company approval starts provisioning
- provisioning failure records status/error
- retry transitions failed to ready
- company webhard access is fail-closed until ready
- reset blocks production
- reset dry-run reports counts
- reset apply preserves companies and removes scoped development data

Cross-system regression:

- public contact form attachment creates Drive-backed `WebhardFile`
- Contact creation creates inquiry folder
- inquiry classification relocates files
- DrawingRevision saves `webhardFileIds`
- Worker upload/download respects worker access
- Delivery proof creates a Drive-backed file in inquiry folder
- AutoContact still fires after confirm
- external sync routing uses Drive target folders

### Frontend 및 E2E

- Admin approval leads to Drive provisioning ready
- Company login shows only its folder tree
- Company cannot see another company files/folders
- Upload/download/rename/move/delete still works
- Folder upload works
- Undownloaded badge appears and clears after download
- Search finds Drive-backed DB files
- `/webhard?folderId=&fileId=` highlights the target file
- Public contact form submission links files to webhard
- Worker additional drawing appears in timeline and webhard
- Delivery proof appears in dashboards and webhard
- Admin sees provisioning failure reason and retry action

## Performance 및 operations

- live webhard listing source로 Drive list/search를 사용하지 않습니다.
- list, search, badge count, storage usage, folder tree는 YJ DB를 사용합니다.
- provisioning 및 batch Drive operation에는 bounded concurrency를 적용합니다.
- 저장된 `driveFolderId`를 재사용하고 Drive name lookup 반복을 피합니다.
- Drive quota error에는 backoff를 적용합니다.
- 가능한 경우 download는 stream 처리합니다.
- Drive download proxy로 server bandwidth가 증가할 수 있으므로 관찰합니다.
- full Drive external-change ingestion은 운영 필요가 생기기 전까지 후속 phase로 둡니다.

## Implementation phases

### Phase 0: Google 및 environment setup

- Google Cloud project 생성/확인
- Google Drive API enable
- service account 생성
- service account를 Shared Drive에 추가
- `GOOGLE_SERVICE_ACCOUNT_JSON` 추가
- `GOOGLE_DRIVE_SHARED_DRIVE_ID` 추가
- secret-safe error를 포함한 local env validation 추가

### Phase 1: Schema 및 interfaces

- `webhard_files`, `webhard_folders`, company provisioning state에 Drive field 추가
- storage provider interface 정의
- Google Drive provider 추가
- provider behavior mock test 추가

### Phase 2: Development reset 및 provisioning

- production block과 dry-run을 가진 reset script 추가
- development webhard/contact/work/drawing/delivery proof data reset
- Drive provisioning service 추가
- company root 및 template folder 생성
- admin retry/status surface 추가

### Phase 3: Files/Folders core

- upload session, confirm, download, rename, move, delete, restore 전환
- folder create, rename, move, delete 전환
- query, search, badge, storage usage는 DB 기반으로 유지
- repair/outbox logging 추가

### Phase 4: Cross-system integration

- Public contact form
- Contact folder sync
- Drawing revisions
- Worker upload/download
- Delivery proof
- Company dashboard links
- Admin/Worker open-in-webhard
- AutoContact
- External sync routing 및 alias flow

### Phase 5: UI 및 E2E hardening

- `/webhard` upload/download UX를 Drive session 기준으로 수정
- admin provisioning status 및 retry UI 수정
- targeted unit test, backend typecheck, frontend typecheck 실행
- webhard, contact form, worker, delivery proof E2E smoke 실행
- 더 이상 필요 없는 temporary R2 naming compatibility 제거

## Open risks

- Drive upload session은 R2 presigned PUT과 동작이 달라 frontend upload helper 변경이 필요할 수 있습니다.
- Drive API quota가 bulk provisioning 및 batch upload를 늦출 수 있습니다.
- server-proxied download는 backend bandwidth를 늘릴 수 있습니다.
- reset scope가 많은 table을 건드리므로 apply 전 검토가 필요합니다.
- 기존 코드가 `path`를 R2 key로 사용하는 숨은 위치가 있을 수 있으므로 모두 찾아 전환해야 합니다.

## 반영된 review finding

- `path`를 overload하지 않고 provider-aware storage reference를 사용합니다.
- Drive/DB split-brain case를 위해 repair/outbox logging을 추가합니다.
- 개발 reset은 허용하되 production execution은 code-level로 차단합니다.
- company approval과 Drive provisioning을 분리하고, 관리자에게 sanitized failure reason 및 retry를 제공합니다.
- Drive API call은 provider/provisioning service에 격리합니다.
- 내부 명명은 Drive 기준으로 전환하고, compatibility는 필요한 곳에만 임시로 둡니다.
- feature service 수정 전에 storage interface를 먼저 정의합니다.
- webhard, contacts, worker, delivery, external sync, reset 전체 regression test coverage를 포함합니다.
