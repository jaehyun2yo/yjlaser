# Phase 1: API Fallback (api-fallback) — A안

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md` — NestJS 규칙, no any
- `docs/specs/features/drawing-workflow.md` — Phase 0에서 갱신된 "타임라인 신뢰성 보장" 섹션
- `docs/specs/features/drawing-revision-history.md` — 실패 처리 정책
- `docs/specs/api/nestjs-endpoints.md` — timeline 응답 Fallback 동작
- `/tasks/14-timeline-reliability/docs-diff.md`

그리고 이전 phase 산출물:

- Phase 0에서 갱신된 위 3개 spec

현재 코드 상태 (수정 대상):

- `webhard-api/src/contacts/contact-timeline.service.ts` — `getTimeline` L128-221
- `webhard-api/src/contacts/dto/timeline-item.dto.ts` — `TimelineItemDto` (task 13 산출물)
- `webhard-api/prisma/schema.prisma` — `contacts` 테이블 필드 확인용
  - `created_at`, `drawing_file_url`, `original_filename`, `drawing_file_name`, `source`, `company_id` 등

## 작업 내용

### 1. `getTimeline` 확장 — fallback 파생 로직

**파일**: `webhard-api/src/contacts/contact-timeline.service.ts`

`getTimeline(contactId, options)`의 끝 부분, 통합 배열 정렬 후 반환 직전에 다음 로직 추가:

```ts
// 의사 시그니처
if (merged.length === 0) {
  const contact = await this.prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      createdAt: true,
      source: true,
      drawingFileUrl: true,
      originalFilename: true,
      drawingFileName: true,
      // 기타 필요 필드
    },
  });
  if (!contact) return [];
  const fallback = this.buildFallbackTimeline(contact, options);
  return fallback;
}
```

### 2. `buildFallbackTimeline` 신규 private 메서드

**동작 규칙 (반드시 이대로)**:

1. **Event 1: `created`**
   - `kind: 'status_change'`
   - `id`: `fallback:${contact.id}:created` (안정적인 고유 ID)
   - `createdAt`: `contact.createdAt.toISOString()`
   - `actorType`/`actorName` 매핑:
     - `source === 'webhard_auto'` → actorType: 'system', actorName: '웹하드 자동생성'
     - `source === 'admin_manual'` → actorType: 'admin', actorName: '관리자'
     - 그 외 → actorType: 'system', actorName: null
   - `payload`: `{ changeType: 'created', metadata: { fallback: true } }`

2. **Event 2: `drawing_revision` (조건부)**
   - `contact.drawingFileUrl`이 truthy일 때만 추가
   - `kind: 'drawing_revision'`
   - `id`: `fallback:${contact.id}:drawing-initial`
   - `createdAt`: `contact.createdAt.toISOString()` (Event 1과 동일)
   - `actorType`: 'system', `actorName`: null (actor 정보 없음)
   - `payload`:
     ```
     {
       revisionId: 'fallback-initial',
       version: 1,
       processStage: null,
       reason: 'initial',
       reasonDetail: null,
       files: [{
         url: contact.drawingFileUrl,
         name: contact.originalFilename || contact.drawingFileName || 'initial-drawing',
         size: 0,
         mimeType: guessMimeType(name) || 'application/octet-stream'
       }],
       isPublic: false,
       note: null,
       fallback: true  // metadata 필드로 구분
     }
     ```

3. **정렬**: createdAt DESC (Event 1이 더 최근? 동일 시각이면 drawing_revision을 아래)
   - 구체 순서: `[drawing_revision(initial), status_change(created)]` (도면을 먼저, created는 가장 아래 — 시간순 내림차순이면 동일 시각이므로 둘 중 먼저 온 것이 앞)
   - 기존 데이터 있을 때와 동일하게 `createdAt DESC` 정렬 기본.

4. **`forCompany=true` 일 때**:
   - Event 1(`created`) 포함
   - Event 2(`drawing_revision initial`) **제외** (isPublic=false이므로)
   - 관리자 메타 마스킹 규칙은 현재 Phase에 불필요 (admin_manual인 경우에만 actorName을 'YJLaser'로)

### 3. 기존 두 테이블 조회 결과가 있을 때는 fallback 건너뜀

- `merged.length > 0` 이면 fallback 로직 건너뜀 (순수 실데이터만 반환).
- 실데이터 + fallback 섞지 않음 — 혼란 방지.

### 4. 타입 안정성

- 반환 타입 그대로 `TimelineItemDto[]`
- payload에 `fallback: true` 플래그 추가해야 한다면 `StatusChangePayload` / `DrawingRevisionPayload` 에 optional 필드로:
  ```ts
  interface StatusChangePayload {
    ...기존...
    fallback?: boolean;
  }
  interface DrawingRevisionPayload {
    ...기존...
    fallback?: boolean;
  }
  ```
- `webhard-api/src/contacts/dto/timeline-item.dto.ts` 갱신

### 5. 프론트엔드 영향 없음

- `TimelineItem` 타입도 동일 확장 (`fallback?: boolean`):
  - `src/lib/types/contact.ts`
- `ContactTimeline` 컴포넌트는 `fallback` 플래그를 무시해도 정상 동작 (옵션). 단, 이 phase에서는 타입만 맞추고 UI 변경은 불필요.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

빌드 성공 + 전체 테스트 통과. 이 phase에서는 새 테스트를 추가하지 않는다 — Phase 3 담당.

## AC 검증 방법

위 AC 커맨드 실행. 통과하면 `/tasks/14-timeline-reliability/index.json`의 phase 1 status를 `"completed"`로 변경.
3회 실패 시 `"error"` + `error_message`.

## 주의사항

- **Phase 1은 fallback 로직 추가만.** `recordChange`/`createInitialRevision` fire-and-forget은 Phase 2에서 제거.
- 기존 테스트를 깨뜨리지 마라. 특히 `contact-timeline.service.spec.ts` (task 13 phase 2 산출물).
- `buildFallbackTimeline`은 순수 함수에 가깝게(Contact 입력 → Timeline 출력). 외부 I/O 호출 금지 (단 `getTimeline`에서 `prisma.contact.findUnique` 한 번 호출은 OK).
- `guessMimeType` 유틸은 단순 확장자 기반. 불필요하면 `'application/octet-stream'`로 고정해도 OK.
- `forCompany` 규칙을 이 경로에도 적용 — 드래프트 조건 분기 주의.
- `fallback` 플래그는 DTO/타입에만 추가하고 이번 phase에서는 UI 소비 안 함 (Phase 3 테스트에서 검증).
- 이 phase는 백엔드만. 프론트 `src/lib/types/contact.ts`만 동기화.
