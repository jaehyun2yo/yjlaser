# Phase 3: NestJS 백엔드 — Integration API

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-revision-history.md`
- `docs/specs/api/endpoints/integration.md`
- `/tasks/0-drawing-revision/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/drawing-revision.service.ts` — Phase 2에서 생성한 서비스
- `webhard-api/src/contacts/dto/drawing-revision.dto.ts` — Phase 2에서 생성한 DTO

아래 기존 코드를 반드시 읽고 Integration 모듈 패턴을 이해하라:

- `webhard-api/src/integration/integration.module.ts` — 전체 파일. 서브모듈 등록 패턴
- `webhard-api/src/integration/orders/orders.module.ts` — 기존 서브모듈 구조 참고
- `webhard-api/src/integration/orders/orders.controller.ts` — API Key 인증 가드 사용법
- `webhard-api/src/integration/orders/auto-contact.controller.ts` — 간단한 Integration 컨트롤러 참고
- `webhard-api/src/integration/auth/` — ApiKeyGuard 사용법

## 작업 내용

### 1. Integration 서브모듈 생성

`webhard-api/src/integration/drawing-revisions/` 디렉토리에 아래 파일들을 생성:

#### `drawing-revisions.module.ts`

```typescript
// NestJS 모듈
// imports: ContactsModule (DrawingRevisionService를 사용하기 위해)
// controllers: [IntegrationDrawingRevisionsController]
```

ContactsModule에서 DrawingRevisionService가 export되어 있으므로 import하면 바로 사용 가능.

#### `drawing-revisions.controller.ts`

`POST /api/v1/integration/drawing-revisions` 엔드포인트를 제공하는 컨트롤러.

```typescript
// @Controller('integration/drawing-revisions')
// @UseGuards(ApiKeyGuard) — 기존 Integration 컨트롤러들과 동일한 인증

// DTO:
// IntegrationCreateDrawingRevisionDto:
//   - contactId: string (IsUUID)
//   - reason: string (IsIn([...]))
//   - reasonDetail?: string
//   - files: Array<{ url: string; name: string; size?: number; mimeType?: string }>
//   - processStage?: string
//   - note?: string
//   - actorName?: string (외부 프로그램명)

@Post()
async createDrawingRevision(@Body() dto: IntegrationCreateDrawingRevisionDto)
// 1. DrawingRevisionService.createRevision() 호출
//    - actorType: 'external'
//    - source: 'integration'
//    - actorName: dto.actorName ?? 'external-program'
// 2. 응답: { success: true, revision: { id, version, createdAt } }
```

**DTO는 이 파일 내에 정의하거나 별도 dto 파일로 분리.** 기존 `auto-contact.dto.ts` 패턴 참고.

### 2. Integration 모듈에 등록

`webhard-api/src/integration/integration.module.ts`의 `imports` 배열에 `IntegrationDrawingRevisionsModule` 추가.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/0-drawing-revision/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 기존 Integration 모듈의 다른 서브모듈(orders, events, delivery 등)을 수정하지 마라.
- ApiKeyGuard 사용법을 기존 컨트롤러에서 정확히 확인하라. `@UseGuards(ApiKeyGuard)` 데코레이터 위치와 import 경로.
- Integration API에서는 파일 업로드를 하지 않는다. 외부 프로그램이 이미 R2에 업로드한 파일의 URL을 전달하는 구조. 따라서 presigned URL 생성 엔드포인트는 필요 없다.
- 외부 프로그램이 파일 URL 없이 메타데이터만 등록할 수도 있으므로 files 배열은 빈 배열 허용.
