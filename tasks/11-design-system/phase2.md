# Phase 2: 색상 상수 재설계 + Backward Compatibility

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/app/globals.css` (Phase 1에서 추가된 CSS 변수와 @theme 토큰)
- `/src/lib/styles/colors.ts` (현재 상태 — 전체를 읽어라)
- `/src/lib/styles/index.ts` (re-export 구조)

## 작업 내용

### 1. `src/lib/styles/colors.ts` 재작성

이 파일을 완전히 재작성한다. 구조:

```typescript
/**
 * Color System - CSS 변수 기반 시맨틱 색상 토큰
 *
 * 규칙:
 * 1. 새 코드는 NEW 섹션의 키만 사용
 * 2. DEPRECATED 섹션은 마이그레이션 완료 후 제거 예정
 * 3. dark: 접두사 사용 금지 — CSS 변수가 자동 처리
 */

// ──────────────────────────────────────────────
// NEW: 시맨틱 토큰 (~45개)
// ──────────────────────────────────────────────

const TEXT_NEW = { ... } as const;
const BG_NEW = { ... } as const;
const BORDER_NEW = { ... } as const;
const DIVIDE_NEW = { ... } as const;
const RING_NEW = { ... } as const;

// ──────────────────────────────────────────────
// DEPRECATED: 기존 키 → 새 키 매핑 (backward compat)
// ──────────────────────────────────────────────

const TEXT_DEPRECATED = { ... } as const;
const BG_DEPRECATED = { ... } as const;
const BORDER_DEPRECATED = { ... } as const;

// ──────────────────────────────────────────────
// EXPORT: 새 키 + deprecated alias 합성
// ──────────────────────────────────────────────

export const TEXT_COLOR = { ...TEXT_NEW, ...TEXT_DEPRECATED } as const;
export const BG_COLOR = { ...BG_NEW, ...BG_DEPRECATED } as const;
export const BORDER_COLOR = { ...BORDER_NEW, ...BORDER_DEPRECATED } as const;
export const DIVIDE_COLOR = { ...DIVIDE_NEW } as const;
export const RING_COLOR = { ...RING_NEW } as const;
export const COLORS = { ... } as const;
```

### 2. TEXT_NEW 키 정의 (~20개)

CSS 변수 기반 Tailwind 유틸리티를 사용한다. `dark:` 접두사가 필요 없다 — CSS 변수가 자동으로 다크모드를 처리한다.

```typescript
const TEXT_NEW = {
  // === Gray Scale ===
  primary: 'text-foreground', // 기본 텍스트
  secondary: 'text-muted-foreground', // 보조 텍스트
  muted: 'text-muted-foreground/70', // 희미한 텍스트
  disabled: 'text-muted-foreground/50', // 비활성 텍스트
  white: 'text-white', // 항상 흰색
  inverted: 'text-background', // 반전 (배경색을 텍스트로)

  // === Brand ===
  brand: 'text-brand',
  brandHover: 'hover:text-brand-hover',

  // === Status ===
  success: 'text-success',
  successStrong: 'text-success-foreground',
  warning: 'text-warning',
  warningStrong: 'text-warning-foreground',
  error: 'text-destructive',
  errorStrong: 'text-error-foreground',
  info: 'text-info',
  infoStrong: 'text-info-foreground',

  // === Hover ===
  hoverPrimary: 'hover:text-foreground',
  hoverBrand: 'hover:text-brand',
  hoverError: 'hover:text-destructive',
} as const;
```

**중요**: `text-foreground`는 이미 `@theme inline`에 등록된 `--color-foreground`를 참조한다. `:root`에서는 `oklch(0.145 0 0)` (dark gray), `.dark`에서는 `oklch(0.985 0 0)` (near white). `dark:` 없이 자동 전환.

### 3. BG_NEW 키 정의 (~20개)

```typescript
const BG_NEW = {
  // === Base ===
  page: 'bg-background',
  card: 'bg-card',
  muted: 'bg-muted',
  elevated: 'bg-card', // card와 동일, 의미 분리
  overlay: 'bg-black/50',

  // === Brand ===
  brand: 'bg-brand',
  brandHover: 'hover:bg-brand-hover',
  brandLight: 'bg-brand-light',

  // === Status Light ===
  success: 'bg-success-light',
  warning: 'bg-warning-light',
  error: 'bg-error-light',
  info: 'bg-info-light',

  // === Status Solid ===
  successSolid: 'bg-success',
  warningSolid: 'bg-warning',
  errorSolid: 'bg-error',
  infoSolid: 'bg-info',

  // === Hover ===
  hoverMuted: 'hover:bg-muted',
  hoverCard: 'hover:bg-accent',
  hoverBrand: 'hover:bg-brand-light',
  hoverError: 'hover:bg-error-light',
} as const;
```

### 4. BORDER_NEW 키 정의 (~10개)

```typescript
const BORDER_NEW = {
  default: 'border-border',
  strong: 'border-border', // @theme에 따라 조정 가능
  light: 'border-border/50',
  brand: 'border-brand',
  success: 'border-success',
  warning: 'border-warning',
  error: 'border-destructive',
  info: 'border-info',
  transparent: 'border-transparent',
} as const;
```

### 5. DEPRECATED 매핑

기존 `TEXT_COLOR`의 모든 키(~183개)를 새 키로 매핑한다. 예시:

```typescript
const TEXT_DEPRECATED = {
  // gray shades → primary/secondary/muted로 통합
  tertiary: TEXT_NEW.secondary,
  strong: TEXT_NEW.primary,
  subtle: TEXT_NEW.muted,
  dim: TEXT_NEW.disabled,
  bright: TEXT_NEW.secondary,
  softMuted: TEXT_NEW.secondary,
  strongMuted: TEXT_NEW.primary,
  darker: TEXT_NEW.primary,
  // ...

  // status variants → 3단계로 통합 (base/strong만)
  errorMid: TEXT_NEW.error,
  errorDeep: TEXT_NEW.errorStrong,
  errorDark: TEXT_NEW.errorStrong,
  redLight: TEXT_NEW.error,
  // ...

  // accent → brand
  accent: TEXT_NEW.brand,
  accentHover: TEXT_NEW.brandHover,
  // ...
} as const;
```

**모든** 기존 키를 빠짐없이 매핑해야 한다. `src/lib/styles/colors.ts`의 현재 `TEXT_COLOR`, `BG_COLOR`, `BORDER_COLOR`, `DIVIDE_COLOR`, `RING_COLOR`의 키를 전부 확인하고 매핑하라.

### 6. COLORS 객체 재정의

```typescript
export const COLORS = {
  primary: 'var(--brand)',
  primaryHover: 'var(--brand-hover)',
  primaryLight: 'var(--brand-light)',
  primary50: '#fff7ed',
  primary100: '#ffedd5',
  primary200: '#fed7aa',
  primary300: '#fdba74',
  primary400: '#fb923c',
} as const;
```

### 7. 테스트 작성

#### `src/__tests__/lib/styles/deprecated-aliases.test.ts`

```typescript
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

describe('Design System: Deprecated Aliases', () => {
  // 기존 키가 전부 존재하는지 검증
  const REQUIRED_TEXT_KEYS = [
    'primary',
    'secondary',
    'tertiary',
    'muted',
    'disabled',
    'accent',
    'accentHover',
    'success',
    'error',
    'warning',
    'info',
    'errorMid',
    'errorStrong',
    'errorDeep',
    'errorDark',
    // ... 기존 colors.ts에서 TEXT_COLOR의 모든 키를 나열
  ];

  test.each(REQUIRED_TEXT_KEYS)('TEXT_COLOR.%s exists', (key) => {
    expect(TEXT_COLOR[key as keyof typeof TEXT_COLOR]).toBeDefined();
  });

  // BG_COLOR, BORDER_COLOR도 동일하게
});
```

기존 `TEXT_COLOR`의 **모든 키 이름**을 `REQUIRED_TEXT_KEYS` 배열에 나열해야 한다. `BG_COLOR`, `BORDER_COLOR`도 마찬가지.

#### `src/__tests__/lib/styles/tokens.test.ts`

```typescript
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR } from '@/lib/styles';

describe('Design System: Token Consistency', () => {
  test('TEXT_COLOR new keys use CSS variable utilities (no dark: prefix)', () => {
    const newKeys = [
      'primary',
      'secondary',
      'muted',
      'disabled',
      'brand',
      'success',
      'error',
      'warning',
      'info',
    ];
    for (const key of newKeys) {
      const value = TEXT_COLOR[key as keyof typeof TEXT_COLOR];
      expect(value).not.toContain('dark:');
    }
  });

  test('new keys snapshot', () => {
    // 새 키만 추출하여 스냅샷
    const { primary, secondary, muted, disabled, brand, success, error, warning, info } =
      TEXT_COLOR;
    expect({
      primary,
      secondary,
      muted,
      disabled,
      brand,
      success,
      error,
      warning,
      info,
    }).toMatchSnapshot();
  });
});
```

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **기존 키를 하나라도 빠뜨리면 빌드가 깨진다.** 현재 `colors.ts`의 `TEXT_COLOR`, `BG_COLOR`, `BORDER_COLOR` 모든 키를 deprecated 매핑에 포함하라. `Object.keys()`로 현재 키를 추출하여 교차 검증하라.
- hover 계열 키(`hoverPrimary`, `hoverError` 등)도 빠짐없이 매핑해야 한다.
- `DIVIDE_COLOR`와 `RING_COLOR`는 키가 적으므로 그대로 새 토큰으로 재정의한다 (deprecated 불필요).
- deprecated 값은 **기존과 동일한 Tailwind 클래스 문자열**을 유지한다 (예: `'text-gray-900 dark:text-gray-100'`). 새 키로 리다이렉트하는 것이 아니라, 기존 값을 그대로 보존한다. 이렇게 해야 시각적 회귀가 발생하지 않는다.
- `index.ts`의 re-export는 건드리지 마라 — `colors.ts`에서 같은 이름으로 export하므로 자동 호환된다.
