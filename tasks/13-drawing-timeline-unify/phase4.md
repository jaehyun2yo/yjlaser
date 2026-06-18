# Phase 4: CSS — @theme 충돌 해결 및 투명 배경 복구 (css-theme-fix)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md` — 디자인 시스템 토큰 규칙 (CSS 변수 기반, dark: 금지)
- `docs/specs/features/design-system.md` — Phase 0에서 갱신된 Tailwind v4 @theme 토큰 관리 섹션
- `/tasks/13-drawing-timeline-unify/docs-diff.md`

그리고 현재 CSS 상태를 확인하라:

- `src/app/globals.css` — `@theme` 블록 (46-58), `:root` (93-164), `@theme inline` (562-635)
- `src/lib/styles/colors.ts` — `BG_NEW` 정의 (`bg-card`, `bg-background`, `bg-muted`)
- 영향 컴포넌트:
  - `src/app/webhard/components/WebhardSidebar.tsx:185` (`BG_COLOR.card`)
  - `src/app/webhard/components/SearchDropdown.tsx:143, 149, 217` (`BG_COLOR.card`, `BG_COLOR.page`)
  - `src/app/webhard/components/SearchModal.tsx:151, 162, 188` (`BG_COLOR.page`, `BG_COLOR.card`)
  - `src/app/webhard/layout.tsx:22` (`BG_COLOR.page`)

이전 phase 산출물 확인:

- Phase 0 `docs/specs/features/design-system.md` 의 @theme 토큰 관리 섹션

## 작업 내용

### 근본 원인

Tailwind v4에서 `globals.css` 내에 `@theme { }`와 `@theme inline { }`가 동시에 존재할 때, 이후 블록의 매핑이 유틸 생성에 반영되지 않아 `bg-card`, `bg-muted`, `bg-background`, `bg-popover` 등 shadcn semantic 유틸이 생성되지 않음. 결과적으로 해당 클래스가 transparent로 렌더링됨 (실제 유틸 CSS가 존재하지 않으므로 background-color 속성 자체 없음).

### 1. `globals.css` @theme 블록 정리

**파일**: `src/app/globals.css`

**수정 방향**:

1. **기존 `@theme` 블록 (L46-58)** 확장 — 다음 매핑 추가:

   ```css
   @theme {
     /* 기존 --color-primary-50 ~ 900 유지 */

     /* shadcn semantic tokens */
     --color-background: var(--background);
     --color-foreground: var(--foreground);
     --color-card: var(--card);
     --color-card-foreground: var(--card-foreground);
     --color-popover: var(--popover);
     --color-popover-foreground: var(--popover-foreground);
     --color-primary: var(--primary);
     --color-primary-foreground: var(--primary-foreground);
     --color-secondary: var(--secondary);
     --color-secondary-foreground: var(--secondary-foreground);
     --color-muted: var(--muted);
     --color-muted-foreground: var(--muted-foreground);
     --color-accent: var(--accent);
     --color-accent-foreground: var(--accent-foreground);
     --color-destructive: var(--destructive);
     --color-destructive-foreground: var(--destructive-foreground);
     --color-border: var(--border);
     --color-input: var(--input);
     --color-ring: var(--ring);

     /* 기타: chart/sidebar 등 필요 시 추가 */
   }
   ```

2. **기존 `@theme inline` 블록 (L562-635) 제거** — 매핑은 위 `@theme` 블록으로 통합됨. 블록 자체를 삭제.

3. **`:root { }` 변수 정의 (L93-164)는 유지** — `--card`, `--background` 등 실제 값은 여기에 남김. 다크 모드 대응은 `@media (prefers-color-scheme: dark)` 블록 또는 `[data-theme="dark"]` 블록에서 재정의 (기존 방식 유지).

4. **주석 경고 추가**: `@theme` 블록 바로 위에 명확한 주석:
   ```css
   /*
    * Tailwind v4 @theme 토큰 관리:
    * 이 블록에서 shadcn semantic tokens을 --color-*로 매핑합니다.
    * @theme inline 블록을 같은 파일에 추가하지 마세요 —
    * 두 블록이 공존하면 유틸 생성 실패(투명 회귀) 이슈가 있습니다.
    * 회귀 이력: 5a324f9 color-redesign → bg-card transparent 버그.
    * 참조: docs/specs/features/design-system.md
    */
   ```

### 2. 사이드이펙트 스캔

- `grep -r "bg-transparent\|BG_COLOR" src/app/webhard/ src/components/` — 의도적 투명 유지해야 할 곳 확인. 있으면 변경하지 말고 두기.
- `grep -r "bg-card\|bg-muted\|bg-background" src/ --include="*.tsx"` — 모든 사용처 리스트 확인. 수정 후 이들이 정상 렌더되는지 재검증.

### 3. Playwright E2E 시각 회귀 테스트 추가

**파일**: `e2e/webhard-background.spec.ts` (신규)

**목적**: Phase 3에서 추가한 E2E와 별도로, CSS 회귀 방지.

```ts
// 의사코드
test('webhard sidebar background is opaque', async ({ page }) => {
  await loginAsCompany(page); // 기존 helper 재사용
  await page.goto('/webhard');
  const sidebar = page.locator('[data-testid="webhard-sidebar"]').first();
  // or 비슷한 selector - WebhardSidebar 루트에 data-testid 추가 필요 시 phase 내에서 추가
  const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
  // transparent: 'rgba(0, 0, 0, 0)' 또는 ''
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('');
});

test('webhard search dropdown background is opaque', async ({ page }) => {
  // 검색 입력 트리거 → 드롭다운 렌더 → 배경 체크
});

test('webhard search modal background is opaque', async ({ page }) => {
  // 검색 모달 오픈 → 배경 체크
});
```

- `data-testid` 가 없는 컴포넌트에는 phase 내에서 추가 가능. 단 최소화 (sidebar, search dropdown, search modal 각 1개씩만).

### 4. 빌드 산출물 grep 검증

Phase 실행 시 AC 스크립트의 일환으로:

```bash
grep -r "\.bg-card\s*{" .next/static/css/ 2>/dev/null | head -1
grep -r "\.bg-muted\s*{" .next/static/css/ 2>/dev/null | head -1
grep -r "\.bg-background\s*{" .next/static/css/ 2>/dev/null | head -1
```

각 결과가 1줄 이상이어야 Tailwind 유틸이 정상 생성된 것.

### 5. 수동 검증 체크리스트 (Phase 파일 실행자가 수행)

Phase 파일 실행 session이 다음을 `pnpm dev`로 띄워 수동 확인하는 것은 권장하되 필수 아님. 대신 E2E가 회귀 방지.

체크리스트:

- [ ] `/webhard` 사이드바 폴더 트리 배경 불투명
- [ ] 검색 드롭다운 (검색창 타이핑 시) 배경 불투명
- [ ] 검색 모달 오버레이 + 내부 박스 배경 불투명
- [ ] 관리자 페이지 Card 컴포넌트 배경 불투명 (사이드이펙트 없는지)
- [ ] Badge 컴포넌트 배경 불투명

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && grep -r "\.bg-card" .next/static/css/ | head -1 && grep -r "\.bg-muted" .next/static/css/ | head -1 && grep -r "\.bg-background" .next/static/css/ | head -1 && npx playwright test e2e/webhard-background.spec.ts
```

빌드 통과 + 3개 grep 모두 매치 + E2E 3개 테스트 통과.

## AC 검증 방법

위 AC 커맨드 실행. 통과하면 `/tasks/13-drawing-timeline-unify/index.json`의 phase 4 status를 `"completed"`로 변경.
수정 3회 이상 시도해도 실패하면 `"error"` + `error_message` 기록 (실패 상세: 어느 grep이 0줄인지, 어느 E2E 테스트가 실패인지 명시).

## 주의사항

- **`:root` 블록의 `--card`, `--background` 등 shadcn 변수 값은 건드리지 마라.** 유틸 매핑 문제만 수정. 색상 값 자체는 기존 유지.
- `dark:` 클래스 사용 금지 (Hard Rule). 다크 모드 대응은 CSS 변수로만.
- `@theme inline` 블록을 삭제한 후 해당 블록 안의 정의가 `@theme` 블록에 모두 이관되었는지 재확인. 누락되면 일부 유틸이 여전히 transparent.
- `BG_COLOR.card = 'bg-card'` 등 `src/lib/styles/colors.ts`의 정의는 변경하지 마라. Tailwind 유틸이 생성되면 자동으로 작동한다.
- `5a324f9 phase 2 color-redesign` 커밋 이전처럼 `bg-white dark:bg-gray-800` 식 폴백을 추가하지 마라 (Hard Rule 위반).
- Playwright E2E 추가 시 기존 `e2e/` 하위 테스트 설정/helper 패턴 그대로 재사용. 테스트 격리 위해 `test.describe.serial` 금지.
- `data-testid` 추가는 꼭 필요한 컴포넌트 최소 3곳만. 컴포넌트 스타일에 영향 주지 말 것.
- 이 phase는 CSS/E2E 전용. 백엔드/프론트 로직 건드리지 마라. Phase 1-3에서 완료됨.
- 기존 테스트를 깨뜨리지 마라.
