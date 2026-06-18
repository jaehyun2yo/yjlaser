# Phase 3: worker-context-menu

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — 이번 task의 설계 문서
- `docs/specs/features/worker-portal.md` — Worker 대시보드 UX
- `docs/specs/features/design-system.md` — UI 스타일 규칙
- `docs/testing.md` — 테스트 전략
- `/tasks/15-inquiry-classification-ux/docs-diff.md` — Phase 0 문서 변경 기록

이전 phase 산출물 확인:

- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` (Phase 1)
- `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` (Phase 2 — Worker 패턴 참고만, 재사용 안 함)

코드 레퍼런스:

- `src/app/worker/_components/WorkerContextMenu.tsx` — 확장 대상 (긴급 토글, 분할 기능 이미 존재)
- `src/app/worker/dashboard/page.tsx` — `contextMenu` state, `handleContextMenu`, 재분류 핸들러 추가 위치 (275~292줄 근처)
- `src/app/worker/_components/OfficeContactCard.tsx` — long-press 핸들러 + `onContextMenu` prop 전달부
- `src/app/worker/_components/StaffContactCard.tsx` — 동일 패턴 (long-press + onContextMenu)
- `src/app/api/contacts/[id]/inquiry-type/route.ts` — 재사용 PATCH API
- `src/lib/types/contact.ts` — `InquiryType`

## 작업 내용

### 1. `WorkerContextMenu.tsx` 확장

파일: `src/app/worker/_components/WorkerContextMenu.tsx`

**기존 Props 유지**: `onToggleUrgent`, `onSplit` 등. 아래 **신규 Props 추가**:

```ts
interface WorkerContextMenuProps {
  // ...기존 props
  currentInquiryType?: InquiryType | null; // 현재 분류 타입 (disabled 처리용)
  canReclassify: boolean; // 재분류 메뉴 표시 여부 (이미 분류된 카드만 true)
  onReclassify: (inquiryType: InquiryType) => void;
}
```

**렌더 변경**:

- 기존 메뉴 항목(긴급/분할) 위 또는 아래에 **재분류 서브섹션** 추가
- `canReclassify`가 true일 때만 재분류 섹션 렌더
- 섹션 구조:
  ```
  ── 재분류 ──
  [ 칼선의뢰 ]  (currentInquiryType === 'cutting_request'면 disabled)
  [ 목형의뢰 ]  (currentInquiryType === 'mold_request'면 disabled)
  ──────────
  긴급 표시 토글
  분할
  ```
- 스타일: 모바일 친화적 tap target (최소 44px 높이), `@/lib/styles` 토큰 사용

### 2. `dashboard/page.tsx` 재분류 핸들러 추가

파일: `src/app/worker/dashboard/page.tsx`

**변경점**:

1. 재분류 핸들러 추가 (`handleToggleUrgent` 근처):

   ```ts
   const handleReclassify = useCallback(
     async (inquiryType: InquiryType) => {
       if (!contextMenu) return;
       const target = allContacts.find((c) => c.id === contextMenu.contactId);
       if (!target) return;

       // status !== 'received'이면 confirm 경고 (대안 A)
       if (target.status !== 'received') {
         const label =
           inquiryType === 'cutting_request' ? '칼선의뢰 → 도면작업' : '목형의뢰 → 컨펌';
         if (!confirm(`재분류 시 공정 상태도 함께 변경됩니다.\n(${label})\n진행하시겠습니까?`)) {
           return;
         }
       }

       // PATCH /api/contacts/{id}/inquiry-type
       const res = await fetch(`/api/contacts/${contextMenu.contactId}/inquiry-type`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ inquiry_type: inquiryType }),
       });

       if (!res.ok) {
         alert('재분류에 실패했습니다.');
         return;
       }

       // invalidate 모든 workCategory 보드
       queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
       queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
       setContextMenu(null);
     },
     [contextMenu, allContacts, queryClient]
   );
   ```

2. `<WorkerContextMenu>` 렌더에 새 props 전달:

   ```tsx
   <WorkerContextMenu
     // ...기존 props
     currentInquiryType={contextMenuContact.inquiry_type}
     canReclassify={!!contextMenuContact.inquiry_type} // 미분류 카드는 long-press 메뉴에서 재분류 항목 숨김
     onReclassify={handleReclassify}
   />
   ```

3. `allContacts` 재계산 위치(349~352줄)가 적절한지 확인. 필요 시 `useMemo` 래핑.

### 3. OfficeContactCard / StaffContactCard 영향 확인

- `onContextMenu` prop 전달 경로가 이미 존재하므로 **추가 변경 불필요**
- long-press 핸들러도 그대로 유지 → `WorkerContextMenu`만 확장되면 재분류 기능 자동 노출

### 4. 테스트

위치: `src/__tests__/worker/WorkerContextMenu.test.tsx` (신규/기존 확장)

테스트 케이스:

1. `canReclassify: false`면 재분류 섹션 렌더 안 됨
2. `canReclassify: true`이면 2개 재분류 항목 렌더
3. `currentInquiryType === 'mold_request'`이면 "목형의뢰" 버튼 disabled
4. "칼선의뢰" 클릭 시 `onReclassify('cutting_request')` 호출
5. 기존 긴급/분할 버튼 regression: 기존 props로 호출 시 정상 렌더

위치: `src/__tests__/worker/dashboard.test.tsx` (기존 있으면 case 추가, 없으면 생략)

테스트 케이스 (선택):

1. `handleReclassify` 호출 시 PATCH 발사 + `invalidateQueries` 실행
2. `status !== 'received'`일 때 `window.confirm` 호출, 취소 시 PATCH 미호출

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="WorkerContextMenu|worker/dashboard"
```

이후 전체 회귀:

```bash
pnpm test
```

## AC 검증 방법

모두 통과 시 `/tasks/15-inquiry-classification-ux/index.json`의 phase 3 status를 `"completed"`로 변경. 3회 실패 시 `"error"` + `"error_message"` 기록.

## 주의사항

- **Admin 쪽 코드(`ContactCard`, `ContactContextMenu`)는 건드리지 마라.** Phase 2의 산출물이다.
- 기존 `WorkerContextMenu`의 긴급 토글/분할 기능은 반드시 회귀 없이 유지.
- 미분류 카드에서 long-press해도 재분류 항목은 숨김. 인라인 버튼과 중복 방지.
- Confirm 메시지는 한글. mobile 사용자도 읽기 편한 길이로.
- 모바일 tap target은 최소 44px 권장. `py-3` 이상 사용.
- Optimistic update는 이번 phase 범위 밖. 단순 PATCH → invalidate로 충분.
- `dark:` 클래스 금지, `@/` import.
- 기존 테스트 회귀 없어야 함.
