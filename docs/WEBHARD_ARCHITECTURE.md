# 웹하드 시스템 레거시 기술 문서 (R2 기반)

> 최종 업데이트: 2026-07-09
> 버전: 3.1
> 현재 코드 기준: 신규 웹하드 파일은 Google Drive + PostgreSQL 메타데이터를 사용한다. 이 문서는 R2 직접 업로드 시절의 상세 설계를 보존하는 레거시 참고 문서이며, 최신 운영 기준은 `README.md`, `CLAUDE.md`, `webhard-api/README.md`를 우선한다.

## 목차

1. [시스템 아키텍처 개요](#1-시스템-아키텍처-개요)
2. [데이터베이스 스키마](#2-데이터베이스-스키마)
3. [API 엔드포인트 전체 목록](#3-api-엔드포인트-전체-목록)
4. [업로드 로직](#4-업로드-로직)
5. [다운로드 로직](#5-다운로드-로직)
6. [삭제 로직](#6-삭제-로직)
7. [수정 로직 (이름변경, 이동)](#7-수정-로직)
8. [폴더 관리](#8-폴더-관리)
9. [휴지통 시스템](#9-휴지통-시스템)
10. [저장공간 관리](#10-저장공간-관리)
11. [검색 기능](#11-검색-기능)
12. [인증 및 권한 체계](#12-인증-및-권한-체계)
13. [프론트엔드 아키텍처](#13-프론트엔드-아키텍처)
14. [상태 관리](#14-상태-관리)
15. [캐시 전략](#15-캐시-전략)
16. [에러 처리](#16-에러-처리)
17. [성능 최적화 현황](#17-성능-최적화-현황)
18. [최적화 제안](#18-최적화-제안)
19. [파일 구조 참조](#19-파일-구조-참조)
20. [백업 시스템](#20-백업-시스템)

---

## 1. 시스템 아키텍처 개요

### 1.1 기술 스택

| 구분            | 기술                                                           |
| --------------- | -------------------------------------------------------------- |
| 프론트엔드      | Next.js 15 (App Router, React 19)                              |
| 백엔드 API      | NestJS (모듈 기반)                                             |
| ORM             | Prisma (PostgreSQL)                                            |
| 데이터베이스    | Supabase (PostgreSQL)                                          |
| 파일 저장소     | Google Drive (신규 웹하드) + Cloudflare R2 (포트폴리오/레거시) |
| 서버 상태 관리  | React Query (TanStack Query)                                   |
| 클라이언트 상태 | Zustand                                                        |
| 패키지 매니저   | pnpm                                                           |

### 1.2 전체 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│  브라우저 (React 19)                                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  WebhardMain.tsx                                          │   │
│  │  ├── React Query (서버 상태 캐싱)                        │   │
│  │  ├── Zustand Store (UI 상태: 선택, 모달, 레이아웃)      │   │
│  │  └── Custom Hooks (비즈니스 로직)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│       │ fetch()                              │ PUT (직접)        │
│       ▼                                      ▼                   │
│  ┌──────────────┐                    ┌──────────────┐           │
│  │ Next.js API  │                    │ Cloudflare   │           │
│  │ /api/webhard │                    │ R2 Storage   │           │
│  │ (프록시)     │                    │ (Presigned)  │           │
│  └──────┬───────┘                    └──────────────┘           │
│         │ proxyToNestJS()                                        │
│         │ (인증 + Rate Limit)                                    │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NestJS Backend (webhard-api/, port 4000)                 │   │
│  │  ├── AuthGuard (세션 쿠키 + HMAC-SHA256)                 │   │
│  │  ├── FilesModule    → FilesService                        │   │
│  │  ├── FoldersModule  → FoldersService                      │   │
│  │  ├── TrashModule    → TrashService                        │   │
│  │  ├── StorageModule  → StorageService (R2 SDK)             │   │
│  │  ├── SearchModule   → SearchService                       │   │
│  │  └── PrismaModule   → PrismaService (연결 풀 + 재시도)   │   │
│  └──────┬───────────────────────────────────────────────────┘   │
│         │ Prisma ORM                                             │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │ Supabase     │                                                │
│  │ PostgreSQL   │                                                │
│  └──────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2.1 환경 분리

개발(dev)과 프로덕션(prod) 환경은 DB와 스토리지가 완전히 분리되어 있다.

| 자원    | 개발                         | 프로덕션                     |
| ------- | ---------------------------- | ---------------------------- |
| DB      | Supabase 개발 프로젝트       | Supabase 프로덕션 프로젝트   |
| R2 버킷 | `yjlaser-dev`                | `yjlaser`                    |
| DB 연결 | Transaction 모드 (포트 6543) | Transaction 모드 (포트 6543) |

- `DATABASE_URL`: Supabase Pooler Transaction 모드 (포트 6543, `pgbouncer=true&statement_cache_size=0`) — 런타임 쿼리용
- `DIRECT_URL`: Direct 연결 (포트 5432) — Prisma 마이그레이션 전용
- 환경변수는 루트 `.env.local`에서 통합 관리 (`webhard-api/.env`는 사용하지 않음)
- 스키마 변경은 Prisma Migrate로 관리: `prisma migrate dev` (개발) → `prisma migrate deploy` (프로덕션)

### 1.3 요청 흐름

```
브라우저 → fetch('/api/webhard/files')
  → Next.js API Route (src/app/api/webhard/files/route.ts)
    → proxyToNestJS() [인증 확인 + Rate Limit]
      → NestJS GET /api/v1/files
        → SessionAuthGuard [세션 쿠키 검증]
          → FilesController.getFiles()
            → FilesService.getFiles()
              → PrismaService.executeWithRetry()
                → Prisma ORM → PostgreSQL
```

### 1.4 주요 설정값

```typescript
// 저장소 제한
DEFAULT_STORAGE_LIMIT  = 10GB      // 일반 사용자
ADMIN_STORAGE_LIMIT    = 100GB     // 관리자

// 업로드 설정
MAX_FILE_SIZE          = 2GB       // 단일 파일 최대 크기
MAX_BATCH_SIZE         = 100       // 배치 작업 최대 파일 수
CONCURRENT_UPLOADS     = 3         // 동시 업로드 수 (프론트엔드)
PRESIGN_EXPIRES_IN     = 3600      // Presigned URL 만료 (1시간)

// 다운로드 설정
CONCURRENT_DOWNLOAD    = 6         // 동시 다운로드 수

// 휴지통 설정
TRASH_RETENTION_DAYS   = 3         // 보존 기간 (일)

// DB 재시도 설정
MAX_RETRIES            = 3         // 최대 재시도 횟수
INITIAL_RETRY_DELAY    = 1000ms    // 초기 대기 시간
MAX_RETRY_DELAY        = 10000ms   // 최대 대기 시간
HEALTH_CHECK_INTERVAL  = 300000ms  // 헬스체크 주기 (5분)
```

---

## 2. 데이터베이스 스키마

### 2.1 webhard_files 테이블

```prisma
// webhard-api/prisma/schema.prisma

model WebhardFile {
  id            String    @id @default(uuid())
  name          String                        // R2에 저장된 파일명 (sanitized)
  originalName  String    @map("original_name") // 사용자가 업로드한 원본 파일명
  size          BigInt                        // 파일 크기 (bytes)
  mimeType      String    @map("mime_type")   // MIME 타입
  path          String                        // R2 저장 경로 (key)
  folderId      String?   @map("folder_id")   // 소속 폴더 (null = 루트)
  companyId     Int?      @map("company_id")  // 소속 회사 (null = 공유/관리자)
  uploadedBy    String    @map("uploaded_by") // 업로더 ID (admin=0, company=userId)
  inquiryNumber String?   @map("inquiry_number") // 문의번호 연결
  isDownloaded  Boolean   @default(false)     // 다운로드 여부 (뱃지 표시용)
  createdAt     DateTime  @default(now())     @map("created_at")
  updatedAt     DateTime  @default(now())     @map("updated_at")
  deletedAt     DateTime? @map("deleted_at")  // Soft Delete 시각
  deletedBy     String?   @map("deleted_by")  // 삭제자 ID

  folder  WebhardFolder? @relation(fields: [folderId], references: [id])

  @@index([folderId, companyId, deletedAt])
  @@map("webhard_files")
}
```

### 2.2 webhard_folders 테이블

```prisma
model WebhardFolder {
  id        String    @id @default(uuid())
  name      String                          // 폴더명
  parentId  String?   @map("parent_id")     // 부모 폴더 (null = 루트)
  companyId Int?      @map("company_id")    // 소속 회사
  path      String?                         // 경로 캐시 (breadcrumb용)
  createdAt DateTime  @default(now())       @map("created_at")
  updatedAt DateTime  @default(now())       @map("updated_at")
  deletedAt DateTime? @map("deleted_at")    // Soft Delete

  parent    WebhardFolder?  @relation("FolderHierarchy", fields: [parentId], references: [id])
  children  WebhardFolder[] @relation("FolderHierarchy")
  files     WebhardFile[]

  @@index([parentId, companyId, path])
  @@map("webhard_folders")
}
```

### 2.3 R2 저장 경로 구조

```
R2 Bucket: yjlaser
└── webhard/
    ├── company-{id}/           # 회사별 격리
    │   ├── {folderId}/
    │   │   └── {timestamp}-{random}-{sanitized_filename}
    │   └── root/               # 루트 폴더 파일
    └── admin/                  # 관리자 공유 파일
```

**파일명 생성 로직** (`StorageService.generateStoragePath()`):

```typescript
// webhard-api/src/storage/storage.service.ts:generateStoragePath()

const timestamp = Date.now();
const random = Math.random().toString(36).substring(2, 8);
const sanitized = filename
  .replace(/[^a-zA-Z0-9가-힣._-]/g, '_') // 특수문자 → _
  .replace(/_+/g, '_') // 연속 _ 제거
  .substring(0, 200); // 200자 제한
const fullName = `${timestamp}-${random}-${sanitized}`;

// 예: webhard/company-1/folder-uuid/1707968790000-abc123-document.pdf
```

---

## 3. API 엔드포인트 전체 목록

### 3.1 파일 관리 API (`/api/v1/files`)

| HTTP   | 엔드포인트               | 컨트롤러 메서드           | 서비스 메서드                   | 설명                                                  |
| ------ | ------------------------ | ------------------------- | ------------------------------- | ----------------------------------------------------- |
| GET    | `/files`                 | `getFiles()`              | `getFiles()`                    | 파일 목록 (페이지네이션, 폴더/업체 필터링, 정렬)      |
| GET    | `/files/search`          | `searchFiles()`           | `searchFiles()`                 | 파일명 검색 (대소문자 무시, 최대 50개)                |
| GET    | `/files/badge-counts`    | `getBadgeCounts()`        | `getBadgeCounts()`              | 미다운로드 파일 수 (폴더별 카운트 옵션)               |
| GET    | `/files/new`             | `getNewFiles()`           | `getNewFiles()`                 | 미다운로드 파일 목록 (페이지네이션)                   |
| GET    | `/files/:id/download`    | `getDownloadUrl()`        | `getDownloadUrl()`              | 다운로드용 Presigned URL 생성 + isDownloaded 업데이트 |
| POST   | `/files/presigned-url`   | `getPresignedUrl()`       | `getUploadPresignedUrl()`       | 단일 업로드용 Presigned URL                           |
| POST   | `/files/batch/upload`    | `getBatchPresignedUrls()` | `getBatchUploadPresignedUrls()` | 배치 업로드용 Presigned URLs                          |
| POST   | `/files/confirm`         | `confirmUpload()`         | `confirmUpload()`               | 업로드 완료 메타데이터 저장                           |
| POST   | `/files/mark-downloaded` | `markDownloaded()`        | `markDownloaded()`              | 파일 다운로드 표시 (배치)                             |
| PATCH  | `/files/:id/rename`      | `renameFile()`            | `renameFile()`                  | 파일명 변경                                           |
| PATCH  | `/files/:id/move`        | `moveFile()`              | `moveFile()`                    | 파일 이동                                             |
| POST   | `/files/batch/move`      | `batchMoveFiles()`        | `batchMoveFiles()`              | 배치 파일 이동                                        |
| DELETE | `/files/:id`             | `deleteFile()`            | `deleteFile()`                  | 파일 삭제 (Soft Delete)                               |
| POST   | `/files/batch/delete`    | `batchDeleteFiles()`      | `batchDeleteFiles()`            | 배치 파일 삭제 (Soft Delete)                          |

### 3.2 폴더 관리 API (`/api/v1/folders`)

| HTTP   | 엔드포인트               | 컨트롤러 메서드         | 서비스 메서드           | 설명                          |
| ------ | ------------------------ | ----------------------- | ----------------------- | ----------------------------- |
| GET    | `/folders`               | `getFolders()`          | `getFolders()`          | 폴더 목록 (parentId 필터링)   |
| GET    | `/folders/tree`          | `getFolderTree()`       | `getFolderTree()`       | 전체 폴더 트리 (네비게이션용) |
| GET    | `/folders/batch-delete`  | `getBatchDeleteStats()` | `getBatchDeleteStats()` | 배치 삭제 통계 (폴더/파일 수) |
| DELETE | `/folders/batch-delete`  | `batchDeleteFolders()`  | `batchDeleteFolders()`  | 배치 폴더 삭제                |
| GET    | `/folders/:id`           | `getFolderDetail()`     | `getFolderDetail()`     | 폴더 상세 + 내용물            |
| GET    | `/folders/:id/ancestors` | `getFolderAncestors()`  | `getAncestors()`        | 상위 폴더 경로 (Breadcrumb)   |
| POST   | `/folders`               | `createFolder()`        | `createFolder()`        | 폴더 생성                     |
| PATCH  | `/folders/:id/rename`    | `renameFolder()`        | `renameFolder()`        | 폴더명 변경                   |
| PATCH  | `/folders/:id/move`      | `moveFolder()`          | `moveFolder()`          | 폴더 이동 (순환참조 방지)     |
| DELETE | `/folders/:id`           | `deleteFolder()`        | `deleteFolder()`        | 폴더 삭제 (재귀 Soft Delete)  |

### 3.3 휴지통 API (`/api/v1/trash`)

| HTTP   | 엔드포인트           | 서비스 메서드             | 설명                                  |
| ------ | -------------------- | ------------------------- | ------------------------------------- |
| GET    | `/trash`             | `getTrashFiles()`         | 휴지통 파일 목록                      |
| GET    | `/trash/count`       | `getTrashCount()`         | 휴지통 파일 수                        |
| POST   | `/trash/:id/restore` | `restoreFile()`           | 파일 복원                             |
| DELETE | `/trash/:id`         | `permanentlyDeleteFile()` | 승인 body 필요. 휴지통 파일 영구 삭제 |
| DELETE | `/trash`             | `emptyTrash()`            | 승인 body 필요. 휴지통 비우기         |

### 3.4 저장공간 API (`/api/v1/storage`)

| HTTP | 엔드포인트             | 서비스 메서드             | 설명                  |
| ---- | ---------------------- | ------------------------- | --------------------- |
| GET  | `/storage`             | `getStorageUsage()`       | 저장공간 사용량       |
| GET  | `/storage/breakdown`   | `getStorageBreakdown()`   | 업체/폴더별 상세 내역 |
| GET  | `/storage/performance` | `getPerformanceMetrics()` | 성능 메트릭 (관리자)  |

### 3.5 Next.js 프록시 라우트 맵

```
src/app/api/webhard/
├── files/
│   ├── route.ts                    → GET /api/v1/files
│   ├── presigned-url/route.ts      → POST /api/v1/files/presigned-url
│   ├── confirm/route.ts            → POST /api/v1/files/confirm
│   ├── badge-counts/route.ts       → GET /api/v1/files/badge-counts
│   ├── mark-downloaded/route.ts    → POST /api/v1/files/mark-downloaded
│   ├── new/route.ts                → GET /api/v1/files/new
│   ├── batch/
│   │   ├── upload/route.ts         → POST /api/v1/files/batch/upload
│   │   ├── delete/route.ts         → POST /api/v1/files/batch/delete
│   │   └── move/route.ts           → POST /api/v1/files/batch/move
│   └── [id]/
│       ├── download/route.ts       → GET /api/v1/files/:id/download
│       ├── delete/route.ts         → DELETE /api/v1/files/:id
│       ├── move/route.ts           → PATCH /api/v1/files/:id/move
│       └── rename/route.ts         → PATCH /api/v1/files/:id/rename
├── folders/
│   ├── route.ts                    → GET/POST /api/v1/folders
│   └── [id]/
│       ├── route.ts                → GET /api/v1/folders/:id
│       ├── ancestors/route.ts      → GET /api/v1/folders/:id/ancestors
│       ├── delete/route.ts         → DELETE /api/v1/folders/:id
│       ├── move/route.ts           → PATCH /api/v1/folders/:id/move
│       └── rename/route.ts         → PATCH /api/v1/folders/:id/rename
├── download/route.ts               → GET /api/v1/files/:id/download
├── badge-counts/route.ts           → GET /api/v1/files/badge-counts
├── storage/route.ts                → GET /api/v1/storage
├── trash/
│   ├── route.ts                    → GET/DELETE /api/v1/trash
│   └── [id]/
│       ├── restore/route.ts        → POST /api/v1/trash/:id/restore
│       └── permanent-delete/route.ts → DELETE /api/v1/trash/:id
└── search/route.ts                 → GET /api/v1/files/search
```

---

## 4. 업로드 로직

### 4.1 전체 업로드 플로우 (3단계)

```
┌──────────────────────────────────────────────────────────────────┐
│ 단계 1: Presigned URL 생성                                      │
│                                                                   │
│ 프론트엔드                                                       │
│ useFileUpload.uploadFiles()                                      │
│   ├── 파일 검증 (크기 ≤ 2GB, 개수 ≤ 100, 빈 파일 거부)        │
│   ├── PendingFileDTO 생성 → 캐시에 Optimistic Update           │
│   └── POST /api/webhard/files/batch/upload                      │
│         ↓                                                        │
│ Next.js API Route                                                │
│   └── proxyToNestJS() [인증 + Rate Limit]                       │
│         ↓                                                        │
│ NestJS: FilesService.getBatchUploadPresignedUrls()               │
│   ├── StorageService.generateStoragePath() [경로 생성]           │
│   └── StorageService.getUploadPresignedUrl() [R2 PutObject]     │
│         ↓                                                        │
│ 응답: { urls: [{ url, key, expiresAt }] }                       │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 단계 2: R2에 직접 업로드 (서버 우회, cross-origin)              │
│                                                                   │
│ ⚠ R2 버킷에 CORS 설정 필수 (미설정 시 브라우저 차단)           │
│   → 설정: npx tsx scripts/setup-r2-cors.ts                       │
│                                                                   │
│ 프론트엔드: uploadFilesBatch()                                   │
│   ├── 동시성 제어: CONCURRENT_UPLOADS = 3                       │
│   ├── fetch(presignedUrl, { method: 'PUT', body: File })        │
│   └── 진행률 → 캐시의 PendingFileDTO.uploadProgress 업데이트   │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 단계 3: 메타데이터 저장                                          │
│                                                                   │
│ 프론트엔드: POST /api/webhard/files/confirm                      │
│         ↓                                                        │
│ NestJS: FilesService.confirmUpload()                             │
│   ├── uploadedBy = admin → '0', company → userId                │
│   └── Raw SQL INSERT INTO webhard_files (...)                    │
│         ↓                                                        │
│ 프론트엔드:                                                      │
│   ├── 캐시에서 PendingFileDTO 제거                              │
│   ├── invalidateQueries(files.list, newFiles, badgeCounts)      │
│   └── Toast 알림                                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 관련 코드 상세

#### 프론트엔드: `useFileUpload.ts`

```typescript
// src/app/webhard/hooks/useFileUpload.ts

const uploadFiles = useCallback(
  async (files: FileList | File[]) => {
    // 1. 검증
    if (fileArray.length > 100) throw Error('최대 100개');
    if (fileArray.some((f) => f.size > 2 * 1024 * 1024 * 1024)) throw Error('최대 2GB');
    fileArray = fileArray.filter((f) => f.size > 0); // 빈 파일 제거

    // 2. Optimistic Update: PendingFileDTO를 캐시에 추가
    const pendingFiles = fileArray.map((file) => createPendingFile(file, folderId, companyId));
    queryClient.setQueryData(filesQueryKey, (oldData) => ({
      ...oldData,
      files: [...pendingFiles, ...oldData.files],
    }));

    // 3. uploadFilesBatch() 호출 (동시성 제어)
    const result = await uploadFilesBatch(fileArray, {
      folderId,
      companyId,
      onProgress: (fileName, progress) => {
        // 캐시에서 uploadProgress 업데이트
        queryClient.setQueryData(filesQueryKey, (old) => ({
          ...old,
          files: old.files.map((f) =>
            isPendingFile(f) && f.original_name === fileName
              ? { ...f, uploadProgress: progress }
              : f
          ),
        }));
      },
    });

    // 4. 완료 처리
    queryClient.invalidateQueries({ queryKey: queryKeys.webhard.files.list() });
    invalidateBadgeCounts(queryClient);
  },
  [folderId, companyId, queryClient]
);
```

#### 백엔드: `FilesService.confirmUpload()`

```typescript
// webhard-api/src/files/files.service.ts

async confirmUpload(dto: ConfirmUploadDto, user: SessionUser): Promise<FileResponseDto> {
  const uploadedBy = user.userType === 'admin' ? '0' : String(user.companyId);

  // Raw SQL INSERT (Prisma create 대신)
  const result = await this.prisma.executeWithRetry(
    () => this.prisma.$queryRaw`
      INSERT INTO webhard_files (id, name, original_name, size, mime_type, path,
        folder_id, company_id, uploaded_by, is_downloaded, created_at, updated_at)
      VALUES (gen_random_uuid(), ${dto.name}, ${dto.originalName}, ${dto.size},
        ${dto.mimeType}, ${dto.key}, ${dto.folderId}, ${dto.companyId},
        ${uploadedBy}, false, NOW(), NOW())
      RETURNING *
    `,
    { operationName: 'confirmUpload' }
  );

  return this.mapToDto(result[0]);
}
```

#### 백엔드: `StorageService.getUploadPresignedUrl()`

```typescript
// webhard-api/src/storage/storage.service.ts

async getUploadPresignedUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<PresignedUrlResult> {
  const command = new PutObjectCommand({
    Bucket: this.bucketName,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(this.s3Client, command, { expiresIn });

  return {
    url,
    key,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}
```

### 4.3 R2 S3 Client 설정

```typescript
// webhard-api/src/storage/storage.service.ts 생성자

this.s3Client = new S3Client({
  region: 'auto', // Cloudflare R2는 'auto'
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED', // AWS SDK v3.723+에서 CRC32 자동 삽입 방지
});
```

### 4.4 업로드 트러블슈팅

| 증상                                                                   | 원인                                                                   | 해결                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 브라우저에서 PUT 요청이 CORS 에러로 차단됨                             | R2 버킷에 CORS 규칙 미설정. 단계 2는 cross-origin 요청이므로 CORS 필수 | `npx tsx scripts/setup-r2-cors.ts` 실행 (dev/prod 버킷 모두)        |
| Presigned URL에 `x-amz-checksum-crc32` 파라미터가 포함되어 서명 불일치 | AWS SDK v3.723+ 에서 `PutObjectCommand`에 CRC32 체크섬 자동 삽입       | S3Client 생성 시 `requestChecksumCalculation: 'WHEN_REQUIRED'` 설정 |

### 4.5 업로드 후 자동 문의 생성

업체 웹하드에 파일이 업로드되면 `AutoContactService`가 자동으로 문의(Contact)를 생성한다.

```
파일 업로드 완료 → FilesService.confirmUpload()
  → AutoContactService.createOrUpdateContact()
    ├── 폴더명으로 업체 매칭 (LaserOnlyMapping → Company.laserOnly)
    ├── 폴더 구조로 inquiryType 결정 (cutting_request / mold_request / laser_cutting)
    └── 문의 생성 (status, processStage 설정)
```

**레이저 전용 업체의 공정 단축 경로:**

| 조건                        | inquiryType     | status      | processStage | 비고            |
| --------------------------- | --------------- | ----------- | ------------ | --------------- |
| laserOnly + 일반 폴더       | `laser_cutting` | `cutting`   | `laser`      | 레이저가공 직행 |
| laserOnly + 샘플의뢰 폴더   | 기존 로직 유지  | `confirmed` | `sample`     | 샘플 로직 우선  |
| 일반 업체 (laserOnly=false) | 기존 로직 유지  | 폴더 기반   | 폴더 기반    | 변경 없음       |

레이저 전용 문의는 레이저가공 완료 시 `completed` 상태로 즉시 종결되며, 칼작업/오시작업/납품 단계를 거치지 않는다. 상세 스펙: `docs/specs/features/laser-only-company-inquiry.md`

---

## 5. 다운로드 로직

### 5.1 전체 다운로드 플로우

```
┌──────────────────────────────────────────────────────────────────┐
│ 프론트엔드: useFileBatchDownload                                 │
│                                                                   │
│ 1. 파일 선택 후 다운로드 클릭                                    │
│ 2. 동시성 제어: CONCURRENT_LIMIT = 6                             │
│    (R2 도메인별 브라우저 HTTP/2 연결 활용)                       │
│                                                                   │
│ 각 파일마다:                                                      │
│ ├── GET /api/webhard/download?fileId={id}                        │
│ │     → proxyToNestJS() → NestJS                                 │
│ │     → FilesService.getDownloadUrl()                            │
│ │       ├── DB에서 파일 조회                                     │
│ │       ├── verifyFileAccess() [권한 검증]                       │
│ │       ├── UPDATE: isDownloaded = true                          │
│ │       └── StorageService.getDownloadPresignedUrl()             │
│ │           └── GetObjectCommand → Presigned URL (1시간)         │
│ │                                                                 │
│ ├── 응답: { signedUrl, filename }                                │
│ │                                                                 │
│ ├── fetch(signedUrl) → R2에서 직접 다운로드 (서버 우회)         │
│ │                                                                 │
│ └── Optimistic Update:                                           │
│     ├── 캐시에서 is_downloaded = true 설정                       │
│     └── 뱃지 카운트 감소                                         │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Optimistic Update + 롤백 패턴

```typescript
// src/app/webhard/hooks/useFileBatchDownload.ts

const downloadSingleFile = async (file: WebhardFileDTO) => {
  // 이전 상태 저장 (롤백용)
  const previousData = queryClient.getQueryData(filesQueryKey);

  try {
    // Signed URL 요청
    const response = await fetch(`/api/webhard/download?fileId=${file.id}&mode=signedUrl`);
    const { signedUrl, filename } = await response.json();

    // R2에서 직접 다운로드
    await downloadViaSignedUrl(signedUrl, filename);

    // Optimistic Update: 캐시에서 다운로드 표시
    queryClient.setQueryData(filesQueryKey, (oldData) => ({
      ...oldData,
      files: oldData.files.map((f) => (f.id === file.id ? { ...f, is_downloaded: true } : f)),
    }));
  } catch (error) {
    // 실패 시 롤백
    queryClient.setQueryData(filesQueryKey, previousData);
    throw error;
  }
};
```

---

## 6. 삭제 로직

### 6.1 삭제 유형 분류

| 유형               | 설명                       | 백엔드 메서드                          | R2 삭제 여부 |
| ------------------ | -------------------------- | -------------------------------------- | ------------ |
| Soft Delete (단일) | 휴지통 이동                | `FilesService.deleteFile()`            | X            |
| Soft Delete (배치) | 다중 파일 휴지통           | `FilesService.batchDeleteFiles()`      | X            |
| 폴더 재귀 삭제     | 하위 전체 Soft Delete      | `FoldersService.deleteFolder()`        | X            |
| 영구 삭제 (단일)   | 승인 후 R2/Drive + DB 삭제 | `TrashService.permanentlyDeleteFile()` | O            |
| 휴지통 비우기      | 승인 후 전체 영구 삭제     | `TrashService.emptyTrash()`            | O            |
| 자동 정리          | 사용자 승인 정책으로 no-op | `TrashService.cleanupExpiredFiles()`   | X            |

### 6.2 Soft Delete 프로세스

```
프론트엔드: useFileOperations.deleteFiles()
  │
  ├── Optimistic Update: removeFilesFromCache()
  │   └── 캐시에서 파일 즉시 제거 (UI 반영)
  │
  ├── POST /api/webhard/files/batch/delete { fileIds: [...] }
  │     ↓
  │   NestJS: FilesService.batchDeleteFiles()
  │     ├── 1. 모든 파일 1회 조회 (findMany)
  │     ├── 2. 메모리에서 권한 검증 (verifyFileAccess)
  │     ├── 3. 권한 있는 파일만 단일 updateMany:
  │     │     UPDATE webhard_files
  │     │     SET deleted_at = NOW(),
  │     │         deleted_by = CASE admin→'1' ELSE companyId END
  │     │     WHERE id IN (authorizedIds)
  │     └── 4. 결과: { success, processed, failed, errors, durationMs }
  │
  └── invalidateAfterDelete()
      └── 뱃지 카운트 갱신
```

### 6.3 폴더 재귀 삭제

```typescript
// webhard-api/src/folders/folders.service.ts

async deleteFolder(folderId: string, user: SessionUser): Promise<void> {
  // 1. 폴더 조회 + 권한 검증
  const folder = await this.prisma.executeWithRetry(
    () => this.prisma.webhardFolder.findUnique({ where: { id: folderId } }),
    { operationName: 'deleteFolder-find' }
  );
  this.verifyFolderAccess(folder, user);

  // 2. 모든 하위 폴더 ID 수집 (메모리 BFS)
  const allFolderIds = await this.getDescendantFolderIds(folderId);
  allFolderIds.push(folderId); // 자신 포함

  // 3. 트랜잭션으로 원자적 삭제
  const now = new Date();
  const deletedBy = user.userType === 'admin' ? '1' : String(user.companyId);

  await this.prisma.$transaction([
    // 폴더 Soft Delete
    this.prisma.webhardFolder.updateMany({
      where: { id: { in: allFolderIds } },
      data: { deletedAt: now },
    }),
    // 하위 파일 Soft Delete
    this.prisma.webhardFile.updateMany({
      where: { folderId: { in: allFolderIds }, deletedAt: null },
      data: { deletedAt: now, deletedBy },
    }),
  ]);
}
```

### 6.4 영구 삭제 (Hard Delete)

```typescript
// webhard-api/src/trash/trash.service.ts

async permanentlyDeleteFile(
  fileId: string,
  user: SessionUser,
  approval: PermanentDeleteApprovalDto
): Promise<void> {
  this.assertPermanentDeleteApproval(approval);

  const file = await this.prisma.executeWithRetry(
    () => this.prisma.webhardFile.findFirst({
      where: { id: fileId, deletedAt: { not: null } },
    }),
    { operationName: 'permanentDelete-find' }
  );

  if (!file) throw new NotFoundException('File not found in trash');
  this.verifyFileAccess(file, user);

  // 1. R2/Drive에서 파일 삭제. Drive는 trashed=true item만 files.delete 허용.
  await this.deleteFileFromStorage(file, true);

  // 2. DB에서 레코드 삭제
  await this.prisma.executeWithRetry(
    () => this.prisma.webhardFile.delete({ where: { id: fileId } }),
    { operationName: 'permanentDelete-delete' }
  );
}
```

### 6.5 배치 영구 삭제 (R2 최적화)

```typescript
// webhard-api/src/storage/storage.service.ts

async deleteFiles(keys: string[]): Promise<DeleteResult> {
  const results: DeleteResult = { deleted: [], errors: [] };

  // R2 제한: 1000개씩 청크 분할
  const chunks = [];
  for (let i = 0; i < keys.length; i += 1000) {
    chunks.push(keys.slice(i, i + 1000));
  }

  for (const chunk of chunks) {
    const command = new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: {
        Objects: chunk.map(k => ({ Key: k })),
        Quiet: false,  // 상세 응답
      },
    });

    const result = await this.s3Client.send(command);
    results.deleted.push(...(result.Deleted || []));
    results.errors.push(...(result.Errors || []));
  }

  return results;
}
```

---

## 7. 수정 로직

### 7.1 파일 이름 변경

```
PATCH /api/v1/files/:id/rename  { newName: "새이름.pdf" }

NestJS: FilesService.renameFile()
  ├── 파일 조회 (findUnique)
  ├── verifyFileAccess() [권한 검증]
  └── update({ name: newName })

프론트엔드: optimisticRename()
  ├── 캐시에서 즉시 name, original_name 업데이트
  └── 실패 시 rollback()
```

### 7.2 파일 이동

```
PATCH /api/v1/files/:id/move  { targetFolderId: "uuid" }

NestJS: FilesService.moveFile()
  ├── 파일 조회 (findUnique)
  ├── verifyFileAccess() [권한 검증]
  ├── 대상 폴더 존재 + 권한 확인 (verifyFolderAccess)
  └── update({ folderId: targetFolderId })

프론트엔드: optimisticMove()
  ├── 소스 폴더 캐시에서 파일 제거
  ├── 대상 폴더 캐시에 파일 추가 (folder_id 업데이트)
  └── 실패 시 rollback()
```

### 7.3 배치 이동 (N+1 최적화)

```typescript
// webhard-api/src/files/files.service.ts

async batchMoveFiles(dto: BatchMoveFilesDto, user: SessionUser) {
  const startTime = Date.now();

  // 1. 모든 파일 1회 조회 (N+1 방지)
  const files = await this.prisma.executeWithRetry(
    () => this.prisma.webhardFile.findMany({
      where: { id: { in: dto.fileIds }, deletedAt: null },
      select: { id: true, companyId: true },
    }),
    { operationName: 'batchMove-find' }
  );

  // 2. 메모리에서 권한 검증 (DB 호출 없음)
  const authorizedIds = files
    .filter(f => this.canAccess(f, user))
    .map(f => f.id);

  // 3. 단일 updateMany로 이동
  const result = await this.prisma.executeWithRetry(
    () => this.prisma.webhardFile.updateMany({
      where: { id: { in: authorizedIds } },
      data: { folderId: dto.targetFolderId, updatedAt: new Date() },
    }),
    { operationName: 'batchMove-update' }
  );

  return {
    success: true,
    processed: result.count,
    failed: dto.fileIds.length - result.count,
    durationMs: Date.now() - startTime,
  };
}
```

### 7.4 폴더 이동 (순환참조 방지)

```typescript
// webhard-api/src/folders/folders.service.ts

async moveFolder(folderId: string, dto: MoveFolderDto, user: SessionUser) {
  // 1. 자기 자신으로 이동 불가
  if (folderId === dto.targetParentId) {
    throw new BadRequestException('Cannot move folder to itself');
  }

  // 2. 순환 참조 체크: 대상이 자신의 하위 폴더인지 확인
  const isDescendant = await this.isDescendantOf(dto.targetParentId, folderId);
  if (isDescendant) {
    throw new BadRequestException('Cannot move folder to its own descendant');
  }

  // 3. 대상 폴더 검증
  if (dto.targetParentId) {
    const targetFolder = await this.findFolder(dto.targetParentId);
    this.verifyFolderAccess(targetFolder, user);
  }

  // 4. 동일 이름 충돌 시 자동 이름 변경
  const existingNames = await this.getSiblingNames(dto.targetParentId);
  let finalName = folder.name;
  let counter = 1;
  while (existingNames.includes(finalName)) {
    finalName = `${folder.name} (${counter++})`;
  }

  // 5. 업데이트
  return this.prisma.webhardFolder.update({
    where: { id: folderId },
    data: { parentId: dto.targetParentId, name: finalName },
  });
}
```

#### 순환참조 감지 알고리즘 (`isDescendantOf`)

```typescript
// 모든 폴더를 1회 조회 → parentId 맵 → 메모리에서 체인 탐색
private async isDescendantOf(folderId: string, ancestorId: string): Promise<boolean> {
  const allFolders = await this.prisma.webhardFolder.findMany({
    where: { deletedAt: null },
    select: { id: true, parentId: true },
  });

  const parentMap = new Map(allFolders.map(f => [f.id, f.parentId]));

  let current = folderId;
  while (current) {
    if (current === ancestorId) return true;
    current = parentMap.get(current) || null;
  }
  return false;
}
```

---

## 8. 폴더 관리

### 8.1 폴더 트리 구성

```typescript
// webhard-api/src/folders/folders.service.ts

async getFolderTree(user: SessionUser): Promise<FolderTreeNodeDto[]> {
  // 1. 모든 폴더 1회 조회
  const allFolders = await this.prisma.executeWithRetry(
    () => this.prisma.webhardFolder.findMany({
      where: {
        deletedAt: null,
        ...(user.userType === 'company'
          ? { OR: [{ companyId: user.companyId }, { companyId: null }] }
          : {}),
      },
      orderBy: { name: 'asc' },
    }),
    { operationName: 'getFolderTree' }
  );

  // 2. 메모리에서 트리 구성
  const map = new Map<string, FolderTreeNodeDto>();
  allFolders.forEach(f => map.set(f.id, { ...f, children: [] }));

  const roots: FolderTreeNodeDto[] = [];
  allFolders.forEach(f => {
    const node = map.get(f.id);
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}
```

### 8.2 Breadcrumb (조상 경로) 조회

```typescript
// webhard-api/src/folders/folders.service.ts

async getAncestors(folderId: string, user: SessionUser): Promise<FolderAncestorsResponseDto> {
  // 1. 모든 폴더 1회 조회
  const allFolders = await this.prisma.webhardFolder.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, parentId: true, companyId: true },
  });

  // 2. 메모리에서 조상 체인 구성 (루트 → 현재)
  const folderMap = new Map(allFolders.map(f => [f.id, f]));
  const ancestors = [];
  let current = folderMap.get(folderId);

  while (current) {
    ancestors.unshift(current); // 앞에 추가 (루트부터)
    current = current.parentId ? folderMap.get(current.parentId) : null;
  }

  return { ancestors };
}
```

### 8.3 하위 폴더 수집 (BFS)

```typescript
// webhard-api/src/folders/folders.service.ts

private async getDescendantFolderIds(folderId: string): Promise<string[]> {
  // 모든 폴더 1회 조회 → parentId→children 맵 → BFS
  const allFolders = await this.prisma.webhardFolder.findMany({
    where: { deletedAt: null },
    select: { id: true, parentId: true },
  });

  const childrenMap = new Map<string, string[]>();
  allFolders.forEach(f => {
    if (f.parentId) {
      if (!childrenMap.has(f.parentId)) childrenMap.set(f.parentId, []);
      childrenMap.get(f.parentId).push(f.id);
    }
  });

  // BFS
  const result: string[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = childrenMap.get(current) || [];
    result.push(...children);
    queue.push(...children);
  }

  return result;
}
```

### 8.4 업체 초기 폴더 생성

```typescript
// 업체 사용자 첫 접속 시 자동 생성
initializeCompanyFolders(companyId, companyName)
  └── 생성 구조:
       {companyName} (루트)
       ├── 올리기
       │   └── 완료함
       └── 내리기
```

---

## 9. 휴지통 시스템

### 9.1 동작 원리

```
파일 삭제 (Soft Delete)
  └── deletedAt = NOW(), deletedBy = userId

휴지통 상태:
  ├── 조회 가능: GET /trash (deletedAt IS NOT NULL)
  ├── 복원 가능: POST /trash/:id/restore → deletedAt = NULL
  └── 승인 후 영구 삭제 가능: DELETE /trash/:id → R2/Drive 삭제 + DB 삭제

보관 기간 초과:
  └── 자동 영구삭제 없음. 휴지통 목록에 남고 사용자 승인 후에만 삭제.
```

### 9.2 휴지통 조회 (잔여일수 계산)

```typescript
// webhard-api/src/trash/trash.service.ts

mapToTrashDto(file): TrashFileDto {
  const deletedDate = new Date(file.deletedAt);
  const now = new Date();
  const daysSinceDeleted = Math.floor((now - deletedDate) / (1000 * 60 * 60 * 24));
  const daysUntilDelete = Math.max(0, TRASH_RETENTION_DAYS - daysSinceDeleted);

  return {
    ...this.mapToDto(file),
    daysUntilDelete,  // 영구 삭제까지 남은 일수
  };
}
```

---

## 10. 저장공간 관리

### 10.1 사용량 조회

```typescript
// webhard-api/src/storage/storage.service.ts

async getStorageUsage(user: SessionUser, queryCompanyId?: number) {
  const effectiveCompanyId =
    user.userType === 'company' ? user.companyId : queryCompanyId;

  const where = {
    deletedAt: null,
    ...(effectiveCompanyId
      ? { OR: [{ companyId: effectiveCompanyId }, { companyId: null }] }
      : {}),
  };

  const result = await this.prisma.webhardFile.aggregate({
    where,
    _sum: { size: true },
    _count: true,
  });

  const limit = user.userType === 'admin' ? ADMIN_STORAGE_LIMIT : DEFAULT_STORAGE_LIMIT;

  return {
    usedBytes: Number(result._sum.size || 0),
    totalBytes: limit,
    fileCount: result._count,
    usagePercent: (Number(result._sum.size || 0) / limit) * 100,
  };
}
```

### 10.2 업체별/폴더별 상세 내역

```typescript
// getStorageBreakdown()
// Admin: 업체별 groupBy(companyId) → 각 업체별 사용량
// Company: 폴더별 groupBy(folderId) → 각 폴더별 사용량
```

### 10.3 성능 메트릭 (관리자 전용)

```typescript
// getPerformanceMetrics() - 8가지 병렬 쿼리
const [
  totalFiles,      // 전체 파일 수
  totalFolders,    // 전체 폴더 수
  totalSize,       // 전체 용량
  recentFiles,     // 최근 24시간 업로드 파일
  undownloaded,    // 미다운로드 파일 수
  sizeDistribution,// 파일 크기 분포 (Raw SQL)
  folderDepth,     // 폴더 깊이 통계 (Raw SQL)
  trashCount,      // 휴지통 파일 수
] = await Promise.all([...]);
```

**파일 크기 분포 (Raw SQL)**:

```sql
SELECT
  CASE
    WHEN size < 1048576 THEN 'small'         -- < 1MB
    WHEN size < 104857600 THEN 'medium'      -- < 100MB
    WHEN size < 1073741824 THEN 'large'      -- < 1GB
    ELSE 'xlarge'                             -- >= 1GB
  END as category,
  COUNT(*) as count
FROM webhard_files
WHERE deleted_at IS NULL
GROUP BY category
```

---

## 11. 검색 기능

### 11.1 파일 검색

```typescript
// webhard-api/src/files/files.service.ts

async searchFiles(query: SearchFilesQueryDto, user: SessionUser) {
  return this.prisma.webhardFile.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: query.query, mode: 'insensitive' } },
        { originalName: { contains: query.query, mode: 'insensitive' } },
      ],
      ...(user.userType === 'company'
        ? { OR: [{ companyId: user.companyId }, { companyId: null }] }
        : {}),
    },
    take: 50,  // 최대 50개
    orderBy: { createdAt: 'desc' },
  });
}
```

### 11.2 프론트엔드 검색 패턴

```typescript
// 프론트엔드에서 2가지 검색 UI 제공:
// 1. SearchModal: 전체 검색 (debounce 300ms)
// 2. SearchDropdown: 드롭다운 검색 (debounce 300ms)

// 별도 queryKey로 캐싱:
queryKeys.webhard.search.modal(query); // 모달 검색 캐시
queryKeys.webhard.search.dropdown(query); // 드롭다운 검색 캐시
```

---

## 12. 인증 및 권한 체계

### 12.1 세션 기반 인증 흐름

```
1. 로그인 → 세션 쿠키 발급
   쿠키명: admin-session
   형식: token:{sessionData}.signature

2. sessionData = JSON.stringify({ userType, userId })
   예: {"userType":"admin"} 또는 {"userType":"company","userId":123}

3. signature = HMAC-SHA256(token:sessionData, SESSION_SECRET)

4. 검증 흐름 (SessionAuthGuard):
   ├── 쿠키에서 admin-session 추출
   ├── 형식 파싱: token:data.signature
   ├── HMAC 서명 검증 (timing-safe comparison)
   ├── JSON 파싱: {userType, userId}
   ├── 실패 → 401 UnauthorizedException
   └── 성공 → request.user = SessionUser
```

### 12.2 SessionUser 인터페이스

```typescript
interface SessionUser {
  userType: 'admin' | 'company';
  userId: string | number; // 'admin' or companyId
  companyId: number | null; // admin=0, company=회사ID
}
```

### 12.3 권한 검증 패턴

```typescript
// webhard-api/src/files/files.service.ts

private verifyFileAccess(
  file: { companyId: number | null },
  user: SessionUser
): void {
  // Admin: 모든 파일 접근 가능
  if (user.userType === 'admin') return;

  // Company: 자신의 회사 파일 or 공유 파일(companyId=null)
  if (file.companyId !== null && file.companyId !== user.companyId) {
    throw new ForbiddenException('Access denied');
  }
}
```

### 12.4 기능별 권한 매트릭스

| 기능           | Admin | Company            |
| -------------- | ----- | ------------------ |
| 파일 업로드    | O     | O (본인 폴더)      |
| 파일 다운로드  | O     | O (본인/공유 파일) |
| 파일 삭제      | O     | O (본인 파일)      |
| 파일 이동      | O     | O (본인 파일/폴더) |
| 파일 이름 변경 | O     | O (본인 파일)      |
| 폴더 생성      | O     | X                  |
| 폴더 삭제      | O     | X                  |
| 폴더 이름 변경 | O     | X                  |
| 폴더 이동      | O     | X                  |
| 휴지통 조회    | O     | O (본인 파일)      |
| 파일 복원      | O     | O (본인 파일)      |
| 영구 삭제      | O     | O (본인 파일)      |
| 성능 메트릭    | O     | X                  |

### 12.5 Next.js 프록시 보안

```typescript
// src/lib/api/webhard-proxy.ts

async function proxyToNestJS(request, endpoint, options) {
  // 1. 인증 + Rate Limit 병렬 검사
  const [authResult, rateLimitOk] = await Promise.all([
    options.skipAuth ? null : requireAuth(request),
    checkWebhardRateLimit(request),
  ]);

  if (!rateLimitOk) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });

  // 2. NestJS로 프록시 (쿠키 자동 전달)
  const nestjsUrl = `${NESTJS_BASE_URL}/api/v1/${endpoint}`;
  const response = await fetch(nestjsUrl, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: request.headers.get('cookie') || '',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return response;
}
```

---

## 13. 프론트엔드 아키텍처

### 13.1 컴포넌트 구조

```
WebhardMain.tsx (최상위 컨테이너 - 모든 상태 통합)
├── WebhardNav.tsx (상단 네비게이션 - 검색, 업로드 버튼)
├── WebhardBreadcrumb.tsx (경로 표시 - Breadcrumb)
├── WebhardToolbar.tsx (작업 버튼 - 다운로드, 이동, 삭제)
├── WebhardSidebar.tsx (좌측 사이드바)
│   ├── FolderTree.tsx (폴더 계층 트리 - 배치 카운팅)
│   └── SidebarResizer.tsx (너비 조절 핸들)
├── MainContent (파일 목록 영역)
│   ├── WebhardColumnHeader.tsx (테이블 헤더 + 정렬)
│   ├── VirtualizedFileList.tsx (가상 스크롤 리스트)
│   │   ├── WebhardFileItem.tsx (파일 행)
│   │   └── WebhardFolderItem.tsx (폴더 행)
│   └── WebhardEmptyState.tsx (빈 상태)
├── WebhardDragSelection.tsx (드래그 선택 영역)
├── WebhardContextMenu.tsx (우클릭 메뉴)
├── ModalContainer.tsx (모달 렌더링)
│   ├── FolderSelectModal.tsx (이동 대상 폴더 선택)
│   ├── FolderUploadModal.tsx (폴더 단위 업로드)
│   ├── DownloadProgressModal.tsx (다운로드 진행률)
│   ├── SearchModal.tsx (통합 검색)
│   ├── SettingsModal.tsx (사용자 설정)
│   ├── TrashBin.tsx (휴지통 관리)
│   ├── DxfPreviewModal.tsx (DXF 미리보기)
│   ├── ShareLinkModal.tsx (공유 링크)
│   └── StorageUsage.tsx (저장공간 표시)
├── WebhardErrorBoundary.tsx (에러 바운더리)
└── WebhardProvider.tsx (Context 제공)
```

### 13.2 커스텀 훅 목록

**파일 작업 훅:**

| 훅                     | 파일                            | 주요 기능                              |
| ---------------------- | ------------------------------- | -------------------------------------- |
| `useFileUpload`        | `hooks/useFileUpload.ts`        | 파일 업로드, Optimistic Update, 진행률 |
| `useFileOperations`    | `hooks/useFileOperations.ts`    | 업로드/다운로드/삭제/이동 통합         |
| `useFileBatchDownload` | `hooks/useFileBatchDownload.ts` | 배치 다운로드 (동시성 6개)             |
| `useFileRename`        | `hooks/useFileRename.ts`        | 인라인 이름 변경                       |
| `useFileSelection`     | `hooks/useFileSelection.ts`     | 단일/다중/범위 선택                    |

**UI/UX 훅:**

| 훅                            | 파일                                   | 주요 기능                  |
| ----------------------------- | -------------------------------------- | -------------------------- |
| `useWebhardDragSelection`     | `hooks/useWebhardDragSelection.ts`     | 드래그 박스 선택           |
| `useWebhardContextMenu`       | `hooks/useWebhardContextMenu.ts`       | 우클릭 메뉴                |
| `useWebhardFileSort`          | `hooks/useWebhardFileSort.ts`          | 파일 정렬 (이름/날짜/크기) |
| `useWebhardColumnResize`      | `hooks/useWebhardColumnResize.ts`      | 테이블 컬럼 너비 조절      |
| `useWebhardSidebarResize`     | `hooks/useWebhardSidebarResize.ts`     | 사이드바 너비 조절         |
| `useWebhardKeyboardShortcuts` | `hooks/useWebhardKeyboardShortcuts.ts` | ESC, Delete 등             |

### 13.3 유틸리티 모듈

| 파일                        | 역할                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `_lib/types.ts`             | DTO 타입 정의 (WebhardFileDTO, PendingFileDTO, FolderTreeNodeDTO 등) |
| `_lib/cacheHelpers.ts`      | React Query 캐시 무효화 함수 (invalidateAfterDelete 등)              |
| `_lib/optimisticUpdates.ts` | Optimistic Update 헬퍼 (optimisticRename, optimisticMove 등)         |
| `_lib/downloadHelpers.ts`   | 다운로드 유틸리티 (downloadViaSignedUrl 등)                          |
| `_lib/fileUtils.ts`         | 파일 유틸리티 (아이콘, MIME 타입 등)                                 |
| `_lib/mappers.ts`           | DTO 변환 매퍼                                                        |
| `_lib/searchUtils.tsx`      | 검색 결과 강조                                                       |

### 13.4 API 클라이언트

```typescript
// src/lib/api/webhard-api-client.ts
// 모든 API 호출은 이 파일을 통해 수행
// credentials: 'include'로 쿠키 인증 자동 전달

export const webhardApi = {
  // 파일 API
  getFiles(params): Promise<FileListResponseDTO>,
  searchFiles(query, companyId?, limit?): Promise<WebhardFileDTO[]>,
  getUploadPresignedUrl(data): Promise<PresignedUrlResponse>,
  getBatchUploadPresignedUrls(files): Promise<{ urls: PresignedUrlResponse[] }>,
  confirmFileUpload(data): Promise<WebhardFileDTO>,
  getDownloadUrl(fileId): Promise<PresignedUrlResponse>,
  renameFile(fileId, name): Promise<WebhardFileDTO>,
  moveFile(fileId, folderId): Promise<WebhardFileDTO>,
  batchMoveFiles(fileIds, targetFolderId): Promise<BatchOperationResultDTO>,
  deleteFile(fileId): Promise<{ success: boolean }>,
  batchDeleteFiles(fileIds): Promise<BatchOperationResultDTO>,
  markFilesDownloaded(params): Promise<MarkDownloadedResponseDTO>,

  // 폴더 API
  getFolders(params): Promise<FolderListResponseDTO>,
  getFolderTree(): Promise<FolderTreeNode[]>,
  getFolderDetail(folderId): Promise<FolderDetailResponse>,
  createFolder(name, parentId?, companyId?): Promise<WebhardFolderDTO>,
  renameFolder(folderId, name): Promise<WebhardFolderDTO>,
  moveFolder(folderId, parentId): Promise<WebhardFolderDTO>,
  deleteFolder(folderId): Promise<{ success: boolean }>,

  // 휴지통 API
  getTrashFiles(params): Promise<TrashListResponse>,
  restoreFile(fileId): Promise<void>,
  permanentlyDeleteFile(fileId): Promise<void>,
  emptyTrash(): Promise<{ deleted: number }>,

  // 기타
  getBadgeCounts(companyId?, includeFolderCounts?): Promise<BadgeCountsResponse>,
  getStorageUsage(companyId?): Promise<StorageUsageDTO>,
  getStorageBreakdown(): Promise<StorageBreakdownDTO>,
  getSettings(): Promise<SettingsDTO>,
  updateSettings(settings): Promise<SettingsDTO>,
};
```

---

## 14. 상태 관리

### 14.1 Zustand 스토어

| 스토어     | 파일                           | 주요 상태                                                                                                        |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Selection  | `useWebhardSelectionStore.ts`  | `selectedFiles: Set<string>`, `selectFile()`, `toggleFile()`, `selectRange()`, `selectAll()`, `clearSelection()` |
| Modal      | `useWebhardModalStore.ts`      | `activeModal`, `openModal()`, `closeModal()`                                                                     |
| Layout     | `useWebhardLayoutStore.ts`     | `sidebarWidth`, `isSidebarCollapsed`, `fileNameColWidth`, `dateColWidth`, `viewMode`                             |
| Navigation | `useWebhardNavigationStore.ts` | `sortBy`, `sortOrder`, `isNewFilesMode`                                                                          |
| DragDrop   | `useWebhardDragDropStore.ts`   | `draggedFileId`, `dragOverFolderId`, `isExternalDragOver`                                                        |

### 14.2 파일 선택 로직

```typescript
// 단일 클릭: 해당 파일만 선택
handleFileClick(file, event) → selectFile(file.id)

// Ctrl + 클릭: 토글 선택
handleFileClick(file, event.ctrlKey) → toggleFile(file.id)

// Shift + 클릭: 범위 선택
handleFileClick(file, event.shiftKey) → selectRange(lastIndex, currentIndex)

// Ctrl + A: 전체 선택/해제
handleSelectAll() → selectAll() or clearSelection()

// ESC: 선택 해제
handleKeyDown('Escape') → clearSelection()

// Delete: 선택 파일 삭제
handleKeyDown('Delete') → deleteFiles(selectedFileIds)
```

---

## 15. 캐시 전략

### 15.1 React Query 캐시 설정

```typescript
// src/app/webhard/_lib/cacheHelpers.ts

export const WEBHARD_CACHE_CONFIG = {
  files: {
    staleTime: 10 * 60 * 1000, // 10분: 파일 목록 (변경 빈도 낮음)
    gcTime: 30 * 60 * 1000, // 30분: 메모리 유지
  },
  newFiles: {
    staleTime: 2 * 60 * 1000, // 2분: 새 파일 (실시간성 유지)
    gcTime: 10 * 60 * 1000,
  },
  folders: {
    staleTime: 10 * 60 * 1000, // 10분: 폴더 구조
    gcTime: 30 * 60 * 1000,
  },
  badges: {
    staleTime: 3 * 60 * 1000, // 3분: 뱃지 카운트
    gcTime: 10 * 60 * 1000,
  },
};
```

### 15.2 Query Key 구조

```typescript
// src/lib/react-query/queryKeys.ts

queryKeys.webhard = {
  all: ['webhard'],
  folders: {
    all: () => ['webhard', 'folders'],
    list: (companyId?) => [..., companyId],
    children: (parentId) => [..., 'children', parentId],
    ancestors: (folderId) => [..., 'ancestors', folderId],
  },
  files: {
    all: () => ['webhard', 'files'],
    list: (filters?) => [..., filters],  // { folderId, companyId, search, sort }
    detail: (id) => [..., 'detail', id],
  },
  badgeCounts: () => ['webhard', 'badge-counts'],
  newFiles: (companyId?) => [..., 'new', companyId],
  search: {
    modal: (query) => [..., 'search', 'modal', query],
    dropdown: (query) => [..., 'search', 'dropdown', query],
  },
};
```

### 15.3 캐시 무효화 전략

```typescript
// 삭제 후: 뱃지만 갱신 (파일은 Optimistic으로 처리됨)
invalidateAfterDelete(queryClient, { folderId, companyId })
  → invalidateQueries(badgeCounts)

// 이동 후: 뱃지만 갱신 (소스/대상 Optimistic)
invalidateAfterMove(queryClient, { folderId, targetFolderId, companyId })
  → invalidateQueries(badgeCounts)

// 업로드 후: 해당 폴더 + 새 파일 목록 + 뱃지
invalidateAfterUpload(queryClient, { folderId, companyId })
  → invalidateQueries(files.list, newFiles, badgeCounts)

// 다운로드 후: 뱃지 갱신
invalidateAfterDownload(queryClient, { companyId })
  → invalidateQueries(badgeCounts)
```

### 15.4 Optimistic Update 패턴

```typescript
// src/app/webhard/_lib/optimisticUpdates.ts

// 1. optimisticFileRemove: 캐시에서 파일 즉시 제거
function optimisticFileRemove(queryClient, fileIds, options) {
  const previousData = queryClient.getQueryData(options.filesQueryKey);
  queryClient.setQueryData(options.filesQueryKey, (old) => ({
    ...old,
    files: old.files.filter(f => !fileIds.includes(f.id)),
  }));
  return { previousData, rollback: () => queryClient.setQueryData(..., previousData) };
}

// 2. optimisticRename: 캐시에서 이름 즉시 변경
// 3. optimisticMove: 소스에서 제거 + 대상에 추가
// 4. optimisticBatchDownload: is_downloaded = true 즉시 반영

// 무한 스크롤 지원:
removeFilesFromNewFilesInfiniteCache(queryClient, fileIds, companyId)
```

---

## 16. 에러 처리

### 16.1 백엔드 에러 체계

| 에러                           | HTTP | 상황                                   |
| ------------------------------ | ---- | -------------------------------------- |
| `NotFoundException`            | 404  | 파일/폴더 없음                         |
| `ForbiddenException`           | 403  | 권한 부족                              |
| `BadRequestException`          | 400  | 잘못된 요청 (순환참조, 필수값 누락 등) |
| `ConflictException`            | 409  | 동일명 폴더 존재                       |
| `InternalServerErrorException` | 500  | S3/DB 통신 실패                        |

### 16.2 DB 연결 재시도 (PrismaService)

```typescript
// webhard-api/src/prisma/prisma.service.ts

// 재시도 가능한 PostgreSQL 에러 코드
RETRYABLE_ERROR_CODES = [
  '08P01',  // protocol_violation (insufficient data left in message)
  '08006',  // connection_failure
  '08003',  // connection_does_not_exist
  '08001',  // sqlclient_unable_to_establish_sqlconnection
  '57P01',  // admin_shutdown
  '57P02',  // crash_shutdown
  '57P03',  // cannot_connect_now
  'XX000',  // internal_error
  'XX001',  // data_corrupted
];

async executeWithRetry<T>(fn: () => Promise<T>, options: { operationName: string }): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!this.isRetryableError(error)) throw error;  // 즉시 실패

      // 지수 백오프 대기
      const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
      await new Promise(resolve => setTimeout(resolve, delay));

      // 연결 리셋
      await this.resetConnection();
    }
  }

  throw lastError;
}
```

### 16.3 헬스체크

```typescript
// PrismaService.onModuleInit()
// 5분 간격으로 SELECT 1 실행
// 연속 2회 실패 → 자동 resetConnection()
```

### 16.4 프론트엔드 에러 처리

```typescript
// 입력값 검증 (webhard-proxy.ts 내)
validateFileIds(fileIds); // UUID 형식 + 최대 100개
validateFolderId(folderId); // UUID 형식
validateFileName(name); // 경로 탐색 공격 방지
validateSearchQuery(query); // 최대 100자
isValidUUID(id); // UUID 정규식

// Rate Limiting
checkWebhardRateLimit(request); // IP당 요청 제한

// Optimistic Update 롤백
try {
  await apiCall();
} catch {
  rollback(); // 이전 캐시 상태 복원
  showErrorToast();
}
```

### 16.5 NestJS 전역 설정

```typescript
// webhard-api/src/main.ts

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // DTO에 없는 필드 제거
    forbidNonWhitelisted: true, // DTO에 없는 필드 → 400 에러
    transform: true, // 자동 타입 변환
  })
);

app.enableCors({
  origin: ['http://localhost:3000'], // 프론트엔드 URL
  credentials: true, // 쿠키 전송
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
});
```

---

## 17. 성능 최적화 현황

### 17.1 구현된 최적화

| 최적화                 | 적용 위치                          | 효과                                       |
| ---------------------- | ---------------------------------- | ------------------------------------------ |
| **N+1 쿼리 방지**      | batchMove, batchDelete, 폴더 트리  | 1회 조회 + 메모리 처리 → 쿼리 수 대폭 감소 |
| **배치 작업**          | 파일 삭제/이동, R2 삭제            | 단일 updateMany로 처리                     |
| **Optimistic Update**  | 업로드/삭제/이동/이름변경/다운로드 | 즉각적 UI 반영                             |
| **가상 스크롤**        | VirtualizedFileList                | 수천 개 파일도 부드러운 렌더링             |
| **Presigned URL**      | 업로드/다운로드                    | 서버 우회 직접 전송 → 대역폭 절감          |
| **동시성 제어**        | 업로드(3개), 다운로드(6개)         | 네트워크 과부하 방지                       |
| **DB 재시도**          | executeWithRetry                   | 연결 불안정 자동 복구                      |
| **정밀한 캐시 무효화** | cacheHelpers.ts                    | 필요한 쿼리만 갱신                         |
| **메모리 BFS**         | 폴더 트리/조상/하위 수집           | DB 호출 최소화                             |
| **트랜잭션**           | 폴더 재귀 삭제                     | 원자성 보장                                |

### 17.2 DB 인덱스

```prisma
// webhard_files
@@index([folderId, companyId, deletedAt])

// webhard_folders
@@index([parentId, companyId, path])
```

---

## 18. 최적화 제안

### 18.1 즉시 적용 가능 (Low Effort, High Impact)

#### 1. 폴더 트리 지연 로딩

```
현재: getFolderTree()에서 모든 폴더를 한번에 로드
문제: 폴더가 많아지면 초기 로딩 시간 증가
제안: 루트 폴더만 로드 → 클릭 시 하위 폴더 로드 (지연 로딩)

위치: webhard-api/src/folders/folders.service.ts:getFolderTree()
구현: parentId 기반 동적 로딩 + 캐시
```

#### 2. 검색 debounce 최적화

```
현재: 모달과 드롭다운에서 별도 검색 쿼리 실행
문제: 동일한 검색어에 대해 2번 API 호출
제안: 검색 캐시 통합 (modal/dropdown 공유)

위치: src/lib/react-query/queryKeys.ts (search 키 통합)
```

#### 3. 뱃지 카운트 캐싱 개선

```
현재: 3분 staleTime, 전체 카운트 1회 조회
문제: 폴더 이동/삭제 후 부정확한 카운트 (최대 3분 지연)
제안:
  - Optimistic Update로 카운트 즉시 조정
  - 파일 삭제 시: 해당 폴더 카운트 -1
  - 파일 이동 시: 소스 -1, 대상 +1
  - 다운로드 시: 해당 폴더 카운트 -1

위치: src/app/webhard/_lib/optimisticUpdates.ts (뱃지 Optimistic 추가)
```

#### 4. 성능 메트릭 캐싱

```
현재: getPerformanceMetrics()에서 8개 병렬 쿼리 매번 실행
문제: 관리자 대시보드 접근 시 매번 무거운 쿼리
제안: 서버 측 캐싱 (5분 TTL) 또는 스케줄러로 미리 계산

위치: webhard-api/src/storage/storage.service.ts:getPerformanceMetrics()
구현: NestJS CacheModule 또는 메모리 캐시
```

### 18.2 중기 개선 (Medium Effort)

#### 5. 대용량 파일 멀티파트 업로드

```
현재: 단일 PUT 업로드 (최대 2GB)
문제: 대용량 파일 업로드 시 중단되면 처음부터 재시작
제안: R2 멀티파트 업로드 지원
  - 100MB 이상: 10MB 청크로 분할
  - 중단 시 해당 청크부터 재개
  - 진행률 더 정밀하게 표시

위치: webhard-api/src/storage/storage.service.ts (멀티파트 메서드 추가)
```

#### 6. 폴더 트리/조상 쿼리 최적화

```
현재: isDescendantOf(), getAncestors(), getDescendantFolderIds()
  → 각각 모든 폴더를 1회 조회 (동일 함수 내 반복 가능)
문제: 같은 트랜잭션 내에서 중복 전체 조회 발생 가능
제안:
  - NestJS 요청 스코프 캐시: 첫 호출에서 전체 폴더 조회 → 이후 메모리 재사용
  - 또는 PostgreSQL WITH RECURSIVE CTE 활용

위치: webhard-api/src/folders/folders.service.ts
```

#### 7. 파일 목록 쿼리 최적화

```
현재: getFiles()에서 count + findMany 2번 쿼리
제안: 단일 쿼리로 통합

SQL: SELECT *, COUNT(*) OVER() as total_count
     FROM webhard_files
     WHERE ...
     ORDER BY ...
     LIMIT ... OFFSET ...

위치: webhard-api/src/files/files.service.ts:getFiles()
```

#### 8. 다운로드 표시 배치 최적화

```
현재: 각 다운로드마다 개별 UPDATE (isDownloaded = true)
제안: 배치 다운로드 완료 후 1회 updateMany

위치:
  - webhard-api/src/files/files.service.ts:getDownloadUrl()
  - 프론트엔드 배치 다운로드 완료 시 markDownloaded() 1회 호출
```

### 18.3 장기 개선 (High Effort)

#### 9. WebSocket 실시간 업데이트

```
현재: 폴링 기반 (staleTime 주기로 refetch)
문제: 다른 사용자가 업로드/삭제한 파일이 최대 10분 후 반영
제안: Socket.io 또는 SSE로 실시간 push
  - 파일 업로드/삭제/이동 이벤트 브로드캐스트
  - 폴더별 구독 → 현재 보고 있는 폴더만 업데이트

참고: Supabase Realtime 또는 NestJS WebSocket Gateway
```

#### 10. CDN 캐싱 전략

```
현재: 모든 다운로드에 Presigned URL 생성
제안: 자주 접근하는 파일에 CDN 캐시 적용
  - Cloudflare Workers로 캐시 헤더 설정
  - 파일 수정 시 캐시 무효화

위치: Cloudflare R2 + Workers 설정
```

#### 11. 저장공간 트리거 기반 실시간 추적

```
현재: 저장공간 조회 시 매번 aggregate 쿼리
제안: DB 트리거로 사용량 실시간 업데이트

SQL:
CREATE OR REPLACE FUNCTION update_storage_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE company_storage SET used_bytes = used_bytes + NEW.size
    WHERE company_id = NEW.company_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE company_storage SET used_bytes = used_bytes - OLD.size
    WHERE company_id = OLD.company_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

#### 12. 압축 다운로드 (ZIP)

```
현재: 다중 파일 다운로드 시 개별 다운로드
제안: 서버 측 ZIP 스트리밍
  - 선택된 파일들을 ZIP으로 묶어 단일 다운로드
  - 스트리밍 방식으로 메모리 효율적

참고: archiver 라이브러리 또는 NestJS StreamableFile
```

### 18.4 보안 강화

#### 13. Presigned URL 만료 시간 단축

```
현재: 3600초 (1시간)
제안: 다운로드 300초 (5분), 업로드 600초 (10분)
이유: 만료 시간이 길면 URL 유출 시 위험
```

#### 14. 파일 접근 감사 로그

```
현재: 활동 로깅이 코드에 정의되어 있으나 NestJS 전환 후 미연동
제안: NestJS 인터셉터로 전체 API 접근 로깅
```

#### 15. CORS 강화

```
현재: origin: ['http://localhost:3000']
제안: 환경변수 기반 동적 CORS (프로덕션 도메인 포함)
```

---

## 19. 파일 구조 참조

### 19.1 백엔드 (NestJS)

```
webhard-api/
├── prisma/
│   └── schema.prisma              # DB 스키마 정의
├── src/
│   ├── main.ts                    # NestJS 부트스트랩 (port 4000)
│   ├── app.module.ts              # 루트 모듈
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts        # 세션 검증 (HMAC-SHA256)
│   │   ├── decorators/
│   │   │   └── current-user.decorator.ts
│   │   └── guards/
│   │       ├── session-auth.guard.ts   # 세션 쿠키 검증
│   │       ├── admin.guard.ts          # 관리자 전용
│   │       └── company-access.guard.ts # 업체 접근 제어
│   ├── files/
│   │   ├── files.module.ts
│   │   ├── files.controller.ts    # 파일 API 엔드포인트
│   │   ├── files.service.ts       # 파일 비즈니스 로직
│   │   └── dto/
│   │       ├── file.dto.ts
│   │       ├── badge-counts.dto.ts
│   │       ├── mark-downloaded.dto.ts
│   │       └── new-files.dto.ts
│   ├── folders/
│   │   ├── folders.module.ts
│   │   ├── folders.controller.ts  # 폴더 API 엔드포인트
│   │   ├── folders.service.ts     # 폴더 비즈니스 로직
│   │   └── dto/
│   │       ├── folder.dto.ts
│   │       └── ancestors.dto.ts
│   ├── trash/
│   │   ├── trash.module.ts
│   │   ├── trash.controller.ts    # 휴지통 API 엔드포인트
│   │   ├── trash.service.ts       # 휴지통 비즈니스 로직
│   │   └── dto/trash.dto.ts
│   ├── storage/
│   │   ├── storage.module.ts
│   │   ├── storage.controller.ts  # 저장공간 조회 API
│   │   ├── storage.service.ts     # R2 S3 연동 + 용량 관리
│   │   └── dto/storage.dto.ts
│   ├── search/                    # 통합 검색
│   ├── settings/                  # 사용자 설정
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts      # DB 연결 + 재시도 + 헬스체크
│   ├── health/                    # 헬스체크 엔드포인트
│   ├── erp/                       # ERP 통합 (Task, Machine, Worker)
│   └── integration/               # 외부 연동 API (Orders, Inventory)
└── package.json
```

### 19.2 프론트엔드 (Next.js)

```
src/
├── app/
│   ├── webhard/                   # 웹하드 메인 페이지
│   │   ├── page.tsx               # 엔트리 포인트 (세션 검증)
│   │   ├── layout.tsx             # 레이아웃
│   │   ├── loading.tsx            # 로딩 상태
│   │   ├── components/            # UI 컴포넌트
│   │   │   ├── WebhardMain.tsx
│   │   │   ├── WebhardNav.tsx
│   │   │   ├── WebhardSidebar.tsx
│   │   │   ├── WebhardToolbar.tsx
│   │   │   ├── WebhardBreadcrumb.tsx
│   │   │   ├── WebhardColumnHeader.tsx
│   │   │   ├── WebhardFileItem.tsx
│   │   │   ├── WebhardFolderItem.tsx
│   │   │   ├── VirtualizedFileList.tsx
│   │   │   ├── FolderTree.tsx
│   │   │   ├── FolderSelectModal.tsx
│   │   │   ├── FolderUploadModal.tsx
│   │   │   ├── DownloadProgressModal.tsx
│   │   │   ├── SearchModal.tsx
│   │   │   ├── SearchDropdown.tsx
│   │   │   ├── TrashBin.tsx
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── ShareLinkModal.tsx
│   │   │   ├── DxfPreviewModal.tsx
│   │   │   ├── FilePreviewTooltip.tsx
│   │   │   ├── WebhardContextMenu.tsx
│   │   │   ├── WebhardDragSelection.tsx
│   │   │   ├── WebhardEmptyState.tsx
│   │   │   ├── WebhardErrorBoundary.tsx
│   │   │   ├── SidebarResizer.tsx
│   │   │   ├── presentational/    # 순수 프레젠테이션
│   │   │   │   ├── FileListView.tsx
│   │   │   │   ├── FileListSkeleton.tsx
│   │   │   │   └── StorageUsage.tsx
│   │   │   ├── containers/        # 컨테이너
│   │   │   │   ├── WebhardMainContainer.tsx
│   │   │   │   └── ModalContainer.tsx
│   │   │   └── context/           # React Context
│   │   │       └── WebhardContext.tsx
│   │   ├── hooks/                 # 커스텀 훅
│   │   │   ├── useFileUpload.ts
│   │   │   ├── useFileOperations.ts
│   │   │   ├── useFileBatchDownload.ts
│   │   │   ├── useFileRename.ts
│   │   │   ├── useFileSelection.ts
│   │   │   ├── useWebhardDragSelection.ts
│   │   │   ├── useWebhardContextMenu.ts
│   │   │   ├── useWebhardFileSort.ts
│   │   │   ├── useWebhardColumnResize.ts
│   │   │   ├── useWebhardSidebarResize.ts
│   │   │   └── useWebhardKeyboardShortcuts.ts
│   │   └── _lib/                  # 로컬 유틸리티
│   │       ├── types.ts
│   │       ├── cacheHelpers.ts
│   │       ├── optimisticUpdates.ts
│   │       ├── downloadHelpers.ts
│   │       ├── fileUtils.ts
│   │       ├── mappers.ts
│   │       └── searchUtils.tsx
│   └── api/webhard/               # Next.js 프록시 라우트
│       └── (위 3.5절 참조)
├── lib/
│   ├── api/
│   │   ├── webhard-api-client.ts  # NestJS API 클라이언트
│   │   └── webhard-proxy.ts       # 프록시 헬퍼 (인증 + Rate Limit)
│   └── react-query/
│       └── queryKeys.ts           # 쿼리 키 팩토리
└── store/webhard/                 # Zustand 스토어
    ├── useWebhardSelectionStore.ts
    ├── useWebhardModalStore.ts
    ├── useWebhardLayoutStore.ts
    ├── useWebhardNavigationStore.ts
    ├── useWebhardDragDropStore.ts
    └── useWebhardUploadStore.ts
```

---

## 20. 백업 시스템

### 20.1 개요

R2에 저장된 웹하드 파일을 NAS(로컬 네트워크 스토리지)로 백업하는 시스템이다. 설정된 보존 기간(`retentionDays`)을 초과한 파일을 대상으로, R2에서 다운로드하여 NAS에 저장하고 선택적으로 R2 원본을 삭제한다.

### 20.2 동작 환경 제약

- **로컬 NestJS에서만 동작**: `fs.existsSync(nasPath)`로 NAS 경로를 확인하므로, Railway 배포 환경에서는 NAS 경로 접근 불가로 자동 스킵된다.
- NAS 경로 예시: `\\192.168.0.6\home\backup\webhard`

### 20.3 백업 흐름

```
┌────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  관리자 UI     │     │  NestJS Backend  │     │  Cloudflare  │
│  BackupSettings│────▶│  BackupService   │────▶│  R2 Storage  │
│  (React)       │     │                  │     └──────┬───────┘
└────────────────┘     │  1. 설정 확인    │            │ getFileBuffer()
                       │  2. 대상 파일 조회│           │
      ┌────────────────│  3. 파일별 백업   │◀──────────┘
      │                │  4. BackupLog 기록│
      ▼                │  5. (선택) R2 삭제│
┌──────────────┐       └─────────────────┘
│  NAS Storage │
│  (로컬)      │
└──────────────┘
```

1. 백업 설정 확인 (`system_settings` 테이블, key: `backup.config`)
2. 보존 기간 초과 파일 조회 (`webhardFile.createdAt < cutoffDate`)
3. 파일별로 R2에서 다운로드 → NAS 디렉토리에 저장
4. `backup_logs` 테이블에 성공/실패 기록
5. `deleteAfterBackup` 설정 시 R2 원본 삭제 + `webhardFile.deletedAt` 설정

### 20.4 스케줄 백업

`@Cron('0 2 * * *')` — 매일 새벽 2시 자동 실행. `BackupService.handleScheduledBackup()`에서 `executeBackup()`을 호출하며, 결과를 로그에 기록한다.

### 20.5 진행률 추적 (개선 예정)

현재 백업 실행은 동기 처리로, 대량 파일 시 HTTP 타임아웃 위험이 있다. 다음과 같이 개선 예정:

- **비동기 실행**: `POST /backup/execute` → 즉시 `{ status: 'started' }` 응답 후 백그라운드 실행
- **진행률 조회**: `GET /backup/status` 엔드포인트 추가 → `{ isRunning, total, success, failed }`
- **프론트엔드 폴링**: 백업 실행 후 주기적으로 `/backup/status`를 폴링하여 진행률 표시

### 20.6 관련 파일

| 파일                                                                       | 역할                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `webhard-api/src/backup/backup.module.ts`                                  | 모듈 정의 (PrismaModule, AuthModule, StorageModule 의존) |
| `webhard-api/src/backup/backup.controller.ts`                              | REST 엔드포인트 (SessionAuthGuard + Admin 체크)          |
| `webhard-api/src/backup/backup.service.ts`                                 | 비즈니스 로직 (R2 다운로드, NAS 저장, 로그 기록)         |
| `webhard-api/src/backup/dto/backup.dto.ts`                                 | DTO 및 응답 인터페이스                                   |
| `src/app/(admin)/admin/integration/webhard/_components/BackupSettings.tsx` | 프론트엔드 관리 UI                                       |

---

## 변경 이력

| 날짜       | 버전 | 변경 내용                                                                                                                          |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2026-01-05 | 1.0  | 최초 문서 작성                                                                                                                     |
| 2026-02-19 | 2.0  | NestJS 백엔드, 프론트엔드 구조 추가                                                                                                |
| 2026-02-20 | 3.0  | 전면 재작성: 코드 레벨 상세 분석, 모든 API/함수 시그니처, Optimistic Update 패턴, 캐시 전략, 에러 처리, 최적화 제안 18개 항목 추가 |
| 2026-04-13 | 3.1  | 백업 시스템 아키텍처 섹션 추가 (R2 → NAS 백업 흐름, 스케줄 백업, 진행률 추적 설계)                                                 |
| 2026-04-15 | 3.2  | 업로드 후 자동 문의 생성 흐름 추가 (레이저 전용 업체 공정 단축 경로 명시)                                                          |
