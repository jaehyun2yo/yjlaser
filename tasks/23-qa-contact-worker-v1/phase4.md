# Phase 4: Worker UI — 분류 · 카드 · 정보 보기 모달 (worker-ui)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/features/worker-contact-classification.md` (Phase 0 신규) — **이번 phase 의 스펙**. Worker 분류 규칙(미분류/공정 시작 전/사무실/현장), 카드 표시 형식, 정보 보기 모달 재사용 정책.
- `docs/specs/features/worker-portal.md` — Worker 포털 기존 UX.
- `docs/specs/features/inquiry-classification-ux.md` — Admin/Worker 공통 컨텍스트 메뉴 규칙.
- `docs/specs/features/design-system.md` — UI 컴포넌트 재사용 규칙. ContactDetailView 재사용 시 spec 준수.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.

그리고 현재 구조를 이해하라:

- `webhard-api/src/contacts/contacts.service.ts:96-114` `workCategory` 분류 로직 — Phase 4 의 서버측 필터 조건 수정 지점.
- `src/app/worker/dashboard/page.tsx:115-118` `officeContacts = officeOnlyContacts + unclassifiedContacts` — 현재 사무실 탭이 미분류를 합쳐 보여주는 구조.
- `src/app/worker/dashboard/page.tsx:267-271` — "공정 시작전" 필터 (`process_stage === null && !!inquiry_type`). 이번 phase 에서 조건 확장.
- `src/app/worker/_components/OfficeContactCard.tsx:243-249` — 카드 표시 형식 (현재 `업체명 - drawing_file_name`).
- `src/app/worker/_components/WorkerContextMenu.tsx:91-186` — 기존 메뉴 (웹하드에서 열기, 재분류, 긴급 배치, 도면 분할). "정보 보기" 추가.
- `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx:624` — pure read-only 컴포넌트. 재사용 대상.
- `src/app/(admin)/admin/contacts/ContactDetailModal.tsx` — 기존 모달. admin 전용 액션 포함 → 직접 재사용 불가.
- `src/lib/types/contact.ts` — Contact 타입. `inquiry_title`, `drawing_file_name` 필드 확인.

## 작업 내용

### 1. 백엔드 `workCategory` 분류 로직 확장

`webhard-api/src/contacts/contacts.service.ts:96-114` 의 `workCategory` 필터를 스펙에 맞게 수정한다.

현재 `office` 조건이 `processStage IN (NULL, 'drawing', 'sample') AND inquiryType IS NOT NULL` 이어서 공개 폼 접수 직후 `inquiryType=null` Contact 가 office 에 안 들어온다.

수정:

```ts
// workCategory = 'office' 조건
{
  OR: [
    // 공개 폼 접수: inquiryType 무관, processStage 가 사무실 단계면 포함
    {
      source: 'website',
      processStage: { in: [null, 'drawing', 'sample'] },
    },
    // 외부웹하드 + 분류 확정: 기존 동작 유지
    {
      source: 'webhard',
      inquiryType: { not: null },
      processStage: { in: [null, 'drawing', 'sample'] },
    },
  ],
  status: { notIn: ['delivered', 'completed', 'deleting'] },
}

// workCategory = 'unclassified' 조건 (명확화)
{
  source: 'webhard',
  inquiryType: null,
  status: { notIn: ['delivered', 'completed', 'deleting'] },
}
```

`field` 는 현행 유지.

`source` 필드 존재 확인: `webhard-api/prisma/schema.prisma:461` 에 `source String? @default("website") @db.VarChar(20)` 로 **이미 존재**. 간접 조건 fallback 불필요. auto-contact 경로가 `source: 'webhard'` 로 INSERT 함 (`auto-contact.service.ts:244`).

**중요: `where.OR` 충돌 주의.** 기존 `findAll` 로직(`contacts.service.ts:157-172`) 에 search 필터가 추가되면 기존 `where.OR` 를 `AND` 로 감싸는 패턴이 있다. Phase 4 의 office OR 는 이 패턴을 따라야 한다:

```ts
} else if (workCategory === 'office') {
  const officeOr = [
    { source: 'website', processStage: { in: [null, 'drawing', 'sample'] } },
    { source: 'webhard', inquiryType: { not: null }, processStage: { in: [null, 'drawing', 'sample'] } },
  ];
  if (where.OR) {
    // 이미 OR 가 있으면 AND 로 결합 (processStages/search 와의 충돌 방지)
    const existingOr = where.OR;
    delete where.OR;
    where.AND = [{ OR: existingOr as Prisma.ContactWhereInput[] }, { OR: officeOr }];
  } else {
    where.OR = officeOr;
  }
  where.status = { notIn: ['delivered', 'completed', 'deleting'] };
}
```

`where.inquiryType = { not: null }` 은 office OR 의 webhard 분기로 이동 — 바깥에 두면 website 분기에서 `inquiryType=null` 인 공개 폼 접수 Contact 가 배제된다.

### 2. 프론트엔드 Worker 대시보드 필터 조정

`src/app/worker/dashboard/page.tsx:267-271` 의 "공정 시작전" 필터:

기존:

```ts
if (key === null) {
  return contact.process_stage === null && !!contact.inquiry_type;
}
```

→ 수정:

```ts
if (key === null) {
  // 공개 폼 접수 또는 분류 확정 Contact 모두 공정 시작 전에 포함
  return contact.process_stage === null && (contact.source === 'website' || !!contact.inquiry_type);
}
```

`source` 필드는 `src/lib/types/contact.ts:150` (`source?: ContactSource | null`), line 293 (`source: string`) 에 **이미 존재** — 추가 작업 불필요. `ContactSource` 타입이 `'website' | 'webhard' | 'phone'` 등으로 정의되어 있는지만 확인.

`officeContacts` 조합도 검토: 미분류는 이제 외부웹하드 전용이므로 `officeContacts = officeOnlyContacts` 만으로 충분할 수 있음. `unclassifiedContacts` 탭은 별도 유지(외부웹하드 자유 폴더 작업용).

### 3. `OfficeContactCard.tsx` 카드 표시 형식

Line 243-249 현재:

```tsx
<div className="...">
  {contact.company_name}
  {contact.drawing_file_name && ` - ${contact.drawing_file_name}`}
</div>
```

→ 수정:

```tsx
<div className="...">
  <span>{contact.company_name || '업체 미확인'}</span>
  <span className="text-[var(--text-secondary)]"> - {contact.inquiry_title || '미입력'}</span>
  <span className="text-[var(--text-secondary)]">
    {' '}
    - {contact.drawing_file_name || '파일 없음'}
  </span>
</div>
```

스타일은 기존 클래스 유지하되, 세 단 구분이 시각적으로 명확하도록 두 번째/세 번째 요소를 `text-secondary` 색으로 낮춤. 다크모드는 CSS 변수로 자동 처리됨 (디자인 시스템 준수).

`text-secondary` 색이 정의되지 않았으면 기존 파일의 색상 토큰 사용 (예: `text-gray-500` 대신 `text-[var(--text-secondary)]`).

### 4. `WorkerContextMenu.tsx` "정보 보기" 메뉴 항목 추가

Line 91-186 의 메뉴 항목 배열에 **최상단** 위치로 추가:

```tsx
{
  key: 'view-info',
  label: '정보 보기',
  icon: Info, // lucide-react 의 Info 아이콘
  onClick: () => {
    setInfoModalOpen(true);
    setInfoModalContact(contact);
  },
  disabled: false,
  // 기존 "웹하드에서 열기" 위에 배치, 사이에 <hr> 구분선
},
```

`setInfoModalOpen` / `setInfoModalContact` 는 부모 컴포넌트(예: `WorkerContactList` 또는 `dashboard/page.tsx`) 에서 관리하거나, `WorkerContextMenu` 내부 `useState` 로 처리. 기존 props 구조를 따라 결정.

### 5. `src/components/contact/ContactInfoModal.tsx` (신규)

admin 의 `ContactDetailView` 를 재사용하는 read-only 모달.

시그니처:

```tsx
import { ContactDetailView } from '@/app/(admin)/admin/contacts/_components/ContactDetailView';
import { Modal } from '@/components/ui/Modal'; // 프로젝트 공통 Modal

export interface ContactInfoModalProps {
  contact: Contact;
  open: boolean;
  onClose: () => void;
}

export function ContactInfoModal({ contact, open, onClose }: ContactInfoModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="문의 정보">
      <ContactDetailView contact={contact} readOnly />
    </Modal>
  );
}
```

`ContactDetailView` 에 `readOnly` prop 이 없다면 추가 (admin 액션 버튼 조건부 렌더링). 기존 `isCompanyView` prop 이 유사 역할을 한다면 재사용.

**중요**: `ContactDetailView` 의 admin 전용 import (confirm-button, delete-button, quick-process-stage-select 등) 가 worker 페이지 번들에 포함되면 번들 크기 증가. `readOnly` 분기에서 dynamic import 또는 조건부 렌더링으로 제외. 또는 `ContactDetailView` 에서 admin 액션 컴포넌트를 props 로 주입받는 구조로 리팩토링.

가장 간단한 해결책: `ContactDetailView` 내부에서 admin 액션 버튼 렌더링을 `readOnly` 또는 `showAdminActions` prop 으로 분기. Worker 에서는 `readOnly={true}` 전달하여 admin 버튼 트리 렌더링 자체를 skip.

### 6. Modal 컴포넌트 기존 활용

프로젝트에 이미 `src/components/ui/Modal.tsx` (또는 유사) 이 있는지 확인. 없으면 기존 modal 패턴(`ContactDetailModal` 등) 참조하여 generic `Modal` 사용.

## Acceptance Criteria

프론트 + 백엔드 혼합 phase:

```bash
pnpm build
```

```bash
npx tsc --noEmit
```

```bash
pnpm test
```

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

### 테스트 (핵심만)

`src/__tests__/worker/office-contact-card.test.tsx` **신규**:

- inquiry_title 있을 때: `업체명 - 패키지명 - 파일명` 3 단 렌더 확인
- inquiry_title = null 일 때: `- 미입력 -` 표시
- drawing_file_name = null 일 때: `- 파일 없음` 표시

`src/__tests__/worker/worker-context-menu.test.tsx` **확장 또는 신규**:

- "정보 보기" 메뉴 항목 렌더 확인
- 클릭 시 `ContactInfoModal` open 콜백 호출

`webhard-api/src/contacts/contacts.service.spec.ts` **확장**:

- `workCategory` 필터: `source='website', inquiryType=null, processStage=null` Contact 가 `office` 에 포함되는지
- `source='webhard', inquiryType=null` 은 `unclassified` 로 분류되는지

## AC 검증 방법

위 5 커맨드 **병렬 실행** 하여 모두 통과 시 phase 4 status `"completed"`.

3 회 이상 실패 시 `"error"` + `error_message`.

## 주의사항

- **기존 admin `ContactDetailView` 를 깨뜨리지 마라**. admin 페이지에서 기존 동작(수정 버튼 포함) 이 그대로 작동해야 함. `readOnly` 는 새 prop 으로 추가하고 default `false`.
- Worker 페이지에서 admin 전용 컴포넌트를 dynamic import 하거나 조건부 렌더링으로 번들 분리.
- `source` 필드는 schema 와 프론트 타입 양쪽에 **이미 존재**. Phase 4 에서 schema 변경 불필요.
- `workCategory` 필터는 **성능 주의**. `OR` 조건 추가로 쿼리 플랜 변화 가능성. Prisma 쿼리 로깅으로 실제 SQL 확인.
- "공정 시작 전" 필터가 확장되면 기존 사무실 탭에 표시되는 Contact 수가 늘 수 있다. 사용자 기대와 일치하는지 QA 검증 필요.
- `ContactInfoModal` 은 Worker **와** admin 양쪽에서 사용 가능한 공용 컴포넌트로 설계 (`src/components/contact/`).
- 한글 커밋: `feat(qa-contact-worker-v1): phase 4 — worker-ui`.
