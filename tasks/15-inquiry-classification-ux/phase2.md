# Phase 2: admin-context-menu

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — 이번 task의 설계 문서
- `docs/specs/features/design-system.md` — UI 스타일 규칙
- `docs/testing.md` — 테스트 전략
- `/tasks/15-inquiry-classification-ux/docs-diff.md` — Phase 0 문서 변경 기록

이전 phase 산출물 확인:

- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` (Phase 1에서 리팩토링됨 — 인라인 2버튼)
- `src/app/(admin)/admin/contacts/_lib/utils.ts` (Phase 1에서 `formatCreatedAt` export 추가됨)

코드 레퍼런스:

- `src/app/(admin)/admin/contacts/_components/ContactCard.tsx` — 관리자 카드 (우클릭 핸들러 추가 대상)
- `src/app/worker/_components/WorkerContextMenu.tsx` — Worker 컨텍스트 메뉴 (UX 패턴 참고)
- `src/app/api/contacts/[id]/inquiry-type/route.ts` — PATCH API (변경 없이 재사용)
- `src/lib/types/contact.ts` — `InquiryType` 타입
- `src/components/modals/ConfirmModal.tsx` — 기존 confirm 모달 컴포넌트

## 작업 내용

### 1. `ContactContextMenu` 컴포넌트 신규 작성

파일: `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx`

시그니처:

```tsx
interface ContactContextMenuProps {
  contact: Contact;
  x: number;
  y: number;
  onSelectInquiryType: (inquiryType: InquiryType) => void;
  onClose: () => void;
}

export function ContactContextMenu(props: ContactContextMenuProps): JSX.Element;
```

**동작 규칙**:

- 화면 위치는 `x`, `y` props로 제어 (fixed position)
- 메뉴 외부 클릭 / ESC 키 시 `onClose` 호출
- 2개 재분류 항목: "칼선의뢰", "목형의뢰"
- **현재 타입과 동일한 항목은 `disabled` 처리** (예: `contact.inquiry_type === 'cutting_request'`면 "칼선의뢰" 비활성화)
- 클릭 시 `onSelectInquiryType(inquiryType)` 호출, 메뉴 자동 닫힘
- 스타일: `@/lib/styles` 토큰 사용 (BG_COLOR.card, BORDER_COLOR.default, TRANSITION_STYLES)
- z-index: 50 이상
- 메뉴가 뷰포트 오른쪽 / 하단을 벗어나는 경우 위치 보정 (간단히 `Math.min(window.innerWidth - menuWidth, x)` 패턴)

### 2. `ContactCard.tsx` 통합

파일: `src/app/(admin)/admin/contacts/_components/ContactCard.tsx`

**변경점**:

1. `useState`로 컨텍스트 메뉴 상태 관리:

   ```ts
   const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
   ```

2. 카드 최상위 `div`에 `onContextMenu` 핸들러 추가:
   - `e.preventDefault()` — 기본 브라우저 메뉴 억제
   - 미분류 카드(`!contact.inquiry_type && contact.source === 'webhard'`)는 **메뉴 열지 않음** (인라인 버튼으로 충분)
   - 웹사이트 문의(`!contact.inquiry_type && contact.source !== 'webhard'`)도 메뉴 열지 않음
   - 위 조건 외 분류된 카드만 `setContextMenu({ x: e.clientX, y: e.clientY })`

3. `handleReclassify` 핸들러 추가:

   ```ts
   const handleReclassify = async (inquiryType: InquiryType) => {
     // status !== 'received'이면 confirm 경고 (대안 A)
     if (contact.status !== 'received') {
       const ok = confirm(
         `재분류 시 공정 상태도 함께 변경됩니다.\n(${inquiryType === 'cutting_request' ? '칼선의뢰 → 도면작업' : '목형의뢰 → 컨펌'})\n진행하시겠습니까?`
       );
       if (!ok) return;
     }
     // PATCH /api/contacts/{id}/inquiry-type 호출
     // 성공 시 invalidateQueries(queryKeys.contacts.all) + invalidateQueries(queryKeys.processBoard.all)
     // 실패 시 alert
   };
   ```

4. 렌더 말미에 조건부로 `<ContactContextMenu>` 렌더:
   ```tsx
   {
     contextMenu && (
       <ContactContextMenu
         contact={contact}
         x={contextMenu.x}
         y={contextMenu.y}
         onSelectInquiryType={handleReclassify}
         onClose={() => setContextMenu(null)}
       />
     );
   }
   ```

### 3. `_components/index.ts` export 추가

`src/app/(admin)/admin/contacts/_components/index.ts`에 `ContactContextMenu` export 추가 (기존 배럴 파일 패턴이 있다면).

### 4. 테스트

위치: `src/__tests__/components/ContactContextMenu.test.tsx` (신규)

테스트 케이스:

1. 2개 재분류 항목 렌더링
2. `contact.inquiry_type === 'cutting_request'`이면 "칼선의뢰" 버튼 disabled
3. "목형의뢰" 클릭 시 `onSelectInquiryType('mold_request')` 호출 + `onClose` 호출
4. ESC 키 시 `onClose` 호출
5. 외부 클릭 시 `onClose` 호출

위치: `src/__tests__/components/ContactCard.test.tsx` (기존 파일이 있으면 case 추가, 없으면 신규)

테스트 케이스:

1. 미분류 카드에서 우클릭 → 메뉴 **렌더 안 됨** (`queryByRole('menu')` null)
2. 분류된 카드에서 우클릭 → `e.preventDefault` 호출 + 메뉴 렌더
3. `status === 'received'` 카드 재분류 → confirm 호출 안 함, 바로 PATCH
4. `status !== 'received'` 카드 재분류 → `window.confirm` 호출, 취소 시 PATCH 미호출

Confirm mock: `jest.spyOn(window, 'confirm')`

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="ContactContextMenu|ContactCard"
```

이후 전체 회귀:

```bash
pnpm test
```

## AC 검증 방법

모두 통과 시 `/tasks/15-inquiry-classification-ux/index.json`의 phase 2 status를 `"completed"`로 변경. 3회 실패 시 `"error"` + `"error_message"` 기록.

## 주의사항

- **Worker의 `WorkerContextMenu.tsx`는 건드리지 마라.** Phase 3에서 확장한다.
- 미분류 카드에서 우클릭 메뉴를 띄우지 마라. 인라인 버튼과 중복되어 UX 혼란.
- 기본 브라우저 우클릭 메뉴는 `preventDefault`로 억제. 카드 영역 밖에서는 영향 없음.
- Confirm 메시지는 한글. `status` 이름 그대로 노출하지 말고 한글 라벨 사용.
- Optimistic update는 이번 phase 범위 밖. 단순히 PATCH → invalidateQueries로 충분.
- 기존 테스트를 깨지 마라. `ContactCard`의 기존 클릭 확장/축소 동작 유지.
- `dark:` 클래스 금지, `@/` import, 절대경로만 사용.
