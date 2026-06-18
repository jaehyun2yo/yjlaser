# Phase 3: classify-buttons-cta

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 §8 "후속 리팩토링" 섹션의 `InquiryClassifyButtons` 공용 컴포넌트 계약, Admin/Worker CTA 위치 매핑, 불변 규칙 §5-7 (인라인 재분류 금지 — CTA 2버튼은 미분류 전용).
- `tasks/16-classify-cta/docs-diff.md` — Phase 0 문서 diff.
- `tasks/16-classify-cta/phase1.md` 와 Phase 1 산출물 — `Contact.id: string` 정상화. `InquiryClassifyButtons` props 의 `contact: Contact` 는 이미 string id 전제.
- `tasks/16-classify-cta/phase2.md` 와 Phase 2 산출물 — `useClassifyInquiryType` 훅. 이 phase 의 공용 컴포넌트가 해당 훅을 내부에서 사용한다.
- `docs/specs/features/design-system.md` — `BADGE.info`(칼선 파란), `BADGE.success`(목형 초록), `TRANSITION_STYLES.colors` 토큰. `dark:` 금지.
- `src/app/(admin)/admin/contacts/_components/ContactCardActions.tsx` — Admin 카드의 "작업시작" 버튼 위치. `isUnclassified && status === 'received'` 분기를 이 파일에 추가한다.
- `src/app/worker/_components/OfficeContactCard.tsx` — Worker 카드의 헤더 우측 CTA. `OfficeAdvanceButton` 자리에 `!contact.inquiry_type` 분기를 추가한다.
- `src/app/worker/_components/OfficeAdvanceButton.tsx` — `disabled` 시 "분류 필요" 뱃지 렌더(`line 53-58`). 이 fallback 만 제거한다.

## 작업 내용

### 1. 공용 컴포넌트 `InquiryClassifyButtons`

**파일**: `src/components/contacts/InquiryClassifyButtons.tsx` (신규)

**디렉토리 생성**: `src/components/contacts/` 가 없으면 함께 생성.

**시그니처**:

```tsx
'use client';

import { memo } from 'react';
import { FaSpinner } from 'react-icons/fa';
import { useClassifyInquiryType } from '@/lib/hooks/useClassifyInquiryType';
import { BADGE, TRANSITION_STYLES } from '@/lib/styles';
import type { Contact } from '@/lib/types';

export interface InquiryClassifyButtonsProps {
  contact: Contact;
  /** 버튼 크기 — 'md' 기본, 'sm' 은 Worker 카드 헤더용 컴팩트 */
  size?: 'sm' | 'md';
  /** 버튼 클릭 시 이벤트 버블링 차단 — 카드 토글 방지 */
  onStopPropagation?: (e: React.MouseEvent) => void;
}

function InquiryClassifyButtonsComponent({
  contact,
  size = 'md',
  onStopPropagation,
}: InquiryClassifyButtonsProps) {
  const { classify, isPending, pendingType } = useClassifyInquiryType(contact);

  const handleClick = (type: 'cutting_request' | 'mold_request') => (e: React.MouseEvent) => {
    e.stopPropagation();
    onStopPropagation?.(e);
    void classify(type);
  };

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';
  const commonButton = `${sizeClass} cursor-pointer
    ring-2 ring-orange-300 ring-offset-1 animate-pulse
    disabled:opacity-60 disabled:cursor-not-allowed
    ${TRANSITION_STYLES.colors} rounded-full font-medium whitespace-nowrap`;

  return (
    <div
      className="flex gap-1 flex-shrink-0 flex-wrap"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="문의 유형 분류"
    >
      <button
        type="button"
        onClick={handleClick('cutting_request')}
        disabled={isPending}
        className={`${BADGE.info} ${commonButton}`}
        title="칼선의뢰로 분류"
        aria-label="칼선의뢰로 분류"
      >
        {isPending && pendingType === 'cutting_request' ? (
          <FaSpinner className="animate-spin" />
        ) : (
          '칼선의뢰'
        )}
      </button>
      <button
        type="button"
        onClick={handleClick('mold_request')}
        disabled={isPending}
        className={`${BADGE.success} ${commonButton}`}
        title="목형의뢰로 분류"
        aria-label="목형의뢰로 분류"
      >
        {isPending && pendingType === 'mold_request' ? (
          <FaSpinner className="animate-spin" />
        ) : (
          '목형의뢰'
        )}
      </button>
    </div>
  );
}

export const InquiryClassifyButtons = memo(InquiryClassifyButtonsComponent);
```

**핵심**:

- `BADGE.info`(칼선 파랑) + `BADGE.success`(목형 초록) + pulse ring 은 기존 `InquiryTypeBadge` 와 동일해 일관성 유지.
- `size='sm'` 은 Worker 카드 헤더 slot (기존 advance 버튼보다 작아야 함), `size='md'` 는 Admin `ContactCardActions` 액션 바.
- **내부에서 `useClassifyInquiryType` 만 사용** — 별도 fetch / optimistic 로직을 복제하지 말 것 (불변 규칙 §5-8).

### 2. Admin 카드: `ContactCardActions` 분기 추가

**파일**: `src/app/(admin)/admin/contacts/_components/ContactCardActions.tsx`

기존 `contact.status === 'received'` 블록(현재: 작업시작 버튼)을 다음으로 교체:

```tsx
{
  contact.status === 'received' &&
    (isUnclassified ? (
      <InquiryClassifyButtons contact={contact} size="md" onStopPropagation={onStopPropagation} />
    ) : (
      <button
        onClick={(e) => {
          onStopPropagation(e);
          onStartWork(e);
        }}
        className={`px-2.5 py-1 text-[11px] rounded ${BG_COLOR.primary} ${BG_COLOR.primaryHover} text-white cursor-pointer ${TRANSITION_STYLES.colors}`}
      >
        작업시작
      </button>
    ));
}
```

**추가 정리**:

- 기존 `handleStartWorkWithCheck` 의 `isUnclassified` 차단 로직(`line 59-69`)은 **제거** — 이제 미분류 카드는 작업시작 버튼 자체가 노출되지 않으므로 alert 분기가 필요 없다.
- `onStartWork` 은 `isUnclassified=false` 경로에서만 호출되므로 `disabled` prop / 회색 스타일 조합도 제거.
- `isUnclassified` 변수 선언(`line 40: contact.source === 'webhard' && !contact.inquiry_type`)은 **유지** — 위 분기 조건에서 사용한다.
- 상단 import 에 `import { InquiryClassifyButtons } from '@/components/contacts/InquiryClassifyButtons';` 추가.

### 3. Worker 카드: `OfficeContactCard` 분기 추가

**파일**: `src/app/worker/_components/OfficeContactCard.tsx`

기존 Office/Staff advance 버튼 렌더 블록(`line 308~340` 근처, `{isSplit && nextStageForGroup ? ... : <OfficeAdvanceButton ... />}`)의 **else 분기**를 다음으로 교체:

```tsx
) : !contact.inquiry_type ? (
  <InquiryClassifyButtons contact={contact} size="sm" onStopPropagation={stopPropagation} />
) : (
  <OfficeAdvanceButton
    contact={contact}
    onAdvance={onAdvance}
    onAdvanceComplete={onAdvanceComplete}
    isAdvancing={isAdvancing}
    // disabled prop 제거 — 미분류 분기가 위에서 처리되므로 항상 활성 상태.
  />
)}
```

**추가**:

- 상단 import 에 `import { InquiryClassifyButtons } from '@/components/contacts/InquiryClassifyButtons';`.
- `OfficeAdvanceButton` 에 전달하던 `disabled={!contact.inquiry_type}` (`line 338`) 은 **제거** — 이제 `!contact.inquiry_type` 일 때는 `OfficeAdvanceButton` 자체가 렌더되지 않는다.

**Staff 카드는 변경 없음** — `StaffContactCard` 는 분류된 카드만 표시하므로 미분류 분기 불필요. import 도 추가하지 않는다.

### 4. `OfficeAdvanceButton` fallback 제거

**파일**: `src/app/worker/_components/OfficeAdvanceButton.tsx`

`line 53-58` 의 `disabled` 분기 블록 **전체 삭제**:

```tsx
// 삭제
if (disabled) {
  return (
    <span className="px-3 py-1.5 bg-gray-100 text-gray-400 text-xs font-medium rounded-lg whitespace-nowrap">
      분류 필요
    </span>
  );
}
```

`disabled` prop 은 **타입에서도 제거** (`line 19`):

```ts
// 변경 전
interface OfficeAdvanceButtonProps {
  ...
  isAdvancing: boolean;
  disabled?: boolean;
}

// 변경 후
interface OfficeAdvanceButtonProps {
  ...
  isAdvancing: boolean;
}
```

기존 시그니처에서 default `disabled = false` 도 제거. `isAdvancing || isLoading` 만 buton disabled 판단 기준으로 남긴다.

### 5. 테스트 추가/수정

**신규 A**: `src/__tests__/components/contacts/InquiryClassifyButtons.test.tsx` — 최소 3건:

1. 2버튼(`칼선의뢰`, `목형의뢰`) 렌더. `role="group"` 존재.
2. `칼선의뢰` 클릭 → 훅의 `classify('cutting_request')` 호출 (훅 mock).
3. `size='sm'` 과 `size='md'` 에서 다른 className 이 적용되는지 최소 1건.

**신규 B**: `src/__tests__/(admin)/ContactCardActions.test.tsx` 또는 기존 파일 확장 — 최소 2건:

1. `status='received'` + `isUnclassified=true` → `<InquiryClassifyButtons>` 가 렌더되고 "작업시작" 버튼은 **없어야 함**.
2. `status='received'` + `isUnclassified=false` → "작업시작" 버튼이 렌더, `<InquiryClassifyButtons>` 는 없음.

**신규/수정 C**: `src/__tests__/worker/OfficeContactCard.test.tsx` 확장 — 최소 2건:

1. `contact.inquiry_type = null` → `<InquiryClassifyButtons>` 가 우측 CTA 슬롯에 렌더. `OfficeAdvanceButton` 은 없음.
2. `contact.inquiry_type = 'cutting_request'` → `OfficeAdvanceButton` 렌더, `<InquiryClassifyButtons>` 없음.

**수정 D**: `src/__tests__/worker/OfficeAdvanceButton.test.tsx` (있으면) — `disabled` prop 관련 테스트 제거. 없으면 스킵.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

독립적으로 실행 가능하므로 **단일 메시지에 Bash 3개로 병렬 실행**. 모두 통과 시 `tasks/16-classify-cta/index.json` 의 phase 3 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **중복 로직 금지**: `InquiryClassifyButtons` 내부에서 fetch 를 직접 호출하지 마라 — **반드시 `useClassifyInquiryType` 훅만** 사용한다. (불변 §5-8)
- **`InquiryTypeBadge` 의 `mode='inline-action'` 기본값은 유지**. Phase 2 에서 caller 는 이미 `label-only` 로 이관됐으므로, 이 phase 에서 `InquiryTypeBadge` 는 건드리지 않는다.
- **Admin 미분류 CTA 노출 조건**: `status === 'received'` AND `isUnclassified`. Admin 카드는 미분류 상태여도 **웹사이트 문의**(`source !== 'webhard'`) 면 `isUnclassified=false` — CTA 분기는 기존 "작업시작" 으로 자연 유지된다. 웹사이트 문의의 자동 status 는 스펙 밖이므로 이 분기에서 건드리지 말 것.
- **Worker CTA 노출 조건**: `!contact.inquiry_type`. `source` 상관없이 미분류이면 2버튼 표시 — Worker 대시보드의 "미분류" 서브필터 동작(불변 §5-2)과 정합.
- **pulse 애니메이션**: `InquiryClassifyButtons` 의 2버튼은 항상 pulse(`animate-pulse ring-2 ring-orange-300`) 유지 — 주의 환기 UX 일관성(§5-3).
- **`OfficeAdvanceButton` 의 `disabled` prop 제거**는 call site 에서도 일치해야 한다. `grep -rn "OfficeAdvanceButton" src/` 로 다른 호출처가 없는지 확인. 있으면 `disabled` prop 전달을 모두 제거.
- **알림/토스트 금지**: CTA 클릭 시 별도의 성공 toast 를 추가하지 마라 — 기존 `InquiryTypeBadge` 도 추가하지 않았고 optimistic update 로 충분하다.
- **기존 테스트를 깨뜨리지 마라**. 특히 `InquiryTypeBadge` 기본 렌더 테스트(`mode='inline-action'`) 가 있으면 그대로 통과.
- **분할 문의(children)**: `isSplit && nextStageForGroup` 분기는 **기존 우선순위 유지** — 분할 그룹이면 일괄 작업완료 버튼이 먼저 렌더되고, 아니면 `!contact.inquiry_type` 분기 → 분류 CTA. 분할 원본이 미분류일 수 있지만 기존 스펙(§분할 규칙) 상 `processStage='drawing'` 이상만 분할 가능하므로 실제 조합은 드물다.
