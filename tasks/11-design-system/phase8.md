# Phase 8: 마이그레이션 — Admin 나머지

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/lib/styles/colors.ts` (Phase 2)
- `/src/components/ui/` (Phase 4-5 — 모든 UI 컴포넌트)
- Phase 7에서 마이그레이션된 admin 핵심 모듈 변경사항 확인 (git log --oneline -5)

특히 Phase 7에서 적용된 패턴을 확인하고 동일한 방식으로 진행하라:

- `src/app/(admin)/admin/contacts/` — Phase 7에서 마이그레이션 완료된 파일의 패턴 참조

## 작업 내용

### 대상 디렉토리

`src/app/(admin)/` 중 Phase 7에서 처리하지 않은 모듈:

1. `src/app/(admin)/admin/erp/` — ERP 대시보드, 태스크 관리
2. `src/app/(admin)/admin/integration/` — 외부 연동 (webhard, workers, orders, deliveries 등)
3. `src/app/(admin)/admin/portfolio/` — 포트폴리오 관리
4. `src/app/(admin)/admin/posts/` — 게시글 관리
5. `src/app/(admin)/admin/bookings/` — 예약 관리
6. `src/app/(admin)/admin/companies/` — 업체 관리
7. `src/app/(admin)/admin/feedback/` — 피드백 관리
8. `src/app/(admin)/admin/webhard/` — 웹하드 관리 (logs, performance)
9. `src/app/(admin)/admin/system/` — 시스템 설정
10. `src/app/(admin)/admin/sync-monitor/` — 동기화 모니터
11. 기타 admin 루트 파일: `DashboardClient.tsx`, `NewCompaniesModal.tsx`, `ContactsChartModal.tsx`, `ReferralSourceModal.tsx`, `LoadingTestModal.tsx`

### 마이그레이션 규칙

Phase 6-7과 동일:

1. **deprecated 색상 키 → 새 시맨틱 키**
2. **dark: 직접 사용 제거** — 이 영역에서 위반 파일:
   - `admin/posts/[id]/edit/page.tsx` (2건 — `dark:placeholder-gray-500`)
   - `admin/posts/new/page.tsx` (1건)
   - `admin/integration/webhard/_components/BackupSettings.tsx` (1건)
3. **BUTTON_STYLES → `<Button>`**
4. **BADGE → `<Badge>`**
5. **INPUT_STYLES → `<Input>`**
6. **TABLE 상수 → `<Table>` 컴포넌트** (해당되는 경우)

### posts 편집기 특수 처리

`admin/posts/[id]/edit/page.tsx`와 `admin/posts/new/page.tsx`에서:

```typescript
// BEFORE
className={`... placeholder-gray-400 dark:placeholder-gray-500 ...`}

// AFTER
className={`... placeholder:text-muted-foreground ...`}
```

`placeholder:text-muted-foreground`는 CSS 변수 기반이므로 dark: 없이 자동 전환.

### BackupSettings 특수 처리

토글 스위치 스타일:

```typescript
// BEFORE
checked ? 'bg-[#ED6C00]' : 'bg-gray-300 dark:bg-gray-600';

// AFTER
checked ? 'bg-brand' : 'bg-muted';
```

가능하면 `<Switch>` 컴포넌트로 대체.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 8 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **Phase 7에서 처리한 파일을 다시 수정하지 마라.** contacts, work-management, process-board, layout, admin 공통 컴포넌트는 건드리지 않는다.
- **Lexical 에디터 관련 코드는 건드리지 마라.** posts 편집기의 Lexical 관련 import, 설정은 그대로 유지.
- integration 모듈은 파일 수가 많다. `_components/` 디렉토리를 먼저 처리하고, 개별 page.tsx 파일을 처리하라.
- `admin/erp/dashboard/_components/TaskCard.tsx`, `KanbanColumn.tsx` 등은 DnD 로직이 있을 수 있다. 스타일만 변경하고 드래그 관련 로직은 건드리지 마라.
