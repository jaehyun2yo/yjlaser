# Phase 1: contact-id-type-fix

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 에서 추가된 후속 리팩토링 섹션(§8). `Contact.id` 타입 정상화 결정의 근거와 왜 `Number()` 변환이 치명적 버그인지 기록되어 있다.
- `tasks/16-classify-cta/docs-diff.md` — 이번 task 의 문서 변경 기록. Phase 0 가 추가한 스펙 섹션을 diff 로 확인할 수 있다.
- `docs/specs/db/prisma-tables.md` (있으면) — `Contact` 테이블의 `id` 가 `String @db.Uuid` 임을 확인 (런타임 UUID 문자열).
- `docs/testing.md` — "깨지면 치명적 분기" 중심 테스트 원칙. 이 phase 의 id 타입 변경은 회귀 범위가 넓으므로 기존 테스트를 모두 통과시키는 것이 AC.
- `webhard-api/prisma/schema.prisma` — `Contact.id` 필드 정의(`@id @default(uuid())`) 직접 확인. Backend 응답의 id 는 UUID string.
- `src/lib/types/contact.ts` — `Contact.id: number` 로 선언된 부정확한 타입. 여기가 수정 대상 1.
- `src/lib/hooks/useContactTimeline.ts` — `Number(contactId)` (NaN 유발) 가 있는 훅. 수정 대상 2.
- `src/app/actions/contacts.ts` — `getContactTimeline(contactId: number)` 시그니처. 수정 대상 3.
- `src/app/(admin)/admin/contacts/_components/ContactCard.tsx` — `ContactCardProps.onToggle(id: number)` 시그니처가 여기서 흐른다. 수정 대상 4 (연쇄).
- `src/app/worker/_components/OfficeContactCard.tsx`, `StaffContactCard.tsx`, `src/app/worker/dashboard/page.tsx` — `onContextMenu(contactId: Contact['id'], ...)` / `onMemo(contactId: Contact['id'])` 시그니처 연쇄. Contact['id'] 를 따라가므로 타입이 `string` 이 되면 자동 전파된다.
- `src/__tests__/` 하위의 Contact 관련 테스트 — id mock 이 `1`, `2` 같은 number 리터럴로 되어 있으면 UUID 문자열로 교체해야 한다.

## 작업 내용

### 1. `Contact.id: number → string` 전면 정상화

**위치**: `src/lib/types/contact.ts:58`

```ts
// 변경 전
export interface Contact {
  id: number;
  ...
}

// 변경 후
export interface Contact {
  id: string;
  ...
}
```

같은 파일 내 다른 인터페이스도 점검:

- `WorkerNote.id: number` (`line 182`) 는 그대로 유지 (별개 엔티티). 단 `WorkerNote.contact_id: string` 은 기존대로.
- `PortfolioReferenceInfo.id: string | number` (`line 195`) 유지.
- `DrawingRevision.id: string` (`line 282`) 유지.
- `TimelineItem.id: string` (`line 337`) 유지.

### 2. 훅·액션 `Number()` 제거

**위치 A**: `src/lib/hooks/useContactTimeline.ts`

```ts
// 변경 전
export function useContactTimeline(
  contactId: number | string,
  options?: UseContactTimelineOptions
) {
  ...
  queryFn: async () => {
    const result = await getContactTimeline(Number(contactId));
    return result.data;
  },
  ...
}

// 변경 후
export function useContactTimeline(
  contactId: string,
  options?: UseContactTimelineOptions
) {
  ...
  queryFn: async () => {
    const result = await getContactTimeline(contactId);
    return result.data;
  },
  ...
}
```

`usePrefetchTimeline` 에서도 동일하게 `Number()` 제거.

**위치 B**: `src/app/actions/contacts.ts:257`

```ts
// 변경 전
export async function getContactTimeline(contactId: number) {
  const timeline = await serverGetContactTimeline(String(contactId), { revalidate: 60 });
  ...
}

// 변경 후
export async function getContactTimeline(contactId: string) {
  const timeline = await serverGetContactTimeline(contactId, { revalidate: 60 });
  ...
}
```

### 3. 연쇄 시그니처 정정

`Contact.id` 가 `string` 이 되면 `Contact['id']` 타입을 참조하는 곳은 자동 전파된다. 그러나 **`number` 를 리터럴로 선언한 모든 곳**은 수동 수정이 필요하다. 아래는 알려진 위치 — `grep` 으로 추가 누락을 찾아라:

- `src/app/(admin)/admin/contacts/_components/ContactCard.tsx` — `onToggle?: (id: number) => void;` → `(id: string) => void`
- `src/app/(admin)/admin/contacts/ContactsList.tsx` — `ContactCard` 와 연결되는 toggle state (`expandedContactId: number | null` 등)가 있으면 `string | null` 로 수정.
- `src/app/(admin)/admin/contacts/_lib/hooks.ts` 의 `useNotificationDismissal(contactId: number)` — `string` 으로 변경.
- `src/app/(admin)/admin/contacts/_lib/utils.ts` 에서 `contactId: number` 를 받는 유틸이 있으면 확인.
- `src/app/worker/_components/OfficeContactCard.tsx`, `StaffContactCard.tsx` — Props 의 `onContextMenu?: (contactId: Contact['id'], x, y) => void` / `onMemo?: (contactId: Contact['id']) => void` 는 자동 전파. 단 `setContextMenuContact` 같은 내부 state 의 number 리터럴은 수정.
- `src/app/worker/dashboard/page.tsx` — state: `contextMenuContact` 가 Contact 객체를 담는 경우 영향 없음. id 를 별도 state 로 관리한다면 `string | null`.
- `src/components/ContactCardToggle.tsx`, `src/components/DeliveredItemCard.tsx` — `contact.id` 사용부 타입 검사.
- `src/app/(admin)/admin/contacts/[id]/page.tsx` — `params.id` 는 이미 `string`. 변경 없음.
- `src/app/(admin)/admin/contacts/[id]/inquiry-type-selector.tsx` — `contactId: number` 로 선언되어 있으면 `string` 으로 변경. PATCH URL 에 그대로 사용되므로 동작 동일.
- `src/app/(admin)/admin/contacts/[id]/delete-button.tsx`, `update-status-button.tsx`, `confirm-button.tsx`, `update-process-stage-button.tsx` — Props 의 `contactId` 타입 확인·수정.
- `src/app/api/contacts/[id]/*` Next.js route handler 는 영향 없음 (URL segment 는 항상 string).

**grep 커맨드로 누락 찾기** (실행 후 결과 기반으로 수정):

```bash
# number 리터럴로 contactId/id 타입을 선언한 곳
grep -rn "contactId:\s*number" src/
grep -rn "contact\.id\s*===\s*[0-9]" src/
grep -rn "id:\s*number" src/app/(admin)/admin/contacts src/app/worker src/components
# Number() 로 id 를 변환하는 잔재
grep -rn "Number(contact" src/
grep -rn "Number(contactId" src/
```

위 grep 에서 잡힌 모든 위치를 검토하여, **Contact 관련 id** 는 `string` 으로 수정. **타임스탬프 관련 Number()** 는 남겨둘 것 (무관).

### 4. 테스트 id mock 전면 교체

**기존 패턴**:

```ts
const contact = { id: 1, company_name: '...', ... };
```

**변경 후**:

```ts
const contact = { id: 'test-contact-001', company_name: '...', ... };
// 또는 UUID 형식 유지가 필요하면
const contact = { id: '11111111-1111-1111-1111-111111111111', company_name: '...', ... };
```

대상 테스트 파일(알려진 목록, `grep -rn "id:\s*[0-9]" src/__tests__/` 로 추가 탐색):

- `src/__tests__/components/ContactCardToggle.test.tsx`
- `src/__tests__/components/ContactTimeline.test.tsx`
- `src/__tests__/worker/OfficeContactCard.test.tsx`
- `src/__tests__/worker/StaffContactCard.test.tsx`
- `src/__tests__/worker/WorkerContextMenu.test.tsx`
- `src/__tests__/` 하위 기타 Contact mock 이 들어간 모든 파일

`Number(contact.id)` 로 assert 하는 테스트는 없어야 한다 — 있으면 string 비교로 전환.

### 5. `useContactTimeline` 훅 테스트 신규 추가

**파일**: `src/__tests__/lib/hooks/useContactTimeline.test.ts` (신규)

**테스트 내용** (최소 2건):

1. **UUID 문자열 입력 → URL 에 NaN 이 없어야 함**
   - Mock `getContactTimeline` (action) 을 spy 로 감시.
   - `useContactTimeline('uuid-abc', { externalExpanded: true })` 호출 시 action 에 `'uuid-abc'` 가 그대로 전달되는지 검증.
   - `Number()` 가 호출되지 않는지 (구현 레벨에서 제거됐는지) 간접 검증.

2. **`externalExpanded=false` 면 fetch 비활성**
   - `enabled: expanded` 계약 유지 검증.

`@tanstack/react-query` 의 `QueryClientProvider` wrapper 는 기존 테스트 패턴(`src/__tests__/components/ContactTimeline.test.tsx` 등) 을 그대로 재사용.

### 6. 런타임 검증 (수동 확인 체크포인트)

AC 커맨드 통과 후, 다음을 **코드 리뷰 시점에 상기**:

- Admin `/admin/contacts/[id]` 상세 페이지 진입 시 **타임라인 섹션이 비어 있지 않아야 한다** (Phase 0 가 기록한 fallback 로직이 실제로 동작).
- Admin `/admin/contacts` 목록에서 카드 펼침 → 타임라인 섹션이 "타임라인 기록이 없습니다" 만 반환하지 않아야 한다.
- Worker `/worker/dashboard` 카드 펼침 → 타임라인 렌더링 확인.

이 phase 의 자동화 AC 는 빌드/타입/테스트 통과이지만, 실제 UI 확인은 Phase 3 직후 종합 검증에서 다시 수행한다.

## Acceptance Criteria

프론트엔드 + NestJS 백엔드 공통 검증:

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

독립적으로 실행 가능하므로 **단일 메시지에 Bash 여러 개로 병렬 실행**해 속도를 높여라:

```bash
# 병렬 예시 (단일 메시지 내 3개 Bash 블록)
pnpm build
npx tsc --noEmit
pnpm test
```

위 3개 모두 통과 시 `tasks/16-classify-cta/index.json` 의 phase 1 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **비즈니스 로직 수정 금지**: 이 phase 는 **타입 정정 + `Number()` 제거** 만 한다. `useContactTimeline` 의 `enabled`, `staleTime`, `gcTime` 등 동작 로직은 변경하지 않는다.
- **테스트 id 교체 시** `String(1) === '1'` 같은 우연한 충돌 회피를 위해 `'test-contact-001'` 등 **영문 prefix 포함 문자열** 을 기본 선택지로 사용.
- **`WorkerNote.id: number` 는 건드리지 말 것** — Contact 와 무관한 별개 엔티티이고 Prisma 에서 `Int` 로 정의되어 있다. Contact 관련 id 만 정정.
- **기존에 `contact.id === Number(x)` 형태의 비교가 있다면** 그냥 `contact.id === x` (string 비교) 로 바꾸라 — `Number(x)` 가 NaN 이면 비교가 항상 false 가 되는 같은 부류의 버그가 잠재.
- **queryKey** (`queryKeys.contacts.timeline(contactId)`) 는 key factory 구현이 `number | string` 을 모두 받는지 확인. 못 받으면 key factory 도 `string` 으로 좁혀라 (단 이 factory 가 다른 곳에서도 쓰이면 영향 범위 추가 확인).
- **기존 테스트를 깨뜨리지 마라**. id 타입 변경으로 회귀 발생한 테스트는 이 phase 내에서 모두 수정한다 — phase 를 넘기지 않는다.
- `pnpm test` 에서 **R2 업로드/다운로드 관련 2건 실패** 는 기존 회귀(이번 task 시작 전부터 존재)일 수 있다. 실패 메시지가 **이 phase 변경과 무관** 하면 error_message 에 "기존 회귀, 이번 phase 무관" 을 명시하고 completed 마킹 가능.
