# Phase 4: 프론트엔드 데이터 레이어

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-revision-history.md`
- `/tasks/0-drawing-revision/docs-diff.md` (이번 task의 문서 변경 기록)
- `CLAUDE.md` — 프론트엔드 컨벤션 (queryKeys factory, @/ imports, 'use client' 규칙 등)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/contacts.controller.ts` — Phase 2에서 추가한 엔드포인트 확인 (경로, HTTP 메서드, 요청/응답 형식)
- `webhard-api/src/contacts/dto/drawing-revision.dto.ts` — DTO 구조 확인
- `webhard-api/src/contacts/drawing-revision.service.ts` — 서비스 메서드 응답 형식 확인

아래 기존 코드를 반드시 읽고 패턴을 이해하라:

- `src/lib/types/contact.ts` — Contact 타입 정의, ContactTimelineEntry 타입
- `src/lib/react-query/queryKeys.ts` — queryKeys 팩토리 패턴
- `src/lib/api/nestjs-server-client.ts` — nestjsFetch 헬퍼 함수, 기존 서버 함수 패턴
- `src/lib/hooks/useContactTimeline.ts` — React Query 훅 패턴
- `src/app/api/contacts/[id]/timeline/route.ts` 또는 유사한 API 프록시 라우트 — Next.js API route 프록시 패턴
- `src/app/api/contacts/[id]/file-download/route.ts` — 파일 다운로드 프록시 패턴

## 작업 내용

### 1. 타입 정의: `src/lib/types/contact.ts`

기존 파일에 아래 타입 추가:

```typescript
export interface DrawingRevisionFile {
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

export interface DrawingRevision {
  id: string;
  contact_id: string;
  version: number;
  process_stage: string | null;
  reason: string;
  reason_detail: string | null;
  files: DrawingRevisionFile[];
  actor_type: string;
  actor_name: string | null;
  source: string;
  is_public: boolean;
  note: string | null;
  created_at: string;
}
```

기존 `ContactTimelineEntry` 타입의 `change_type` union에 `'drawing_revision'` 추가.

### 2. Query Keys: `src/lib/react-query/queryKeys.ts`

기존 `contacts` 섹션에 추가:

```typescript
drawingRevisions: (id: number | string) =>
  [...queryKeys.contacts.detail(id), 'drawing-revisions'] as const,
```

기존 contacts 키 구조를 읽고 정확한 위치에 추가하라.

### 3. 서버 함수: `src/lib/api/nestjs-server-client.ts`

기존 nestjsFetch 패턴을 따라 아래 함수들 추가:

```typescript
// 도면 수정 이력 조회
export async function serverGetDrawingRevisions(
  contactId: string,
  includePrivate: boolean = true
): Promise<DrawingRevision[]>;
// GET /contacts/{contactId}/drawing-revisions?includePrivate={includePrivate}

// 도면 수정 등록
export async function serverCreateDrawingRevision(
  contactId: string,
  data: {
    reason: string;
    reasonDetail?: string;
    files: DrawingRevisionFile[];
    processStage?: string;
    note?: string;
    isPublic?: boolean;
    source?: string;
  }
): Promise<DrawingRevision>;
// POST /contacts/{contactId}/drawing-revisions

// 도면 업로드 presigned URL 생성
export async function serverGetDrawingRevisionUploadUrls(
  contactId: string,
  files: Array<{ name: string; mimeType: string }>
): Promise<Array<{ uploadUrl: string; key: string; fileName: string }>>;
// POST /contacts/{contactId}/drawing-revisions/upload-urls

// 도면 파일 다운로드 URL
export async function serverGetDrawingRevisionDownloadUrl(
  revisionId: string,
  fileIndex: number
): Promise<{ url: string; fileName: string }>;
// GET /drawing-revisions/{revisionId}/download?fileIndex={fileIndex}

// 공개 여부 변경
export async function serverUpdateDrawingRevisionVisibility(
  revisionId: string,
  isPublic: boolean
): Promise<DrawingRevision>;
// PATCH /drawing-revisions/{revisionId}/visibility
```

### 4. React Query 훅: `src/lib/hooks/useDrawingRevisions.ts`

새 파일 생성. 기존 `useContactTimeline.ts` 패턴 참고:

```typescript
// useDrawingRevisions(contactId, options?)
// - queryKey: queryKeys.contacts.drawingRevisions(contactId)
// - queryFn: fetch /api/contacts/{contactId}/drawing-revisions
// - enabled: options?.enabled ?? true
// - staleTime: 5 * 60 * 1000
```

### 5. Next.js API 프록시 라우트

기존 API 라우트 패턴을 참고하여 아래 파일들 생성:

#### `src/app/api/contacts/[id]/drawing-revisions/route.ts`

```typescript
// GET: NestJS /contacts/{id}/drawing-revisions로 프록시
// POST: NestJS /contacts/{id}/drawing-revisions로 프록시
```

#### `src/app/api/contacts/[id]/drawing-revisions/upload-urls/route.ts`

```typescript
// POST: NestJS /contacts/{id}/drawing-revisions/upload-urls로 프록시
```

#### `src/app/api/drawing-revisions/[revisionId]/download/route.ts`

```typescript
// GET: NestJS /drawing-revisions/{revisionId}/download로 프록시
```

**프록시 패턴**: 기존 API 라우트 파일을 읽어 인증 헤더 전달, 에러 핸들링 방식을 정확히 따르라. `nestjsFetch`를 직접 사용할 수 있다면 사용하고, 아니라면 기존 라우트의 fetch 패턴을 따르라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/0-drawing-revision/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 기존 타입, queryKeys, 서버 함수 파일의 기존 내용을 삭제하거나 수정하지 마라. 추가만 하라.
- `@/` 절대경로 import만 사용. 상대경로 금지.
- `console.log` 금지. `logger.createLogger` 사용.
- 새 파일 생성 시 기존 파일의 스타일(export 방식, 함수명 패턴, 에러 핸들링)을 정확히 따르라.
- NestJS 컨트롤러의 실제 라우트 경로를 확인하라. 특히 `drawing-revisions/:revisionId/download` 경로가 contacts prefix 아래에 있는지, 별도인지 확인 필수.
