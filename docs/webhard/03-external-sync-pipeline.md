# 외부 동기화 프로그램 연동 파이프라인 설계 문서

> 작성일: 2026-03-11
> 최종 검증: 2026-03-11 (코드 레벨 직접 확인 완료)
> 연동 대상: 외부웹하드동기화프로그램 (Node.js/TypeScript)
> 서버: webhard-api (NestJS Backend)

---

## 1. 현재 상태 분석

### 1.1 외부웹하드동기화프로그램 현재 구조

외부 동기화 프로그램은 LGU+ 웹하드 ↔ 자체 웹하드 간 양방향 동기화를 수행:

```
[LGU+ 웹하드]
    ↕ (Playwright 브라우저 자동화)
[외부웹하드동기화프로그램]
    ↕ (REST API + Presigned URL)
[자체 웹하드 (webhard-api)]
    ↕ (Prisma + R2)
[PostgreSQL + Cloudflare R2]
```

**현재 사용 중인 API 클라이언트** (`self-webhard/api-client.ts`):
- 인증: `X-API-Key` 헤더
- 폴더: 생성, 조회, 자식 목록
- 파일: 단일 업로드 (presigned URL + confirm), 배치 업로드, 삭제, 이동, 검색
- 동기화 로그: 생성, 중복 검사
- 프로그램 하트비트: 전송

### 1.2 webhard-api 현재 제공 API

**파일/폴더 CRUD (Session 인증)**:
- Files: 20개 엔드포인트 (업로드, 다운로드, 이동, 삭제, 이름변경, 배치 등)
- Folders: 11개 엔드포인트 (생성, 이동, 삭제, 이름변경, 트리, 배치 등)

**통합 모듈 (API Key 인증)**:
- Sync Log: 로그 기록/조회/통계
- Programs: 하트비트/상태
- API Key: 키 관리
- File Transfer: 미구현 (501 반환)

### 1.3 인증 체계 차이

| 모듈 | 인증 방식 | 가드 |
|------|----------|------|
| Files/Folders/Trash/Search | Session 쿠키 (`admin-session`) | `SessionAuthGuard` |
| Integration 모듈 | Session 쿠키 OR API Key | `ApiKeyGuard` |

**문제**: 외부 프로그램은 세션 쿠키 없이 API Key만 사용. 파일/폴더 CRUD API는 `SessionAuthGuard`만 지원하므로, 외부 프로그램이 직접 호출 불가.

**현재 해결 방식**: 외부 프로그램의 `api-client.ts`가 Next.js 프론트엔드 API 라우트(`/api/webhard/*`)를 호출하고, 프론트엔드가 `MIGRATION_API_KEY`를 검증하여 NestJS 백엔드에 세션 쿠키로 전달하는 프록시 역할.

---

## 2. 연동 파이프라인 설계

### 2.1 아키텍처 선택지

#### 옵션 A: 기존 프록시 패턴 유지 (현재 방식)
```
외부 프로그램 → Next.js API Route (프록시) → NestJS Backend
                  ↑ API Key 검증              ↑ Session 쿠키
```
- 장점: 기존 코드 변경 없음
- 단점: 프록시 오버헤드, Next.js 의존성, 배포 복잡성

#### 옵션 B: NestJS에 API Key 인증 통합 (추천)
```
외부 프로그램 → NestJS Backend (직접 호출)
                  ↑ ApiKeyGuard (Session OR API Key)
```
- 장점: 프록시 제거, 지연시간 감소, 단순한 아키텍처
- 단점: Files/Folders 컨트롤러의 가드 변경 필요

#### 옵션 C: 전용 동기화 엔드포인트 추가
```
외부 프로그램 → NestJS /api/v1/integration/sync/* (전용)
                  ↑ ApiKeyGuard + 권한 검증
```
- 장점: 기존 API 미변경, 동기화 전용 최적화 가능
- 단점: 코드 중복, 유지보수 부담

### 2.2 추천 아키텍처: 옵션 B (API Key 인증 통합)

Files/Folders/Trash/Search 컨트롤러의 가드를 `SessionAuthGuard` → `ApiKeyGuard`로 교체.
`ApiKeyGuard`는 이미 Session 쿠키와 API Key 모두 지원하므로, 기존 웹 클라이언트 호환성 유지.

```typescript
// 변경 전
@Controller('files')
@UseGuards(SessionAuthGuard)
export class FilesController { ... }

// 변경 후
@Controller('files')
@UseGuards(ApiKeyGuard)
export class FilesController { ... }
```

**영향 범위**: 4개 컨트롤러 (files, folders, trash, search)의 `@UseGuards` 데코레이터만 변경.

---

## 3. 기능별 연동 파이프라인

### 3.1 파일 업로드 파이프라인

#### 단일 파일 업로드
```
동기화 프로그램                    webhard-api
    │                                │
    ├─ POST /files/presigned-url ──→ │ [ApiKeyGuard]
    │  { filename, contentType,      │ StorageService.generateStoragePath()
    │    folderId, companyId }       │ StorageService.getUploadPresignedUrl()
    │←─ { url, key, expiresAt } ────┤
    │                                │
    ├─ PUT url (R2 직접 업로드) ───→ [Cloudflare R2]
    │                                │
    ├─ POST /files/confirm ────────→ │ [ApiKeyGuard]
    │  { key, name, originalName,    │ verifyFolderAccess()
    │    size, mimeType, folderId }  │ INSERT INTO webhard_files
    │←─ FileResponseDto ────────────┤ WebSocket: file:created
    │                                │
    ├─ POST /integration/sync-log ─→ │ [ApiKeyGuard]
    │  { filename, status, md5Hash } │ SyncLog.create()
    │←─ SyncLog ────────────────────┤
```

#### 배치 파일 업로드 (대량 동기화)
```
동기화 프로그램                    webhard-api
    │                                │
    │  [1단계: Presigned URL 배치 발급]
    ├─ POST /files/batch/upload ──→ │ [ApiKeyGuard]
    │  { files: [{filename,          │ 20개씩 청크 처리
    │    contentType, folderId}] }   │ R2 서명 발급
    │←─ { urls: [{url, key}] } ────┤
    │                                │
    │  [2단계: R2 직접 업로드 (병렬)]
    ├─ PUT url × N ────────────────→ [Cloudflare R2]
    │                                │
    │  [3단계: 메타데이터 배치 등록]
    ├─ POST /files/batch/confirm ──→ │ [ApiKeyGuard]
    │  { files: [{key, name,         │ 폴더 접근 권한 일괄 검증
    │    originalName, size,         │ createMany (500개까지)
    │    mimeType, folderId}] }     │ WebSocket: batch:update
    │←─ { success, failed } ────────┤
    │                                │
    │  [4단계: 동기화 로그 기록]
    ├─ POST /integration/sync-log ─→ │
```

**최적 배치 크기**:
- Presigned URL: 50개 (서버 제한)
- Confirm: 500개 (서버 제한)
- 권장 패턴: 50개씩 presigned URL → R2 업로드 → 500개 모아서 confirm

### 3.2 파일 삭제 파이프라인

#### 단일 삭제 (Soft Delete)
```
동기화 프로그램                    webhard-api
    │                                │
    ├─ DELETE /files/:id ──────────→ │ [ApiKeyGuard]
    │                                │ findUnique + verifyFileAccess
    │                                │ update(deletedAt, deletedBy)
    │←─ { success: true } ──────────┤ WebSocket: file:deleted
```

#### 배치 삭제
```
동기화 프로그램                    webhard-api
    │                                │
    ├─ POST /files/batch/delete ──→ │ [ApiKeyGuard]
    │  { fileIds: [...], max 100 }   │ findMany + 권한 필터링
    │                                │ updateMany (soft delete)
    │←─ { success, processed,        │ WebSocket: file:deleted
    │    failed, errors } ──────────┤
```

### 3.3 파일 이동 파이프라인

#### 단일 이동
```
동기화 프로그램                    webhard-api
    │                                │
    ├─ PATCH /files/:id/move ──────→ │ [ApiKeyGuard]
    │  { folderId: "target-uuid" }   │ findUnique + verifyAccess
    │                                │ verifyFolderAccess(target)
    │                                │ update(folderId)
    │←─ FileResponseDto ────────────┤ WebSocket: file:moved
```

#### 배치 이동
```
동기화 프로그램                    webhard-api
    │                                │
    ├─ POST /files/batch/move ─────→ │ [ApiKeyGuard]
    │  { fileIds: [...],             │ verifyFolderAccess(target)
    │    targetFolderId: "uuid" }    │ findMany + 권한 필터링
    │                                │ updateMany
    │←─ BatchOperationResult ────────┤ WebSocket: file:moved
```

### 3.4 파일 이름 변경 파이프라인

```
동기화 프로그램                    webhard-api
    │                                │
    ├─ PATCH /files/:id/rename ────→ │ [ApiKeyGuard]
    │  { name: "새이름.dxf" }        │ findUnique + verifyAccess
    │                                │ update(name)
    │←─ FileResponseDto ────────────┤ WebSocket: file:renamed
```

### 3.5 폴더 생성 파이프라인

```
동기화 프로그램                    webhard-api
    │                                │
    ├─ POST /folders ──────────────→ │ [ApiKeyGuard]
    │  { name: "업체명",             │ verifyFolderAccess(parent)
    │    parentId: "uuid",           │ checkDuplicate (409 시 기존 반환)
    │    companyId: null }           │ create
    │←─ FolderResponseDto ──────────┤ WebSocket: folder:created
    │                                │ 캐시 무효화
```

**중복 처리**: 409 ConflictException 시 기존 폴더 조회하여 사용 (idempotent)

### 3.6 폴더 삭제 파이프라인

#### 단일 삭제
```
동기화 프로그램                    webhard-api
    │                                │
    ├─ DELETE /folders/:id ────────→ │ [ApiKeyGuard]
    │                                │ findUnique + verifyAccess
    │                                │ getDescendantFolderIds (메모리 BFS)
    │                                │ $transaction [
    │                                │   updateMany(폴더들, deletedAt)
    │                                │   updateMany(파일들, deletedAt)
    │                                │ ]
    │←─ { success: true } ──────────┤ WebSocket: folder:deleted
```

#### 배치 삭제
```
동기화 프로그램                    webhard-api
    │                                │
    ├─ DELETE /folders/batch-delete → │ [ApiKeyGuard]
    │  { folderIds: [...] }          │ findMany + 권한 확인
    │                                │ 전체 폴더 조회 → BFS 하위 수집
    │                                │ $transaction [folders, files]
    │←─ { foldersDeleted,            │ WebSocket: folder:deleted
    │    filesDeleted, durationMs } ─┤
```

### 3.7 폴더 이동 파이프라인

```
동기화 프로그램                    webhard-api
    │                                │
    ├─ PATCH /folders/:id/move ────→ │ [ApiKeyGuard]
    │  { parentId: "target-uuid" }   │ findUnique + verifyAccess
    │                                │ isDescendantOf (순환 참조 검사)
    │                                │ checkDuplicate → 자동 리네이밍
    │                                │ update(parentId, name)
    │←─ FolderResponseDto ──────────┤ WebSocket: folder:moved
```

### 3.8 폴더 이름 변경 파이프라인

```
동기화 프로그램                    webhard-api
    │                                │
    ├─ PATCH /folders/:id/rename ──→ │ [ApiKeyGuard]
    │  { name: "새이름" }            │ findUnique + verifyAccess
    │                                │ checkDuplicate (409 시 에러)
    │                                │ update(name)
    │←─ FolderResponseDto ──────────┤ WebSocket: folder:renamed
```

---

## 4. 에러 처리 및 복원력

### 4.1 HTTP 에러 코드 매핑

| HTTP 코드 | NestJS Exception | 동기화 프로그램 동작 |
|-----------|-----------------|-------------------|
| 400 | BadRequestException | 요청 수정 후 재시도 |
| 401 | UnauthorizedException | API Key 확인, 재인증 |
| 403 | ForbiddenException | 로그 기록, 스킵 |
| 404 | NotFoundException | 스킵 또는 재생성 |
| 409 | ConflictException | 기존 리소스 사용 (폴더 중복) |
| 500 | InternalServerError | 지수 백오프 재시도 (3회) |

### 4.2 재시도 전략

```typescript
// 동기화 프로그램 권장 재시도 설정
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};
```

### 4.3 중복 방지 (Idempotency)

| 작업 | 중복 방지 방식 |
|------|--------------|
| 파일 업로드 | MD5 해시로 SyncLog 중복 검사 |
| 폴더 생성 | 이름+부모+회사 유니크 → 409 시 기존 사용 |
| 파일 삭제 | deletedAt 이미 설정 시 404 반환 |
| 파일 이동 | 이미 목표 폴더에 있으면 성공 처리 |

### 4.4 Dead Letter Queue (DLQ)

실패한 작업을 DLQ에 기록하고, 이후 재처리:

```
동기화 프로그램                    webhard-api
    │                                │
    ├─ (작업 실패) ──→ 로컬 SQLite DLQ 기록
    │                                │
    ├─ (재처리 스케줄러) ──→ DLQ에서 꺼내서 재시도
    │                                │
    ├─ POST /integration/sync-log ─→ │ 실패 로그 기록
    │  { status: 'api_error' }       │
```

---

## 5. 실시간 양방향 동기화 (WebSocket)

### 5.1 현재 WebSocket 연동

외부 프로그램은 `IntegrationGateway` (`/integration` namespace)에 연결:
- 인증: `handshake.auth.apiKey`로 API Key 전달
- Room 구독: `join` 이벤트로 방 입장

### 5.2 웹하드 이벤트 수신 (제안)

현재 `EventsGateway`(웹하드 전용)는 별도 네임스페이스이므로, 외부 프로그램이 웹하드 파일/폴더 변경 이벤트를 수신하려면:

**방안 A**: EventsGateway에 API Key 인증 추가 + 외부 프로그램 연결 허용
**방안 B**: IntegrationGateway에서 웹하드 이벤트도 릴레이

**권장**: 방안 A (EventsGateway 인증 추가 — 보안 최적화 P5와 동시 처리)

```typescript
// events.gateway.ts 개선
async handleConnection(client: Socket) {
  const cookie = client.handshake.headers.cookie;
  const apiKey = client.handshake.auth?.apiKey as string;

  // Session 또는 API Key 인증
  let authenticated = false;
  if (cookie) { /* 세션 인증 */ }
  if (!authenticated && apiKey) { /* API Key 인증 */ }
  if (!authenticated) { client.disconnect(); return; }
}
```

### 5.3 이벤트 기반 동기화 흐름

```
[웹하드 UI에서 파일 삭제]
    → webhard-api: FilesService.deleteFile()
    → EventsGateway: file:deleted 이벤트 발행
    → 동기화 프로그램 (WebSocket 수신)
    → LGU+ 웹하드에서도 해당 파일 삭제
```

```
[LGU+ 웹하드에 파일 추가]
    → 동기화 프로그램: LGU+ 감지 → 다운로드
    → webhard-api: presigned-url → R2 업로드 → confirm
    → EventsGateway: file:created 이벤트 발행
    → 웹하드 UI 자동 갱신
```

---

## 6. 구현 계획

### Phase 1: API Key 인증 통합 (필수)

**변경 파일 4개 (코드 직접 확인):**
```
webhard-api/src/files/files.controller.ts:38    — @UseGuards(SessionAuthGuard) → @UseGuards(ApiKeyGuard)
webhard-api/src/folders/folders.controller.ts:26 — @UseGuards(SessionAuthGuard) → @UseGuards(ApiKeyGuard)
webhard-api/src/trash/trash.controller.ts       — @UseGuards(SessionAuthGuard) → @UseGuards(ApiKeyGuard)
webhard-api/src/search/search.controller.ts     — @UseGuards(SessionAuthGuard) → @UseGuards(ApiKeyGuard)
```

**ApiKeyGuard 특성 (api-key.guard.ts 직접 확인):**
- Session 쿠키 (`admin-session`) OR `X-API-Key` 헤더 중 하나로 인증
- 기존 웹 클라이언트(세션 쿠키) 완전 호환 — 동작 변경 없음
- API Key 인증 성공 시 `user.userType = 'admin'`으로 설정

**모듈 의존성 추가 (각 module.ts에):**
```typescript
// 예: files.module.ts
imports: [..., AuthModule], // ApiKeyService는 IntegrationModule에서 export
providers: [..., ApiKeyGuard]
```

**테스트 항목:**
- [ ] 기존 Session 쿠키 인증 정상 동작 (회귀 없음)
- [ ] API Key 인증으로 파일 CRUD 동작
- [ ] API Key 인증으로 폴더 CRUD 동작
- [ ] 잘못된 API Key 시 401 반환
- [ ] 인증 없음 시 401 반환

### Phase 2: 외부 프로그램 API 클라이언트 확장

**현재 미지원 API (추가 필요, 서버 엔드포인트는 이미 존재):**

| API | NestJS 엔드포인트 | 클라이언트 현황 | 우선순위 |
|-----|-----------------|--------------|---------|
| 파일 이름 변경 | `PATCH /files/:id/rename` | 미구현 | 높음 |
| 파일 배치 이동 | `POST /files/batch/move` | 미구현 | 높음 |
| 폴더 이름 변경 | `PATCH /folders/:id/rename` | 미구현 | 높음 |
| 폴더 이동 | `PATCH /folders/:id/move` | 미구현 | 높음 |
| 폴더 배치 삭제 | `DELETE /folders/batch-delete` | 미구현 | 중간 |
| 파일 다운로드 | `GET /files/:id/download` | 미구현 | 높음 (역방향) |
| 휴지통 관리 | `GET/DELETE /trash/*` | 미구현 | 낮음 |

**참고**: 서버 엔드포인트는 모두 구현되어 있음. Phase 1 (가드 변경) 완료 후 외부 프로그램 `api-client.ts`에 위 API 추가만 하면 됨.

### Phase 3: EventsGateway 인증 + 양방향 동기화

- [ ] EventsGateway에 API Key 인증 추가
- [ ] 동기화 프로그램에서 웹하드 이벤트 수신 로직 구현
- [ ] 이벤트 기반 역방향 동기화 (웹하드 → LGU+)

---

## 7. API 호출 예시

### 7.1 폴더 구조 동기화

```typescript
// 1. 루트 폴더 조회
const rootFolders = await fetch(`${API_URL}/api/v1/folders/children`, {
  headers: { 'X-API-Key': API_KEY },
});

// 2. 업체별 폴더 생성 (중복 시 409 → 기존 사용)
try {
  const folder = await fetch(`${API_URL}/api/v1/folders`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '원컴퍼니', parentId: rootFolderId }),
  });
} catch (e) {
  if (e.status === 409) {
    // 기존 폴더 사용
  }
}

// 3. 파일 배치 업로드
const presigned = await fetch(`${API_URL}/api/v1/files/batch/upload`, {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: filesToUpload }),
});

// 4. R2 업로드 (병렬)
await Promise.all(presigned.urls.map(({ url, file }) =>
  fetch(url, { method: 'PUT', body: file.buffer })
));

// 5. 메타데이터 등록
await fetch(`${API_URL}/api/v1/files/batch/confirm`, {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: confirmData }),
});
```

### 7.2 파일 이동/삭제 동기화

```typescript
// 파일 이동
await fetch(`${API_URL}/api/v1/files/batch/move`, {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fileIds: ['uuid1', 'uuid2'],
    targetFolderId: 'target-folder-uuid',
  }),
});

// 파일 삭제
await fetch(`${API_URL}/api/v1/files/batch/delete`, {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileIds: ['uuid1', 'uuid2'] }),
});
```

---

## 8. 제약 사항 및 주의 사항

### 배치 크기 제한
| API | 최대 크기 | Body 제한 |
|-----|----------|----------|
| batch/upload (presigned) | 50개 | - |
| batch/confirm | 500개 | 10MB |
| batch/move | 100개 | - |
| batch/delete | 100개 | - |
| folders/batch-delete | 제한 없음 | - |

### Presigned URL 만료 시간
| 용도 | 만료 |
|------|------|
| 다운로드 | 5분 |
| 업로드 | 10분 |
| 멀티파트 | 1시간 |

### Rate Limiting
- 현재 서버 레벨 rate limiting 미구현
- 동기화 프로그램에서 자체적으로 10개/배치, 1 동시 배치로 제한 중
- 향후 서버 레벨 rate limiting 추가 권장 (express-rate-limit 또는 NestJS ThrottlerModule)
