# Phase 2: 프론트엔드 타입 수정 + InquiryTypeBadge

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (루트 + yjlaser_website)
- `docs/specs/features/laser-only-company-inquiry.md`
- `/tasks/6-laser-only/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/prisma/schema.prisma` — LaserOnlyMapping 모델 추가됨
- `webhard-api/src/companies/laser-only-mapping.service.ts` — 신규 서비스
- `webhard-api/src/integration/orders/auto-contact.service.ts` — isLaserOnlyFolder 체크 추가됨

아래 프론트엔드 코드를 반드시 읽어라:

- `src/lib/types/contact.ts` — Contact 타입, ContactStatus, InquiryType, StatusCounts
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — 문의 유형 뱃지
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — 카드 헤더 (뱃지 사용)
- `src/app/(admin)/admin/contacts/_lib/utils.ts` — getStatusBadgeClass
- `src/app/(admin)/admin/contacts/_lib/constants.ts` — STATUS_FILTERS, INQUIRY_TYPE_FILTERS
- `src/lib/styles.ts` — BADGE 상수 (BADGE.gray, BADGE.info, BADGE.success 등)
- `src/lib/utils/statusLabels.ts` — STATUS_LABELS

## 작업 내용

### 1. `src/lib/types/contact.ts` 타입 수정

**ContactStatus 타입에 `completed` 추가:**

현재:

```typescript
export type ContactStatus =
  | 'received'
  | 'drawing'
  | 'confirmed'
  | 'production'
  | 'cutting'
  | 'finishing'
  | 'delivering'
  | 'delivered'
  | 'on_hold';
```

변경:

```typescript
export type ContactStatus =
  | 'received'
  | 'drawing'
  | 'confirmed'
  | 'production'
  | 'cutting'
  | 'finishing'
  | 'delivering'
  | 'delivered'
  | 'completed'
  | 'on_hold';
```

**InquiryType에 `laser_cutting` 추가:**

현재:

```typescript
export type InquiryType = 'cutting_request' | 'mold_request';
```

변경:

```typescript
export type InquiryType = 'cutting_request' | 'mold_request' | 'laser_cutting';
```

**StatusCounts에 `completed` 추가:**

현재:

```typescript
export interface StatusCounts {
  all: number;
  received: number;
  drawing: number;
  confirmed: number;
  production: number;
  cutting: number;
  finishing: number;
  delivered: number;
  on_hold: number;
}
```

변경:

```typescript
export interface StatusCounts {
  all: number;
  received: number;
  drawing: number;
  confirmed: number;
  production: number;
  cutting: number;
  finishing: number;
  delivered: number;
  completed: number;
  on_hold: number;
}
```

### 2. `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` 수정

**laser_cutting 케이스 추가.** 기존 `isCuttingRequest`, `isMoldRequest` 판별 패턴을 따른다.

변수 추가:

```typescript
const isLaserCutting = contact.inquiry_type === 'laser_cutting';
```

조건문 수정 — `isLaserCutting`을 체크 대상에 포함:

```typescript
if (
  !isUnclassified &&
  !isWebsiteInquiry &&
  !isCuttingRequest &&
  !isMoldRequest &&
  !isLaserCutting
) {
  return null;
}
```

렌더링 분기 추가 — `isMoldRequest` 블록 바로 아래에:

```typescript
// 레이저가공 라벨
if (isLaserCutting) {
  return (
    <span className={`${BADGE.gray} flex-shrink-0 ${TRANSITION_STYLES.colors}`}>레이저가공</span>
  );
}
```

**INQUIRY_TYPE_OPTIONS에는 추가하지 마라.** 레이저가공은 미분류 문의에서 수동 선택하는 유형이 아니라 자동 분류되는 유형이다.

### 3. `src/app/(admin)/admin/contacts/_lib/utils.ts` 확인

`getStatusBadgeClass` 함수에 `completed` 상태의 스타일이 있는지 확인하라. 없으면 추가:

```typescript
case 'completed':
  return '...'; // 기존 delivered와 유사한 완료 스타일 (녹색 계열)
```

이미 있으면 수정하지 마라.

### 4. 기존 StatusCounts 사용처 확인

`StatusCounts` 인터페이스에 `completed`를 추가하면, 이 인터페이스를 사용하는 곳에서 타입 에러가 날 수 있다. `tsc --noEmit`으로 확인하고, 에러가 나는 곳에서 completed 카운트를 적절히 처리하라 (보통 API 응답에서 값을 받거나, 0으로 초기화).

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/6-laser-only/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **백엔드 코드는 수정하지 마라.** 이 phase는 프론트엔드만 다룬다.
- BADGE.gray를 사용하라. 커스텀 색상을 만들지 마라.
- InquiryTypeBadge에서 laser_cutting은 **정적 뱃지**다. 미분류처럼 드롭다운을 추가하지 마라.
- INQUIRY_TYPE_OPTIONS 배열에 laser_cutting을 추가하지 마라 (수동 선택 유형이 아님).
- `dark:` 클래스를 사용하지 마라. BADGE 상수가 다크모드를 자동 처리한다.
- 기존 테스트를 깨뜨리지 마라.
