# Phase 8: timeline-realtime

## 사전 준비

- `tasks/17-contact-feedback-pack/phase3.md` — 이전 task 의 실시간 구독 설계. 이 phase 는 그 구독 대상에 **신규 이벤트 2종** (folder:renamed, file:moved) 을 추가하고, **상세 페이지 단독 접속 시에도 반영** 되도록 클라이언트 래퍼를 도입한다.
- `src/app/(admin)/admin/contacts/[id]/page.tsx` — 현재 서버 컴포넌트. `<ContactTimeline entries={timelineData} showActor />` 렌더.
- `src/app/(admin)/admin/work-management/[id]/page.tsx` — 위와 거의 동일 중복 페이지. 같은 변경 적용.
- `src/components/ContactTimeline.tsx` — presentation 컴포넌트. 그대로 재사용.
- `src/lib/socket/useSocketNamespace.ts` — 소켓 구독 훅.
- `src/lib/react-query/queryKeys.ts` — `queryKeys.contacts.timeline(contactId)` 팩토리.
- `src/lib/hooks/useContactTimeline.ts` — React Query 훅, `initialData` 주입 방식 확인.
- `src/app/actions/contacts.ts:252` — `getContactTimeline` 서버 액션.
- `webhard-api/src/contacts/contacts.gateway.ts` — 기존 `emitContactUpdated`, `emitDrawingRevisionAdded`, `emitGroupStageAdvanced`, `emitContactSplit` + phase 5 신규 `emitFolderRenamed`, `emitFileMoved`.

이유: 기존에는 `[id]/page.tsx` 가 서버 컴포넌트라 혼자 열어 둬도 실시간 반영이 되지 않았다. 클라이언트 컴포넌트 래퍼로 타임라인 영역을 감싸서 단독 접속에서도 소켓 구독을 보장.

## 작업 내용

### 1. 신규 클라이언트 컴포넌트 `src/app/(admin)/admin/contacts/_components/ContactTimelineRealtime.tsx`

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { ContactTimeline } from '@/components/ContactTimeline';
import type { TimelineItemDto } from '@/types/contact-timeline';

export function ContactTimelineRealtime({
  contactId,
  initialEntries,
  showActor = true,
  compact = false,
}: {
  contactId: string;
  initialEntries: TimelineItemDto[];
  showActor?: boolean;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: entries } = useContactTimeline({
    contactId,
    externalExpanded: true,
    initialData: initialEntries,
  });

  useSocketNamespace('contacts', {
    events: {
      'contact:drawing_revision_added': (data: { contactId: string }) => {
        if (data.contactId !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
      'contact:updated': (data: { id: string }) => {
        if (data.id !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
      'contact:status_changed': (data: { id: string }) => {
        if (data.id !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
      'contact:process_stage_changed': (data: { id: string }) => {
        if (data.id !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
      'contact:group-stage-advanced': (data: { parentContactId: string }) => {
        if (data.parentContactId !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
      'contact:split': (data: { parentContactId: string }) => {
        if (data.parentContactId !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
      'folder:renamed': (data: { contactId: string }) => {
        if (data.contactId !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
      'file:moved': (data: { contactId: string }) => {
        if (data.contactId !== contactId) return;
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
      },
    },
  });

  return (
    <ContactTimeline entries={entries ?? initialEntries} showActor={showActor} compact={compact} />
  );
}
```

### 2. `useContactTimeline` 훅 확장

`src/lib/hooks/useContactTimeline.ts` 에 `initialData` 옵션 추가:

```ts
export function useContactTimeline({
  contactId,
  externalExpanded,
  initialData,
}: {
  contactId: string;
  externalExpanded?: boolean;
  initialData?: TimelineItemDto[];
}) {
  return useQuery({
    queryKey: queryKeys.contacts.timeline(contactId),
    queryFn: () => getContactTimeline(contactId),
    enabled: externalExpanded ?? true,
    staleTime: 5 * 60 * 1000,
    initialData,
  });
}
```

기존 호출처(`ContactDetailView` 등) 는 `initialData` 없이도 동작. 새 래퍼는 초기 SSR 데이터를 주입.

### 3. 상세 페이지 교체

`src/app/(admin)/admin/contacts/[id]/page.tsx`:

기존:

```tsx
<ContactTimeline entries={timelineData} showActor />
```

교체:

```tsx
<ContactTimelineRealtime contactId={id} initialEntries={timelineData} showActor />
```

동일 변경을 `src/app/(admin)/admin/work-management/[id]/page.tsx` 에도 적용. 두 페이지 모두 업데이트 필수.

### 4. `ContactsGateway` emit 패턴 확인·보강

`webhard-api/src/contacts/contacts.gateway.ts` 에서 아래 emit 들이 **admin + worker 룸** 에 실제로 발행되는지 확인:

- `emitContactUpdated` — 기존
- `emitContactStatusChanged` — 기존
- `emitContactProcessStageChanged` — 기존
- `emitDrawingRevisionAdded` — 기존 (task 17 phase 3 에서 추가)
- `emitGroupStageAdvanced` — 기존
- `emitContactSplit` — 기존
- `emitFolderRenamed` — phase 5 에서 추가됨
- `emitFileMoved` — phase 5 에서 추가됨

payload 는 최소 `contactId` 또는 식별 가능한 id 를 포함해야 한다. 누락된 게 있으면 이 phase 에서 payload 보강.

### 5. 테스트

`src/__tests__/components/ContactTimelineRealtime.test.tsx`:

- `initialEntries` prop 으로 전달된 데이터가 초기 렌더에 표시된다
- 소켓 mock (`vi.fn` / `jest.fn`) 이 각 이벤트 발행 시 `queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) })` 호출 확인 (8 이벤트 모두)
- 다른 contactId payload 는 invalidate 호출 안 됨 (자기 id 만 반응)
- 언마운트 시 소켓 구독 해제 (`useSocketNamespace` 내부 cleanup 검증)

기존 `src/__tests__/components/ContactTimeline.test.tsx` 는 그대로 유지 (presentation 테스트).

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="ContactTimelineRealtime|useContactTimeline|admin/contacts"
```

## AC 검증 방법

통과 시 phase 8 status `"completed"`. 3회 실패 시 `"error"`.

## 주의사항

- 두 상세 페이지 (`admin/contacts/[id]` + `admin/work-management/[id]`) 모두 교체. 한 곳만 바꾸면 공정 화면에서 실시간 미반영 — 반드시 양쪽.
- `useContactTimeline` 의 `initialData` 추가가 기존 호출처(`ContactDetailView` 등) 를 깨뜨리지 않도록 optional 로 유지.
- 이벤트 페이로드의 식별자 필드명 상이 주의: `contact:updated` 는 `data.id`, `contact:drawing_revision_added` 는 `data.contactId`, `contact:split` 는 `data.parentContactId`. 각 이벤트에 맞는 필드 사용.
- invalidate 만 수행. `router.refresh()` 는 쓰지 마라 — 전체 서버 컴포넌트 리렌더 비용이 과다. React Query 캐시 무효화로 충분.
- `useSocketNamespace` 는 같은 namespace 에 대해 singleton 연결을 재사용. 여러 번 호출해도 추가 connection 생성 안 됨 — 기존 패턴 유지.
- `ContactTimeline` 의 presentation 로직 (ASC 정렬, actorName 표시 등) 은 task 17 phase 2 에서 이미 완성. 건드리지 마라.
- 이 phase 에서 **백엔드 gateway emit 함수 시그니처 변경은 최소화**. phase 5 에서 이미 추가된 것만 사용, 이 phase 는 주로 프론트.
- `contact:split` 이벤트 구독은 admin/worker 양쪽이 이미 task 2~3 에서 필요. 중복 구독 아닌지 확인 (`_lib/hooks.ts` 의 useRealtimeSubscription 과 중복되어도 React Query invalidate 는 멱등이므로 무해).
