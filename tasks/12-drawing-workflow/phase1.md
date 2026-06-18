# Phase 1: 백엔드 — DrawingRevision 서비스 확장

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-workflow.md` (이번 기능 전체 스펙)
- `/tasks/12-drawing-workflow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 아래 기존 코드를 반드시 읽어라:

- `webhard-api/src/contacts/drawing-revision.service.ts` (기존 도면 서비스)
- `webhard-api/src/contacts/dto/drawing-revision.dto.ts` (기존 DTO)
- `webhard-api/src/contacts/contacts.controller.ts` (기존 컨트롤러)
- `webhard-api/src/contacts/contacts.service.ts` (findOne 메서드 확인)
- `webhard-api/src/contacts/constants/process-stages.ts` (공정 단계 정의)
- `webhard-api/prisma/schema.prisma` (DrawingRevision, Contact 모델)

## 작업 내용

### 1. DTO 확장: reason에 `revision_request` 추가

`webhard-api/src/contacts/dto/drawing-revision.dto.ts`의 `CreateDrawingRevisionDto`:

- reason의 `@IsIn` 배열에 `'revision_request'` 추가

`webhard-api/src/integration/drawing-revisions/drawing-revisions.controller.ts`의 `IntegrationCreateDrawingRevisionDto`:

- 동일하게 reason에 `'revision_request'` 추가

### 2. DrawingRevisionService에 상태별 도면 조회 메서드 추가

`webhard-api/src/contacts/drawing-revision.service.ts`에 2개 메서드 추가:

```typescript
/**
 * 특정 공정 단계의 최신 DrawingRevision 반환
 */
async getLatestForStage(contactId: string, processStage: string): Promise<DrawingRevision | null>

/**
 * Contact의 현재 processStage에 맞는 최신 도면 자동 선택
 *
 * 조회 규칙:
 * - drawing: reason IN ('initial', 'domuson_fit')의 최신
 * - sample: reason = 'sample_revision'의 최신. 없으면 drawing 단계 fallback
 * - drawing_confirmed: processStage = 'drawing_confirmed'의 최신. 없으면 sample fallback
 * - laser ~ creasing: reason IN ('field_correction', 'laser_processing')의 최신. 없으면 drawing_confirmed fallback
 * - delivery: 가장 최신 revision (단계 무관)
 *
 * fallback 로직: 해당 단계에 도면이 없으면 이전 단계 순서대로 탐색
 */
async getLatestForCurrentStage(contactId: string): Promise<DrawingRevision | null>
```

**핵심 규칙:**

- `getLatestForCurrentStage`는 Contact를 먼저 조회하여 현재 processStage를 가져온 뒤, 규칙에 따라 적절한 도면을 반환한다.
- Contact.processStage가 null이면 가장 최신 revision을 반환한다.
- fallback은 단계 순서(PROCESS_STAGE_ORDER)의 역순으로 탐색한다.
- 도면이 하나도 없으면 null을 반환한다.

### 3. Controller에 최신 도면 조회 엔드포인트 추가

`webhard-api/src/contacts/contacts.controller.ts`에 추가:

```typescript
/**
 * GET /api/v1/contacts/:id/latest-drawing
 * 현재 공정 단계 기준 최신 도면 조회
 */
@Get(':id/latest-drawing')
async getLatestDrawing(@Param('id', ParseUUIDPipe) id: string)
```

반환값: DrawingRevision 객체 또는 null (없으면 `{ drawing: null }`)

**주의**: 이 엔드포인트는 `:id` 경로 파라미터를 사용하므로, `findOne` 등 다른 `:id` 엔드포인트보다 위에 배치해야 NestJS 라우팅이 정확히 동작한다. 기존 `@Get(':id/drawing-revisions')` 근처에 배치하라.

### 4. Controller에서 도면 업로드 actorType 동적 처리

현재 `contacts.controller.ts`의 `createDrawingRevision` 메서드는 actorType을 `'admin'`으로 하드코딩하고 있다:

```typescript
// 현재 코드
return this.drawingRevisionService.createRevision(id, dto, {
  actorType: 'admin',
  actorName: 'admin',
});
```

이를 수정하여 DTO에서 actorType을 받도록 한다:

- `CreateDrawingRevisionDto`에 actorType, actorName 필드 추가 (optional, 기본값 'admin')
- actorType 허용값: `'admin' | 'worker' | 'company'`
- controller에서 dto.actorType ?? 'admin' 사용

### 5. ContactsService.findOne() 응답 확장

`webhard-api/src/contacts/contacts.service.ts`의 `findOne()` 메서드 수정:

- 기존 Contact 데이터에 `latestDrawing` 필드를 추가하여 반환
- `DrawingRevisionService.getLatestForCurrentStage(contactId)`를 호출하여 가져온다
- latestDrawing이 null이면 필드를 포함하되 null로 반환

**주의**: ContactsService에 DrawingRevisionService를 주입해야 한다. 순환 의존(circular dependency)에 주의하라. 필요하면 `forwardRef`를 사용하라.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 기존 DrawingRevisionService의 메서드들(createRevision, getRevisions, getRevisionDownloadUrl 등)을 변경하지 마라. 새 메서드만 추가.
- 기존 테스트를 깨뜨리지 마라.
- Contact 모델이나 Prisma 스키마를 변경하지 마라. DB 마이그레이션 불필요.
- `contacts.controller.ts`에서 기존 엔드포인트의 URL 패턴이나 동작을 변경하지 마라.
- actorType 변경 시, 기존에 actorType 없이 호출하는 코드가 깨지지 않도록 optional + 기본값 처리.
