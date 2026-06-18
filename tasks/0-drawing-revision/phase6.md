# Phase 6: Company 포털 통합 + WebSocket

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-revision-history.md`
- `/tasks/0-drawing-revision/docs-diff.md` (이번 task의 문서 변경 기록)
- `CLAUDE.md` — 프론트엔드 컨벤션

그리고 이전 phase의 작업물을 반드시 확인하라:

- `src/components/DrawingRevisionTimeline.tsx` — Phase 5에서 생성한 타임라인 컴포넌트
- `src/lib/hooks/useDrawingRevisions.ts` — Phase 4에서 생성한 훅
- `webhard-api/src/contacts/drawing-revision.service.ts` — Phase 2에서 생성한 서비스
- `webhard-api/src/contacts/contacts.gateway.ts` — 기존 WebSocket 게이트웨이

아래 기존 코드를 반드시 읽고 패턴을 이해하라:

- `webhard-api/src/contacts/contacts.gateway.ts` — 전체 파일. WebSocket 이벤트 emit 패턴, 룸 기반 접근 제어
- `src/app/company/` — Company 포털 전체 구조 파악. 문의 관련 페이지/컴포넌트 확인
- `src/app/company/dashboard/` 또는 `src/app/company/orders/` — 문의 상세가 표시되는 곳 확인
- Company 포털에서 Contact 상세를 표시하는 컴포넌트를 찾아라. 이 컴포넌트에 도면 수정 이력을 추가해야 한다.

## 작업 내용

### 1. Company 포털 도면 수정 이력 표시

Company 포털에서 문의 상세를 표시하는 컴포넌트를 찾아 아래 내용을 추가:

**조건**: Company 사용자는 `isPublic=true`인 항목만 볼 수 있다.

```typescript
// useDrawingRevisions 훅에 includePrivate=false 옵션 추가
const { data: revisions = [] } = useDrawingRevisions(contactId, {
  enabled: true,
  includePrivate: false, // company 사용자는 공개 항목만
});
```

먼저 `src/lib/hooks/useDrawingRevisions.ts`를 확인하여 `includePrivate` 옵션이 지원되는지 확인. 없다면 추가:

```typescript
interface UseDrawingRevisionsOptions {
  enabled?: boolean;
  includePrivate?: boolean;
}
```

`queryFn`에서 `includePrivate` 파라미터를 API 호출 시 전달:

```typescript
fetch(
  `/api/contacts/${contactId}/drawing-revisions?includePrivate=${options.includePrivate ?? true}`
);
```

Company 포털 문의 상세에 도면 수정 이력 섹션 추가:

- `DrawingRevisionTimeline` 컴포넌트 사용
- `showVisibilityToggle={false}` — 공개 토글 숨김
- 읽기 전용: 업로드 버튼 없음

**Company 포털 페이지 구조를 파악하기 위해 아래 경로를 탐색하라:**

- `src/app/company/` 하위 디렉토리
- `src/app/(admin)/admin/contacts/ContactDetailModal.tsx` — isCompanyView prop이 있을 수 있음
- Company 포털이 `ContactDetailModal`을 `isCompanyView={true}`로 재사용하는지, 별도 컴포넌트인지 확인

**가능한 통합 시나리오:**

- A) ContactDetailModal에 `isCompanyView` prop이 이미 있고, company에서 이 모달을 사용 → 모달 내에서 isCompanyView일 때 includePrivate=false로 로드
- B) Company 전용 컴포넌트 존재 → 해당 컴포넌트에 DrawingRevisionTimeline 추가
- C) Company 포털에서 문의 상세를 보여주는 곳이 없음 → 기존 ContactDetailModal을 company에서도 사용하도록 연동

**정확한 통합 방식은 코드를 읽고 판단하라.** 위 시나리오 중 하나를 선택하여 구현.

### 2. WebSocket 이벤트 추가

`webhard-api/src/contacts/contacts.gateway.ts`에 새 이벤트 추가:

기존 `emitContactUpdated()` 등의 패턴을 따라:

```typescript
// 도면 수정 추가 이벤트
emitDrawingRevisionAdded(contactId: string, revision: { id: string; version: number }) {
  // admin 룸 + 해당 company 룸에 emit
  this.server.to('admin').emit('contact:drawing_revision_added', { contactId, revision });
  // company 관련 emit이 필요하다면 기존 패턴 참고
}
```

`webhard-api/src/contacts/drawing-revision.service.ts`의 `createRevision()` 메서드에서 revision 생성 후 게이트웨이 emit 호출:

```typescript
// fire-and-forget
this.contactsGateway.emitDrawingRevisionAdded(contactId, {
  id: revision.id,
  version: revision.version,
});
```

### 3. 프론트엔드 실시간 업데이트

Admin 페이지에서 `contact:drawing_revision_added` 이벤트를 수신하면 drawingRevisions 쿼리를 무효화.

기존 실시간 구독 패턴을 확인:

- `src/app/(admin)/admin/contacts/_lib/hooks.ts` — useRealtimeSubscription 등

해당 패턴을 따라 `contact:drawing_revision_added` 이벤트 수신 시:

```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.contacts.drawingRevisions(contactId) });
```

**중요**: 기존 실시간 구독 로직에 이벤트를 추가하는 것이 가장 깔끔하다. 새 구독을 만들지 말고 기존 구독에 이벤트 핸들러를 추가하라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/0-drawing-revision/index.json`의 phase 6 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- Company 포털의 기존 기능을 깨뜨리지 마라.
- Company 사용자에게 도면 업로드 버튼을 노출하지 마라. 조회만 가능.
- Company 사용자에게 isPublic 토글을 노출하지 마라.
- WebSocket 이벤트명은 기존 패턴(`contact:` prefix)을 따르라.
- 기존 WebSocket 이벤트 핸들러를 수정하지 마라. 새 이벤트만 추가.
- `useEffect` cleanup을 반드시 포함하라 (소켓 이벤트 리스너 해제).
- Company 포털 구조를 파악한 뒤 가장 일관성 있는 방식으로 통합하라. 코드를 충분히 읽고 판단하라.
