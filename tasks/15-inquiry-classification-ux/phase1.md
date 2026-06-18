# Phase 1: badge-refactor

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — 이번 task의 설계 문서 (Phase 0 산출물)
- `docs/specs/features/design-system.md` — UI 스타일 규칙 (CSS 변수 토큰, BADGE/BG_COLOR)
- `docs/testing.md` — 테스트 전략 (순수 로직 중심)
- `/tasks/15-inquiry-classification-ux/docs-diff.md` — Phase 0 문서 변경 기록

이전 phase의 작업물을 확인하라:

- `docs/specs/features/inquiry-classification-ux.md` (Phase 0에서 생성됨)

코드 레퍼런스 (수정 대상 및 참조):

- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — 리팩토링 대상
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — `formatCreatedAt` 원본 함수 (30~41줄)
- `src/app/(admin)/admin/contacts/_lib/utils.ts` — 유틸 이동 타겟
- `src/lib/styles.ts` — BADGE, BG_COLOR, TRANSITION_STYLES 등 토큰
- `src/lib/types/contact.ts` — `InquiryType` 타입

## 작업 내용

### 1. `formatCreatedAt` 유틸 추출

`src/app/(admin)/admin/contacts/_lib/utils.ts`에 아래 함수 export 추가:

```ts
/** 등록일시를 한국어 형식으로 포맷 (예: 3/23 오전 9시 3분) */
export function formatCreatedAt(dateStr: string): string;
```

구현체는 `ContactCardHeader.tsx`의 기존 함수를 그대로 이동. 구현 후 `ContactCardHeader.tsx`에서 이 import로 교체하고, 로컬 함수 정의는 제거.

**핵심 규칙**: `hours === 0`은 "오전 12시"로, `hours === 12`는 "오후 12시"로. `minutes === 0`이면 "~시"만 출력.

### 2. `InquiryTypeBadge.tsx` 리팩토링

파일: `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx`

**변경점**:

- 기존 "미분류 드롭다운 버튼 + 메뉴" 제거
- 미분류(`!contact.inquiry_type && contact.source === 'webhard'`) 상태일 때 **인라인 2버튼** 렌더:
  - `[칼선의뢰]` — `BADGE.info` 계열, 클릭 시 `cutting_request`로 PATCH
  - `[목형의뢰]` — `BADGE.success` 계열, 클릭 시 `mold_request`로 PATCH
  - 각 버튼에 pulse 강조(예: `animate-pulse ring-2 ring-orange-300`)로 주의 환기 유지
  - 두 버튼은 `flex gap-1 flex-shrink-0`로 나란히. 헤더 좁을 때 wrap 허용
- 분류된 상태(`cutting_request` / `mold_request` / `laser_cutting`), 웹사이트 문의(`!inquiry_type && source !== 'webhard'`)는 **기존 읽기 전용 배지 로직 유지**
- `isPending` 동안은 해당 버튼만 spinner로 교체 (또는 두 버튼 모두 disabled)
- `handleSelect` optimistic update + rollback + queryKeys.contacts.all / processBoard.all invalidate 로직 **그대로 유지**
- 외부 인터페이스(Props) 변경 없음 → Admin `ContactCard` + Worker `OfficeContactCard` 양쪽 자동 반영

**유지할 로직 (절대 깨지 마라)**:

- `statusMap: { cutting_request: 'drawing', mold_request: 'confirmed', laser_cutting: 'cutting' }` — optimistic update에서 status도 함께 변경
- API 실패 시 previousData / previousBoardData rollback
- Worker processBoard에서 즉시 제거 → refetch로 올바른 탭에 등장

### 3. 테스트 작성

위치: `src/__tests__/components/InquiryTypeBadge.test.tsx` (신규)

테스트 케이스:

1. `contact.source === 'webhard' && !contact.inquiry_type`이면 "칼선의뢰"/"목형의뢰" 2버튼 렌더링
2. "칼선의뢰" 클릭 시 `fetch`가 `/api/contacts/{id}/inquiry-type` PATCH + body `{ inquiry_type: 'cutting_request' }`로 호출
3. "목형의뢰" 클릭 시 body `{ inquiry_type: 'mold_request' }`로 호출
4. `contact.inquiry_type === 'cutting_request'`이면 읽기 전용 "칼선의뢰" 배지만 렌더 (버튼 없음)
5. `contact.inquiry_type === 'mold_request'`이면 읽기 전용 "목형의뢰" 배지만 렌더
6. 웹사이트 문의(`source !== 'webhard' && !inquiry_type`)는 "문의접수" 배지 렌더
7. API 400 응답 시 optimistic 상태 rollback (이전 상태로 복원) — happy-path + 4xx 만

테스트 라이브러리: Jest + `@testing-library/react`. `fetch`는 `global.fetch`를 `jest.fn()`으로 mock.

위치: `src/__tests__/lib/formatCreatedAt.test.ts` 또는 `src/__tests__/admin-contacts/formatCreatedAt.test.ts` (기존 `__tests__` 디렉토리 구조 확인 후 가장 어울리는 곳)

테스트 케이스:

1. `new Date('2026-04-17T09:03:00').` → "4/17 오전 9시 3분"
2. `hours === 0` → "오전 12시..."
3. `hours === 12` → "오후 12시..."
4. `minutes === 0` → "시"로 종료 (분 생략)

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="InquiryTypeBadge|formatCreatedAt"
```

이후 전체 테스트 회귀 확인:

```bash
pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행해서 모두 통과하면 `/tasks/15-inquiry-classification-ux/index.json`의 phase 1 status를 `"completed"`로 변경하라. 수정 3회 이상 시도해도 실패 시 `"error"` + `"error_message"` 기록.

## 주의사항

- `InquiryTypeBadge`의 Props 인터페이스는 그대로 유지. 외부 사용처 영향 금지.
- 기존 `isLaserCutting`(레이저가공 배지) 분기 삭제 금지. `laser_cutting`은 여전히 읽기 전용 배지로 유지.
- `_lib/utils.ts`에서 기존 유틸(`getStatusBadgeClass`, `getStatusLabel`, `shouldShowSecondaryInfo` 등)을 건드리지 마라.
- `ContactCardHeader.tsx`의 로컬 `formatCreatedAt` 제거 후 import 대체. 함수 시그니처/반환값 동일 유지 → 헤더 렌더 결과 변경 없어야 함.
- 디자인 시스템 규칙: `dark:` 클래스 사용 금지, `@/lib/styles` 토큰 사용, `@/` 절대경로 import.
- 기존 테스트를 깨뜨리지 마라. 특히 `ContactCardHeader`/`ContactCard` 렌더링 스냅샷 테스트가 있다면 업데이트.
