# Phase 5: docs-sync

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 산출물 (설계 의도)
- `docs/changelog/CHANGELOG.md` — 변경 이력 양식
- `docs/features-list.md` (있다면) — 기능 현황판
- `docs/testing.md`
- `/tasks/15-inquiry-classification-ux/docs-diff.md` — Phase 0 문서 변경 기록

이전 phase 산출물을 **모두** 확인하라:

- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` (Phase 1)
- `src/app/(admin)/admin/contacts/_lib/utils.ts` (Phase 1, `formatCreatedAt` 추가)
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` (Phase 1, 로컬 함수 제거)
- `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` (Phase 2 신규)
- `src/app/(admin)/admin/contacts/_components/ContactCard.tsx` (Phase 2, 우클릭 통합)
- `src/app/worker/_components/WorkerContextMenu.tsx` (Phase 3 확장)
- `src/app/worker/dashboard/page.tsx` (Phase 3)
- `src/app/worker/_components/OfficeContactCard.tsx` (Phase 4)
- `src/app/worker/_components/StaffContactCard.tsx` (Phase 4)

## 작업 내용

이 phase는 **코드 구현이 아니라 문서 동기화 전용**이다.

### 1. 실제 코드 vs Spec 비교

Phase 1~4에서 변경된 모든 코드를 읽고 `docs/specs/features/inquiry-classification-ux.md` 내용과 비교:

- 인터페이스, props, 파일 경로가 spec과 일치하는가
- 불일치가 있다면 **코드가 아닌 spec을 수정** (코드는 이미 AC 통과한 최종 산출물)
- 추가된 공개 export, 유틸, 컴포넌트를 spec에 반영

### 2. API/DB Spec 확인

- `docs/specs/api/nextjs-routes.md` — `/api/contacts/[id]/inquiry-type` 항목에 변경사항(재분류 시 confirm 경고 UX) 주석 추가 (스키마 변경 없음)
- `docs/specs/db/prisma-tables.md` — 변경 없으면 생략
- `docs/specs/api/endpoints/webhard.md` 또는 기타 연관 endpoint — 영향 없으면 생략

### 3. CHANGELOG 엔트리 추가

파일: `docs/changelog/CHANGELOG.md`

다음 형식으로 엔트리 추가 (기존 엔트리 양식에 맞춰):

```markdown
## [Unreleased] — 2026-04-17

### Changed

- 미분류 문의 카드 UX 개선: 기존 "미분류" 드롭다운 배지 → 인라인 `[칼선의뢰] [목형의뢰]` 2버튼 (1-click 분류)
- 분류된 카드 재분류 경로 추가: 우클릭(데스크톱) / long-press(모바일) 컨텍스트 메뉴
  - Admin: `ContactContextMenu` 신규
  - Worker: `WorkerContextMenu`에 재분류 섹션 확장
- 재분류 시 `status !== 'received'`이면 confirm 경고 (공정 상태도 함께 변경됨을 고지)

### Added

- Worker `OfficeContactCard` / `StaffContactCard`에 문의 생성시간 표시 (포맷: `3/23 오전 9시 3분`)
- `formatCreatedAt` 유틸을 `_lib/utils.ts`로 추출 (admin + worker 공용)
```

### 4. features-list 갱신 (파일이 있다면)

`docs/features-list.md` 내 문의/Contact 항목이 있다면:

- "미분류 UX" 또는 "재분류" 관련 항목을 "완료" 상태로
- 파일이 없거나 해당 항목이 없으면 생략

### 5. CLAUDE.md 확인 (파일이 있다면)

`yjlaser_website/CLAUDE.md` 또는 `.claude/CLAUDE.md`에 이번 변경이 영향 주는 컨벤션(예: 공용 컨텍스트 메뉴 패턴)을 추가할 만한지 검토. 불필요하면 생략.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

- 마크다운 파일 변경만 있어야 하므로 `pnpm test`는 생략 가능하지만 회귀 확인용으로 한 번 실행:

```bash
pnpm test
```

## AC 검증 방법

위 AC 통과 시 `/tasks/15-inquiry-classification-ux/index.json`의 phase 5 status를 `"completed"`로 변경. 3회 실패 시 `"error"` + `"error_message"` 기록.

## 주의사항

- **코드 파일(`.ts`, `.tsx`)은 수정하지 마라.** 문서 동기화 phase이다.
- 실제 구현된 코드와 spec이 다르면 **spec을 실제 구현에 맞춰 수정**. 코드를 뒤집지 마라 (AC 이미 통과됨).
- CHANGELOG 엔트리는 한글. 날짜는 `2026-04-17` 고정 (이 task의 created_at 기준).
- 기존 CHANGELOG 엔트리 덮어쓰기 금지.
- `docs/specs/features/inquiry-classification-ux.md`에 추가 정보만 append하고 기존 섹션 구조 유지.
