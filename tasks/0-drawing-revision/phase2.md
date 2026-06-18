# Phase 2: NestJS 백엔드 — 서비스 + 내부 API

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-revision-history.md`
- `docs/specs/api/nestjs-endpoints.md`
- `/tasks/0-drawing-revision/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/prisma/schema.prisma` — Phase 1에서 추가한 DrawingRevision 모델

아래 기존 코드를 반드시 읽고 패턴을 이해하라:

- `webhard-api/src/contacts/contacts.module.ts` — 모듈 구조
- `webhard-api/src/contacts/contacts.service.ts` — 특히 `create()` 메서드와 `updateProcessStage()` 메서드
- `webhard-api/src/contacts/contact-timeline.service.ts` — 전체 파일. `recordChange()` 패턴
- `webhard-api/src/contacts/contacts.controller.ts` — 엔드포인트 패턴, 가드 사용법
- `webhard-api/src/contacts/contacts.gateway.ts` — WebSocket 이벤트 emit 패턴
- `webhard-api/src/contacts/dto/create-contact.dto.ts` — DTO 패턴
- `webhard-api/src/contacts/dto/update-contact.dto.ts` — 특히 UpdateStatusDto, UpdateProcessStageDto
- `webhard-api/src/storage/storage.service.ts` — `getUploadPresignedUrl()`, `getDownloadPresignedUrl()` 시그니처 확인
- `webhard-api/src/files/files.service.ts` — presigned URL 생성 흐름 참고

## 작업 내용

### 1. DTO 생성: `webhard-api/src/contacts/dto/drawing-revision.dto.ts`

class-validator 데코레이터를 사용하여 아래 DTO들을 생성:

```typescript
// CreateDrawingRevisionDto
// - reason: string (IsIn(['domuson_fit', 'sample_revision', 'field_correction', 'laser_processing', 'initial', 'other']))
// - reasonDetail?: string (IsOptional, IsString)
// - files: Array<{ url: string; name: string; size?: number; mimeType?: string }> (IsArray, ValidateNested)
// - processStage?: string (IsOptional, IsString)
// - note?: string (IsOptional, IsString)
// - isPublic?: boolean (IsOptional, IsBoolean, default false)
// - source?: string (IsOptional, IsIn(['stage_change', 'manual', 'auto_initial', 'integration']), default 'manual')

// GetDrawingRevisionUploadUrlsDto
// - files: Array<{ name: string; mimeType: string }> (IsArray, ValidateNested)

// UpdateDrawingRevisionVisibilityDto
// - isPublic: boolean (IsBoolean)
```

### 2. 서비스 생성: `webhard-api/src/contacts/drawing-revision.service.ts`

`@Injectable()` 서비스. PrismaService, StorageService, ContactTimelineService, ContactsGateway 주입.
Logger는 `private readonly logger = new Logger(DrawingRevisionService.name)` 패턴 사용.

**메서드 시그니처:**

```typescript
// 도면 수정 등록 — $transaction으로 version 원자적 계산
async createRevision(contactId: string, dto: CreateDrawingRevisionDto, actor: { actorType: string; actorName?: string }): Promise<DrawingRevision>
// 내부 로직:
// 1. $transaction 내에서:
//    a. 해당 contact의 MAX(version) 조회 (없으면 0)
//    b. version = max + 1로 DrawingRevision INSERT
// 2. fire-and-forget으로 ContactTimelineService.recordChange() 호출
//    - changeType: 'drawing_revision'
//    - metadata: { revisionVersion: version, reason, fileCount: files.length }
// 3. ContactsGateway로 'contact:drawing_revision_added' 이벤트 emit

// 도면 수정 이력 조회
async getRevisions(contactId: string, options?: { includePrivate?: boolean }): Promise<DrawingRevision[]>
// includePrivate=false이면 where에 isPublic: true 추가
// orderBy: { createdAt: 'asc' }

// 도면 파일 다운로드 presigned URL 생성
async getRevisionDownloadUrl(revisionId: string, fileIndex: number): Promise<{ url: string; fileName: string }>
// revision을 조회하여 files[fileIndex]의 url(R2 key)로 StorageService.getDownloadPresignedUrl() 호출

// 도면 업로드 presigned URL 생성
async getUploadPresignedUrls(contactId: string, files: Array<{ name: string; mimeType: string }>): Promise<Array<{ uploadUrl: string; key: string; fileName: string }>>
// R2 키: drawings/contact-{contactId}/{uuid}/{timestamp}-{sanitizedName}
// StorageService.getUploadPresignedUrl(key, contentType) 호출

// 공개 여부 변경
async updateVisibility(revisionId: string, isPublic: boolean): Promise<DrawingRevision>

// 초기 도면 자동 등록 (문의 생성 시 drawingFileUrl 존재 시 호출)
async createInitialRevision(contactId: string, drawingFileUrl: string, drawingFileName?: string | null): Promise<void>
// fire-and-forget. 실패해도 로그만 남기고 문의 생성을 막지 않는다.
// version: 1, reason: 'initial', source: 'auto_initial', actorType: 'system'
// files: [{ url: drawingFileUrl, name: drawingFileName ?? 'initial-drawing' }]
```

**핵심 규칙:**

- `createRevision`의 version 계산은 반드시 `$transaction` 내에서 수행. `$queryRaw`로 `SELECT COALESCE(MAX(version), 0) + 1` 사용 가능.
- `createInitialRevision`은 fire-and-forget 패턴. try-catch로 감싸고 실패 시 logger.error만.
- ContactTimelineService.recordChange() 호출 시 changeType은 문자열 `'drawing_revision'`을 직접 전달.

### 3. ContactTimelineService 확장

`webhard-api/src/contacts/contact-timeline.service.ts`에서 `recordChange()` 메서드의 changeType 파라미터에 `'drawing_revision'` 값이 들어올 수 있도록 허용. 만약 TypeScript 타입으로 제한되어 있다면 `'drawing_revision'`을 union에 추가.

### 4. ContactsService에 v1 자동 등록 연동

`webhard-api/src/contacts/contacts.service.ts`의 `create()` 메서드에서:

- Contact 생성 완료 후, `drawingFileUrl`이 존재하면 `drawingRevisionService.createInitialRevision()` 호출
- fire-and-forget: await 하지 않아도 됨. `.catch(err => this.logger.error(...))` 패턴.

ContactsService에 DrawingRevisionService를 주입:

```typescript
constructor(
  // ... 기존 주입들
  private readonly drawingRevisionService: DrawingRevisionService,
) {}
```

### 5. 컨트롤러 엔드포인트 추가

`webhard-api/src/contacts/contacts.controller.ts`에 5개 엔드포인트 추가:

```typescript
// 1. 도면 수정 이력 조회
@Get(':id/drawing-revisions')
async getDrawingRevisions(
  @Param('id', ParseUUIDPipe) id: string,
  @Query('includePrivate') includePrivate?: string,  // 'true' | 'false'
)
// → drawingRevisionService.getRevisions(id, { includePrivate: includePrivate !== 'false' })

// 2. 도면 수정 등록
@Post(':id/drawing-revisions')
async createDrawingRevision(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: CreateDrawingRevisionDto,
)
// actor: { actorType: 'admin', actorName: 'admin' } (기존 패턴 참고)

// 3. 도면 업로드 presigned URL
@Post(':id/drawing-revisions/upload-urls')
async getDrawingRevisionUploadUrls(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: GetDrawingRevisionUploadUrlsDto,
)

// 4. 도면 파일 다운로드 URL
@Get('drawing-revisions/:revisionId/download')
async getDrawingRevisionDownloadUrl(
  @Param('revisionId', ParseUUIDPipe) revisionId: string,
  @Query('fileIndex') fileIndex: string,
)
// ParseIntPipe 또는 parseInt 사용

// 5. 공개 여부 변경 (Admin only)
@Patch('drawing-revisions/:revisionId/visibility')
async updateDrawingRevisionVisibility(
  @Param('revisionId', ParseUUIDPipe) revisionId: string,
  @Body() dto: UpdateDrawingRevisionVisibilityDto,
)
```

**라우팅 주의**: `drawing-revisions/:revisionId/*` 경로는 `:id` 파라미터와 충돌할 수 있으므로, 컨트롤러 상단(`:id` 와일드카드 라우트보다 위)에 배치하거나, 별도의 경로 접두사를 사용하라. 기존 컨트롤러의 라우트 순서를 확인하고 적절히 배치하라.

### 6. 모듈 등록

`webhard-api/src/contacts/contacts.module.ts`:

- `providers`에 `DrawingRevisionService` 추가
- `exports`에 `DrawingRevisionService` 추가

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/0-drawing-revision/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 기존 테스트를 깨뜨리지 마라. 기존 contacts.service.spec.ts 등이 있다면 수정하지 말고, 새 서비스에 대한 테스트만 추가하라.
- StorageService의 presigned URL 메서드 시그니처를 반드시 확인 후 사용하라. 추측하지 마라.
- `drawing-revisions/:revisionId` 라우트가 `:id` 와일드카드와 충돌하지 않도록 라우트 순서에 주의하라.
- ContactsGateway의 emit 패턴을 그대로 따르라. 새 이벤트명만 추가.
- `createInitialRevision`에서 drawingFileUrl이 R2 key인지 전체 URL인지 확인하라. Contact 모델의 `drawingFileUrl` 필드에 어떤 형식으로 저장되는지 `contacts.service.ts`의 create 로직을 읽고 파악하라.
