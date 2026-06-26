# Webhard API — 파일/폴더 관리

Base URL: `/api/v1`

Browser-facing Next routes under `/api/webhard/*` proxy or adapt selected NestJS/R2 flows for the web UI. They must preserve session authentication and must not expose presigned URLs, API keys, tokens, or secrets in response bodies.

## 인증

| Header         | 설명                                   | 필수                         |
| -------------- | -------------------------------------- | ---------------------------- |
| `X-API-Key`    | API 키 (ApiKeyGuard)                   | 세션 없는 외부 프로그램 요청 |
| `Cookie`       | `admin-session` 또는 `company-session` | 브라우저 세션 요청           |
| `X-Company-Id` | 업체 ID (CompanyAccessGuard)           | Storage·Sync 제외 전부       |

> Storage 모듈의 브라우저/API endpoint는 `ApiKeyGuard + CompanyAccessGuard`를 적용한다. `POST /storage/drive-change-webhook`은 Google Drive가 호출하는 별도 endpoint라 세션/업체 가드 대신 Drive channel token 검증을 사용한다. Sync 모듈은 `ApiKeyGuard`만 적용.
> `folders/config/*` 엔드포인트는 `AdminGuard` 추가 적용.
> `GET /storage/performance`는 `AdminGuard` 추가 적용.
> Backup 모듈은 `ApiKeyGuard + BackupAdminGuard`를 적용한다. Admin session은 허용, company session은 거부, API key는 endpoint별 명시 백업 스코프가 필요하다.
> `CompanyAccessGuard` 뒤의 Webhard files/folders endpoint에서 `X-API-Key`는 integration principal로만 처리한다. API key 호출은 `POST /files/presigned-url`, `POST /files/confirm`, `POST /files/batch/upload`, `POST /files/batch/confirm`, `POST /files/mark-downloaded`, `POST /folders/initialize`, `POST /share-links/validate`, `POST /share-links/download/stream`처럼 명시적으로 integration 허용 메타데이터가 붙은 endpoint만 통과한다. `GET /files/:id/download`, `GET /files/:id/download/stream`, `GET /share-links`, `POST /share-links`, `GET /folders` 같은 generic company-scoped endpoint는 API key-only 요청으로 호출할 수 없다.

---

## 업로드 플로우

### 단건 업로드

```
POST /files/presigned-url  →  (Google Drive resumable upload URL 직접 업로드)  →  POST /files/confirm
```

### 배치 업로드

```
POST /files/batch/upload  →  (Google Drive resumable upload URL 직접 업로드 x N)  →  POST /files/batch/confirm
```

### 멀티파트 업로드 (legacy R2 대용량 파일)

```

> 신규 웹하드 업로드 응답은 `provider='google_drive'`, `uploadUrl`, `uploadHeaders`, `driveFileId`를 포함할 수 있다. 클라이언트는 `uploadUrl`로 PUT 후 confirm/batch-confirm에 `storageProvider='google_drive'`와 `driveFileId`를 전달해야 한다. Next.js Drive upload proxy가 `driveUploadProof`를 반환한 경우 client는 confirm/batch-confirm에 함께 전달할 수 있으며, NestJS는 proof signature, storage file id, expiry, expected parent digest가 모두 맞을 때 confirm-time Drive metadata GET을 생략한다. proof가 없으면 기존 Drive API metadata 검증을 수행한다.
POST /files/multipart/initiate
  → POST /files/multipart/presign   (반복: 파트별)
  → POST /files/multipart/complete
  (또는) → POST /files/multipart/abort
```

---

## Files

### GET /api/v1/files

파일 목록 조회 (페이지네이션).

**Guard:** ApiKeyGuard + CompanyAccessGuard + AdminGuard

**Query Parameters:**

| 필드           | 타입          | Required | 기본값       | 설명                                                          |
| -------------- | ------------- | -------- | ------------ | ------------------------------------------------------------- |
| folderId       | string (UUID) | No       | -            | 특정 폴더 내 파일만 조회                                      |
| companyId      | number        | No       | -            | 특정 업체 파일만 조회                                         |
| page           | number        | No       | 1            | 페이지 번호 (≥1)                                              |
| limit          | number        | No       | 50           | 페이지당 항목 수 (≥1)                                         |
| sortBy         | string        | No       | `created_at` | 정렬 기준: `created_at`, `date`, `name`, `size`, `updated_at` |
| sortOrder      | string        | No       | `desc`       | 정렬 방향: `asc`, `desc`                                      |
| includeDeleted | boolean       | No       | false        | 삭제된 파일 포함 여부                                         |

**Response:**

```json
{
  "files": [
    {
      "id": "uuid",
      "name": "파일명.pdf",
      "original_name": "원본명.pdf",
      "size": 1024000,
      "mime_type": "application/pdf",
      "path": "webhard/company-1/...",
      "folder_id": "uuid | null",
      "company_id": 1,
      "uploaded_by": "admin",
      "inquiry_number": "INQ-001 | null",
      "is_downloaded": false,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z",
      "deleted_at": "null",
      "deleted_by": null,
      "companies": { "company_name": "업체명", "manager_name": "담당자" }
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 50,
  "hasMore": true
}
```

---

### GET /api/v1/files/search

파일명 검색.

**Guard:** ApiKeyGuard + CompanyAccessGuard + AdminGuard

**Query Parameters:**

| 필드      | 타입   | Required | 기본값 | 설명              |
| --------- | ------ | -------- | ------ | ----------------- |
| query     | string | **Yes**  | -      | 검색 키워드       |
| companyId | number | No       | -      | 특정 업체 제한    |
| limit     | number | No       | 50     | 최대 결과 수 (≥1) |

**Response:** `FileResponseDto[]` 배열

---

### GET /api/v1/files/badge-counts

미다운로드 파일 카운트 조회 (배지 표시용).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Scope / cache contract:**

- 업체 사용자는 세션의 `companyId`만 조회한다. 요청 `companyId`는 무시된다.
- 관리자가 `companyId`를 지정하면 파일 count는 같은 `companyId`로 제한한다. `folderCounts` parent propagation은 해당 업체 폴더 트리와 legacy `companyId=null` bridge folder를 함께 사용해, 업체가 볼 수 있는 관리자 생성 하위 폴더의 count가 최상위 업체 폴더까지 전파되게 한다.
- `folderCounts`는 직접 파일 수만이 아니라 하위 폴더의 미다운로드 파일 수를 부모까지 전파한 값이다. root 파일은 `"root"` key로 집계한다.
- Frontend cache key는 `companyId`와 `includeFolderCounts`를 포함해야 하며, mutation 후에는 `queryKeys.webhard.badgeCounts()` prefix invalidation으로 active scoped cache를 갱신한다.

**Query Parameters:**

| 필드                | 타입    | Required | 기본값 | 설명                    |
| ------------------- | ------- | -------- | ------ | ----------------------- |
| companyId           | number  | No       | -      | 특정 업체 제한          |
| includeFolderCounts | boolean | No       | true   | 폴더별 카운트 포함 여부 |

**Response:**

```json
{
  "totalCount": 15,
  "companyId": 1,
  "folderCounts": {
    "folder-uuid-1": 5,
    "folder-uuid-2": 10
  }
}
```

---

### GET /api/v1/files/new

신규(미다운로드) 파일 목록 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Query Parameters:**

| 필드      | 타입   | Required | 기본값       | 설명                                                                         |
| --------- | ------ | -------- | ------------ | ---------------------------------------------------------------------------- |
| companyId | number | No       | -            | 특정 업체 제한                                                               |
| page      | number | No       | 1            | 페이지 번호 (≥1)                                                             |
| limit     | number | No       | 50           | 페이지당 항목 수 (≥1)                                                        |
| sortBy    | string | No       | `created_at` | 정렬 기준: `created_at`, `date`, `name`, `size`, `updated_at`, `uploaded_by` |
| sortOrder | string | No       | `desc`       | 정렬 방향: `asc`, `desc`                                                     |

**Response:**

```json
{
  "files": [
    {
      "id": "uuid",
      "name": "파일명.pdf",
      "original_name": "원본명.pdf",
      "size": 1024000,
      "mime_type": "application/pdf",
      "path": "webhard/company-1/...",
      "folder_id": "uuid | null",
      "company_id": 1,
      "uploaded_by": "admin",
      "inquiry_number": null,
      "is_downloaded": false,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z",
      "deleted_at": null,
      "deleted_by": null,
      "folder_path": "/올리기전용/업체A",
      "uploader_display_name": "관리자"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 50,
  "hasMore": false
}
```

---

### POST /api/v1/files/mark-downloaded

파일 다운로드 완료 표시.

**Guard:** ApiKeyGuard + CompanyAccessGuard. 외부웹하드동기화프로그램 integration principal 허용.

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Body:**

| 필드     | 타입            | Required | 설명                   |
| -------- | --------------- | -------- | ---------------------- |
| fileIds  | string[] (UUID) | No       | 개별 파일 ID 목록      |
| folderId | string (UUID)   | No       | 폴더 내 전체 파일 대상 |
| markAll  | boolean         | No       | 전체 파일 대상         |

> 세 필드 중 하나 이상 지정.

**Response:**

```json
{
  "success": true,
  "updatedCount": 5
}
```

**Integration scope:** API key integration principal may mark explicit `fileIds` or a verified `folderId`, but `markAll=true` is session-only. `markAll` from an integration principal is rejected because it is an unscoped global mutation.

---

### POST /api/v1/files/presigned-url

단건 업로드용 Presigned URL 생성.

**Guard:** ApiKeyGuard + CompanyAccessGuard. 외부웹하드동기화프로그램 integration principal 허용.

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Body:**

| 필드        | 타입          | Required | 설명                                       |
| ----------- | ------------- | -------- | ------------------------------------------ |
| filename    | string        | **Yes**  | 파일명 (1~500자)                           |
| contentType | string        | **Yes**  | MIME 타입 (예: `application/pdf`) (≤200자) |
| size        | number        | No       | 파일 크기 (bytes)                          |
| folderId    | string (UUID) | No       | 업로드 대상 폴더                           |
| companyId   | number        | No       | 업체 ID                                    |

**Response:**

```json
{
  "url": "https://r2.cloudflarestorage.com/...",
  "key": "webhard/company-1/abc123.pdf",
  "expiresAt": "2025-01-01T01:00:00.000Z",
  "folderId": "<routed-or-echoed-uuid>",
  "redirected": false
}
```

**task 26 — 외부웹하드 routing**: 요청 `folderId` 가 `/외부웹하드/{X}/...` 하위이고 `X` 가 가입 업체와 매칭되면 응답 `folderId` 를 업체 폴더 id 로 교체 (`redirected: true`). 매칭 실패 또는 비외부 folderId → `redirected: false`, 요청 `folderId` echo. Electron client 가 응답 `folderId` 를 `confirm` 호출에 그대로 사용하면 R2 PUT 자체가 처음부터 업체 경로로 박힌다. `folderId` / `redirected` 는 옵셔널 필드 — 구버전 client 호환.

**AUDIT-20 — routing trace**: routing 예외가 발생하면 업로드 자체는 기존 fallback 정책을 유지하되 `sync_logs.metadata.auditKind='webhard_pipeline'` 이벤트를 남긴다. trace에는 `stage`, `status`, `reasonCode`, `folderId`, sanitized `context`만 포함하며 R2 presigned URL, token, raw API key, secret은 저장하지 않는다. 관리자 조회 계약은 `GET /api/v1/integration/sync-logs/pipeline-backlog`에 정의한다.

---

### POST /api/v1/files/confirm

업로드 완료 확인 및 메타데이터 저장.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Body:**

| 필드             | 타입                   | Required | 설명                                                               |
| ---------------- | ---------------------- | -------- | ------------------------------------------------------------------ |
| key              | string                 | **Yes**  | R2 스토리지 키 (≤1000자)                                           |
| name             | string                 | **Yes**  | 저장 파일명 (1~500자)                                              |
| originalName     | string                 | **Yes**  | 원본 파일명 (≤500자)                                               |
| size             | number                 | **Yes**  | 파일 크기 (bytes)                                                  |
| mimeType         | string                 | **Yes**  | MIME 타입 (≤200자)                                                 |
| folderId         | string (UUID)          | No       | 폴더 ID                                                            |
| companyId        | number                 | No       | 업체 ID                                                            |
| inquiryNumber    | string                 | No       | 문의 번호                                                          |
| driveFileId      | string                 | No       | Google Drive 파일 ID                                               |
| driveUploadProof | string                 | No       | Drive upload proxy가 발급한 confirm-time metadata GET 생략용 proof |
| storageProvider  | `google_drive` \| `r2` | No       | 저장 provider. 신규 웹하드는 `google_drive`                        |

**Response:** `FileResponseDto` (생성된 파일 레코드)

---

### POST /api/v1/files/batch/upload

배치 Presigned URL 생성 (최대 50개).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Body:**

| 필드  | 타입                    | Required | 설명                                                                                       |
| ----- | ----------------------- | -------- | ------------------------------------------------------------------------------------------ |
| files | CreatePresignedUrlDto[] | **Yes**  | 파일 목록 (1~50개). 각 항목: `filename`, `contentType`, `size?`, `folderId?`, `companyId?` |

**Response:**

```json
{
  "urls": [
    {
      "url": "https://r2.cloudflarestorage.com/...",
      "key": "webhard/company-1/abc123.pdf",
      "expiresAt": "2025-01-01T01:00:00.000Z"
    }
  ]
}
```

---

### POST /api/v1/files/batch/confirm

배치 업로드 확인 (최대 500개).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Body:**

| 필드  | 타입               | Required | 설명                                                                                                                                                                                  |
| ----- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| files | ConfirmUploadDto[] | **Yes**  | 파일 목록 (1~500개). 각 항목: `key`, `name`, `originalName`, `size`, `mimeType`, `folderId?`, `companyId?`, `inquiryNumber?`, `driveFileId?`, `driveUploadProof?`, `storageProvider?` |

**Response:** 생성된 `FileResponseDto[]` 배열

---

### GET /api/v1/files/:id/download

파일 다운로드 URL 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 파일 ID |

**Response:**

```json
{
  "url": "https://r2.cloudflarestorage.com/...",
  "expiresAt": "2025-01-01T01:00:00.000Z"
}
```

**Browser proxy notes:**

- `/api/webhard/download` consumes this response and returns the R2 file stream to the browser.
- Forwarded non-JSON headers must be ByteString-safe. Korean filenames in `Content-Disposition` are percent-encoded before creating the `NextResponse`.
- `/api/webhard/preview-dxf?fileId=<uuid>` uses this endpoint server-side, fetches the signed R2 URL, and returns `text/plain; charset=utf-8` with `Cache-Control: no-store`. Invalid UUID is rejected before the backend lookup.

---

### PATCH /api/v1/files/:id/rename

파일명 변경.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 파일 ID |

**Request Body:**

| 필드 | 타입   | Required | 설명                |
| ---- | ------ | -------- | ------------------- |
| name | string | **Yes**  | 새 파일명 (1~500자) |

Frontend callers must send `{ "name": "new-file-name.ext" }`. `original_name` is response data, not the rename request field. The server persists the new display filename to both `name` and `originalName` so a later refetch/realtime update does not restore the old display name.

**Response:** 업데이트된 `FileResponseDto`

---

### PATCH /api/v1/files/:id/move

파일 이동.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 파일 ID |

**Request Body:**

| 필드     | 타입                  | Required | 설명                            |
| -------- | --------------------- | -------- | ------------------------------- |
| folderId | string (UUID) \| null | No       | 이동 대상 폴더 ID (null = 루트) |

**Response:** 업데이트된 `FileResponseDto`

---

### POST /api/v1/files/batch/move

파일 일괄 이동 (최대 100개).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

| 필드           | 타입                  | Required | 설명                            |
| -------------- | --------------------- | -------- | ------------------------------- |
| fileIds        | string[] (UUID)       | **Yes**  | 파일 ID 목록 (1~100개)          |
| targetFolderId | string (UUID) \| null | No       | 이동 대상 폴더 ID (null = 루트) |

**Response:** 이동된 파일 수

**Realtime contract:** batch move emits `file:moved` to every source folder represented by the moved files and to the target folder when the target differs from the source folders. Source pages must invalidate/remove moved files without waiting for a browser refresh.

**Storage contract:** Google Drive-backed batch move uses the storage provider batch move path when source and target Drive parent ids are known. Any Drive item failure keeps the DB move fail-closed and records sanitized success/failure/elapsed metrics.

---

### DELETE /api/v1/files/:id

파일 소프트 삭제 (휴지통으로 이동).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Policy:** admin session only. Company users receive 403; the web UI should block the attempt before the API call and show "관리자에게 삭제 요청해주세요".

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 파일 ID |

**Response:**

```json
{ "success": true }
```

---

### POST /api/v1/files/batch/delete

파일 일괄 소프트 삭제 (최대 100개).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Policy:** admin session only. Company users receive 403; the web UI should block the attempt before the API call and show "관리자에게 삭제 요청해주세요".

**Request Body:**

| 필드    | 타입            | Required | 설명                   |
| ------- | --------------- | -------- | ---------------------- |
| fileIds | string[] (UUID) | **Yes**  | 파일 ID 목록 (1~100개) |

**Response:** 삭제된 파일 수

**Storage contract:** Google Drive-backed batch delete uses the storage provider batch trash path. Any Drive item failure keeps the DB delete fail-closed and records sanitized success/failure/elapsed metrics.

---

### POST /api/v1/files/batch/download-zip

ZIP 압축 다운로드 (최대 100개).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Policy:** browser session only. API key integration principal is not enabled for ZIP because ZIP must remain scoped to the authenticated webhard actor. Google Drive files are streamed through the storage provider and appended to the ZIP without exposing Drive media URLs.

**Request Body:**

| 필드    | 타입            | Required | 설명                   |
| ------- | --------------- | -------- | ---------------------- |
| fileIds | string[] (UUID) | **Yes**  | 파일 ID 목록 (1~100개) |

**Response:** `application/zip` 바이너리 스트림

- Header: `Content-Disposition: attachment; filename="download-{timestamp}.zip"`

---

### POST /api/v1/share-links

공유 링크 생성.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Policy:** browser session only. Browser-facing `POST /api/webhard/share` must generate the token and absolute expiry, validate company ownership before calling this endpoint, and forward the browser session cookie to NestJS. Company users must ignore untrusted body `company_id` and use the authenticated session company id. NestJS must not trust caller-supplied `webhardFileId` alone; it must resolve the file from DB and require company users to share only files whose `companyId` matches the session company. API key integration principal is not enabled for raw share creation.

**Request Body:**

| 필드          | 타입          | Required | 설명                                  |
| ------------- | ------------- | -------- | ------------------------------------- |
| token         | string        | **Yes**  | 64자 이하 공유 토큰                   |
| filePath      | string        | **Yes**  | 공유 대상 파일 path                   |
| fileName      | string        | **Yes**  | 다운로드 파일명                       |
| webhardFileId | string (UUID) | No       | 공유 대상 WebhardFile id              |
| companyId     | number        | No       | 업체 범위                             |
| createdBy     | number        | **Yes**  | 생성자 numeric id. admin fallback은 0 |
| expiresAt     | ISO string    | **Yes**  | 만료 시각                             |
| maxDownloads  | number        | No       | 최대 다운로드 수                      |

**Response:** `{ "id": "uuid", "token": "..." }`

---

### POST /api/v1/share-links/validate

공유 링크 토큰 검증 및 다운로드 카운트 증가.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Policy:** API key integration principal is allowed for internal token validation. Public downloads should prefer `POST /api/v1/share-links/download/stream` so token validation and storage streaming stay in one scoped endpoint.
`maxDownloads` is enforced with a conditional atomic increment so parallel token downloads cannot exceed the configured limit.

**Request Body:**

| 필드  | 타입   | Required | 설명      |
| ----- | ------ | -------- | --------- |
| token | string | **Yes**  | 공유 토큰 |

**Response 주요 필드:** `is_valid`, `file_path`, `webhard_file_id`, `drive_file_id`, `storage_provider`, `file_name`, `error_message`

---

### POST /api/v1/share-links/download/stream

공유 링크 토큰을 검증하고 해당 파일을 stream으로 다운로드한다.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Policy:** API key integration principal is allowed only for token-scoped public download streaming. The request accepts a share token, not an arbitrary file id. `GET /api/v1/files/:id/download` and `GET /api/v1/files/:id/download/stream` remain session/worker scoped and reject API key-only direct file access.

**Request Body:**

| 필드  | 타입   | Required | 설명      |
| ----- | ------ | -------- | --------- |
| token | string | **Yes**  | 공유 토큰 |

**Response:** 파일 바이너리 stream. Google Drive 파일은 `StorageService.downloadWebhardFile()`로 Drive stream을 반환하고, legacy R2 파일은 signed URL을 서버에서 fetch해 stream으로 전달한다.

---

### POST /api/v1/files/multipart/initiate

멀티파트 업로드 시작 (대용량 파일).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

| 필드        | 타입   | Required | 설명                                          |
| ----------- | ------ | -------- | --------------------------------------------- |
| key         | string | **Yes**  | R2 스토리지 키 (≤1000자, 경로 탈출 문자 차단) |
| contentType | string | **Yes**  | MIME 타입 (≤200자)                            |

> `key` 검증: `..`, `//`, `\`, 제어 문자 차단. 업체 사용자는 자기 업체 경로만 접근 가능.

**Response:**

```json
{
  "uploadId": "multipart-upload-id",
  "key": "webhard/company-1/largefile.zip"
}
```

---

### POST /api/v1/files/multipart/presign

멀티파트 파트별 Presigned URL 생성.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

| 필드       | 타입   | Required | 설명                         |
| ---------- | ------ | -------- | ---------------------------- |
| key        | string | **Yes**  | R2 스토리지 키 (≤1000자)     |
| uploadId   | string | **Yes**  | 멀티파트 업로드 ID (≤1000자) |
| partNumber | number | **Yes**  | 파트 번호 (1~10000)          |

**Response:**

```json
{
  "url": "https://r2.cloudflarestorage.com/...?partNumber=1&uploadId=..."
}
```

---

### POST /api/v1/files/multipart/complete

멀티파트 업로드 완료.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

| 필드     | 타입     | Required | 설명                                                              |
| -------- | -------- | -------- | ----------------------------------------------------------------- |
| key      | string   | **Yes**  | R2 스토리지 키                                                    |
| uploadId | string   | **Yes**  | 멀티파트 업로드 ID                                                |
| parts    | object[] | **Yes**  | 완료된 파트 목록. 각 항목: `{ PartNumber: number, ETag: string }` |

**Response:**

```json
{ "success": true }
```

---

### POST /api/v1/files/multipart/abort

멀티파트 업로드 취소.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

| 필드     | 타입   | Required | 설명               |
| -------- | ------ | -------- | ------------------ |
| key      | string | **Yes**  | R2 스토리지 키     |
| uploadId | string | **Yes**  | 멀티파트 업로드 ID |

**Response:**

```json
{ "success": true }
```

---

## Folders

### GET /api/v1/folders

폴더 목록 조회. 기본 조회는 전체 트리를 반환하지 않고 루트 또는 지정 `parentId`의 직계 자식만 반환한다.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Query Parameters:**

| 필드              | 타입           | Required | 기본값 | 설명                                                                                 |
| ----------------- | -------------- | -------- | ------ | ------------------------------------------------------------------------------------ |
| parentId          | string (UUID)  | No       | -      | 부모 폴더 ID. 미지정 시 루트 폴더만 반환                                             |
| companyId         | number \| null | No       | -      | 업체 ID 필터                                                                         |
| includeFileCounts | boolean        | No       | false  | 파일 수 포함 여부                                                                    |
| includeAll        | boolean        | No       | false  | true일 때만 parentId 필터를 생략하는 호환 전체 목록 조회. 일반 화면 탐색은 사용 금지 |

**조회 계약:**

- root/children lazy loading: `GET /folders` 또는 `GET /folders/children`에 `parentId`를 명시하거나 생략해 직계 폴더만 조회한다.
- 업체 사용자는 자기 `companyId` 폴더와 legacy `companyId=null` child를 볼 수 있어야 한다. 단, `companyId=null` 외부웹하드 root/하위 폴더는 `companyVisibilityFilter`로 계속 차단한다.
- breadcrumb: `GET /folders/:id/ancestors`의 `ancestors + current` 응답을 사용한다. 현재 children 목록으로 상위 경로를 추정하지 않는다.
- 전체 트리: 네비게이션/호환 캐시 등 전체 구조가 필요한 경로만 `GET /folders/tree` 또는 `GET /folders?includeAll=true`를 명시한다.
- 폴더 목록 응답은 표시용 최신 파일 메타데이터를 포함한다. `latest_file_created_at`/`latest_file_uploader_display_name`은 해당 폴더와 모든 하위 폴더의 삭제되지 않은 파일 중 가장 최신 `created_at` 파일 기준이다. 파일이 없으면 두 값은 `null`이며, 프론트 표시 날짜는 폴더 `created_at`으로 fallback한다.

**Response:**

```json
{
  "folders": [
    {
      "id": "uuid",
      "name": "올리기전용",
      "parent_id": "uuid | null",
      "company_id": 1,
      "path": "/올리기전용",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z",
      "deleted_at": null,
      "companies": { "company_name": "업체A" },
      "file_count": 10,
      "undownloaded_count": 3,
      "latest_file_created_at": "2026-05-11T03:12:00.000Z",
      "latest_file_uploader_display_name": "관리자"
    }
  ],
  "total": 5
}
```

---

### GET /api/v1/folders/template

현재 폴더 템플릿 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Response:** `FolderTemplateNode[]`

```json
[
  {
    "name": "올리기전용",
    "children": []
  },
  {
    "name": "내리기전용",
    "children": []
  }
]
```

---

### PUT /api/v1/folders/template

폴더 템플릿 업데이트.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

| 필드     | 타입                 | Required | 설명                                                                           |
| -------- | -------------------- | -------- | ------------------------------------------------------------------------------ |
| template | FolderTemplateNode[] | **Yes**  | 폴더 구조 템플릿. 각 노드: `{ name: string, children?: FolderTemplateNode[] }` |

**Response:** 업데이트된 템플릿

---

### GET /api/v1/folders/external-unmatched

(task 26 신규) 외부웹하드 직하의 미매칭 root 폴더 목록 — admin UI 매뉴얼 매핑 폼 후보.

**Guard:** AdminGuard (admin 세션만. API key 호출 차단.)

**Request:** 쿼리 파라미터 없음.

**Response:** `ExternalUnmatchedFolder[]`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "대성목형(2265-1295)",
    "path": "/외부웹하드/대성목형(2265-1295)",
    "contactCount": 5,
    "fileCount": 47,
    "createdAt": "2026-04-15T09:00:00.000Z"
  }
]
```

**조건:**

- `path` startsWith `/외부웹하드/` (depth=2 직하 root 폴더만)
- `companyId IS NULL` (이미 매칭된 폴더 제외)
- `deletedAt IS NULL`
- `folderKind IN ('root', 'generic')` (template 폴더 제외)
- 동일 `name` 의 `CompanyFolderAlias status='approved'` 가 없는 것만 (이미 매핑된 폴더 제외)

`contactCount` / `fileCount` 는 폴더 트리 BFS 누적 (depth 무제한, `deletedAt=null`). 구현은 외부 subtree 관계를 bulk 조회한 뒤 `webhardFile`/`Contact` groupBy 결과를 root별로 합산해야 하며, root 수만큼 count 쿼리를 반복하지 않는다.

---

### GET /api/v1/folders/external-husk (task 27 Phase C)

외부웹하드 husk (빈 껍데기) 정리 후보 목록.

**Guard:** AdminGuard (admin 세션만. API key 호출 차단.)

**Request:** 쿼리 파라미터 없음.

**Response:** `Array<{ id: string; name: string; path: string | null; createdAt: string }>`

**조건:**

- `path` startsWith `/외부웹하드/` (depth=2)
- `companyId IS NULL`
- `deletedAt IS NULL`
- 직접 자식 폴더 0 + 직접 파일 0

후보 목록의 빈 폴더 판정은 **직접 자식/직접 파일 기준**이다. 전체 descendants 검증은 실제 `DELETE /folders/external-husk/:rootId` 실행 시 안전 가드가 수행한다. 목록 조회는 root별 count 반복 없이 direct child/file 존재 여부를 bulk 계산한다.

**Error:** 401 (no admin session)

---

### DELETE /api/v1/folders/external-husk/:rootId (task 27 Phase C)

단일 husk root cascade soft-delete (자식 트리 포함).

**Guard:** AdminGuard (admin 세션만.)

**Path Parameters:**

| 필드   | 타입          | Required | 설명                                    |
| ------ | ------------- | -------- | --------------------------------------- |
| rootId | string (UUID) | **Yes**  | 정리 대상 husk root 의 WebhardFolder.id |

**Response:**

```json
{ "deletedFolderIds": ["uuid", "..."] }
```

**Errors:**

| 코드 | 사유                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 400  | folder 미존재 / 이미 deletedAt set / path not under /외부웹하드/ / companyId IS NOT NULL / depth ≠ 2 |
| 422  | 자식 폴더 ≥ 1 / 직접 파일 ≥ 1 / descendants 파일 ≥ 1                                                 |

---

### POST /api/v1/folders/initialize

업체 기본 폴더 구조 초기화.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Body:**

| 필드        | 타입   | Required | 설명             |
| ----------- | ------ | -------- | ---------------- |
| companyId   | number | **Yes**  | 업체 ID          |
| companyName | string | **Yes**  | 업체명 (1~255자) |

**Response:** 생성된 폴더 목록

---

### GET /api/v1/folders/company-info/:companyId

업체 웹하드 접근 정보 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드      | 타입   | Required | 설명    |
| --------- | ------ | -------- | ------- |
| companyId | number | **Yes**  | 업체 ID |

**Response:**

```json
{
  "companyName": "업체A",
  "webhardAccess": true,
  "rootFolderExists": true
}
```

---

### GET /api/v1/folders/tree

폴더 트리 전체 조회 (네비게이션/명시 전체 구조 조회용). 일반 폴더 목록 화면의 기본 데이터 소스로 사용하지 않는다.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Response:** `FolderTreeNodeDto[]`

```json
[
  {
    "id": "uuid",
    "name": "올리기전용",
    "parent_id": null,
    "children": [
      {
        "id": "uuid",
        "name": "하위폴더",
        "parent_id": "uuid",
        "children": [],
        "file_count": 5,
        "undownloaded_count": 2
      }
    ],
    "file_count": 10,
    "undownloaded_count": 3
  }
]
```

---

### GET /api/v1/folders/children

자식 폴더 목록 (지연 로딩용). 응답은 wrapper 없이 `FolderResponseDto[]` 배열이며 각 항목은 `has_children`을 포함할 수 있다.

**Guard:** ApiKeyGuard + CompanyAccessGuard. 외부웹하드동기화프로그램 integration principal 허용.

**Query Parameters:**

| 필드     | 타입          | Required | 기본값 | 설명                                          |
| -------- | ------------- | -------- | ------ | --------------------------------------------- |
| parentId | string (UUID) | No       | null   | 부모 폴더 ID (미지정/빈 값 시 루트 폴더 반환) |

**Response:** `FolderResponseDto[]` 배열. `GET /folders`와 동일하게 각 폴더는 표시용 `latest_file_created_at`/`latest_file_uploader_display_name`을 포함할 수 있으며, 파일이 없으면 `null`이다.

---

### GET /api/v1/folders/batch-delete

배치 삭제 통계 조회 (삭제 전 확인용).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Query Parameters:**

| 필드      | 타입   | Required | 설명                                 |
| --------- | ------ | -------- | ------------------------------------ |
| folderIds | string | **Yes**  | 콤마로 구분된 UUID 목록 (최대 100개) |

**Response:**

```json
{
  "folderCount": 3,
  "fileCount": 25
}
```

---

### DELETE /api/v1/folders/batch-delete

폴더 일괄 소프트 삭제.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

| 필드      | 타입            | Required | 설명                    |
| --------- | --------------- | -------- | ----------------------- |
| folderIds | string[] (UUID) | **Yes**  | 폴더 ID 목록 (1개 이상) |

**Response:**

```json
{
  "foldersDeleted": 3,
  "filesDeleted": 25,
  "durationMs": 150
}
```

---

### GET /api/v1/folders/config/status-mapping

폴더-문의상태 매핑 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard + **AdminGuard**

**Response:** `FolderStatusMappingItemDto[]`

```json
[
  { "folderName": "올리기전용", "processStage": "접수" },
  { "folderName": "내리기전용", "processStage": "수정완료" }
]
```

---

### PUT /api/v1/folders/config/status-mapping

폴더-문의상태 매핑 업데이트.

**Guard:** ApiKeyGuard + CompanyAccessGuard + **AdminGuard**

**Request Body:**

| 필드     | 타입     | Required | 설명                                                               |
| -------- | -------- | -------- | ------------------------------------------------------------------ |
| mappings | object[] | **Yes**  | 매핑 목록. 각 항목: `{ folderName: string, processStage: string }` |

**Response:** 업데이트된 매핑 목록

---

### GET /api/v1/folders/config/excluded-folders

제외 폴더 목록 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard + **AdminGuard**

**Response:** `string[]` (제외 폴더명 목록)

---

### PUT /api/v1/folders/config/excluded-folders

제외 폴더 목록 업데이트.

**Guard:** ApiKeyGuard + CompanyAccessGuard + **AdminGuard**

**Request Body:**

| 필드    | 타입     | Required | 설명             |
| ------- | -------- | -------- | ---------------- |
| folders | string[] | **Yes**  | 제외 폴더명 목록 |

**Response:** 업데이트된 제외 폴더 목록

---

### GET /api/v1/folders/config/auto-contact-excluded

문의 자동생성 제외 폴더 목록 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard + **AdminGuard**

**Response:** `string[]` (제외 폴더명 목록)

---

### PUT /api/v1/folders/config/auto-contact-excluded

문의 자동생성 제외 폴더 목록 업데이트.

**Guard:** ApiKeyGuard + CompanyAccessGuard + **AdminGuard**

**Request Body:**

| 필드    | 타입     | Required | 설명                           |
| ------- | -------- | -------- | ------------------------------ |
| folders | string[] | **Yes**  | 문의 자동생성 제외 폴더명 목록 |

**Response:** 업데이트된 제외 폴더 목록

---

### GET /api/v1/folders/:id/ancestors

폴더 조상 경로 조회 (breadcrumb 용).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 폴더 ID |

**Response:**

```json
{
  "ancestors": [{ "id": "uuid", "name": "루트폴더", "parent_id": null, "...": "..." }],
  "current": { "id": "uuid", "name": "현재폴더", "parent_id": "uuid", "...": "..." }
}
```

---

### GET /api/v1/folders/:id

폴더 상세 조회 (하위 폴더 + 파일 포함).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 폴더 ID |

**Response:**

```json
{
  "id": "uuid",
  "name": "폴더명",
  "parent_id": "uuid | null",
  "company_id": 1,
  "path": "/올리기전용/하위",
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-01-01T00:00:00.000Z",
  "deleted_at": null,
  "subfolders": [{ "id": "uuid", "name": "서브폴더", "...": "..." }],
  "files": [
    {
      "id": "uuid",
      "name": "파일.pdf",
      "original_name": "원본.pdf",
      "size": 1024000,
      "mime_type": "application/pdf",
      "is_downloaded": false,
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST /api/v1/folders

폴더 생성.

**Guard:** ApiKeyGuard + CompanyAccessGuard. 외부웹하드동기화프로그램 integration principal 허용.

**Policy:** admin session or external sync integration principal only. Company users receive 403 and should not see creation entry points in the web UI.

If an admin creates a child folder under a company-owned parent and omits `companyId`, the backend inherits the parent folder `companyId`. This keeps admin-created company child folders visible to the company user after refresh.

**Request Body:**

| 필드      | 타입           | Required | 설명             |
| --------- | -------------- | -------- | ---------------- |
| name      | string         | **Yes**  | 폴더명 (1~255자) |
| parentId  | string (UUID)  | No       | 부모 폴더 ID     |
| companyId | number \| null | No       | 업체 ID          |

**Response:** 생성된 `FolderResponseDto`

---

### PATCH /api/v1/folders/:id/rename

폴더명 변경.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 폴더 ID |

**Request Body:**

| 필드    | 타입   | Required | 설명                                    |
| ------- | ------ | -------- | --------------------------------------- |
| name    | string | No       | 새 폴더명 (1~255자)                     |
| newName | string | No       | 새 폴더명 (1~255자, `name`의 대체 필드) |

> `name` 또는 `newName` 중 하나 사용.

**Response:** 업데이트된 `FolderResponseDto`

**Path update policy:**

- 루트 폴더의 `name/path` 갱신과 descendant `path` prefix 치환은 같은 transaction에서 수행한다.
- descendant 갱신은 기존 path prefix와 slash-boundary를 함께 확인해야 하며, 이름이 같은 prefix로 시작하는 sibling branch를 갱신하면 안 된다.
- SQL prefix 치환의 `left()`/`substring()` position parameter는 PostgreSQL `integer`로 cast되어야 한다. Prisma raw numeric binding이 `bigint`로 전달되어 `left(text, bigint)` 오류가 나면 안 된다.
- prefix 치환 실패 시 cache invalidation과 realtime event emit을 실행하지 않는다.
- 폴더 rename은 `WebhardFile.path`/R2 object key를 변경하지 않는다.

---

### PATCH /api/v1/folders/:id/move

폴더 이동.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 폴더 ID |

**Request Body:**

| 필드     | 타입                  | Required | 설명                                 |
| -------- | --------------------- | -------- | ------------------------------------ |
| parentId | string (UUID) \| null | No       | 이동 대상 부모 폴더 ID (null = 루트) |

**Response:** 업데이트된 `FolderResponseDto`

**Policy:** admin session only. Company users receive 403; web UI must block folder drag/drop before the API call.

**Path update policy:**

- 이동 대상 루트의 `parentId/name/path` 갱신과 descendant `path` prefix 치환은 같은 transaction에서 수행한다.
- descendant 갱신은 기존 path prefix와 slash-boundary를 함께 확인해야 하며, 예를 들어 `/상위/기존` 이동이 `/상위/기존형제`를 갱신하면 안 된다.
- SQL prefix 치환의 `left()`/`substring()` position parameter는 PostgreSQL `integer`로 cast되어야 한다. Prisma raw numeric binding이 `bigint`로 전달되어 `left(text, bigint)` 오류가 나면 안 된다.
- prefix 치환 실패 시 cache invalidation과 realtime event emit을 실행하지 않는다.
- 폴더 이동은 `WebhardFile.path`/R2 object key를 변경하지 않는다.

---

### DELETE /api/v1/folders/:id

폴더 소프트 삭제.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Policy:** admin session only. Company users receive 403; the web UI should block the attempt before the API call and show "관리자에게 삭제 요청해주세요".

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 폴더 ID |

**Response:**

```json
{ "success": true }
```

Folder delete from the web UI is exposed through the folder context menu and follows the admin-only delete policy.

**Company root folder policy:**

- A folder with `companyId != null` and `parentId == null` is controlled by the company lifecycle.
- Direct delete returns `400` with `code="COMPANY_ROOT_FOLDER_DELETE_BLOCKED"`, `companyId`, `companyName`, `folderId`, `folderName`, and `redirectTo="/admin/companies/:companyId"`.
- The admin UI must show a common modal with the matched folder/company information and a company detail navigation action. If a batch selection also contains non-matched items, the UI may let the admin exclude the matched company root folder and continue deleting only the remaining items.
- Deleting that matched folder must be performed through `DELETE /api/v1/companies/:id`.

---

## Trash

### GET /api/v1/trash

휴지통 파일 목록 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Query Parameters:**

| 필드      | 타입   | Required | 기본값 | 설명                  |
| --------- | ------ | -------- | ------ | --------------------- |
| companyId | number | No       | -      | 특정 업체 제한        |
| page      | number | No       | 1      | 페이지 번호 (≥1)      |
| limit     | number | No       | 50     | 페이지당 항목 수 (≥1) |

**Response:**

```json
{
  "files": [
    {
      "id": "uuid",
      "name": "삭제된파일.pdf",
      "original_name": "원본명.pdf",
      "size": 1024000,
      "mime_type": "application/pdf",
      "path": "webhard/company-1/...",
      "folder_id": "uuid | null",
      "company_id": 1,
      "uploaded_by": "admin",
      "is_downloaded": true,
      "created_at": "2025-01-01T00:00:00.000Z",
      "deleted_at": "2025-01-15T00:00:00.000Z",
      "deleted_by": 1,
      "days_until_delete": 15,
      "folder_path": "/올리기전용",
      "companies": { "company_name": "업체A" }
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 50,
  "hasMore": false
}
```

---

### GET /api/v1/trash/count

휴지통 파일 수 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Response:**

```json
{ "count": 3 }
```

---

### POST /api/v1/trash/:id/restore

파일 복원 (휴지통 → 원래 위치).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 파일 ID |

**Response:**

```json
{ "success": true }
```

---

### DELETE /api/v1/trash/:id

승인 body가 있을 때만 휴지통 파일을 영구 삭제한다. Google Drive 파일은 Drive item이
이미 `trashed=true`일 때만 `files.delete`를 호출한다.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | **Yes**  | 파일 ID |

**Request Body:**

```json
{
  "confirmPermanentDelete": true,
  "confirmationText": "PERMANENT_DELETE"
}
```

**Response:**

```json
{ "success": true }
```

---

### DELETE /api/v1/trash

승인 body가 있을 때만 휴지통을 비운다. 보관 기간 만료 자동 영구삭제는 사용하지 않는다.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Request Body:**

```json
{
  "confirmPermanentDelete": true,
  "confirmationText": "PERMANENT_DELETE"
}
```

**Response:**

```json
{ "deleted": 3 }
```

---

## Search

### GET /api/v1/search

통합 검색 (파일 + 폴더).

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Query Parameters:**

| 필드      | 타입   | Required | 기본값 | 설명                               |
| --------- | ------ | -------- | ------ | ---------------------------------- |
| q         | string | **Yes**  | -      | 검색 키워드 (1자 이상)             |
| type      | string | No       | `all`  | 검색 대상: `all`, `file`, `folder` |
| companyId | number | No       | -      | 특정 업체 제한                     |
| limit     | number | No       | 50     | 최대 결과 수 (≥1)                  |

**Response:**

```json
{
  "files": [{ "id": "uuid", "name": "파일.pdf", "...": "..." }],
  "folders": [{ "id": "uuid", "name": "폴더명", "...": "..." }],
  "total": 15
}
```

---

## Storage

### GET /api/v1/storage

저장공간 사용량 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**Query Parameters:**

| 필드      | 타입   | Required | 기본값 | 설명                                                        |
| --------- | ------ | -------- | ------ | ----------------------------------------------------------- |
| companyId | number | No       | -      | 특정 업체 조회 (관리자용, 업체 사용자는 자동으로 자기 업체) |

**Response:**

```json
{
  "active": 4294967296,
  "trash": 1073741824,
  "current": 5368709120,
  "max": 10737418240,
  "companyId": 1,
  "percentage": 50.0,
  "activePercentage": 40.0,
  "trashPercentage": 10.0
}
```

> `active`, `trash`, `current`, `max` 단위: bytes. `current = active + trash`이며, 휴지통에 있는 파일도 실제 저장소 공간을 차지하므로 전체 사용량에 포함한다. 기본 한도: 업체 10GB, 관리자 100GB.

---

### GET /api/v1/storage/breakdown

저장공간 상세 내역 조회.

**Guard:** ApiKeyGuard + CompanyAccessGuard

**권한/가시성 정책 (2026-05-10):**

- 관리자 사용자는 전체 파일을 업체별로 집계한다. `companyId=null` 파일은 `관리자` 항목으로 표시한다.
- 업체 사용자는 자기 `companyId` 파일만 폴더별로 집계한다. 타 업체 파일과 `companyId=null` 관리자/null 파일은 포함하지 않는다.

**Response (관리자):**

```json
{
  "total": 53687091200,
  "byCompany": [
    { "companyId": 1, "companyName": "업체A", "used": 5368709120, "fileCount": 100 },
    { "companyId": 2, "companyName": "업체B", "used": 2147483648, "fileCount": 50 }
  ]
}
```

**Response (업체):**

```json
{
  "total": 5368709120,
  "byFolder": [
    { "folderId": "uuid", "folderName": "올리기전용", "used": 3221225472, "fileCount": 60 },
    { "folderId": "uuid", "folderName": "내리기전용", "used": 2147483648, "fileCount": 40 }
  ]
}
```

---

### GET /api/v1/storage/performance

성능 메트릭 조회 (관리자 전용).

**Guard:** ApiKeyGuard + **AdminGuard**

**Response:** 서버 성능 메트릭 (캐싱됨)

---

### GET /api/v1/storage/webhard-consistency

Google Drive 웹하드 metadata 정합성 진단 (관리자 전용).

**Guard:** ApiKeyGuard + **AdminGuard**

**Query Parameters:**

| 필드                | 타입    | Required | 기본값 | 설명                                                                |
| ------------------- | ------- | -------- | ------ | ------------------------------------------------------------------- |
| verifyDriveApi      | boolean | No       | false  | `true`이면 Drive id가 있는 항목을 Google Drive API로 샘플 검증한다. |
| verifyDriveApiLimit | number  | No       | 50     | Drive API 검증 대상 folder/file 각각의 최대 개수. 최대 500.         |

**Response 주요 필드:**

| 필드                          | 설명                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| lastCheckedAt                 | 진단 응답 생성 시각                                             |
| quotaBackoffCount             | Drive API 403/429 또는 최근 quota/backoff repair 이벤트 수      |
| missingDriveIds.folders.count | `GOOGLE_DRIVE`인데 `driveFolderId`가 없는 folder row 수         |
| missingDriveIds.files.count   | `GOOGLE_DRIVE`인데 `driveFileId`가 없는 file row 수             |
| duplicateActiveCompanyRoots   | 업체별 active root folder 중복 목록                             |
| driveApi404                   | Drive API 샘플 검증 결과. 404 누락과 기타 오류를 분리해 반환함. |
| recentRepairEvents            | 최근 `sync_logs.metadata.auditKind='storage_repair'` 이벤트     |

`storageProvider=GOOGLE_DRIVE` row의 Drive id 누락은 화면 표시 대상이 아니라 데이터 drift다. 정리 작업은 `webhard-api/scripts/audit-google-drive-webhard-consistency.ts` dry-run 결과를 확인한 뒤 `--apply`로 실행한다.

---

### POST /api/v1/storage/drive-change-webhook

Google Drive change notification 수신 endpoint.

**Guard:** Drive channel token validation (`GOOGLE_DRIVE_WEBHOOK_TOKEN`, optional `GOOGLE_DRIVE_WEBHOOK_CHANNEL_ID`)

**Headers:**

| Header                | Required | 설명                               |
| --------------------- | -------- | ---------------------------------- |
| X-Goog-Channel-Token  | Yes      | 서버에 설정한 webhook token과 일치 |
| X-Goog-Channel-Id     | Optional | channel id 검증이 켜진 경우 일치   |
| X-Goog-Resource-Id    | Optional | Drive resource id                  |
| X-Goog-Resource-State | Optional | `change`, `sync` 등 상태           |
| X-Goog-Message-Number | Optional | Google notification sequence       |

**Response:**

```json
{
  "accepted": true,
  "enqueued": true,
  "queueDepth": 1,
  "resourceState": "change"
}
```

이 endpoint는 사용자 목록을 즉시 재검증하지 않는다. 알림을 reconciliation queue에 넣고 sanitized `storage_repair` 이벤트를 남긴 뒤, 백그라운드 reconciliation이 bounded limit로 Drive 404/403/429를 점진 검증한다.

---

## Activity Logs

### GET /api/v1/activity-logs

웹하드/관리자 모니터링 활동 로그 목록 조회.

**Guard:** ApiKeyGuard

**Query Parameters:**

| 필드      | 타입              | Required | 기본값 | 설명                                         |
| --------- | ----------------- | -------- | ------ | -------------------------------------------- |
| action    | string            | No       | -      | 활동 종류 필터 (`UPLOAD`, `DOWNLOAD` 등)     |
| actorId   | string            | No       | -      | actor id 필터                                |
| limit     | number            | No       | 50     | 페이지 크기                                  |
| offset    | number            | No       | 0      | 조회 시작 offset                             |
| startDate | string (ISO 8601) | No       | -      | `createdAt >= startDate`. invalid date는 400 |
| endDate   | string (ISO 8601) | No       | -      | `createdAt <= endDate`. invalid date는 400   |

**Response:**

```json
{
  "logs": [
    {
      "id": "uuid",
      "actor_type": "admin",
      "actor_id": "admin",
      "actor_name": "관리자",
      "action": "UPLOAD",
      "resource_type": "webhard_file",
      "resource_id": "uuid",
      "details": {},
      "ip_address": "127.0.0.1",
      "user_agent": "Mozilla/5.0",
      "created_at": "2026-05-10T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

## Sync

### POST /api/v1/sync/state

동기화 상태 upsert.

**Guard:** ApiKeyGuard (CompanyAccessGuard 미적용)

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Body:**

| 필드          | 타입              | Required | 설명               |
| ------------- | ----------------- | -------- | ------------------ |
| companyId     | number            | **Yes**  | 업체 ID            |
| lastSyncAt    | string (ISO 8601) | No       | 마지막 동기화 시각 |
| lastSyncHash  | string            | No       | 마지막 동기화 해시 |
| filesSynced   | number            | No       | 동기화된 파일 수   |
| foldersSynced | number            | No       | 동기화된 폴더 수   |
| syncType      | string            | No       | 동기화 타입        |
| syncStatus    | string            | No       | 동기화 상태        |
| errorMessage  | string            | No       | 에러 메시지        |

**Response:** upsert된 동기화 상태 레코드

---

### GET /api/v1/sync/state

동기화 상태 조회.

**Guard:** ApiKeyGuard (CompanyAccessGuard 미적용)

**사용 프로그램:** 외부웹하드동기화프로그램

**Query Parameters:**

| 필드      | 타입            | Required | 설명    |
| --------- | --------------- | -------- | ------- |
| companyId | string (number) | **Yes**  | 업체 ID |

**Response:** 해당 업체의 동기화 상태 레코드

---

## Backup

R2에 저장된 파일을 NAS로 백업하는 시스템.
로컬 NestJS 환경에서만 동작하며 (`fs.existsSync`로 NAS 경로 확인), Railway 배포 환경에서는 NAS 경로 접근 불가로 스킵된다.
매일 새벽 2시 스케줄 백업이 실행되며 (`@Cron('0 2 * * *')`), 관리자가 수동으로도 실행할 수 있다.

**권한 정책 (2026-05-10):** 백업 API는 프론트엔드 프록시와 별개로 NestJS 자체에서 `ApiKeyGuard + BackupAdminGuard`를 적용한다. Admin session은 허용하고, company session은 거부한다. API key 요청은 `ApiKeyGuard`가 `userType='admin'`을 주입하더라도 admin session으로 간주하지 않고, 아래 명시 스코프가 있을 때만 허용한다.

| Scope            | 허용 동작                                                                |
| ---------------- | ------------------------------------------------------------------------ |
| `backup:read`    | 설정 조회, 백업 대상 요약, 진행 상태 조회, 이력 조회                     |
| `backup:write`   | 설정 수정, NAS/파일시스템 디렉토리 브라우징                              |
| `backup:execute` | 수동 백업 실행                                                           |
| `backup:*`       | 백업 API 전체. 운영 API key에는 필요한 최소 스코프만 부여하는 것을 권장. |

### GET /api/v1/backup/settings

백업 설정 조회.

**Guard:** ApiKeyGuard + BackupAdminGuard (`admin-session` 또는 `backup:read`)

**Response:**

```typescript
interface BackupSettingsResponse {
  enabled: boolean;
  retentionDays: number; // 백업 보존 기간 (일)
  nasPath: string; // NAS 백업 경로 (e.g. \\192.168.0.6\home\backup\webhard)
  deleteAfterBackup: boolean; // 백업 성공 후 R2 원본 삭제 여부
}
```

---

### PUT /api/v1/backup/settings

백업 설정 수정.

**Guard:** ApiKeyGuard + BackupAdminGuard (`admin-session` 또는 `backup:write`)

**Request Body:**

```typescript
class UpdateBackupSettingsDto {
  enabled?: boolean;
  retentionDays?: number; // 1~365 범위
  nasPath?: string;
  deleteAfterBackup?: boolean;
}
```

**Response:** `BackupSettingsResponse`

---

### GET /api/v1/backup/eligible

백업 대상 파일 요약 (retentionDays 기간 이상 경과한 파일).

**Guard:** ApiKeyGuard + BackupAdminGuard (`admin-session` 또는 `backup:read`)

**Response:**

```typescript
interface BackupEligibleSummary {
  fileCount: number; // 백업 대상 파일 수
  totalSize: number; // 총 크기 (bytes)
  retentionDays: number; // 적용된 보존 기간
}
```

---

### POST /api/v1/backup/execute

백업 실행. 비동기 처리(즉시 응답 + 백그라운드 실행)로 동작한다.

**Guard:** ApiKeyGuard + BackupAdminGuard (`admin-session` 또는 `backup:execute`)

**Response:**

```typescript
interface BackupStartResult {
  status: 'started' | 'skipped' | 'already_running';
  total?: number; // status가 'started'일 때 백업 대상 파일 수
  reason?: string; // status가 'skipped'일 때 스킵 사유
}
```

---

### GET /api/v1/backup/status

백업 진행 상태 조회. 비동기 백업 실행 중 프론트엔드에서 폴링하여 진행률을 표시한다.

**Guard:** ApiKeyGuard + BackupAdminGuard (`admin-session` 또는 `backup:read`)

**Response:**

```typescript
interface BackupStatusResponse {
  isRunning: boolean;
  total: number; // 전체 대상 파일 수
  success: number; // 성공 건수
  failed: number; // 실패 건수
}
```

---

### GET /api/v1/backup/browse-directories

NAS 백업 경로 선택용 디렉토리 목록 조회. 로컬 파일시스템 경로 정보를 노출할 수 있으므로 읽기 조회가 아니라 설정 변경 권한과 같은 `backup:write`로 제한한다.

**Guard:** ApiKeyGuard + BackupAdminGuard (`admin-session` 또는 `backup:write`)

**Query Parameters:**

| 필드 | 타입   | Required | 설명                                     |
| ---- | ------ | -------- | ---------------------------------------- |
| path | string | No       | 조회할 디렉토리 경로. 미지정 시 드라이브 |

**Response:**

```typescript
interface BrowseDirectoriesResponse {
  path: string;
  parent: string | null;
  directories: string[];
  error?: string;
}
```

---

### GET /api/v1/backup/history

백업 이력 조회 (페이지네이션).

**Guard:** ApiKeyGuard + BackupAdminGuard (`admin-session` 또는 `backup:read`)

**Query Parameters:**

| 필드  | 타입   | Required | 설명                              |
| ----- | ------ | -------- | --------------------------------- |
| page  | number | No       | 페이지 번호 (기본: 1)             |
| limit | number | No       | 페이지 크기 (기본: 20, 최대: 100) |

**Response:**

```typescript
interface BackupHistoryResponse {
  items: BackupHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface BackupHistoryItem {
  id: string;
  fileId: string;
  fileName: string;
  originalName: string;
  fileSize: string; // BigInt → string 변환
  r2Key: string;
  backupPath: string;
  companyId: number | null;
  status: string; // 'success' | 'failed' | 'pending'
  error: string | null; // 프론트엔드에서 errorMessage로 참조 중 → error로 통일 예정
  createdAt: string; // ISO 8601
}
```

---

## Drawing Revisions ↔ WebhardFile 자동 연결

도면 워크플로우에서 발생한 도면 등록은 contacts 도메인 엔드포인트에서 처리되지만, 성공 시 `webhard_files` 테이블에 WebhardFile 레코드도 자동 생성된다. 두 도메인 간 링크 정책 요약:

| Contacts 엔드포인트                           | WebhardFile 동작                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/contacts/:id/drawing-revisions` | 성공 시 files 각 요소당 WebhardFile 레코드도 생성된다. Webhard 동기화 부분 실패 시 응답에 `webhardWarning?` 필드 포함 (§아래 `webhardWarning` 참고). |
| `POST /api/v1/contacts/:id/company-drawing`   | 성공 시 files 각 요소당 WebhardFile 레코드도 생성된다. 동일하게 `webhardWarning?` 반영.                                                              |
| `POST /api/v1/contacts/:id/link-webhard-file` | **기존 WebhardFile을 재사용하므로 신규 생성하지 않음** — `inquiryNumber` 필드만 갱신.                                                                |

저장 위치 정책 (task 19 이후 — 현행): `{거래처루트(company.name)}/문의-{buildInquiryFolderName({inquiryNumber, workNumber})}/[{대표번호}] {originalName}`. 대표번호는 `workNumber`가 있으면 현장작업번호(F)를 우선하고, 없을 때만 `inquiryNumber`(O)를 사용한다. 기존 `[O]`/`[F]` prefix가 있으면 제거 후 선택된 번호 하나만 붙인다. 납품 완료된 문의는 `{거래처루트}/완료/문의-.../` 하위로 자동 이관. 거래처 루트·template 폴더(`칼선의뢰`/`목형의뢰`) 가 없으면 `POST /api/v1/folders/initialize` 와 동일한 흐름으로 자동 생성된다. template 폴더는 **삭제·이동 금지** — 거래처 원본 도면 수신 구분용. 상세 정책은 `docs/specs/features/drawing-workflow.md` §W.1 참고.

> 문의 폴더명 스키마 (task 23 qa-contact-worker-v1, 2026-04-24): 공개 폼 또는 외부웹하드 동기화 경로에서 `inquiry_title`(패키지명) 이 있으면 `{패키지명-slug}-{inquiryNumber}[_{workNumber}]` 형식으로, 없으면 첫 번째 첨부 파일명 slug 를 fallback 으로 사용한다. 둘 다 없으면 현행 `문의-{inquiryNumber}[_{workNumber}]` 를 유지. `buildInquiryFolderName` 시그니처가 `BuildInquiryFolderNameInput { inquiryNumber, workNumber, packageLabel?, filenameFallback? }` 로 확장된다. 상세 정책은 `docs/specs/features/contact-webhard-folder.md` 참고.

생성된 WebhardFile ID 목록은 DrawingRevision의 `webhardFileIds` 컬럼에 저장된다.

### `webhardWarning` 응답 필드 (task 19)

`createRevision` 경로(`drawing-revisions`, `company-drawing`) 에서 `syncRevisionToWebhard`(`drawing-revision.service.ts:402`) 가 부분 실패하면, DrawingRevision 레코드는 성공적으로 저장한 뒤 응답에 옵셔널 필드를 붙여 반환한다.

```ts
interface DrawingRevisionResponse extends DrawingRevision {
  webhardWarning?: {
    code: 'NO_INQUIRY_NUMBER' | 'FOLDER_CREATE_FAILED' | 'RELOCATE_FAILED';
    message: string;
  };
}
```

- `NO_INQUIRY_NUMBER`: Contact 에 `inquiryNumber` / `workNumber` 둘 다 없어 폴더명을 만들 수 없음.
- `FOLDER_CREATE_FAILED`: `ensureInquiryFolder` 단계에서 DB/권한 오류 등으로 폴더 확보 실패.
- `RELOCATE_FAILED`: 폴더는 확보했으나 일부 파일이 `relocateContactFiles` 로 이동되지 못함.

프론트(Worker 모달, 거래처 포탈 업로드 화면)는 이 필드가 있으면 toast 경고로 표시 — Revision 자체는 정상 반영된 상태다. task 18 까지의 `.catch(() => [] as string[])` 무음 삼킴은 제거된다.

---

## 웹하드 페이지 URL 규약

웹하드 페이지(`/webhard`)는 쿼리 파라미터로 특정 폴더·파일을 직접 진입할 수 있다.

| URL                                      | 동작                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/webhard`                               | 웹하드 루트 진입 (기본 상태)                                                                                                                     |
| `/webhard?folderId={uuid}`               | 특정 폴더 선택 (기존)                                                                                                                            |
| `/webhard?folderId={uuid}&fileId={uuid}` | 폴더 선택 + 파일 하이라이트. 폴더 로드 완료 후 `useWebhardHighlightStore` 를 통해 **3 초간** `ring-2 ring-blue-500 animate-pulse` 표시 (task 22) |

세부 규칙:

- `fileId` 만 단독으로 주어진 경우 (`folderId` 없음): **noop**. 폴더 없이 특정 파일만 하이라이트하는 기능은 미지원.
- 지정된 `fileId` 가 해당 폴더에 존재하지 않을 경우: `setHighlight` 은 호출하되 UI 는 기존 store 로직대로 렌더링된 요소가 없으면 noop (에러 미발생).
- 진입 경로: 문의카드 컨텍스트 메뉴 "웹하드에서 열기" (Admin / Worker 공통, task 22 contact-webhard-navigate).

---

## Contact 응답 DTO 확장 (task 22)

문의카드 컨텍스트 메뉴 "웹하드에서 열기" 기능을 위해 Contact 응답 DTO 에 아래 필드가 추가된다:

| 필드              | 타입             | 설명                                                                                                                                                                                                             |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhard_file_id` | `string \| null` | 해당 Contact 의 최신 DrawingRevision 의 첫 번째 `webhardFileIds` 값. 컨텍스트 메뉴의 "웹하드에서 열기" 기능에서 파일 하이라이트 대상으로 사용. DrawingRevision 이 없거나 `webhardFileIds` 가 비어 있으면 `null`. |

참고: `webhard_folder_id` 필드는 이미 기존 Contact DTO 에 포함되어 있다. `webhard_file_id` 와 `webhard_folder_id` 는 위 URL 규약의 `fileId` / `folderId` 쿼리 파라미터에 각각 매핑된다. 응답 필드는 Contact DTO 의 기존 snake_case 컨벤션을 따른다.

---

## 외부 프로그램 연동 요약

| 프로그램                 | 사용 엔드포인트                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 외부웹하드동기화프로그램 | `GET /folders/children`, `POST /folders`, `POST /files/presigned-url`, `POST /files/confirm`, `POST /files/batch/upload`, `POST /files/batch/confirm`, `POST /files/mark-downloaded`, `POST /folders/initialize`, `POST /sync/state`, `GET /sync/state` |
