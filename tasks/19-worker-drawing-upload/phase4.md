# Phase 4: frontend-timeline-realtime

## 사전 준비

아래를 반드시 읽어 타임라인 쿼리·소켓 구독 패턴·QueryKey 구조를 파악하라:

- `tasks/19-worker-drawing-upload/phase3.md` — 모달에서 mutation onSuccess 시 refetch / invalidate 호출. 이 phase 에서 정확한 호출 방식 확정.
- `tasks/19-worker-drawing-upload/docs-diff.md` — 문서 diff.
- `src/lib/hooks/useContactTimeline.ts:21~32` — 현 훅. `enabled: expanded`, `staleTime: 5 * 60 * 1000`. 이 phase 에서 staleTime 을 `30 * 1000` 으로 축소.
- `src/lib/react-query/queryKeys.ts` — `queryKeys.contacts.timeline(contactId)`, `queryKeys.contacts.detail(contactId)` 확인.
- `src/app/worker/_components/WorkerDrawingUpload.tsx` (phase 3 에서 BaseModal 화된 상태) — onSuccess invalidate 로직.
- `src/app/worker/_components/StaffContactCard.tsx`, `OfficeContactCard.tsx` — 카드 컴포넌트. expanded state 위치 확인.
- `src/lib/socket/useSocketNamespace.ts` — 소켓 훅. 네임스페이스 싱글톤. 리스너만 추가/제거됨.
- `src/app/worker/dashboard/page.tsx:226~246` — 기존 dashboard 레벨 소켓 구독 예시. 유지 대상 (제거 금지).
- `webhard-api/src/contacts/contacts.gateway.ts:213` — 이벤트명 `contact:drawing_revision_added`, payload `{ contactId, ... }`. 구독 대상.
- `src/__tests__/worker/` — 기존 테스트 패턴.

이유: 버그 3 · 5 · 6 은 모두 단일 원인 (`enabled: expanded` + 긴 staleTime + mutation invalidate 가 enabled=false 쿼리를 refetch 하지 않음) 으로 수렴한다. 본인 업로드는 refetchQueries 로 강제, 타 사용자 업로드는 카드 레벨 소켓으로 전파.

## 작업 내용

### 1. `src/lib/hooks/useContactTimeline.ts` — staleTime 축소

```ts
staleTime: 30 * 1000, // 기존 5 * 60 * 1000
```

`enabled: expanded` 는 유지 (닫힌 카드 N+1 쿼리 방지).

### 2. `WorkerDrawingUpload.tsx` — mutation onSuccess 강화

`handleUpload` 성공 분기에서 기존 `invalidateQueries({ queryKey: contacts.timeline })` 를 아래로 교체:

```ts
await Promise.all([
  queryClient.refetchQueries({
    queryKey: queryKeys.contacts.timeline(contactId),
    type: 'active',
  }),
  queryClient.invalidateQueries({
    queryKey: queryKeys.contacts.detail(contactId),
  }),
]);
```

`type: 'active'` 는 현재 마운트된 쿼리만 refetch — 내 카드가 열려 있으면 즉시 반영. 상세 카드 헤더 정보도 (latest revision 번호 등) 동시 갱신.

### 3. 카드 레벨 소켓 구독 — 신규 훅 또는 카드에서 직접

`src/app/worker/_components/useTimelineRealtime.ts` (신규 훅) 생성:

```ts
export function useTimelineRealtime(contactId: string, expanded: boolean): void {
  const queryClient = useQueryClient();
  const socket = useSocketNamespace('/contacts');

  useEffect(() => {
    if (!expanded || !socket) return;
    const handler = (data: { contactId: string }) => {
      if (data.contactId !== contactId) return;
      queryClient.refetchQueries({
        queryKey: queryKeys.contacts.timeline(contactId),
        type: 'active',
      });
    };
    socket.on('contact:drawing_revision_added', handler);
    return () => {
      socket.off('contact:drawing_revision_added', handler);
    };
  }, [expanded, contactId, socket, queryClient]);
}
```

`StaffContactCard.tsx`, `OfficeContactCard.tsx` 각각에서 `useTimelineRealtime(contactId, expanded)` 호출. expanded state 와 contactId 는 이미 각 카드에 존재.

### 4. `OrderEvent` 관련 이벤트 확장 검토

현재는 `contact:drawing_revision_added` 만 구독. `contact:status_changed`, `contact:process_stage_changed` 등도 타임라인에 영향을 주지만 이번 phase 의 스코프 밖 — 건드리지 않는다. 필요 시 별도 task.

### 5. 테스트 추가

`src/lib/hooks/__tests__/useContactTimeline.test.tsx` 확장 (없으면 신규):

- T1: 훅 옵션에 `staleTime: 30000` 이 전달되는지 (queryClient spy).

`src/__tests__/worker/WorkerDrawingUpload.test.tsx` 확장 (phase 3 파일에 추가):

- T2: mutation 성공 시 `queryClient.refetchQueries` 가 `contacts.timeline(contactId)` + `type: 'active'` 인자로 호출.
- T3: 동시에 `invalidateQueries` 가 `contacts.detail(contactId)` 로 호출.

`src/app/worker/_components/__tests__/useTimelineRealtime.test.tsx` (신규):

- T4: expanded=true 마운트 시 `socket.on('contact:drawing_revision_added', ...)` 호출.
- T5: expanded=false 또는 unmount 시 `socket.off(...)` 호출 (leak 방지 검증).
- T6: `contact:drawing_revision_added` 이벤트 payload.contactId 일치 시 `queryClient.refetchQueries` 호출, 불일치 시 호출 없음.

소켓 mock 은 `useSocketNamespace` 자체를 jest mock — 외부 시스템이라 허용.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="worker|useContactTimeline|useTimelineRealtime"
```

## AC 검증 방법

위 커맨드 통과 시 `tasks/19-worker-drawing-upload/index.json` 의 phase 4 status 를 `"completed"`. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- `useContactTimeline.ts` 의 `enabled: expanded` 는 **유지**. 제거하면 카드 100+ 개가 모두 쿼리 — 네트워크 폭탄.
- 소켓 리스너는 반드시 useEffect cleanup 에서 `off` 호출. 누락 시 메모리 누수 + 중복 실행.
- `useSocketNamespace` 는 이미 싱글톤 — 카드 여러 개에서 호출해도 연결은 1 개. 걱정 없음.
- Worker dashboard (`src/app/worker/dashboard/page.tsx:226~`) 의 기존 전역 소켓 구독 **제거 금지** — 대시보드 레벨 refresh 용도로 유지.
- `refetchQueries({ type: 'active' })` 는 현재 마운트된 쿼리만 refetch. `enabled=false` 쿼리는 skip 되며 다음 expanded=true 시점에 staleTime 30s 지나면 자동 refetch 됨 — 의도한 동작.
- phase 3 에서 mutation onSuccess 로직 초안이 이미 들어있을 수 있음. 이 phase 에서 **최종 확정** — 중복 invalidate 호출 없도록 정리.
- ContactTimelineRealtime 컴포넌트가 이미 존재한다면 (task 18 산출물) 그 구현을 먼저 확인하고 중복되지 않는 선에서 새 훅 도입. 이미 충분하면 기존 확장만으로도 가능.
