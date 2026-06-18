# Phase 0: docs-update

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — 이번 task는 이 스펙의 **후속 리팩토링**. 기존 인라인 2버튼 모델을 "왼쪽 단일 미분류 라벨 + 오른쪽 분류 CTA 2버튼" 으로 바꾸는 이유, Admin/Worker 공용화 방침, 공용 훅 추출을 여기에 기록한다.
- `docs/specs/features/contact-split.md` — 분할 원본/자식 문의에서도 분류가 동작해야 한다. 그룹 헤더에 분류 CTA를 어떻게 배치할지 영향 판단에 필요.
- `docs/specs/features/worker-portal.md` — Worker 대시보드 CTA 위치/우선순위 베이스라인. 새로 추가되는 `InquiryClassifyButtons`가 기존 advance 버튼을 미분류 상태에서 대체한다는 점을 기록해야 한다.
- `docs/specs/features/design-system.md` — `dark:` 금지, `BADGE` / `TEXT_COLOR` 토큰 사용 규칙 재확인.
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — 현재 인라인 2버튼이 Admin 미분류 카드의 유일한 분류 경로. `mode` prop 추가 계약을 기록하려면 기존 동작을 알아야 한다.
- `src/app/(admin)/admin/contacts/_components/ContactCardActions.tsx` — Admin 카드 미분류 시 "작업시작"이 `disabled + alert` 동작. 이 자리에 `InquiryClassifyButtons`가 들어간다는 점을 기록.
- `src/app/worker/_components/OfficeContactCard.tsx` + `src/app/worker/_components/OfficeAdvanceButton.tsx` — Worker 카드의 "분류 필요" disabled 뱃지(`OfficeAdvanceButton.tsx:53-58`). 이 자리가 `InquiryClassifyButtons`로 교체되는 이유와 layout 변경 의도를 스펙에 반영해야 한다.
- `src/lib/hooks/useContactTimeline.ts` + `src/app/actions/contacts.ts`(`getContactTimeline`) — `Number(contactId)` 치명적 버그의 실제 코드 위치. 스펙에 `Contact.id: string` 정상화 결정을 기록할 근거.

## 작업 내용

### 1. `docs/specs/features/inquiry-classification-ux.md` 확장

기존 스펙 하단(§7 구현 결과 이후 또는 별도 §8 섹션)에 **"후속 리팩토링 (task 16: classify-cta)"** 섹션을 추가한다. 다음 항목을 반드시 포함:

- **재설계 배경**: Worker 카드 오른쪽의 disabled "분류 필요" 뱃지는 CTA 자리이지만 액션 불가 → 사용자가 좌측 인라인 2버튼을 라벨로 오인. 이를 "왼쪽 = 상태 라벨, 오른쪽 = 액션 CTA" 로 명확히 분리한다.
- **Admin/Worker 공용 정책**: 두 역할 모두 동일 패턴을 따른다. 왼쪽 `InquiryTypeBadge`는 `mode='label-only'`로 단일 주황 "미분류" 뱃지만 렌더. 오른쪽 CTA는 공용 컴포넌트 `InquiryClassifyButtons`를 재사용.
- **공용 훅 계약** — `useClassifyInquiryType(contact: Contact)`:
  - 위치: `src/lib/hooks/useClassifyInquiryType.ts` (신규)
  - 반환: `{ classify: (inquiryType: InquiryType) => Promise<void>, isPending: boolean, pendingType: InquiryType | null }`
  - 동작: 기존 `InquiryTypeBadge.handleSelect` 의 optimistic update(`contacts.all` + `processBoard.all`) + `PATCH /api/contacts/:id/inquiry-type` + rollback 로직을 그대로 이관. status 매핑(`cutting_request → drawing`, `mold_request → confirmed`)은 **절대 변경 금지** — 기존 불변 규칙(§5-1)을 유지한다.
- **공용 컴포넌트 계약** — `InquiryClassifyButtons`:
  - 위치: `src/components/contacts/InquiryClassifyButtons.tsx` (신규)
  - Props: `contact: Contact`, `size?: 'sm' | 'md'` (기본 `'md'`), `onStopPropagation?: (e: React.MouseEvent) => void`
  - 내부에서 `useClassifyInquiryType` 사용.
  - 2버튼: `[칼선의뢰]` (`BADGE.info` 계열) + `[목형의뢰]` (`BADGE.success` 계열). pulse 애니메이션 유지.
- **`InquiryTypeBadge.mode` prop 계약**:
  - 타입: `'inline-action' | 'label-only'`, 기본값 `'inline-action'` (하위호환).
  - `mode='label-only'` + 미분류 상태일 때: 주황 "미분류" 단일 뱃지만 렌더, 클릭 핸들러 바인딩 없음.
  - 분류 완료 상태(`cutting_request` 등)에서는 mode와 무관하게 기존 읽기 전용 라벨 그대로.
- **Admin 카드 CTA 위치**: `ContactCardActions` 의 `contact.status === 'received'` 블록에서 `isUnclassified` 분기를 추가 — 미분류면 `InquiryClassifyButtons`, 분류되면 기존 "작업시작" 버튼. 분류 성공 시 서버 statusMap 이 `received → drawing/confirmed` 로 전환하므로 자연스럽게 다른 CTA 세트로 넘어간다.
- **Worker 카드 CTA 위치**: `OfficeContactCard` 오른쪽 `OfficeAdvanceButton` 렌더 자리에서 `!inquiry_type` 분기를 추가 — 미분류면 `InquiryClassifyButtons`, 분류되면 기존 `OfficeAdvanceButton`. `OfficeAdvanceButton` 의 `disabled` 시 "분류 필요" fallback(`line 53-58`) 은 제거한다.
- **Worker 카드 layout 변경**: `formatCreatedAt` 을 두 번째(세 번째) 줄의 `webhard_folder_path` 옆에서 → 첫 번째 줄 `inquiry_number` 다음으로 이동. Office / Staff 양쪽 동일. 세 번째 줄은 `webhard_folder_path` 만 남긴다.
- **`Contact.id` 타입 정상화**: `src/lib/types/contact.ts` 의 `Contact.id: number` 는 실제 런타임이 UUID 문자열이므로 **오류**. `Contact.id: string` 으로 정정. 이로 인해 `useContactTimeline` 의 `Number(contactId)` (NaN 유발) 제거 가능 → 타임라인 기록이 실제로 노출된다. 영향 받는 모든 caller(`ContactCardProps.onToggle(id)`, `onContextMenu`, `onMemo`, 분할 action 등)의 시그니처를 일괄 `string` 으로 전환한다.
- **불변 규칙 추가** (§5 아래 항 추가):
  - 7. 분류 CTA(2버튼)는 **미분류 상태에서만** 노출. 분류 완료 후 재분류는 기존 컨텍스트 메뉴(우클릭 / long-press) 경로만 사용. 인라인 재분류 버튼 부활 금지.
  - 8. `useClassifyInquiryType` 훅의 status 매핑은 `InquiryTypeBadge` 에 존재하던 것과 동일해야 하며, 훅 분리 과정에서 매핑 테이블을 중복 정의하지 말고 기존 로직을 이동시킨다.

### 2. 관련 스펙의 참조 갱신

- `docs/specs/features/contact-split.md`: `inquiry-classification-ux.md` 를 참조하는 주석 라인(§자식에 복사되는 정보 블록 아래 "> `inquiryType` 필드의 카드 UX..." 부분)에 **"task 16 이후 CTA는 `InquiryClassifyButtons` 공용 컴포넌트 기준"** 을 한 줄 추가.
- `docs/specs/features/worker-portal.md`: Worker 대시보드 카드 섹션에 "미분류 카드의 분류 CTA는 advance 버튼 자리를 공용 `InquiryClassifyButtons` 가 대체한다" 는 라인을 추가.
- `docs/API.md` 또는 `docs/specs/api/nextjs-routes.md` 에 등록된 `PATCH /api/contacts/[id]/inquiry-type` 엔트리는 **스펙 변경 없음** — 요청/응답 계약 그대로. 라우트 엔트리에 주석으로 "UI에서 `useClassifyInquiryType` 훅이 이 엔드포인트를 사용" 한 줄만 추가.

### 3. docs-diff 생성은 runner 가 담당

Phase 0 는 문서 업데이트만 수행한다. `tasks/16-classify-cta/docs-diff.md` 는 `scripts/run-phases.py` 가 Phase 0 완료 직후 `scripts/gen-docs-diff.py` 를 호출해 자동 생성하므로 **직접 작성하지 않는다**.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

문서만 수정되므로 빌드·타입체크가 통과하면 OK. 테스트는 Phase 0 에서 실행하지 않는다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `tasks/16-classify-cta/index.json` 의 phase 0 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고, 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- 기존 스펙 §5 의 **status 매핑** (`cutting_request → drawing`, `mold_request → confirmed`) 을 절대 바꾸지 마라. 이 task 는 UX·구조 리팩토링이지 비즈니스 규칙 변경이 아니다.
- 기존 스펙 §5-2 "Worker 대시보드의 '미분류' 서브필터" 동작 유지. 인라인 분류 버튼 제거 후에도 새 `InquiryClassifyButtons` 클릭 시 해당 카드가 서브필터에서 사라지는 동작을 스펙에서 재강조한다.
- `InquiryTypeBadge.mode` prop 은 기본값을 `'inline-action'` 으로 두어 **task 외부의 호출처가 바로 깨지지 않도록** 한다. Phase 2 에서 caller 를 이관할 때 명시적으로 `'label-only'` 를 넘긴다.
- 이 phase 에서 **코드는 수정하지 않는다**. 모든 코드 변경은 Phase 1~4 에서 이루어진다.
- `dark:` 클래스 금지 원칙을 스펙 본문에서 재확인 라인으로 넣되, 토큰 목록 테이블은 불필요하게 중복 작성하지 마라.
