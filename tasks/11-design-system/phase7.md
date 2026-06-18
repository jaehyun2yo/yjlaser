# Phase 7: 마이그레이션 — Admin 핵심

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/lib/styles/colors.ts` (Phase 2)
- `/src/components/ui/` (Phase 4-5 — 모든 UI 컴포넌트)
- Phase 6에서 마이그레이션된 공통 컴포넌트 변경사항 확인 (git diff)

## 작업 내용

### 대상 디렉토리

`src/app/(admin)/` 중 핵심 모듈:

1. `src/app/(admin)/admin/contacts/` — 문의 관리 (가장 큰 모듈)
2. `src/app/(admin)/admin/work-management/` — 작업 관리
3. `src/app/(admin)/admin/process-board/` — 공정 보드
4. `src/app/(admin)/components/` — Admin 공통 컴포넌트 (AdminNav, MobileNavMenu 등)
5. `src/app/(admin)/layout.tsx`, `error.tsx` — Admin 레이아웃

### 마이그레이션 규칙

Phase 6과 동일한 규칙 적용:

1. **deprecated 색상 키 → 새 시맨틱 키**
2. **dark: 직접 사용 제거** — 이 영역에서 위반 파일:
   - `admin/contacts/ContactDetailModal.tsx` (6건 — `classList.add('dark:ring-*')` 포함)
   - `admin/work-management/delivered/_components/DeliveredItem.tsx` (1건)
3. **BUTTON_STYLES → `<Button>`**
4. **BADGE → `<Badge>`**
5. **INPUT_STYLES → `<Input>`**
6. **MODAL 상수 → `<Modal>` 컴포넌트** (해당되는 경우)

### ContactDetailModal.tsx 특수 처리

이 파일은 `classList.add('dark:ring-red-700')` 등 programmatic dark: 사용이 있다:

```typescript
// BEFORE
revisionSection.classList.add('ring-4', 'ring-red-300', 'dark:ring-red-700');

// AFTER — CSS 변수 기반 ring 색상 사용
revisionSection.classList.add('ring-4', 'ring-error');
```

`ring-error`가 Tailwind에서 작동하려면 `@theme inline`에 등록되어야 한다. Phase 1에서 `--color-error`가 등록되었으므로 `ring-error` 유틸리티가 자동 생성된다.

### 파일별 처리 순서

1. `(admin)/layout.tsx`, `error.tsx` — 레이아웃 먼저
2. `(admin)/components/AdminNav.tsx`, `MobileNavMenu.tsx`
3. `(admin)/admin/contacts/` — 전체 (page.tsx, ContactsList.tsx, ContactDetailModal.tsx, 하위 \_components/)
4. `(admin)/admin/work-management/` — 전체
5. `(admin)/admin/process-board/` — 전체

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 7 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **로직 변경 금지.** 스타일 전환만 수행한다. `ContactDetailModal.tsx`의 `classList.add` 로직은 유지하되, 클래스 문자열만 변경.
- `src/app/(admin)/admin/erp/`, `src/app/(admin)/admin/integration/` 등 나머지 admin 모듈은 이 phase에서 건드리지 마라 — Phase 8에서 처리.
- `src/app/(admin)/admin/page.tsx` (대시보드 메인)는 이 phase에서 처리한다.
- `src/app/(admin)/admin/_components/` (StatsCards, QuickLinks 등)도 이 phase에서 처리한다.
