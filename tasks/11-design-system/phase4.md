# Phase 4: UI 컴포넌트 — 폼 컨트롤

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/app/globals.css` (Phase 1 — CSS 변수 토큰)
- `/src/lib/styles/colors.ts` (Phase 2 — 시맨틱 토큰)
- `/src/lib/styles/buttons.ts` (Phase 3 — 리팩토링된 버튼 상수)
- `/src/lib/styles/layout.ts` (Phase 3 — 리팩토링된 레이아웃 상수)

기존 UI 컴포넌트도 확인하라:

- `/src/components/ui/badge.tsx` (기존 badge 구현)
- `/src/components/ui/DashboardButtons.tsx`
- `/package.json` (현재 설치된 Radix 패키지 확인)

## 작업 내용

### 0. Radix 패키지 설치

```bash
pnpm add @radix-ui/react-checkbox @radix-ui/react-switch @radix-ui/react-select
```

### 1. 유틸리티 함수 확인

`src/lib/utils.ts` 또는 유사 파일에 `cn()` 함수가 있는지 확인. 없으면 생성:

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`clsx`와 `tailwind-merge`는 이미 package.json에 설치되어 있다.

### 2. `src/components/ui/button.tsx` 생성

CVA 패턴으로 구현:

```typescript
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // base: 공통 스타일
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-brand hover:bg-brand-hover text-white shadow-md hover:shadow-lg',
        secondary: 'bg-muted hover:bg-muted/80 text-foreground',
        danger: 'bg-error hover:bg-error/90 text-white',
        ghost: 'border border-border hover:bg-accent text-foreground',
        outline: 'border border-brand text-brand hover:bg-brand-light',
        link: 'text-brand hover:text-brand-hover underline-offset-4 hover:underline',
      },
      size: {
        sm: 'text-xs py-2 px-4 rounded',
        md: 'text-sm py-3 px-8',
        lg: 'text-base py-4 px-10',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

// forwardRef 사용
// export { buttonVariants }도 함께 export
```

### 3. `src/components/ui/input.tsx` 생성

```typescript
import { cva, type VariantProps } from 'class-variance-authority';

const inputVariants = cva(
  'border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-border',
        error: 'border-destructive focus:ring-destructive',
      },
      inputSize: {
        sm: 'px-2.5 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);
```

forwardRef + `React.InputHTMLAttributes<HTMLInputElement>` 확장.

### 4. `src/components/ui/textarea.tsx` 생성

Input과 유사한 구조. `resize-none` 기본. `rows` prop 지원.

### 5. `src/components/ui/select.tsx` 생성

두 가지 모드:

- `native`: 네이티브 select 엘리먼트 (모바일 친화)
- `custom`: Radix Select (데스크톱)

기본은 `native`로 설정. 프로젝트에서 대부분 네이티브 select를 사용하므로.

### 6. `src/components/ui/checkbox.tsx` 생성

Radix Checkbox 기반. brand 색상 적용.

### 7. `src/components/ui/switch.tsx` 생성

Radix Switch 기반. brand 색상 적용.

### 8. 테스트 작성

`src/__tests__/components/ui/button.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  test('renders with default variant', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-brand');
  });

  test('renders with danger variant', () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-error');
  });

  test('renders with different sizes', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-xs');
  });

  test('passes disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('renders as child with asChild', () => {
    render(<Button asChild><a href="/test">Link</a></Button>);
    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});
```

Input, Textarea에 대해서도 기본 렌더링 + variant 테스트 작성.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **기존 `src/components/ui/badge.tsx`를 삭제하지 마라** — Phase 5에서 리팩토링한다.
- **기존 `src/components/ui/DashboardButtons.tsx`, `DashboardCard.tsx`를 수정하지 마라** — Phase 6에서 마이그레이션한다.
- `@radix-ui/react-slot`은 이미 설치되어 있다. 중복 설치하지 마라.
- variant 이름은 이 문서에 정의된 것을 사용하라. 임의로 추가하지 마라.
- `buttonVariants`를 export하여 외부에서 variant 클래스만 사용할 수 있게 하라 (Link 컴포넌트 등에서 활용).
- `cn()` 함수가 이미 존재하면 재생성하지 마라. 기존 것을 import하라.
- 컴포넌트 파일명은 소문자 kebab-case (`button.tsx`, `input.tsx`).
