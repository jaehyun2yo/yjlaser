# 웹하드 REST API 스펙

## 1. API 개요

### 1.1 Base URL

| 환경            | URL                                 | 설명           |
| --------------- | ----------------------------------- | -------------- |
| **개발**        | `http://localhost:3100/api/webhard` | Next.js 프록시 |
| **프로덕션**    | `https://yjlaser.net/api/webhard`   | Next.js 프록시 |
| **NestJS 직접** | `http://localhost:4000`             | 내부 전용      |

> **중요**: 클라이언트는 항상 Next.js 프록시(`/api/webhard`)를 통해 호출합니다 (CSP 준수).

### 1.2 인증 방식

- **세션 쿠키 기반 인증**
- 모든 요청에 `credentials: 'include'` 필수
- 세션 만료 시 401 Unauthorized 반환

### 1.3 공통 헤더

```http
Content-Type: application/json
Cookie: session=<session_token>
```

### 1.4 공통 응답 형식

```typescript
// 성공 응답
{
  "data": { ... },
  "total": number,    // 목록 조회 시
  "page": number,     // 페이지네이션
  "limit": number,
  "hasMore": boolean
}

// 에러 응답
{
  "statusCode": number,
  "message": string,
  "error": string     // 에러 타입
}
```

---

## 2. 인증 및 권한

### 2.1 사용자 타입

| 타입      | 권한      | 설명                       |
| --------- | --------- | -------------------------- |
| `admin`   | 전체 접근 | 모든 업체 데이터 조회/수정 |
| `company` | 제한 접근 | 자신의 업체 데이터만 접근  |

### 2.2 세션 사용자 정보

```typescript
interface SessionUser {
  userId: string; // 사용자 ID
  userType: 'admin' | 'company';
  companyId?: number; // company 타입일 경우
  companyName?: string;
}
```

---

## 3. Files API

### 3.1 파일 목록 조회

```http
GET /files
```

**Query Parameters**

| 파라미터    | 타입            | 필수 | 설명                              |
| ----------- | --------------- | ---- | --------------------------------- |
| `folderId`  | string (UUID)   | -    | 폴더 ID (없으면 루트)             |
| `companyId` | number          | -    | 업체 ID (admin 전용)              |
| `page`      | number          | -    | 페이지 번호 (기본: 1)             |
| `limit`     | number          | -    | 페이지 크기 (기본: 50, 최대: 100) |
| `sortBy`    | string          | -    | 정렬 필드 (기본: created_at)      |
| `sortOrder` | 'asc' \| 'desc' | -    | 정렬 순서 (기본: desc)            |

**Response**

```typescript
interface FileListResponse {
  files: WebhardFileDTO[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

**예제**

```bash
curl -X GET "https://yjlaser.net/api/webhard/files?folderId=123e4567-e89b-12d3-a456-426614174000&page=1&limit=20" \
  -H "Cookie: session=xxx"
```

---

### 3.2 새 파일 목록 조회 (미다운로드)

```http
GET /files/new
```

**Query Parameters**

| 파라미터    | 타입            | 필수 | 설명        |
| ----------- | --------------- | ---- | ----------- |
| `companyId` | number          | -    | 업체 ID     |
| `page`      | number          | -    | 페이지 번호 |
| `limit`     | number          | -    | 페이지 크기 |
| `sortBy`    | string          | -    | 정렬 필드   |
| `sortOrder` | 'asc' \| 'desc' | -    | 정렬 순서   |

**Response**: `FileListResponse`

---

### 3.3 파일 검색

```http
GET /files/search
```

**Query Parameters**

| 파라미터    | 타입   | 필수 | 설명           |
| ----------- | ------ | ---- | -------------- |
| `query`     | string | ✓    | 검색어         |
| `companyId` | number | -    | 업체 ID        |
| `limit`     | number | -    | 결과 개수 제한 |

**Response**

```typescript
WebhardFileDTO[]
```

---

### 3.4 배지 카운트 조회

```http
GET /files/badge-counts
```

**Query Parameters**

| 파라미터              | 타입    | 필수 | 설명               |
| --------------------- | ------- | ---- | ------------------ |
| `companyId`           | number  | -    | 업체 ID            |
| `includeFolderCounts` | boolean | -    | 폴더별 카운트 포함 |

**Response**

```typescript
interface BadgeCountsResponse {
  totalCount: number;
  companyId?: number;
  folderCounts?: Record<string, number>; // folderId → count
}
```

---

### 3.5 업로드 Presigned URL 생성

```http
POST /files/presigned-url
```

**Request Body**

```typescript
{
  filename: string;       // 파일명
  contentType: string;    // MIME 타입
  folderId?: string;      // 대상 폴더 ID
  companyId?: number;     // 업체 ID (admin 전용)
}
```

**Response**

```typescript
interface PresignedUrlResponse {
  url: string; // R2 업로드 URL
  key: string; // 저장 경로
  expiresAt: string; // 만료 시간 (ISO 8601)
}
```

**예제**

```javascript
// 1. Presigned URL 요청
const { url, key } = await fetch('/api/webhard/files/presigned-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    filename: 'document.pdf',
    contentType: 'application/pdf',
    folderId: '123e4567-e89b-12d3-a456-426614174000',
  }),
}).then((r) => r.json());

// 2. R2에 직접 업로드
await fetch(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/pdf' },
  body: file,
});

// 3. 업로드 확인
await fetch('/api/webhard/files/confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    key,
    name: 'document.pdf',
    originalName: 'document.pdf',
    size: file.size,
    mimeType: 'application/pdf',
    folderId: '123e4567-e89b-12d3-a456-426614174000',
  }),
});
```

---

### 3.6 배치 업로드 Presigned URL 생성

```http
POST /files/batch/upload
```

**Request Body**

```typescript
{
  files: {
    filename: string;
    contentType: string;
    folderId?: string;
    companyId?: number;
  }[]
}
```

**Response**

```typescript
{
  urls: PresignedUrlResponse[]
}
```

---

### 3.7 업로드 확인

```http
POST /files/confirm
```

**Request Body**

```typescript
{
  key: string;            // R2 저장 경로
  name: string;           // 표시 파일명
  originalName: string;   // 원본 파일명
  size: number;           // 파일 크기 (bytes)
  mimeType: string;       // MIME 타입
  folderId?: string;      // 폴더 ID
  companyId?: number;     // 업체 ID
  inquiryNumber?: string; // 문의 번호
}
```

**Response**: `WebhardFileDTO`

---

### 3.8 다운로드 URL 조회

```http
GET /files/:id/download
```

**Path Parameters**

| 파라미터 | 타입          | 설명    |
| -------- | ------------- | ------- |
| `id`     | string (UUID) | 파일 ID |

**Response**

```typescript
interface PresignedUrlResponse {
  url: string; // R2 다운로드 URL
  key: string; // 저장 경로
  expiresAt: string; // 만료 시간
}
```

---

### 3.9 파일 이름 변경

```http
PATCH /files/:id/rename
```

**Request Body**

```typescript
{
  name: string; // 새 파일명
}
```

**Response**: `WebhardFileDTO`

---

### 3.10 파일 이동

```http
PATCH /files/:id/move
```

**Request Body**

```typescript
{
  folderId: string | null; // 대상 폴더 ID (null = 루트)
}
```

**Response**: `WebhardFileDTO`

---

### 3.11 배치 파일 이동

```http
POST /files/batch/move
```

**Request Body**

```typescript
{
  fileIds: string[];
  targetFolderId: string | null;
}
```

**Response**

```typescript
interface BatchOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  duration_ms: number;
}
```

---

### 3.12 파일 삭제 (휴지통으로 이동)

```http
DELETE /files/:id
```

**Response**

```typescript
{
  success: boolean;
}
```

---

### 3.13 배치 파일 삭제

```http
POST /files/batch/delete
```

**Request Body**

```typescript
{
  fileIds: string[]
}
```

**Response**: `BatchOperationResult`

---

### 3.14 다운로드 상태 표시

```http
POST /files/mark-downloaded
```

**Request Body**

```typescript
{
  fileIds?: string[];     // 특정 파일들
  folderId?: string;      // 폴더 내 모든 파일
  markAll?: boolean;      // 전체 파일
}
```

**Response**

```typescript
{
  success: boolean;
  updatedCount: number;
}
```

---

## 4. Folders API

### 4.1 폴더 목록 조회

```http
GET /folders
```

**Query Parameters**

| 파라미터            | 타입          | 필수 | 설명         |
| ------------------- | ------------- | ---- | ------------ |
| `parentId`          | string (UUID) | -    | 상위 폴더 ID |
| `companyId`         | number        | -    | 업체 ID      |
| `includeFileCounts` | boolean       | -    | 파일 수 포함 |

**Response**

```typescript
interface FolderListResponse {
  folders: WebhardFolderDTO[];
  total: number;
}
```

---

### 4.2 폴더 트리 조회

```http
GET /folders/tree
```

**Response**

```typescript
interface FolderTreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  children: FolderTreeNode[];
  file_count?: number;
  undownloaded_count?: number;
}

FolderTreeNode[]
```

---

### 4.3 폴더 상세 조회

```http
GET /folders/:id
```

**Response**

```typescript
interface FolderDetailResponse extends WebhardFolderDTO {
  subfolders: WebhardFolderDTO[];
  files: {
    id: string;
    name: string;
    original_name: string;
    size: number;
    mime_type: string;
    is_downloaded: boolean;
    created_at: string;
  }[];
}
```

---

### 4.4 폴더 상위 경로 조회 (Breadcrumb)

```http
GET /folders/:id/ancestors
```

**Response**

```typescript
interface FolderAncestorsResponse {
  ancestors: WebhardFolderDTO[]; // 루트부터 순서대로
  current: WebhardFolderDTO;
}
```

---

### 4.5 폴더 생성

```http
POST /folders
```

**Request Body**

```typescript
{
  name: string;
  parentId?: string;      // 상위 폴더 ID
  companyId?: number;     // 업체 ID
}
```

**Response**: `WebhardFolderDTO`

---

### 4.6 폴더 이름 변경

```http
PATCH /folders/:id/rename
```

**Request Body**

```typescript
{
  name: string;
}
```

**Response**: `WebhardFolderDTO`

---

### 4.7 폴더 이동

```http
PATCH /folders/:id/move
```

**Request Body**

```typescript
{
  parentId: string | null; // 대상 상위 폴더 (null = 루트)
}
```

**Response**: `WebhardFolderDTO`

---

### 4.8 폴더 삭제

```http
DELETE /folders/:id
```

**Response**

```typescript
{
  success: boolean;
}
```

---

### 4.9 배치 삭제 통계 조회

```http
GET /folders/batch-delete?folderIds=id1,id2,id3
```

**Response**

```typescript
{
  totalFolders: number;
  totalFiles: number;
  totalSize: number;
}
```

---

### 4.10 배치 폴더 삭제

```http
DELETE /folders/batch-delete
```

**Request Body**

```typescript
{
  folderIds: string[]
}
```

**Response**: `BatchOperationResult`

---

## 5. Trash API

### 5.1 휴지통 목록 조회

```http
GET /trash
```

**Query Parameters**

| 파라미터    | 타입   | 설명        |
| ----------- | ------ | ----------- |
| `companyId` | number | 업체 ID     |
| `page`      | number | 페이지 번호 |
| `limit`     | number | 페이지 크기 |

**Response**

```typescript
interface TrashListResponse {
  files: TrashFileDTO[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

---

### 5.2 휴지통 카운트 조회

```http
GET /trash/count
```

**Response**

```typescript
{
  count: number;
}
```

---

### 5.3 파일 복원

```http
POST /trash/:id/restore
```

**Response**

```typescript
{
  success: boolean;
}
```

---

### 5.4 파일 영구 삭제

```http
DELETE /trash/:id
```

**Request Body**

```typescript
{
  confirmPermanentDelete: true;
  confirmationText: 'PERMANENT_DELETE';
}
```

승인 body가 없거나 파일이 휴지통 상태가 아니면 영구삭제하지 않는다.

**Response**

```typescript
{
  success: boolean;
}
```

---

### 5.5 휴지통 비우기

```http
DELETE /trash
```

**Request Body**

```typescript
{
  confirmPermanentDelete: true;
  confirmationText: 'PERMANENT_DELETE';
}
```

휴지통에 있는 파일만 대상으로 하며, 보관 기간 만료 자동 영구삭제는 사용하지 않는다.

**Response**

```typescript
{
  deleted: number;
}
```

---

## 6. Storage API

### 6.1 저장공간 사용량 조회

```http
GET /storage
```

**Query Parameters**

| 파라미터    | 타입   | 설명    |
| ----------- | ------ | ------- |
| `companyId` | number | 업체 ID |

**Response**

```typescript
interface StorageUsageResponse {
  current: number; // 현재 사용량 (bytes)
  max: number; // 최대 용량 (bytes)
  companyId?: number;
  percentage?: number; // 사용률 (%)
}
```

---

### 6.2 저장공간 상세 분석

```http
GET /storage/breakdown
```

**Response**

```typescript
interface StorageBreakdownResponse {
  total: number;
  byCompany?: {
    // admin일 경우
    companyId: number;
    companyName: string;
    used: number;
    fileCount: number;
  }[];
  byFolder?: {
    // company일 경우
    folderId: string;
    folderName: string;
    used: number;
    fileCount: number;
  }[];
}
```

---

## 7. Search API

### 7.1 통합 검색

```http
GET /search
```

**Query Parameters**

| 파라미터    | 타입   | 필수 | 설명      |
| ----------- | ------ | ---- | --------- |
| `q`         | string | ✓    | 검색어    |
| `companyId` | number | -    | 업체 ID   |
| `limit`     | number | -    | 결과 개수 |

**Response**

```typescript
interface UnifiedSearchResponse {
  files: WebhardFileDTO[];
  folders: WebhardFolderDTO[];
  total: number;
}
```

---

## 8. Settings API

### 8.1 설정 조회

```http
GET /settings
```

**Response**

```typescript
interface WebhardSettingsResponse {
  userId: string;
  fontSize: string; // 'small' | 'medium' | 'large'
  notificationsEnabled: boolean;
  downloadFolderPath: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

### 8.2 설정 업데이트

```http
POST /settings
```

**Request Body**

```typescript
{
  fontSize?: string;
  notificationsEnabled?: boolean;
  downloadFolderPath?: string;
}
```

**Response**: `WebhardSettingsResponse`

---

## 9. 에러 코드

| HTTP 상태 | 에러 코드               | 설명                 |
| --------- | ----------------------- | -------------------- |
| 400       | `BAD_REQUEST`           | 잘못된 요청 파라미터 |
| 401       | `UNAUTHORIZED`          | 인증 필요            |
| 403       | `FORBIDDEN`             | 권한 없음            |
| 404       | `NOT_FOUND`             | 리소스 없음          |
| 409       | `CONFLICT`              | 충돌 (중복 이름 등)  |
| 413       | `PAYLOAD_TOO_LARGE`     | 파일 크기 초과       |
| 500       | `INTERNAL_SERVER_ERROR` | 서버 오류            |

---

## 10. DTO 타입 정의

### 10.1 WebhardFileDTO

```typescript
interface WebhardFileDTO {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id: number | null;
  uploaded_by: number;
  inquiry_number: string | null;
  is_downloaded: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
  companies?: {
    company_name: string;
    manager_name?: string | null;
  } | null;
}
```

### 10.2 WebhardFolderDTO

```typescript
interface WebhardFolderDTO {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  companies?: {
    company_name: string;
  } | null;
  file_count?: number;
  undownloaded_count?: number;
}
```

### 10.3 TrashFileDTO

```typescript
interface TrashFileDTO extends WebhardFileDTO {
  days_until_delete: number;
  folder_path?: string;
}
```

### 10.4 BatchOperationResultDTO

```typescript
interface BatchOperationResultDTO {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
  duration_ms: number;
}
```

---

## 11. 예제 코드

### 11.1 JavaScript (브라우저)

```javascript
// API 클라이언트 기본 설정
const API_BASE = '/api/webhard';

async function webhardFetch(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// 파일 목록 조회
async function getFiles(folderId) {
  const params = new URLSearchParams();
  if (folderId) params.set('folderId', folderId);
  return webhardFetch(`/files?${params}`);
}

// 파일 업로드
async function uploadFile(file, folderId) {
  // 1. Presigned URL 요청
  const { url, key } = await webhardFetch('/files/presigned-url', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      folderId,
    }),
  });

  // 2. R2 직접 업로드
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  // 3. 업로드 확인
  return webhardFetch('/files/confirm', {
    method: 'POST',
    body: JSON.stringify({
      key,
      name: file.name,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
      folderId,
    }),
  });
}

// 파일 다운로드
async function downloadFile(fileId, fileName) {
  const { url } = await webhardFetch(`/files/${fileId}/download`);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

// 폴더 생성
async function createFolder(name, parentId) {
  return webhardFetch('/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
}
```

### 11.2 cURL

```bash
# 파일 목록 조회
curl -X GET "https://yjlaser.net/api/webhard/files?page=1&limit=20" \
  -H "Cookie: session=your-session-token"

# 폴더 생성
curl -X POST "https://yjlaser.net/api/webhard/folders" \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session-token" \
  -d '{"name": "새 폴더", "parentId": null}'

# 파일 삭제
curl -X DELETE "https://yjlaser.net/api/webhard/files/123e4567-e89b-12d3-a456-426614174000" \
  -H "Cookie: session=your-session-token"

# 검색
curl -X GET "https://yjlaser.net/api/webhard/search?q=도면&limit=50" \
  -H "Cookie: session=your-session-token"
```

---

## 12. Rate Limiting

| 엔드포인트 | 제한        | 설명               |
| ---------- | ----------- | ------------------ |
| 업로드     | 100 req/min | Presigned URL 요청 |
| 다운로드   | 200 req/min | 다운로드 URL 요청  |
| 일반       | 300 req/min | 기타 모든 요청     |

---

## 13. 버전 이력

| 버전  | 날짜       | 변경 내용 |
| ----- | ---------- | --------- |
| 1.0.0 | 2026-01-23 | 초기 버전 |

---

**최종 업데이트**: 2026-01-23
**작성자**: YJLaser 개발팀
