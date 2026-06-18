# Phase 3: Frontend — 하위 문의 작업완료 확인 모달 추가

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/contact-split.md` (분할 문의 스펙)
- `/tasks/3-split-realtime-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `src/app/(admin)/admin/contacts/_lib/hooks.ts` — Phase 2에서 추가된 소켓 이벤트 핸들러
- `src/app/worker/dashboard/page.tsx` — Phase 2에서 추가된 소켓 이벤트 핸들러

그리고 아래 파일들을 읽고 기존 ConfirmModal 사용 패턴을 이해하라:

- `src/app/(admin)/admin/contacts/_components/SplitGroupCard.tsx` — "일괄 작업완료"의 `ConfirmModal` 사용 패턴 (line ~248). Admin용 ConfirmModal: `@/components/modals/ConfirmModal`
- `src/app/worker/_components/StaffAdvanceButton.tsx` — 비분할 문의의 "작업완료" ConfirmModal 패턴 (line ~222). Worker용 ConfirmModal: `@/app/worker/_components/ConfirmModal`
- `src/app/worker/_components/ConfirmModal.tsx` — Worker ConfirmModal 인터페이스 (props: `isOpen`, `title`, `message`, `type`, `confirmText`, `onConfirm`, `onCancel`)
- `src/components/modals/ConfirmModal.tsx` — Admin ConfirmModal 인터페이스 (props: `isOpen`, `onClose`, `onConfirm`, `title`, `message`, `confirmLabel`, `cancelLabel`, `isSubmitting`)

## 작업 내용

4개 컴포넌트에서 개별 하위 문의의 "작업완료" 버튼 클릭 시 확인 모달을 추가하라.

### 공통 패턴

각 컴포넌트에서:

1. `confirmingChild` state를 추가: `const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);`
2. 기존 "작업완료" 버튼의 `onClick`을 `setConfirmingChild(child)`로 변경 (기존 `handleChildComplete` 직접 호출 대신)
3. `ConfirmModal`을 추가하여, 확인 시 기존 `handleChildComplete` 로직을 실행
4. 모달 메시지에 해당 하위 문의의 번호를 표시

### 1. `ContactCardSummary.tsx`

파일: `src/app/(admin)/admin/contacts/_components/ContactCardSummary.tsx`

**import 추가**: `ConfirmModal`이 아직 import되어 있지 않다. 추가하라:

```typescript
import { ConfirmModal } from '@/components/modals/ConfirmModal';
```

**state 추가** (기존 `togglingChildId` state 근처):

```typescript
const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);
```

**기존 "작업완료" 버튼 수정** (JSX 내 `handleChildComplete` 호출 부분):

- 기존: `onClick={(e) => handleChildComplete(e, child)}`
- 변경: `onClick={(e) => { e.stopPropagation(); onStopPropagation(e); setConfirmingChild(child); }}`

**ConfirmModal 추가** (분할 하위 문의 카드 영역 바로 아래, `</div>` 닫기 전):

```tsx
<ConfirmModal
  isOpen={!!confirmingChild}
  onClose={() => setConfirmingChild(null)}
  onConfirm={(e?: React.MouseEvent) => {
    if (confirmingChild) {
      const syntheticEvent = (e || { stopPropagation: () => {} }) as React.MouseEvent;
      handleChildComplete(syntheticEvent, confirmingChild);
      setConfirmingChild(null);
    }
  }}
  title="작업완료"
  message={`${confirmingChild?.work_number || confirmingChild?.inquiry_number || ''} 작업완료 처리하시겠습니까?`}
  confirmLabel="완료"
  cancelLabel="취소"
  isSubmitting={isPending}
/>
```

**주의**: `handleChildComplete`는 `e.stopPropagation()`을 호출한다. ConfirmModal의 onConfirm에서 synthetic event를 전달하되, stopPropagation이 안전하게 동작하도록 처리하라. 기존 `handleChildComplete` 함수의 시그니처를 변경하지 마라.

### 2. `SplitGroupCard.tsx`

파일: `src/app/(admin)/admin/contacts/_components/SplitGroupCard.tsx`

이미 `ConfirmModal`이 import되어 있다 (`@/components/modals/ConfirmModal`).

**state 추가**:

```typescript
const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);
```

**기존 "작업완료" 버튼 수정** (JSX 내 child 목록의 버튼):

- 기존: `onClick={(e) => handleChildComplete(e, child)}`
- 변경: `onClick={(e) => { e.stopPropagation(); setConfirmingChild(child); }}`

**ConfirmModal 추가** (기존 "일괄 작업완료" ConfirmModal 바로 아래):

```tsx
<ConfirmModal
  isOpen={!!confirmingChild}
  onClose={() => setConfirmingChild(null)}
  onConfirm={() => {
    if (confirmingChild) {
      const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent;
      handleChildComplete(syntheticEvent, confirmingChild);
      setConfirmingChild(null);
    }
  }}
  title="작업완료"
  message={`${confirmingChild?.inquiry_number || confirmingChild?.work_number || ''} 작업완료 처리하시겠습니까?`}
  confirmLabel="완료"
  cancelLabel="취소"
  isSubmitting={isPending}
/>
```

### 3. `StaffContactCard.tsx`

파일: `src/app/worker/_components/StaffContactCard.tsx`

이미 Worker용 `ConfirmModal`이 import되어 있다 (`./ConfirmModal`).

**state 추가**:

```typescript
const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);
```

**기존 "작업완료" 버튼 수정** (분할 하위 문의 카드 영역의 버튼):

- 기존: `onClick={(e) => handleChildComplete(String(child.id), e)}`
- 변경: `onClick={(e) => { e.stopPropagation(); setConfirmingChild(child); }}`

**ConfirmModal 추가** (분할 하위 문의 카드 영역 바로 아래):

```tsx
<ConfirmModal
  isOpen={!!confirmingChild}
  title="작업완료"
  message={`${confirmingChild?.work_number || confirmingChild?.inquiry_number || ''} 작업완료 처리하시겠습니까?`}
  type="confirm"
  confirmText="완료"
  onConfirm={(e?: React.MouseEvent) => {
    if (confirmingChild) {
      const syntheticEvent = (e || { stopPropagation: () => {} }) as React.MouseEvent;
      handleChildComplete(String(confirmingChild.id), syntheticEvent);
      setConfirmingChild(null);
    }
  }}
  onCancel={() => setConfirmingChild(null)}
/>
```

### 4. `OfficeContactCard.tsx`

파일: `src/app/worker/_components/OfficeContactCard.tsx`

이미 Worker용 `ConfirmModal`이 import되어 있다 (`./ConfirmModal`).

**state 추가**:

```typescript
const [confirmingChild, setConfirmingChild] = useState<Contact | null>(null);
```

**기존 "작업완료" 버튼 수정** (분할 하위 문의 카드 영역의 버튼):

- 기존: `onClick={(e) => handleChildComplete(String(child.id), e)}`
- 변경: `onClick={(e) => { e.stopPropagation(); setConfirmingChild(child); }}`

**ConfirmModal 추가** (분할 하위 문의 카드 영역 바로 아래):

```tsx
<ConfirmModal
  isOpen={!!confirmingChild}
  title="작업완료"
  message={`${confirmingChild?.work_number || confirmingChild?.inquiry_number || ''} 작업완료 처리하시겠습니까?`}
  type="confirm"
  confirmText="완료"
  onConfirm={(e?: React.MouseEvent) => {
    if (confirmingChild) {
      const syntheticEvent = (e || { stopPropagation: () => {} }) as React.MouseEvent;
      handleChildComplete(String(confirmingChild.id), syntheticEvent);
      setConfirmingChild(null);
    }
  }}
  onCancel={() => setConfirmingChild(null)}
/>
```

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/3-split-realtime-fix/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 백엔드 코드(`webhard-api/`)를 수정하지 마라.
- Admin 컴포넌트(`ContactCardSummary`, `SplitGroupCard`)는 `@/components/modals/ConfirmModal`을 사용하라.
- Worker 컴포넌트(`StaffContactCard`, `OfficeContactCard`)는 `./ConfirmModal`(Worker 전용)을 사용하라.
- "일괄 작업완료" 버튼의 기존 ConfirmModal을 수정하지 마라. 개별 하위 문의의 "작업완료" 버튼에만 모달을 추가.
- `handleChildComplete` 함수의 시그니처를 변경하지 마라. 기존 함수를 그대로 호출하되, 모달에서 트리거되도록 분리.
- `window.location.reload()`를 사용하지 마라.
- 기존 테스트를 깨뜨리지 마라.
- `@/lib/styles.ts`의 스타일 상수를 사용하라. `dark:` 클래스를 직접 사용하지 마라.
