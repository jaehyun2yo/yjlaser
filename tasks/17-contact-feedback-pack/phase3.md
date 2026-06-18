# Phase 3: timeline-realtime

## 사전 준비

- `src/app/(admin)/admin/contacts/_lib/hooks.ts` — `useRealtimeSubscription` 훅 현재 구독 이벤트 목록 확인. 기존 invalidate 패턴 (`queryKeys.contacts.all`, `queryKeys.processBoard.all`) 참고.
- `src/app/worker/dashboard/page.tsx` (line 191-205) — worker 쪽 `socketEvents` 객체. `contact:drawing_revision_added` 핸들러 등록 여부.
- `webhard-api/src/contacts/contacts.gateway.ts` (line 199-203) — `emitDrawingRevisionAdded({contactId, revisionId, version})` payload 구조.
- `src/lib/react-query/queryKeys.ts` — `queryKeys.contacts.timeline(contactId)` 키 구조.
- `src/lib/hooks/useContactTimeline.ts` — invalidate 대상 queryKey.
- `src/lib/socket/socket-manager.ts` — namespace 기준 singleton connection 재사용 확인.

## 작업 내용

### 1. Admin `useRealtimeSubscription` 에 drawing_revision 이벤트 추가

**파일**: `src/app/(admin)/admin/contacts/_lib/hooks.ts`

`useRealtimeSubscription` 이 구독하는 events 맵에 신규 핸들러 추가:

```ts
'contact:drawing_revision_added': (data: { contactId: string; revisionId: string; version: number }) => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.contacts.timeline(data.contactId),
  });
},
```

기존 `contact:updated`, `contact:status_changed`, `contact:process_stage_changed` 핸들러 내부에도 payload 의 id 또는 contactId 로 `queryKeys.contacts.timeline(contactId)` invalidate 를 **추가**한다 (기존 `contacts.all` / `processBoard.all` invalidate 는 유지).

payload 추출 방식 참조:

- `emitContactUpdated(contact)` 는 contact 전체 객체 → `data.id`
- `emitContactStatusChanged(contact)` 는 contact 전체 객체 → `data.id`
- `emitContactProcessStageChanged(contact)` 동일 → `data.id`

### 2. Worker dashboard `socketEvents` 확장

**파일**: `src/app/worker/dashboard/page.tsx` (line 191-205 근처)

`socketEvents` 객체에 다음 항목 추가:

```ts
'contact:drawing_revision_added': (data: { contactId: string }) => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.contacts.timeline(data.contactId),
  });
  debouncedTargetedInvalidate();
},
```

기존 `contact:updated`, `contact:status_changed`, `contact:process_stage_changed` 핸들러는 `debouncedTargetedInvalidate` 로 워커 대시보드 목록만 갱신 중 — **타임라인 invalidate 는 payload 에서 contactId 추출 가능한 경우에만 추가**. 추출 불가한 batch 이벤트는 변경 없음 (펼친 타임라인은 staleTime 5분 후 자동 refetch 로 보완).

### 3. 소켓 중복 방지 확인

`socketManager.connect(namespace, ...)` 는 namespace 기준 singleton. 이번 phase 는 **기존 connection 에 핸들러만 append** — 추가 연결 생성 없음. 확인만 하고 코드 변경 없음.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="worker/dashboard|realtime|admin/contacts/_lib"
```

통과 시 phase 3 status `"completed"`. 3회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- Admin/Worker 양쪽 기존 소켓 연결 재사용. 추가 `useSocketNamespace` 호출 금지.
- Payload 에서 contactId 추출 불가능한 이벤트 (batch_updated 등) 는 건드리지 말 것.
- React Query invalidate 는 active query 만 refetch 하므로, 펼쳐져 있지 않은 카드의 타임라인은 무시된다 — 정상 동작.
- 이미 열린 `ContactDetailView` 또는 Worker 카드의 `useContactTimeline` 이 invalidate 신호 받으면 자동 refetch.
- 이 phase 테스트는 Jest 유닛 수준에서만. 실제 소켓 전파는 Phase 6 E2E S3 에서 검증.
- TS 타입 에러 없이 payload.contactId 접근하려면 event handler 시그니처에 타입 지정 필수.
