# Contact Urgent UI (긴급 문의 시각화)

## 1. 개요

- 목적: `contacts.is_urgent=true` 로 표시된 긴급 문의를 Admin/Worker 카드에서 **동일한 overlay 패턴**으로 노출한다. 카드 전체의 배경/테두리를 붉게 바꾸는 기존 방식은 시각 소음이 크고, 타 배지(분류/공정 단계)의 색상 의미를 가린다는 피드백에 대한 대응이다.
- 도메인: CRM > 문의 관리 > 카드 시각화
- 범위:
  - Admin: `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx`
  - Worker: `src/app/worker/_components/OfficeContactCard.tsx`, `StaffContactCard.tsx`
- 데이터 모델: **변경 없음** — 기존 `Contact.is_urgent`(boolean) / `Contact.urgent_at`(TimestampTZ) 재사용.

## 2. 규칙

- 카드 컨테이너의 background / border 는 긴급 여부와 무관하게 기존 스타일을 유지한다 (`bg-white border border-gray-200`). **컨테이너 시각 변경 금지.**
- 긴급(`is_urgent === true`) 시 카드 **header 영역**에 붉은 "긴급" 배지 1개를 **최우선 순서**로 노출한다.
  - 배지 색상: `bg-red-600 text-white`.
  - 내부 구성: `[Siren 아이콘] "긴급"` 순서.
  - 사이즈/레이아웃: 다른 header 배지(분류, 공정 단계, inquiry_number, 생성시간)와 동일한 line-height 에서 `flex-shrink-0` 유지, wrap 허용.
- 사이렌 아이콘
  - 라이브러리: `lucide-react` `Siren`.
  - 클래스: `w-3 h-3 animate-pulse`.
  - emoji(🚨 등) 사용 금지 — 라인 높이 불일치 및 폰트 의존 문제 방지.
- 분류 배지(`InquiryTypeBadge`), 공정 단계 배지, `inquiry_number`, 생성시간(`formatCreatedAt`) 등 **그 외 요소는 긴급 여부와 무관하게 기존 스타일을 그대로 사용**한다.
- Worker 카드에 남아있던 조건부 스타일 — `urgent ? 'bg-red-500' : ...`, `text-white/60`, `text-white/80`, `bg-white/20`, `bg-white/10` 등 — 은 **전부 제거**한다. 생성시간 텍스트는 일반 카드와 동일하게 `text-gray-400`(단일 토큰)만 적용.
- `is_urgent === false` 또는 `null` 인 경우: 긴급 관련 요소(배지, 아이콘, 조건부 스타일)를 **전부 미렌더**한다.
- 긴급 배치/해제 자체의 작업자와 시각은 카드 UI가 아니라 통합 타임라인의 `urgent_toggle` 이력으로 표시한다.

## 3. 컴포넌트 구성

- 초기 구현은 각 카드에 **인라인 렌더** 한다 (Admin `ContactCardHeader`, Worker `OfficeContactCard`, Worker `StaffContactCard` — 3곳).
- 렌더 패턴이 3곳 이상에서 실제로 **중복/분기 없이 동일**하게 안정화되면, 공용 `UrgentBadge` 로 추출을 검토. 현 단계(task 17 Phase 5)에서는 추출하지 않는다.
- 공용 추출 시 배치 예정 경로: `src/components/contacts/UrgentBadge.tsx`.

## 4. 불변 규칙

1. **긴급 시각화는 overlay 전용.** 카드 컨테이너의 background·border 를 조건부로 변경하지 않는다. 이전 `OfficeContactCard` 의 `urgent ? 'bg-red-500'` 패턴은 부활 금지.
2. **사이렌 아이콘은 `lucide-react` `Siren` 로 통일.** emoji 사용 금지.
3. **`is_urgent === false | null` 일 때 긴급 요소 전부 미렌더.** "긴급 해제됨" 같은 보조 문구·상태 뱃지도 카드 UI 에 표시하지 않는다 (이력은 타임라인에서 별도 노출).
4. **배지 색상**은 `bg-red-600 text-white` 고정. 공정/분류 배지와의 의미 충돌을 피하기 위해 다른 붉은 톤(rose/pink 등) 사용 금지.
5. **카드 본문 텍스트 컬러 분기 금지.** `text-white/60`, `text-white/80` 등 긴급 전용 투명도 토큰을 재도입하지 않는다. 본문 가독성은 일반 `text-gray-*` 토큰으로 통일.

## 5. 디자인 시스템 준수

- `dark:` 클래스 사용 금지 (design-system.md §Rules-1) — CSS 변수 기반 토큰이 light/dark 를 자동 처리한다. 긴급 배지의 `bg-red-600 text-white` 도 dark 모드에서 그대로 유지되도록 Tailwind 네이티브 색상을 사용한다 (시맨틱 토큰 `BADGE.danger` 등이 추후 추가되면 마이그레이션 검토).
- `animate-pulse` 는 사이렌 아이콘에만 국한 적용. 배지 컨테이너 자체에는 pulse 적용 금지 (inquiry-classification-ux.md §5-3 원칙과 일관).

## 6. 참조

- `src/app/worker/_components/OfficeContactCard.tsx` — Phase 5 조건부 urgent 배경/텍스트 스타일 제거 대상.
- `src/app/worker/_components/StaffContactCard.tsx` — Phase 5 조건부 urgent 배경/텍스트 스타일 제거 대상.
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — Phase 5 긴급 배지 overlay 추가 위치. 기존 배지 배열(분류/공정/inquiry_number/생성시간) 앞에 삽입.
- `webhard-api/prisma/schema.prisma` 의 Contact 모델 `is_urgent` / `urgent_at` 필드 — 스키마 변경 없음.
- `docs/specs/features/inquiry-classification-ux.md` §5-3, §9 — pulse/ring 금지 원칙 (긴급 배지도 동일 원칙 준수).
- `docs/specs/features/design-system.md` — `dark:` 금지, 시맨틱 토큰 우선 규칙.
