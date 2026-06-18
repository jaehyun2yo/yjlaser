# Phase 2: badge-mode-split + classify-hook

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 에서 추가된 §8 "후속 리팩토링" 섹션. `InquiryTypeBadge.mode` prop 계약, `useClassifyInquiryType` 훅 계약, pulse 애니메이션 유지 규칙이 정의되어 있다.
- `tasks/16-classify-cta/docs-diff.md` — Phase 0 문서 diff.
- `docs/specs/features/design-system.md` — `BADGE.info/success/warning` 토큰, `dark:` 금지. `mode='label-only'` 주황 뱃지 디자인 선택 근거.
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — 현재 구현. `handleSelect` 의 optimistic update + rollback 로직을 훅으로 추출하기 위해 완전히 이해해야 한다.
- `tasks/16-classify-cta/phase1.md` 와 Phase 1 산출물 — `Contact.id: string` 정상화 결과. 이 phase 에서 훅·컴포넌트 시그니처가 모두 string id 를 전제로 작성된다.
- `src/lib/react-query/queryKeys.ts` — `queryKeys.contacts.all`, `queryKeys.processBoard.all` 키 factory. 훅이 invalidate 대상 키를 참조한다.

## 작업 내용

### 1. 공용 훅 `useClassifyInquiryType` 추출

**파일**: `src/lib/hooks/useClassifyInquiryType.ts` (신규)

**시그니처**:

```ts
import type { Contact, InquiryType } from '@/lib/types';

export function useClassifyInquiryType(contact: Contact): {
  classify: (inquiryType: InquiryType) => Promise<void>;
  isPending: boolean;
  pendingType: InquiryType | null;
};
```

**내부 동작** — 기존 `InquiryTypeBadge.handleSelect` (`InquiryTypeBadge.tsx:31-108`) 로직을 그대로 이관:

1. `setIsPending(true); setPendingType(inquiryType);`
2. React Query optimistic update:
   - `queryKeys.contacts.all` — `pages[].contacts` 배열에서 해당 id 만 `{ ...c, inquiry_type, status: statusMap[inquiryType] }` 로 치환.
   - `queryKeys.processBoard.all` — 배열에서 해당 id 즉시 제거 (카테고리 전환 가시성).
3. `PATCH /api/contacts/:id/inquiry-type` 요청.
4. 성공 시 `invalidateQueries({ queryKey: queryKeys.contacts.all })` + `queryKeys.processBoard.all`.
5. 실패 시 `previousData.forEach(...)` rollback + `alert(err.message)`.
6. `finally`: `setIsPending(false); setPendingType(null);`

**status 매핑 상수** — 훅 내부에 하드코딩:

```ts
const STATUS_MAP: Record<InquiryType, string> = {
  cutting_request: 'drawing',
  mold_request: 'confirmed',
  laser_cutting: 'cutting',
};
```

**주의**: 기존 `InquiryTypeBadge` 안의 `statusMap` 과 동일해야 한다. 훅으로 이동 후 **기존 `InquiryTypeBadge` 의 statusMap 은 제거** (중복 정의 금지).

**로깅**: 기존 `logger.createLogger('InquiryTypeBadge')` 대신 `logger.createLogger('ClassifyInquiryType')` 사용.

### 2. `InquiryTypeBadge` 에 `mode` prop 추가

**파일**: `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx`

**새 Props 시그니처**:

```ts
interface InquiryTypeBadgeProps {
  contact: Contact;
  onStopPropagation?: (e: React.MouseEvent) => void;
  /** 미분류 상태에서의 렌더 방식
   * - 'inline-action' (기본): 기존 [칼선의뢰][목형의뢰] 인라인 2버튼 (하위호환)
   * - 'label-only': 주황 "미분류" 단일 뱃지, 클릭 핸들러 없음 */
  mode?: 'inline-action' | 'label-only';
}
```

**변경 동작**:

- **분류 완료 상태** (`cutting_request`, `mold_request`, `laser_cutting`, `isWebsiteInquiry`): 기존 읽기 전용 라벨 그대로. mode 무관.
- **미분류 + `mode='label-only'`**: 신규 분기 — 주황 "미분류" 단일 뱃지만 렌더.
  ```tsx
  return (
    <span
      className={`${BADGE.warning} flex-shrink-0 ${TRANSITION_STYLES.colors} animate-pulse ring-2 ring-orange-300 ring-offset-1`}
      aria-label="미분류 문의"
    >
      미분류
    </span>
  );
  ```

  - 색상은 기존 pulse 뱃지와 동일한 warning(주황) 토큰. `dark:` 클래스 금지.
  - 클릭 핸들러 없음. `onStopPropagation` 도 바인딩하지 않는다.
- **미분류 + `mode='inline-action'`** (기본): 기존 [칼선의뢰][목형의뢰] 2버튼 로직 유지. 단 내부에서 `useClassifyInquiryType` 훅을 사용하도록 리팩토링.

**리팩토링 세부**:

기존 `handleSelect`, `isPending`, `pendingType`, optimistic update, rollback, STATUS_MAP 을 **모두 제거**하고 다음으로 교체:

```ts
const { classify, isPending, pendingType } = useClassifyInquiryType(contact);

const onClickCutting = (e: React.MouseEvent) => {
  e.stopPropagation();
  onStopPropagation?.(e);
  void classify('cutting_request');
};
const onClickMold = (e: React.MouseEvent) => {
  e.stopPropagation();
  onStopPropagation?.(e);
  void classify('mold_request');
};
```

UI 구조(flex gap, pulse ring, spinner)는 기존 그대로. `FaSpinner` 렌더 조건 `isPending && pendingType === ...` 유지.

### 3. 기존 caller 를 `mode='label-only'` 로 이관

**Admin 대상**:

- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx:112`
  ```tsx
  // 변경 전
  <InquiryTypeBadge contact={contact} onStopPropagation={onStopPropagation} />
  // 변경 후
  <InquiryTypeBadge contact={contact} mode="label-only" onStopPropagation={onStopPropagation} />
  ```

**Worker 대상**:

- `src/app/worker/_components/OfficeContactCard.tsx:209`
  ```tsx
  // 변경 후
  <InquiryTypeBadge contact={contact} mode="label-only" onStopPropagation={stopPropagation} />
  ```
- `src/app/worker/_components/StaffContactCard.tsx` — 해당 컴포넌트는 **분류된 문의만 표시**(`StaffContactCard` 는 분류된 카드 전용이라 미분류 카드를 렌더하지 않음)하므로 `InquiryTypeBadge` import 자체가 없을 수 있다. `grep` 으로 확인 후 사용 중이면 동일하게 `mode="label-only"` 전달, 사용 안 하면 변경 없음.

**기타 caller**:

```bash
grep -rn "<InquiryTypeBadge" src/
```

에서 잡히는 **모든 경로**에 `mode="label-only"` 를 명시 전달. 하위호환용으로 기본값을 `'inline-action'` 으로 뒀지만, 이번 task 이후로는 `label-only` 가 표준 렌더가 된다 — 사용처에서 누락되면 옛 인라인 2버튼이 다시 나타나는 회귀가 생길 수 있다.

### 4. 테스트 추가/수정

**신규**: `src/__tests__/lib/hooks/useClassifyInquiryType.test.tsx` — 최소 3건:

1. `classify('cutting_request')` 호출 시 `fetch` 가 `/api/contacts/:id/inquiry-type` 로 `PATCH` 요청 + body `{ inquiry_type: 'cutting_request' }`.
2. 성공 시 `queryClient.invalidateQueries` 가 `queryKeys.contacts.all` + `queryKeys.processBoard.all` 에 대해 호출되는지.
3. 실패(`response.ok = false`) 시 이전 데이터로 rollback + `alert` 호출.

**수정**: `src/__tests__/components/InquiryTypeBadge.test.tsx` 또는 동등한 기존 파일이 있으면:

- `mode='inline-action'` (또는 기본): 기존 2버튼 렌더 검증 유지.
- `mode='label-only'`: 단일 주황 "미분류" 뱃지 렌더 + 버튼(role='button') 이 없어야 함 검증.
- `mode='label-only'` 에서 클릭 시 fetch 호출이 **일어나지 않아야** 함 (핸들러 미바인딩 검증).

기존 테스트 파일이 없으면 최소 3건짜리 신규 파일로 추가.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="InquiryTypeBadge|useClassifyInquiryType"
```

그리고 전체 테스트 회귀도 확인:

```bash
pnpm test
```

위 두 블록 모두 통과 시 `tasks/16-classify-cta/index.json` 의 phase 2 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

독립적인 검증은 단일 메시지에 Bash 병렬로 발사해 속도를 높여라.

## 주의사항

- **status 매핑 중복 금지**: `useClassifyInquiryType` 훅 내부의 `STATUS_MAP` 과 `InquiryTypeBadge` 에 남아있던 것을 **동시에 두지 말 것**. 기존 `InquiryTypeBadge.handleSelect` 의 statusMap 리터럴을 **반드시 제거**하고 훅에만 남긴다. (불변 규칙 §5-1, §5-8)
- **pulse 애니메이션**: `mode='label-only'` 의 단일 "미분류" 뱃지도 기존 `animate-pulse ring-2 ring-orange-300 ring-offset-1` 을 유지해 주의 환기 일관성을 지킨다(§5-3 pulse 규칙은 "미분류 상태에서만" 이므로 label-only 에서도 유지).
- **기본값 변경 금지**: `mode` 기본값은 **`'inline-action'`** 을 유지 — 이번 task 외의 호출처가 있을 수 있으므로 하위호환 보호. 사용처에서 명시적으로 `'label-only'` 를 전달해야 새 동작이 켜진다.
- **알림 뱃지 / flex-wrap**: `ContactCardHeader` 의 `flex-wrap` 구조를 수정하지 마라. label-only 전환 시 뱃지 크기만 줄어들 뿐 레이아웃은 그대로다.
- **`useClassifyInquiryType` 는 훅이므로 컴포넌트 내부에서만 호출** — 이벤트 핸들러 안에서 호출하려는 실수 금지 (React Hooks 규칙).
- **기존 테스트를 깨뜨리지 마라**. 기존 `InquiryTypeBadge` 2버튼 동작 테스트가 있다면 그대로 통과해야 한다 (mode 기본값이 보호).
- `onStopPropagation` prop 은 `mode='label-only'` 에서도 받되 **사용하지 않는다**(뱃지 자체에 이벤트 없음). Props 타입에서 optional 유지.
