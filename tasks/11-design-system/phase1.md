# Phase 1: CSS 변수 토큰 시스템

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md` (Phase 0에서 생성된 스펙)
- `/tasks/11-design-system/docs-diff.md` (이번 task의 문서 변경 기록)
- `/src/app/globals.css` (현재 CSS 변수 및 @theme 설정)
- `/src/lib/styles/colors.ts` (현재 색상 상수 — 이해용, 수정하지 않음)

## 작업 내용

### 1. `src/app/globals.css` 수정

기존 CSS 변수와 `@theme` 블록을 확장한다. **기존 shadcn CSS 변수(`--card`, `--foreground`, `--muted` 등)는 그대로 유지**하고, 프로젝트 전용 시맨틱 토큰을 추가한다.

#### 1-1. `:root` 블록에 추가할 CSS 변수

```css
:root {
  /* === 기존 shadcn 변수 유지 === */

  /* === Brand Colors === */
  --brand: #ed6c00;
  --brand-hover: #d15f00;
  --brand-light: #fff7ed;
  --brand-foreground: #ffffff;

  /* === Status Colors (Light mode) === */
  --success: oklch(0.55 0.17 145);
  --success-light: oklch(0.96 0.03 145);
  --success-foreground: oklch(0.3 0.1 145);
  --warning: oklch(0.75 0.15 85);
  --warning-light: oklch(0.97 0.03 85);
  --warning-foreground: oklch(0.4 0.1 85);
  --error: oklch(0.55 0.2 25);
  --error-light: oklch(0.96 0.03 25);
  --error-foreground: oklch(0.35 0.15 25);
  --info: oklch(0.55 0.15 250);
  --info-light: oklch(0.96 0.03 250);
  --info-foreground: oklch(0.35 0.12 250);

  /* === Spacing Scale === */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;

  /* === Shadow === */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
}
```

#### 1-2. `.dark` 블록에 추가할 CSS 변수

```css
.dark {
  /* === 기존 shadcn 다크모드 변수 유지 === */

  /* === Brand Colors (Dark mode) === */
  --brand: #ff8533;
  --brand-hover: #ed6c00;
  --brand-light: rgba(237, 108, 0, 0.15);

  /* === Status Colors (Dark mode) === */
  --success: oklch(0.65 0.17 145);
  --success-light: oklch(0.25 0.05 145);
  --success-foreground: oklch(0.75 0.12 145);
  --warning: oklch(0.75 0.15 85);
  --warning-light: oklch(0.25 0.05 85);
  --warning-foreground: oklch(0.8 0.1 85);
  --error: oklch(0.65 0.2 25);
  --error-light: oklch(0.25 0.05 25);
  --error-foreground: oklch(0.75 0.15 25);
  --info: oklch(0.65 0.15 250);
  --info-light: oklch(0.25 0.05 250);
  --info-foreground: oklch(0.75 0.12 250);

  /* === Shadow (Dark mode) === */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.2);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.2);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.2);
}
```

#### 1-3. `@theme inline` 블록 확장

기존 `@theme inline` 블록에 새 토큰을 추가한다:

```css
@theme inline {
  /* === 기존 항목 유지 === */

  /* === Brand === */
  --color-brand: var(--brand);
  --color-brand-hover: var(--brand-hover);
  --color-brand-light: var(--brand-light);
  --color-brand-foreground: var(--brand-foreground);

  /* === Status === */
  --color-success: var(--success);
  --color-success-light: var(--success-light);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-light: var(--warning-light);
  --color-warning-foreground: var(--warning-foreground);
  --color-error: var(--error);
  --color-error-light: var(--error-light);
  --color-error-foreground: var(--error-foreground);
  --color-info: var(--info);
  --color-info-light: var(--info-light);
  --color-info-foreground: var(--info-foreground);

  /* === Spacing === */
  --spacing-1: var(--space-1);
  --spacing-2: var(--space-2);
  --spacing-3: var(--space-3);
  --spacing-4: var(--space-4);
  --spacing-5: var(--space-5);
  --spacing-6: var(--space-6);
  --spacing-8: var(--space-8);
  --spacing-10: var(--space-10);
  --spacing-12: var(--space-12);

  /* === Shadow === */
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
}
```

이로써 다음 Tailwind 유틸리티가 자동 생성된다:

- `text-brand`, `bg-brand`, `border-brand`, `text-brand-hover` 등
- `text-success`, `bg-success-light`, `text-success-foreground` 등
- `text-foreground`, `bg-card`, `text-muted-foreground` (기존 shadcn)

#### 1-4. 기존 `@theme` 블록 유지

`@theme { --color-primary-50 ... --color-primary-900 }` 블록은 그대로 유지한다. 이것은 Tailwind의 primary 색상 팔레트로, brand 토큰과는 별개이다.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **기존 CSS 변수를 삭제하거나 값을 변경하지 마라.** 새 변수를 추가만 한다. 기존 `--card`, `--foreground`, `--muted` 등의 값을 바꾸면 현재 사용 중인 shadcn 패턴 컴포넌트가 깨진다.
- **기존 `@theme { --color-primary-* }` 블록을 수정하지 마라.** brand 토큰은 `--brand`로 별도 정의한다.
- `--brand-foreground`는 `:root`에서 `#ffffff`로, `.dark`에서도 `#ffffff`로 정의한다 (brand 위의 텍스트는 항상 흰색).
- oklch 값은 제시된 것을 참고하되, 실제 Tailwind의 기본 색상 팔레트(green-600, yellow-600, red-600, blue-600)와 시각적으로 유사하도록 조정해도 된다.
- `src/lib/styles/` 하위 파일은 이 phase에서 수정하지 않는다.
