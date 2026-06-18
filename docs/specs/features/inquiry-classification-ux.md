# Inquiry Classification UX (문의 분류 UX)

## 개요

- 목적: 미분류 문의의 분류를 1-click으로 완료하고, 접수 시점을 Worker 카드에서 바로 파악할 수 있도록 한다.
- 도메인: CRM > 문의 관리 > 문의 카드 UX
- 범위: Admin `ContactCard`, Worker `OfficeContactCard` / `StaffContactCard`, 공용 `InquiryTypeBadge`, 새 `ContactContextMenu`(Admin), 기존 `WorkerContextMenu` 확장
- 데이터 모델 / API: **변경 없음** — 기존 `PATCH /api/contacts/[id]/inquiry-type` 재사용

## 1. 배경 / 문제

- 기존 미분류 카드는 헤더에 "미분류" 드롭다운 배지만 노출된다. 분류하려면 (1) 배지 클릭 → 드롭다운 오픈 → (2) 항목 선택, **2단계 클릭**이 필요하다. 카드 수가 많을수록 분류 피로도가 누적된다.
- 분류 후 재분류 UI는 상세 페이지(`/admin/contacts/[id]`)에만 있어, 카드 목록에서 바로 칼선↔목형 유형을 바꿀 수 없다. 잘못 분류된 건을 보정하려면 항상 상세 페이지를 오가야 한다.
- Worker 포털의 `OfficeContactCard` / `StaffContactCard`는 **문의 생성시간을 표시하지 않는다**. 당일 접수된 건인지, 며칠 묵은 건인지 판단이 어려워 현장 우선순위 판단에 병목이 생긴다. Worker 카드는 별도 포맷터로 `26년 5월 12일 오전 10시 57분` 형식의 생성시간을 노출한다.

## 2. 변경 요구사항

### 2.1 미분류 카드: 인라인 2버튼 분류

- 헤더의 미분류 배지 자리에 **인라인 `[칼선의뢰] [목형의뢰]` 2버튼**을 노출한다 (1-click 분류).
- 두 버튼 모두에 기존 미분류 배지와 동일한 pulse 애니메이션(`animate-pulse` + `ring`)을 유지해 주의를 환기한다.
- 2버튼이 헤더 1줄에 들어가지 않으면 **wrap 허용** (의도된 동작). 카드 헤더의 `flex-wrap` 속성을 그대로 사용한다.
- 적용 범위: 공용 컴포넌트 `InquiryTypeBadge`를 수정해 Admin `ContactCard`와 Worker `OfficeContactCard`(사무실 작업자 카드) 양쪽에 동시에 반영한다. `StaffContactCard`는 이미 분류된 문의만 표시하므로 영향 없음.
- 기존 드롭다운/스피너 로직은 제거하지 않고 재사용 (optimistic update, rollback, `onStopPropagation` 포함).

### 2.2 분류된 카드: 읽기 전용 배지 + 컨텍스트 메뉴 재분류

- 분류된 카드는 현행과 동일하게 읽기 전용 배지(칼선의뢰 / 목형의뢰 / 레이저가공 / 문의접수)를 유지한다.
- 재분류는 **우클릭(데스크톱) / long-press 500ms(모바일)** 컨텍스트 메뉴로 진행한다.
  - 메뉴 항목: `칼선의뢰로 변경`, `목형의뢰로 변경`. 현재 유형은 비활성화/체크 표시.
- 미분류 상태에서는 컨텍스트 메뉴를 **열지 않는다** (인라인 버튼이 동일 기능을 제공하므로 중복 방지).
- Admin: 신규 `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` 생성.
- Worker: 기존 `src/app/worker/_components/WorkerContextMenu.tsx`에 재분류 섹션 확장 (메뉴 상단에 "재분류" 라벨 + 칼선/목형 2항목, 그 아래 구분선 후 기존 긴급 배치 / 도면 분할 항목).
- 컨텍스트 메뉴는 **Admin / Worker 각자 별도 컴포넌트로 유지**하고 공용화하지 않는다. 역할별로 추가 메뉴 항목(예: 긴급 배치, 도면 분할)이 다르기 때문.

#### 2.2.1 "웹하드에서 열기" 항목 (task 22, Admin / Worker 공통)

컨텍스트 메뉴 **최상단** 에 "웹하드에서 열기" 항목을 배치한다 (재분류 / 긴급 배치 / 도면 분할 등 기존 항목 **위**, `<hr>` 구분선으로 분리).

- 아이콘: `lucide-react` 의 `FolderOpen`
- 라벨: "웹하드에서 열기"
- 클릭 동작: Next.js `router.push(/webhard?folderId={contact.webhard_folder_id}&fileId={contact.webhard_file_id})` — **같은 탭 이동** (새 탭/새 창 아님)
- disabled 조건: `contact.webhard_folder_id == null`
- disabled 시 `title` 툴팁: `"웹하드 폴더 미생성"`
- `contact.webhard_file_id` 가 null 이어도 메뉴는 **활성화**. URL 조립 시 `fileId` 쿼리만 생략하고 folderId 만으로 이동
- 적용 컴포넌트:
  - Admin: `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx`
  - Worker: `src/app/worker/_components/WorkerContextMenu.tsx`

`contact.webhard_file_id` 는 Contact 응답 DTO 에 새로 추가되는 필드로, 해당 Contact 의 최신 DrawingRevision 의 첫 번째 `webhardFileIds` 값이다 (상세: `docs/specs/api/endpoints/webhard.md` Contact 응답 DTO 섹션).

### 2.3 Worker 카드 문의 생성시간 표시

- `OfficeContactCard` / `StaffContactCard`에 **문의 생성시간을 표시**한다.
- 포맷: `26년 5월 12일 오전 10시 57분` (`YY년 M월 D일 오전/오후 H시 m분`).
- 위치: 오른쪽 버튼 그룹의 다운로드 아이콘 왼쪽. `webhard_folder_path` 줄과 상단 문의번호 줄에는 생성시간을 함께 표시하지 않는다.

## 3. UX 세부

### 3.1 색상 토큰

| 요소                   | 토큰                                                                     | 비고                                        |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| 칼선의뢰 인라인 버튼   | `BADGE.info` 계열 (파랑)                                                 | 기존 칼선의뢰 배지 색상과 동일하게 맞춤     |
| 목형의뢰 인라인 버튼   | `BADGE.success` 계열 (초록)                                              | 기존 목형의뢰 배지 색상과 동일하게 맞춤     |
| pulse/ring             | 기존 `animate-pulse ring-2 ring-orange-300` 유지 — **task 17 에서 폐기** | task 17 이전까지 주의 환기 일관성. §9 참고. |
| Worker 생성시간 텍스트 | `text-xs font-medium text-gray-500`                                      | 다운로드 아이콘 왼쪽에서 접수 시점 확인     |

- 디자인 토큰 규칙 준수: `dark:` 클래스 금지, CSS 변수 기반 `BADGE`, `TEXT_COLOR` 사용 (design-system.md 참고).

### 3.2 재분류 확인 모달 (중요)

재분류 시 status도 함께 변경된다 (§4 참고). 단순 칼선↔목형 토글이 아니라 공정 단계가 이동하므로, 초기 접수 상태가 아닐 때는 **반드시 confirm 모달로 경고**한다.

- 조건: `status !== 'received'` 이면서 현재 `inquiry_type`이 이미 분류된 경우.
- 모달 메시지 예: `"현재 '${현재공정}' 단계입니다. 재분류 시 '${새공정}' 단계로 이동하고 기존 진행 상태가 초기화될 수 있습니다. 계속하시겠습니까?"`
- `status === 'received'`인 분류된 건은 즉시 변경 허용 (공정 이동으로 인한 위험 없음).
- 미분류 → 첫 분류는 모달 없이 1-click 진행.

### 3.3 컨텍스트 메뉴 공용화 안 함

- Admin/Worker 역할마다 추가 메뉴 항목이 다르다 (Worker: 긴급 배치, 도면 분할 / Admin: 재분류 외에 별도 액션 없음 또는 역할별 확장 예정).
- 공용화하면 prop drilling이 늘고 역할별 권한 로직이 섞인다. **별도 컴포넌트로 유지** 하되, 재분류 핸들러는 `InquiryTypeBadge`의 기존 `handleSelect` 로직을 재사용하는 공용 훅(예: `useReclassifyInquiryType`)으로 추출 고려.

## 4. API / 데이터 모델

- **스키마 변경 없음.** `contacts.inquiry_type`, `contacts.status`, `contacts.process_stage` 필드를 그대로 사용한다.
- **엔드포인트 변경 없음.** 기존 `PATCH /api/contacts/[id]/inquiry-type` (Next.js) → `PATCH /api/v1/contacts/:id/inquiry-type` (NestJS) 재사용.
- 허용 값: `VALID_INQUIRY_TYPES = ['cutting_request', 'mold_request']` 유지 (`src/app/api/contacts/[id]/inquiry-type/route.ts`).
- 재분류 시 status 동기화는 서버/클라이언트 모두에서 **기존 로직 그대로** 적용:
  - Optimistic: `InquiryTypeBadge` 의 `statusMap` (cutting_request → drawing, mold_request → confirmed).
  - 서버: NestJS `ContactsService.updateInquiryType`이 동일 매핑을 적용해 `status`/`process_stage`를 변경하고 `ContactStatusHistory`를 기록.
- 권한: admin 세션 또는 worker(PIN 세션) 가능. 기존 route handler의 `getErpWorkerSession` / `requireAdmin` 분기 유지.

## 5. 불변 규칙 (Invariants)

1. **status 매핑**은 단일 소스: `cutting_request → status='drawing'`, `mold_request → status='confirmed'`. Admin/Worker 공통이며 기존 `InquiryTypeBadge` optimistic 로직과 일치해야 한다. 추가 매핑을 이 UX에서 만들지 않는다.
2. **Worker 대시보드의 "미분류" 서브필터** (`!inquiry_type` 기준)는 동작을 그대로 유지한다. 인라인 버튼 클릭으로 분류 완료 시 해당 카드는 서브필터에서 사라지며, 재분류 후 올바른 탭(칼선/목형)에 다시 나타난다 — `InquiryTypeBadge`의 기존 `processBoard` 캐시 제거 패턴과 동일.
3. **분류 CTA 및 '미분류' 뱃지는 정적 렌더**. task 17 피드백 이후 pulse/ring 효과는 제거됨. 주의 환기는 tooltip 과 우측 CTA 의 색상 대비(파랑/초록)로 충분. (이전 규칙: "pulse 애니메이션은 '미분류 상태에서만' 유지" — task 17 에서 폐기)
4. **컨텍스트 메뉴는 미분류 카드에서 열리지 않는다** (인라인 버튼과 중복 방지). Admin/Worker 모두 동일.
5. **재분류 status 경고 모달**은 `status !== 'received'` + 이미 분류된 카드에서만 표시. 미분류 → 첫 분류는 모달 없이 즉시 실행 (기존 UX와 동일).
6. **Worker 생성시간 포맷**은 `formatWorkerCreatedAt`을 통해 `YY년 M월 D일 오전/오후 H시 m분`으로 표시한다. Admin `formatCreatedAt` 포맷과 독립적으로 유지한다.

## 6. 구현 단계 (참고)

| Phase | 이름                | 범위                                                                                             |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------ |
| 0     | docs-update         | 이 문서 + 기존 스펙 참조 라인 추가                                                               |
| 1     | badge-refactor      | `InquiryTypeBadge`에 인라인 2버튼 분기 추가, `formatCreatedAt` utils 추출                        |
| 2     | admin-context-menu  | `ContactContextMenu` 신규 + Admin `ContactCard`에 우클릭/long-press 바인딩 + 재분류 confirm 모달 |
| 3     | worker-context-menu | 기존 `WorkerContextMenu`에 재분류 섹션 확장 + Worker 카드 바인딩                                 |
| 4     | worker-created-at   | `OfficeContactCard` / `StaffContactCard`에 문의 생성시간 표시                                    |
| 5     | docs-sync           | 변경 결과 반영 (CHANGELOG, 필요 시 스펙 미세 조정)                                               |

## 7. 구현 결과 (Phase 1~4 완료 기준)

### 7.1 공개 export / 유틸

- `formatCreatedAt(dateStr: string): string` — `src/app/(admin)/admin/contacts/_lib/utils.ts`
  - Admin 카드 포맷: `3/23 오전 9시 3분`. `minutes === 0` 이면 "~시"만 출력(분 생략), `hours === 0 → 오전 12시`, `hours === 12 → 오후 12시`.
- `formatWorkerCreatedAt(dateStr: string): string` — `src/app/worker/_lib/formatWorkerContactMeta.ts`
  - Worker 카드 포맷: `26년 5월 12일 오전 10시 57분`.

### 7.2 신규 컴포넌트

- `ContactContextMenu` (Admin, `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx`)
  - Props: `contact: Contact`, `x: number`, `y: number`, `onSelectInquiryType: (InquiryType) => void`, `onClose: () => void`.
  - 항목: 칼선의뢰 / 목형의뢰 2개. 현재 `inquiry_type`과 동일한 항목은 disabled.
  - 외부 클릭 / Escape 키 → `onClose` 호출. 화면 경계 보정: `MENU_WIDTH=180`, `MENU_HEIGHT=96`.

### 7.3 확장된 컴포넌트 인터페이스

- `WorkerContextMenu` (`src/app/worker/_components/WorkerContextMenu.tsx`)
  - 신규 props: `currentInquiryType?: InquiryType | null`, `canReclassify: boolean`, `onReclassify: (InquiryType) => void`.
  - 레이아웃: 재분류 섹션이 메뉴 **상단**에 위치하고 구분선(`border-t border-gray-100 my-1`) 후 기존 긴급/분할 항목이 표시됨. 현재 타입 disabled.
- `OfficeContactCard` / `StaffContactCard` (`src/app/worker/_components/*.tsx`)
  - 신규 prop: `onContextMenu?: (contactId: Contact['id'], x: number, y: number) => void`.
  - 동작: 데스크톱 우클릭 + 모바일 500ms long-press(터치 이동 시 취소) → `onContextMenu` 호출.
  - 생성시간 표시: 오른쪽 버튼 그룹에서 다운로드 아이콘 왼쪽에 `formatWorkerCreatedAt(contact.created_at)` 을 `text-xs font-medium text-gray-500` 텍스트로 노출한다. 상단 문의번호 줄과 `webhard_folder_path` 줄에는 생성시간을 함께 표시하지 않는다.
  - 카드 헤더는 기존 flex 구조를 유지하며, 오른쪽 생성시간·아이콘·펼치기 표시는 가운데 제목 줄의 중심선에 맞춘다.

### 7.4 재분류 핸들러 (Admin/Worker 공통 로직)

- Admin `ContactCard.handleReclassify` / Worker `dashboard/page.tsx.handleReclassify`:
  - `contact.status !== 'received'` 일 때 `window.confirm("재분류 시 공정 상태도 함께 변경됩니다.\n(<칼선의뢰 → 도면작업> | <목형의뢰 → 컨펌>)\n진행하시겠습니까?")` 로 경고.
  - `PATCH /api/contacts/[id]/inquiry-type` 호출 후 `queryKeys.contacts.all` + `queryKeys.processBoard.all` 모두 invalidate.
- `InquiryTypeBadge.handleSelect` (미분류 → 첫 분류 경로)는 confirm 없이 즉시 optimistic update 실행 (§3.2).

### 7.5 테스트

- Frontend Jest: `StaffContactCard` 에 생성시간 렌더링 테스트 3건 추가 (Phase 4).
- 기존 `InquiryTypeBadge`, `ContactCard` 테스트 회귀 없음.

## 8. 후속 리팩토링 (task 16: classify-cta)

### 8.1 재설계 배경

§2 구현 이후 실제 운영 중 다음 인지 이슈가 드러났다.

- Worker 카드의 오른쪽(advance 버튼 자리)에 `OfficeAdvanceButton` 이 `disabled + "분류 필요"` 뱃지로 **액션 불가한 라벨처럼** 표시된다 (`OfficeAdvanceButton.tsx:53-58`). 하지만 그 자리는 원래 "다음 단계" CTA 자리이므로, 사용자는 "여기서 뭔가를 눌러야 할 것 같은데 안 눌린다" 는 모순된 신호를 받는다.
- 대응으로 왼쪽에 인라인 2버튼(`[칼선의뢰] [목형의뢰]`)을 배치했지만, Admin/Worker 모두에서 **왼쪽 = 상태/속성 라벨 자리**라는 시각적 규범이 있다. 사용자는 이 2버튼을 **라벨의 일부**로 오인하고 클릭하지 않는다.

해결책은 **"왼쪽 = 상태 라벨, 오른쪽 = 액션 CTA"** 규범을 따르는 쪽으로 UI 를 뒤집는 것이다.

- 왼쪽 `InquiryTypeBadge`: 미분류일 때 단일 주황 "미분류" 뱃지만 (라벨) 렌더. 클릭 핸들러 없음.
- 오른쪽 CTA: `OfficeAdvanceButton` 의 `disabled "분류 필요"` 뱃지를 제거하고, 그 자리에 `[칼선의뢰] [목형의뢰]` 2버튼을 **실제 CTA 로서** 배치한다.

### 8.2 Admin / Worker 공용 정책

두 역할 모두 동일 패턴을 따른다.

- 왼쪽: `InquiryTypeBadge` 를 `mode='label-only'` 로 호출 → 주황 "미분류" 단일 뱃지.
- 오른쪽: 신규 공용 컴포넌트 `InquiryClassifyButtons` 를 CTA 자리(= Admin "작업시작" / Worker advance 버튼 자리)에 렌더.
- 분류 완료 후 서버 statusMap 이 `received → drawing/confirmed` 로 전환하므로, 카드 렌더 경로가 자연스럽게 "작업시작" / `OfficeAdvanceButton` 쪽으로 넘어간다.

### 8.3 공용 훅 계약 — `useClassifyInquiryType`

- 위치: `src/lib/hooks/useClassifyInquiryType.ts` (신규)
- 시그니처: `useClassifyInquiryType(contact: Contact) => { classify: (inquiryType: InquiryType) => Promise<void>, isPending: boolean, pendingType: InquiryType | null }`
- 동작: 기존 `InquiryTypeBadge.handleSelect` 의 optimistic update(`queryKeys.contacts.all` + `queryKeys.processBoard.all`) + `PATCH /api/contacts/:id/inquiry-type` + rollback 로직을 **이관(이동)** 한다. 새 매핑 테이블을 만들지 말고 기존 로직을 그대로 옮긴다.
- status 매핑은 §5-1 불변 규칙(`cutting_request → drawing`, `mold_request → confirmed`)을 그대로 유지한다. 훅 분리가 이 규칙을 바꾸는 계기가 되어서는 안 된다.

### 8.4 공용 컴포넌트 계약 — `InquiryClassifyButtons`

- 위치: `src/components/contacts/InquiryClassifyButtons.tsx` (신규)
- Props:
  - `contact: Contact`
  - `size?: 'sm' | 'md'` (기본 `'md'`) — Admin/Worker 카드의 시각적 밀도 차이 대응
  - `onStopPropagation?: (e: React.MouseEvent) => void` — 카드 래퍼의 클릭 토글과 충돌 방지
- 내부에서 `useClassifyInquiryType` 사용. 상위 컴포넌트는 fetch 호출을 알 필요 없음.
- 렌더: `[칼선의뢰]` (`BADGE.info` 계열) + `[목형의뢰]` (`BADGE.success` 계열) 2버튼. 기존 pulse 애니메이션(`animate-pulse ring-2 ring-orange-300`)을 유지해 주의 환기 일관성을 보장한다.

### 8.5 `InquiryTypeBadge.mode` prop 계약

- 타입: `'inline-action' | 'label-only'`
- 기본값: `'inline-action'` — **task 외부의 호출처가 바로 깨지지 않도록 하위 호환 유지**.
- `mode='label-only'` + 미분류(`!contact.inquiry_type && contact.source === 'webhard'`)일 때: 주황 "미분류" 단일 뱃지만 렌더. `handleSelect` 바인딩/스피너/드롭다운 로직은 실행되지 않는다.
- 분류 완료 상태(`cutting_request` 등)에서는 mode 와 무관하게 기존 읽기 전용 라벨 그대로 동작. 즉 mode 는 "미분류 상태의 렌더 방식" 만 제어한다.

### 8.6 Admin 카드 CTA 위치 (`ContactCardActions`)

- 대상: `src/app/(admin)/admin/contacts/_components/ContactCardActions.tsx` 의 `contact.status === 'received'` 블록.
- 현재: 미분류 시 "작업시작" 버튼이 `disabled + alert` 로 빠진다 (`isUnclassified` 분기).
- 변경: `isUnclassified` 분기를 유지하되, 미분류 → `<InquiryClassifyButtons contact={contact} onStopPropagation={onStopPropagation} />` 를 렌더. 분류되면 기존 "작업시작" 버튼을 렌더.
- `handleStartWorkWithCheck` 의 `alert('문의 유형을 먼저 분류해주세요...')` 경로는 **CTA 자체가 사라지므로** dead code 가 된다 — Phase 3 에서 제거.
- 분류 직후 statusMap 이 서버에서 `received → drawing/confirmed` 로 넘어가므로, 다음 렌더에서는 `status !== 'received'` 블록(보류/작업중 토글)으로 자연스럽게 이관된다.

### 8.7 Worker 카드 CTA 위치 (`OfficeContactCard`)

- 대상: `src/app/worker/_components/OfficeContactCard.tsx` 의 오른쪽 버튼 그룹 — 현재 `OfficeAdvanceButton` 렌더 자리.
- 변경: `!contact.inquiry_type` 분기를 추가. 미분류 → `<InquiryClassifyButtons contact={contact} size="sm" onStopPropagation={stopPropagation} />`, 분류되면 기존 `OfficeAdvanceButton` 렌더.
- `OfficeAdvanceButton` 의 `disabled` 시 "분류 필요" fallback(`OfficeAdvanceButton.tsx:53-58`) 은 **완전히 제거**. `disabled` prop 자체도 이제 불필요 (호출처가 미분류 분기에서 이 컴포넌트를 렌더하지 않음).
- `isSplit && nextStageForGroup` 경로(일괄 작업완료)는 **영향 없음** — 분할 그룹은 분할 시점에 `inquiry_type` 이 자식에도 복사되어 이미 분류된 상태이므로 `!contact.inquiry_type` 분기를 타지 않는다.
- `StaffContactCard` 는 이미 분류된 문의만 표시하므로 변경 없음 (§2.1 원칙 유지).

### 8.8 Worker 카드 layout 변경 (생성시간 위치 이동)

- 현재: `formatWorkerCreatedAt(contact.created_at)` 이 오른쪽 버튼 그룹의 다운로드 아이콘 왼쪽에 위치한다.
- 변경: 세 번째 줄은 `webhard_folder_path` 만 남기고, 첫 번째 줄의 문의번호 옆에도 생성시간을 표시하지 않는다. 기존 flex 구조를 유지하고 오른쪽 생성시간/아이콘/펼치기 표시는 가운데 제목 줄의 중심선에 맞춘다. Office / Staff 양쪽 동일.
- 의도: 실제 파일 동작 버튼 근처에 접수 시점을 고정 배치해 긴 경로 텍스트와 섞이지 않게 하고, 다운로드 아이콘과 함께 한눈에 확인할 수 있게 한다.
- 포맷/토큰은 `26년 5월 12일 오전 10시 57분` + `text-xs font-medium text-gray-500` 기준으로 맞춘다.

### 8.9 `Contact.id` 타입 정상화 (치명적 버그 수정)

- 현재: `src/lib/types/contact.ts` 의 `Contact.id: number` (`contact.ts:58`) — 실제 런타임은 UUID 문자열(`parent_contact_id: UUID`, `contacts.id` DB 컬럼).
- 증상: `useContactTimeline(contactId: number | string)` 이 내부에서 `Number(contactId)` 로 변환 (`useContactTimeline.ts:30, 49`) → UUID 는 `NaN` 이 되어 `getContactTimeline(NaN)` 호출 → `serverGetContactTimeline("NaN")` → 타임라인 빈 배열 반환. 결과적으로 **타임라인 기록이 Worker/Admin 카드 모두에서 보이지 않음**.
- 수정: `Contact.id: string` 으로 타입 변경. `useContactTimeline` 의 `Number(...)` 변환 제거. `contactId: string` 단일 타입으로 정리.
- 영향 범위(일괄 `string` 전환):
  - `ContactCardProps.onToggle`, `onContextMenu`, `onMemo` 콜백 시그니처
  - `toggleStageCompleted`, `advanceSplitGroupStage`, `updateProcessStage` 등 action 인자 (현재 `String(contact.id)` 로 감싸고 있는 호출처는 불필요해짐)
  - `queryKeys.contacts.timeline(contactId)` 키 타입
  - Admin `ContactCard` / Worker `OfficeContactCard` / `StaffContactCard` 에서 `contact.id` 를 props 로 전파하는 모든 경로
- 근거: 기존 스펙 §5 의 status 매핑/권한 규칙은 변경 없음. 타입 오류를 바로잡는 정상화이며, 비즈니스 규칙 개정이 아님.

### 8.10 불변 규칙 추가 (§5 연장)

7. **분류 CTA(2버튼)는 미분류 상태에서만 노출**한다. 분류 완료 후 재분류는 기존 컨텍스트 메뉴(우클릭 / long-press) 경로만 사용 (§2.2). 인라인 재분류 버튼 부활 금지.
8. `useClassifyInquiryType` 훅의 status 매핑은 `InquiryTypeBadge` 에 존재하던 것과 **동일**해야 한다. 훅 분리 과정에서 매핑 테이블을 중복 정의하지 말고 기존 로직을 이동시킨다. 단일 소스 원칙 (§5-1) 위반 방지.

(§5 기존 규칙 6 항목은 그대로 유효하다. 특히 §5-2 "Worker 대시보드의 '미분류' 서브필터" 동작은 유지 — 새 `InquiryClassifyButtons` 클릭 시에도 분류 성공 시 해당 카드는 `processBoard` 캐시에서 즉시 제거되어 서브필터에서 사라지고, refetch 후 올바른 탭에 재등장한다.)

### 8.11 `dark:` 금지 원칙 재확인

신규 `InquiryClassifyButtons` 및 수정되는 `InquiryTypeBadge` / `OfficeContactCard` / `ContactCardActions` 코드에서 `dark:` 클래스 사용을 금지한다 (design-system.md §Rules-1). 기존 `BADGE.info` / `BADGE.success` / `TEXT_COLOR.muted` 등 시맨틱 토큰을 통해 light/dark 모드가 자동 처리되도록 유지한다.

### 8.12 구현 단계 (task 16)

| Phase | 이름                 | 범위                                                                                                                                    |
| ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | docs-update          | 본 §8 섹션 추가 + 관련 스펙 참조 갱신                                                                                                   |
| 1     | contact-id-type-fix  | `Contact.id: string` 정상화 + `useContactTimeline` Number 제거 + caller 일괄 전환                                                       |
| 2     | badge-mode-split     | `InquiryTypeBadge.mode` prop 도입 (`inline-action` / `label-only`)                                                                      |
| 3     | classify-buttons-cta | `useClassifyInquiryType` 훅 + `InquiryClassifyButtons` 공용 컴포넌트 + Admin/Worker CTA 자리 교체 + `OfficeAdvanceButton` fallback 제거 |
| 4     | worker-card-layout   | Worker 카드 생성시간 위치 이동 (오른쪽 버튼 그룹, 다운로드 아이콘 왼쪽)                                                                 |
| 5     | docs-sync            | CHANGELOG + 필요 시 본 스펙 미세 조정                                                                                                   |

## 9. 후속 리팩토링 (task 17: classify-cta-cleanup)

### 9.1 재설계 배경

task 16 완료 이후 실사용 피드백에서 다음이 드러났다.

- 미분류 상태의 `InquiryClassifyButtons` 2버튼과 `InquiryTypeBadge mode='label-only'` 의 "미분류" 뱃지 모두 `animate-pulse ring-2 ring-orange-300 ring-offset-1` 을 그대로 갖는다 (task 16 이 §3.1 토큰 규칙을 보존하기 위해 유지했음).
- 운영자 관점에서 카드 리스트에 미분류 건이 쌓이면 **pulse/ring 이 시각 소음**이 되어 오히려 우선순위 판단을 방해한다. 색상 대비(파랑 "칼선의뢰" vs 초록 "목형의뢰")만으로도 충분히 구분 가능하며, tooltip 이 의도를 명시한다.
- 또한 2버튼의 `gap-1` 은 좁아서 빠른 터치/클릭 시 오분류 위험이 있다.

결론: pulse/ring 제거 + 2버튼 간격 확대.

### 9.2 변경 사항

- `InquiryTypeBadge` `mode='label-only'` 렌더 path: `animate-pulse ring-2 ring-orange-300 ring-offset-1` **완전 제거**. "미분류" 주황 뱃지는 정적(`BADGE.warning`)으로만 렌더.
- `InquiryTypeBadge` 인라인 2버튼 렌더 path(`mode='inline-action'` 분기, 하위 호환용): 동일하게 pulse/ring 제거. 분기 자체는 제거하지 않고 효과만 제거 (외부 호출처가 있을 경우 대비).
- `InquiryClassifyButtons` 내 `commonButton` 문자열에서 `ring-2 ring-orange-300 ring-offset-1 animate-pulse` 제거. 버튼 배경의 `BADGE.info`/`BADGE.success` 색상 대비와 `title`/`aria-label` 로 의도 전달.
- `InquiryClassifyButtons` 2버튼 컨테이너: `gap-1 → gap-2` 로 확대. `flex-wrap` 은 유지 (카드 헤더 공간 협소 시 줄바꿈 허용).

### 9.3 범위 경계 (task 17 의 다른 phase)

- 본 §9 는 task 17 Phase 1 (`classify-cta-cleanup`) 의 스펙 근거만 기술한다.
- 타임라인 ASC 정렬 + actorName 노출(Phase 2), 실시간 반영(Phase 3), 최신 도면 다운로드 API(Phase 4), 긴급 사이렌 overlay(Phase 5) 는 **별도 스펙 문서** 에서 관리한다:
  - Phase 2~3: `docs/specs/features/drawing-workflow.md` 의 "통합 타임라인" 섹션 (추후 갱신) 및 ContactTimeline 컴포넌트 주석.
  - Phase 4: `docs/specs/features/drawing-revision-history.md` "최신 도면 다운로드 API" 서브섹션 + `docs/specs/api/endpoints/integration.md` 신규 엔드포인트.
  - Phase 5: `docs/specs/features/contact-urgent-ui.md` (신규 스펙).

### 9.4 불변 규칙 업데이트 (§5 연장)

9. **분류 CTA 및 '미분류' 뱃지에는 pulse/ring 효과를 적용하지 않는다.** 주의 환기는 tooltip + 좌(라벨 주황) / 우(칼선 파랑·목형 초록) CTA 색상 대비에 맡긴다. task 17 이후 부활 금지.

## 참조

- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — 인라인 2버튼 + 분류된 상태 읽기 전용 라벨 (task 16 에서 `mode` prop 추가)
- `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` — Admin 재분류 컨텍스트 메뉴 (Phase 2 신규)
- `src/app/(admin)/admin/contacts/_components/ContactCard.tsx` — 우클릭 바인딩 + 재분류 confirm (Phase 2)
- `src/app/(admin)/admin/contacts/_components/ContactCardActions.tsx` — 미분류 시 CTA 자리에 `InquiryClassifyButtons` (task 16 §8.6)
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — `formatCreatedAt` consumer
- `src/app/(admin)/admin/contacts/_lib/utils.ts` — `formatCreatedAt` 공용 utils
- `src/components/contacts/InquiryClassifyButtons.tsx` — Admin/Worker 공용 분류 CTA 2버튼 (task 16 신규)
- `src/lib/hooks/useClassifyInquiryType.ts` — 분류 optimistic update + rollback 공용 훅 (task 16 신규)
- `src/app/worker/_components/OfficeContactCard.tsx`, `StaffContactCard.tsx` — Worker 카드 (생성시간 + onContextMenu prop; task 16 layout/CTA 교체)
- `src/app/worker/_components/OfficeAdvanceButton.tsx` — task 16 이후 미분류 fallback 제거
- `src/app/worker/_components/WorkerContextMenu.tsx` — 재분류 섹션 확장 (Phase 3)
- `src/app/worker/dashboard/page.tsx` — Worker 재분류 핸들러 + 컨텍스트 메뉴 바인딩 (Phase 3)
- `src/app/api/contacts/[id]/inquiry-type/route.ts` — PATCH 핸들러 (변경 없음)
- `src/lib/types/contact.ts` — `Contact.id: string` 정상화 (task 16 §8.9)
- `src/lib/hooks/useContactTimeline.ts` — `Number(contactId)` 제거 (task 16 §8.9)
- `docs/specs/features/drawing-workflow.md` — `inquiry_type` 분류 이후의 공정 흐름
- `docs/specs/features/worker-portal.md` — Worker 대시보드 UX 베이스라인
- `docs/specs/features/contact-split.md` — 분할 그룹에서의 `inquiry_type` 복사 규칙
- `docs/specs/features/design-system.md` — 색상/토큰/`dark:` 금지 규칙
