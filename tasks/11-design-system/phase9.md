# Phase 9: 마이그레이션 — Company + Webhard

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/lib/styles/colors.ts` (Phase 2)
- `/src/lib/styles/webhard.ts` (Phase 3 — 리팩토링된 웹하드 스타일)
- `/src/components/ui/` (Phase 4-5)
- Phase 7-8에서 마이그레이션된 admin 패턴 참조 (git log --oneline -10)

## 작업 내용

### 대상 디렉토리

1. `src/app/company/` — 업체 포탈 (~25개 파일)
   - `company/_components/` — CompanyTopBar, CompanySidebar, CompanyMobileNav, CompanyLayoutClient
   - `company/dashboard/` — 대시보드, 공유 컴포넌트 (BookingSection, StatsCards 등)
   - `company/orders/` — 주문 목록/상세
   - `company/billing/` — 청구서
   - `company/profile/` — 프로필
   - `company/feedback/` — 피드백
   - `company/error.tsx`

2. `src/app/webhard/` — 웹하드 (~35개 파일)
   - `webhard/components/` — 모든 웹하드 컴포넌트
   - `webhard/page.tsx`, `layout.tsx`, `error.tsx`

3. `src/lib/webhard-ui/` — 웹하드 공통 UI (~10개 파일)

### 마이그레이션 규칙

Phase 6-8과 동일:

1. **deprecated 색상 키 → 새 시맨틱 키**
2. **dark: 직접 사용 제거** — 이 영역에서 위반 파일:
   - `company/dashboard/components/shared/BookingSection.tsx` (1건 — gradient)
   - `webhard/components/WebhardFileItem.tsx` (1건 — 주석 내 dark:, 무시 가능)
3. **BUTTON_STYLES → `<Button>`**
4. **BADGE → `<Badge>`**
5. **INPUT_STYLES → `<Input>`**

### Company 영역 특수 처리

`company/dashboard/components/shared/BookingSection.tsx`의 gradient:

```typescript
// BEFORE
className={`bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/80 dark:to-gray-800/50 ...`}

// AFTER — gradient는 CSS 변수로 완벽히 처리하기 어려우므로 BG_COLOR 상수로 대체
className={`${BG_COLOR.gradientCard} ...`}
```

`BG_COLOR.gradientCard`가 Phase 2에서 deprecated로 매핑되었다면 새 키로 변경. gradientCard가 새 키에 없으면 그대로 유지해도 된다.

### Webhard 영역 특수 처리

- `WEBHARD_STYLES`, `FOLDER_TREE`, `BADGE_STYLES`는 Phase 3에서 이미 리팩토링됨
- 웹하드 컴포넌트에서 이 상수들의 사용은 그대로 유지 — 값만 Phase 3에서 새 토큰으로 변경되었으므로
- `webhard/components/` 파일에서 직접 사용되는 deprecated 색상 키만 변경

### lib/webhard-ui 처리

`src/lib/webhard-ui/components/` — 이 디렉토리의 파일들도 동일한 규칙으로 마이그레이션:

- VirtualFileList.tsx, Toolbar.tsx, SearchDropdown.tsx 등
- deprecated 키 → 새 키
- 가능하면 `<Button>`, `<Input>` 등 컴포넌트 전환

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 9 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **웹하드 기존 테스트를 깨뜨리지 마라.** `src/tests/unit/components/webhard/`와 `src/app/webhard/__tests__/`에 기존 테스트가 많다. 마이그레이션 후 반드시 테스트 통과를 확인하라.
- **Socket.IO 관련 코드를 건드리지 마라.** 웹하드 실시간 동기화 로직은 스타일과 무관.
- **DxfPreviewModal, DownloadProgressModal 등 모달은 `<Modal>` 컴포넌트로 전환 가능하면 전환.** 불가능하면 스타일만 새 토큰으로 변경.
- **VirtualizedFileList, VirtualFileList**: 가상화 관련 로직에 영향을 주지 마라. className만 변경.
- gradient 패턴 (`bg-gradient-to-*`)은 CSS 변수로 완벽 대체가 어렵다. 이 경우 기존 값을 그대로 유지하거나 BG_COLOR 상수를 사용하라.
