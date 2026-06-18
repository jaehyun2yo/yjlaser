# Phase 4: worker-created-at

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — 이번 task의 설계 문서
- `docs/specs/features/design-system.md` — UI 스타일 규칙 (CSS 토큰)
- `docs/specs/features/worker-portal.md` — Worker 대시보드 UX
- `docs/testing.md` — 테스트 전략
- `/tasks/15-inquiry-classification-ux/docs-diff.md` — Phase 0 문서 변경 기록

이전 phase 산출물 확인:

- `src/app/(admin)/admin/contacts/_lib/utils.ts` — `formatCreatedAt` export (Phase 1에서 추출됨)
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` (Phase 1)

코드 레퍼런스 (수정 대상):

- `src/app/worker/_components/OfficeContactCard.tsx` — 생성시간 미표시 상태
- `src/app/worker/_components/StaffContactCard.tsx` — 동일

레퍼런스 (참조만):

- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — 기존 admin의 생성시간 표시 패턴 (포맷 참고)
- `src/lib/styles.ts` — TEXT_COLOR.muted 토큰

## 작업 내용

### 1. `OfficeContactCard.tsx` 생성시간 추가

파일: `src/app/worker/_components/OfficeContactCard.tsx`

**추가 위치**: 업체명 아래의 `webhard_folder_path` 라인 (237~241줄).

현재 구조:

```tsx
{
  contact.webhard_folder_path && (
    <p className={`text-xs truncate ${urgent ? 'text-white/60' : 'text-gray-400'}`}>
      {contact.webhard_folder_path}
    </p>
  );
}
```

변경 구조: **경로 + 생성시간을 같은 줄 (flex)** 또는 **경로 바로 오른쪽에 · 구분자로 inline**:

```tsx
<div className="flex items-center gap-2 min-w-0">
  {contact.webhard_folder_path && (
    <p className={`text-[10px] truncate ${urgent ? 'text-white/60' : 'text-gray-400'} min-w-0`}>
      {contact.webhard_folder_path}
    </p>
  )}
  <span className={`text-[10px] flex-shrink-0 ${urgent ? 'text-white/60' : 'text-gray-400'}`}>
    {formatCreatedAt(contact.created_at)}
  </span>
</div>
```

**핵심 규칙**:

- `formatCreatedAt` import: `@/app/(admin)/admin/contacts/_lib/utils` 경로에서
- 폰트 크기: `text-[10px]` (작게)
- 긴급(`urgent`) 대비 색상 유지 (`text-white/60` vs `text-gray-400`)
- 경로가 길어도 생성시간은 `flex-shrink-0`으로 항상 보임
- 경로가 없으면 생성시간만 표시 (동일 컨테이너)

### 2. `StaffContactCard.tsx` 생성시간 추가

파일: `src/app/worker/_components/StaffContactCard.tsx`

**추가 위치**: 업체명 아랫줄 메타 정보 영역. OfficeContactCard와 **동일한 패턴**으로 적용. 파일 내 `webhard_folder_path` 또는 이에 준하는 라인을 찾아 같은 flex 컨테이너로 감싸고 `formatCreatedAt(contact.created_at)` 표시.

파일 구조가 다르면 업체명(`contact.company_name`) 아래에 새 라인을 추가해서 생성시간만 단독으로 표시 (경로가 없는 UI라면).

### 3. 테스트

위치: `src/__tests__/worker/OfficeContactCard.test.tsx` (신규 또는 기존 확장)

테스트 케이스:

1. `contact.created_at = '2026-03-23T09:03:00Z'` → "3/23 오전" 포함 문자열이 DOM에 렌더
2. `webhard_folder_path`가 있을 때 경로와 생성시간이 같은 flex 컨테이너에 렌더
3. `webhard_folder_path`가 없을 때도 생성시간 렌더

위치: `src/__tests__/worker/StaffContactCard.test.tsx` (신규 또는 기존 확장)

테스트 케이스:

1. `contact.created_at` → `formatCreatedAt` 결과가 DOM에 포함

테스트는 타임존 의존 안 되게 `new Date(ISO)` 결과가 로컬시간으로 변환되는 점 감안. 필요 시 `jest.useFakeTimers` 또는 로컬 시간대 가정.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="OfficeContactCard|StaffContactCard"
```

이후 전체 회귀:

```bash
pnpm test
```

## AC 검증 방법

모두 통과 시 `/tasks/15-inquiry-classification-ux/index.json`의 phase 4 status를 `"completed"`로 변경. 3회 실패 시 `"error"` + `"error_message"` 기록.

## 주의사항

- **Admin 카드(`ContactCardHeader.tsx`)의 기존 생성시간 표시는 건드리지 마라.** 이미 동일 기능이 있고, Phase 1에서 import만 교체했다.
- `formatCreatedAt`은 **Phase 1에서 추출된 utils를 import**하여 사용. 로컬에서 재정의 금지.
- 긴급(`urgent === true`) 카드의 색상 대비 규칙 유지 (`text-white/60`).
- 모바일 UI에서 경로가 길면 truncate 되도록 `min-w-0` + `truncate` 필수.
- 기존 카드의 다른 레이아웃(작업자 노트, 분할 하위 카드 등) 건드리지 마라.
- `dark:` 클래스 금지, `@/` import.
- 기존 테스트 회귀 없어야 함.
