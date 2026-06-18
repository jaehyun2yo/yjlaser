# Phase 2: timeline-sort-asc + actor-display

## 사전 준비

- `docs/specs/features/inquiry-classification-ux.md` §9 — Phase 0 에서 ASC 전환을 기록했는지 재확인.
- `webhard-api/src/contacts/contact-timeline.service.ts` — **정렬을 바꿀 4곳**:
  - line 140 (ContactStatusHistory findMany orderBy)
  - line 144 (DrawingRevision findMany orderBy)
  - line 223 (merged.sort 비교자)
  - line 324-330 (buildFallbackTimeline 의 items.sort)
- `src/components/ContactTimeline.tsx` — `StatusChangeRow` (line 126-172), `DrawingRevisionRow` (line 174-288). `isLast` 판별 로직 유지.
- `webhard-api/src/contacts/contacts.service.ts` — `updateInquiryType(id, inquiryType, actor?)` 에서 `recordChange` 에 actor 를 전달하는지 확인.
- `webhard-api/src/contacts/contact-timeline.service.spec.ts` — 정렬 순서 assert 하는 기존 테스트 위치.
- `src/__tests__/components/ContactTimeline.test.tsx` — 신규 케이스 2건 추가 대상.

## 작업 내용

### 1. NestJS 타임라인 정렬 ASC 전환 (4곳)

**파일**: `webhard-api/src/contacts/contact-timeline.service.ts`

- **line 140**: `orderBy: { createdAt: 'desc' }` → `orderBy: { createdAt: 'asc' }`
- **line 144**: `orderBy: { createdAt: 'desc' }` → `orderBy: { createdAt: 'asc' }`
- **line 223** (merged.sort):
  - 변경 전: `(a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)`
  - 변경 후: `(a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)`
- **line 324-330** (buildFallbackTimeline 의 items.sort):
  - DESC → ASC 로 전환. 동일 시각 규칙도 반대로:
    - 기존: `drawing_revision` 우선
    - 변경 후: `status_change (created)` 우선 → 그 다음 `drawing_revision (initial)` — create 이벤트가 시간상 선행한다는 의미론에 부합.

### 2. `updateInquiryType` actor 전달 검증

**파일**: `webhard-api/src/contacts/contacts.service.ts`

`updateInquiryType(id, inquiryType, actor?)` 내부에서 `this.timelineService.recordChange({...})` 호출부가 `actorType: actor?.actorType ?? 'system'`, `actorName: actor?.actorName ?? null` 를 전달하는지 확인. **이미 적용되어 있으면 변경 diff 0 라인으로 정상**. 누락 시 추가만.

### 3. `ContactTimeline` StatusChangeRow actorName 상시 노출

**파일**: `src/components/ContactTimeline.tsx`

**StatusChangeRow** (line 149-169) 의 inline 분기 간결화:

- `compact && showActor && actorName` 전용 라인과 `!compact && actorName` 전용 라인이 각각 존재 → 두 분기를 합쳐 **항상 label 옆 inline 으로** 노출:

```tsx
<span className="text-xs text-foreground" data-testid="timeline-label">
  {label}
  {showActor && actorName && (
    <span className="text-muted-foreground font-normal"> — {actorName}</span>
  )}
</span>
```

compact/non-compact 분기 제거. `!compact && actorName` 의 `getActorTypeLabel` 라벨(작업자/관리자 등) 노출도 제거 — 이름만 노출.

**DrawingRevisionRow** (line 232-234): 이미 actorName 표시 중. `text-[10px]` → `text-[11px]` 로 한 단계 키움 (가독성).

### 4. Backend 테스트 수정

**파일**: `webhard-api/src/contacts/contact-timeline.service.spec.ts`

기존 "타임라인이 DESC 로 정렬" 류 테스트 → ASC 기대값으로 수정. 테스트 이름도 변경.

### 5. Frontend 테스트 추가

**파일**: `src/__tests__/components/ContactTimeline.test.tsx`

신규 케이스 2건:

```tsx
it('renders entries in server-provided order (ASC expected)', () => {
  const entries: TimelineItem[] = [
    {
      id: '1',
      kind: 'status_change',
      createdAt: '2026-04-20T09:00:00Z',
      actorType: 'system',
      actorName: null,
      payload: { changeType: 'created', metadata: { source: 'website' } },
    },
    {
      id: '2',
      kind: 'status_change',
      createdAt: '2026-04-20T11:00:00Z',
      actorType: 'admin',
      actorName: '관리자A',
      payload: { changeType: 'type', toValue: 'cutting_request' },
    },
  ];
  render(<ContactTimeline entries={entries} />);
  const labels = screen.getAllByTestId('timeline-label');
  expect(labels[0]).toHaveTextContent(/문의 접수/);
  expect(labels[1]).toHaveTextContent(/유형 변경/);
});

it('shows actorName inline for status_change when showActor=true', () => {
  const entries: TimelineItem[] = [
    {
      id: '1',
      kind: 'status_change',
      createdAt: '2026-04-20T09:00:00Z',
      actorType: 'admin',
      actorName: '관리자A',
      payload: { changeType: 'type', toValue: 'cutting_request' },
    },
  ];
  render(<ContactTimeline entries={entries} compact showActor />);
  expect(screen.getByText(/관리자A/)).toBeInTheDocument();
});
```

`TimelineItem` 타입 import 는 `@/lib/types/contact`.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="ContactTimeline" && cd webhard-api && pnpm test -- --testPathPattern="contact-timeline.service"
```

단일 메시지 병렬 발사. 통과 시 phase 2 status `"completed"`. 3회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- **정렬 방향 변경은 4곳 모두 일관되게**: findMany 2 + merged sort 1 + fallback sort 1. 한 곳이라도 DESC 로 남으면 깨짐.
- fallback 동시각 순서 규칙이 **drawing_revision 우선 → status_change 우선** 으로 반대. 기존 테스트 있으면 업데이트.
- `updateInquiryType` 의 `actor` 인자는 task 15/16 에서 이미 반영됐을 수 있음 — 변경 diff 0 이어도 정상.
- Worker 카드 (`OfficeContactCard`, `StaffContactCard`) 는 `<ContactTimeline entries={entries} compact />` 로 호출 (showActor prop 없이 기본값 `true`) → 이번 변경으로 StatusChangeRow 의 actorName 이 자동 노출.
- `isLast` 판별 (`idx === entries.length - 1`) 은 그대로 — ASC 에서는 자연스럽게 "최신" 이 마지막 원 강조.
- `formatTimelineDate`, `getStatusChangeLabel` 등 헬퍼 함수 **건드리지 말 것**.
