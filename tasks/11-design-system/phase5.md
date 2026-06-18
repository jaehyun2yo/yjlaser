# Phase 5: UI 컴포넌트 — 디스플레이

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/app/globals.css` (Phase 1)
- `/src/lib/styles/colors.ts` (Phase 2)
- `/src/lib/styles/layout.ts` (Phase 3 — BADGE, ALERT, MODAL, TABLE 등)
- `/src/components/ui/button.tsx` (Phase 4 — 참조용, CVA 패턴)
- `/src/lib/utils.ts` (Phase 4 — cn 함수)

기존 관련 컴포넌트도 확인하라:

- `/src/components/ui/badge.tsx` (기존 badge)
- `/src/components/ui/DashboardCard.tsx`
- `/src/components/modals/BaseModal.tsx` (기존 모달 베이스)
- `/src/components/modals/ConfirmModal.tsx`
- `/src/components/Badge.tsx` (또 다른 badge 구현)

## 작업 내용

### 0. 추가 Radix 패키지 설치

```bash
pnpm add @radix-ui/react-tabs @radix-ui/react-dropdown-menu @radix-ui/react-tooltip
```

### 1. `src/components/ui/card.tsx` 생성

```typescript
const cardVariants = cva('rounded-lg border bg-card text-card-foreground', {
  variants: {
    variant: {
      default: 'border-border shadow-md',
      hover: 'border-border shadow-md hover:shadow-lg transition-shadow',
      elevated: 'border-border shadow-lg',
      flat: 'border-border',
    },
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
  },
  defaultVariants: { variant: 'default', padding: 'md' },
});
```

Card, CardHeader, CardContent, CardFooter 서브컴포넌트 포함.

### 2. `src/components/ui/badge.tsx` 리팩토링

기존 badge.tsx를 CVA 패턴으로 재작성:

```typescript
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full text-xs font-medium', {
  variants: {
    variant: {
      success: 'bg-success-light text-success-foreground',
      warning: 'bg-warning-light text-warning-foreground',
      error: 'bg-error-light text-error-foreground',
      info: 'bg-info-light text-info-foreground',
      gray: 'bg-muted text-muted-foreground',
      primary: 'bg-brand-light text-brand',
      purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      notification: 'bg-destructive text-white',
    },
    size: {
      sm: 'px-1.5 py-0.5 text-[10px]',
      md: 'px-2 py-1',
      lg: 'px-2.5 py-1.5',
    },
  },
  defaultVariants: { variant: 'gray', size: 'md' },
});
```

**기존 badge.tsx를 읽고**, 기존 export 인터페이스를 유지하면서 내부를 CVA로 교체하라. 기존에 badge.tsx를 import하는 코드가 깨지면 안 된다.

### 3. `src/components/ui/alert.tsx` 생성

```typescript
const alertVariants = cva('rounded-lg p-4 border border-l-4', {
  variants: {
    variant: {
      success: 'bg-success-light border-success',
      warning: 'bg-warning-light border-warning',
      error: 'bg-error-light border-error',
      info: 'bg-info-light border-info',
    },
  },
  defaultVariants: { variant: 'info' },
});
```

Alert, AlertTitle, AlertDescription 서브컴포넌트 포함.

### 4. `src/components/ui/modal.tsx` 생성

Radix Dialog 기반. 기존 `@radix-ui/react-dialog`는 이미 설치됨.

```typescript
// Radix Dialog primitives 래핑
// Modal (root), ModalTrigger, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalClose
// ModalContent에 기본 스타일:
//   bg-card rounded-lg shadow-xl max-w-lg w-full mx-4
//   overlay: bg-black/50 fixed inset-0 z-50
```

기존 `BaseModal.tsx`의 인터페이스를 참고하되, Radix Dialog 위에 구축한다.

### 5. `src/components/ui/table.tsx` 생성

```typescript
// Table, TableHeader, TableBody, TableRow, TableHead, TableCell
// 기본 스타일은 layout.ts의 TABLE 상수를 CVA 패턴으로 변환
```

### 6. `src/components/ui/tabs.tsx` 생성

Radix Tabs 기반.

```typescript
// Tabs, TabsList, TabsTrigger, TabsContent
// TabsTrigger active 상태: bg-brand text-white
// TabsTrigger inactive 상태: text-muted-foreground hover:text-foreground
```

### 7. `src/components/ui/dropdown.tsx` 생성

Radix DropdownMenu 기반.

```typescript
// Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator
// 기본 스타일: bg-card rounded-lg shadow-lg border-border
```

### 8. `src/components/ui/tooltip.tsx` 생성

Radix Tooltip 기반.

### 9. `src/components/ui/skeleton.tsx` 생성

```typescript
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
```

### 10. `src/components/ui/icon-button.tsx` 생성

```typescript
const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded transition-colors focus:outline-none focus:ring-2',
  {
    variants: {
      variant: {
        default: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        primary: 'text-brand hover:bg-brand-light',
        danger: 'text-destructive hover:bg-error-light',
        success: 'text-success hover:bg-success-light',
      },
      size: {
        sm: 'p-1',
        md: 'p-2',
        lg: 'p-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);
```

### 11. 테스트 작성

`src/__tests__/components/ui/badge.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  test('renders with default variant', () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  test('renders each status variant', () => {
    const variants = ['success', 'warning', 'error', 'info'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });
});
```

Card, Modal에 대해서도 기본 렌더링 테스트 작성.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 5 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **기존 `Badge.tsx` (`/src/components/Badge.tsx`)를 삭제하지 마라** — 이것은 다른 컴포넌트. Phase 6에서 마이그레이션 시 새 ui/badge.tsx로 대체 여부를 결정한다.
- **기존 `BaseModal.tsx`를 삭제하지 마라** — Phase 6에서 마이그레이션한다.
- 기존 badge.tsx의 export 인터페이스가 변경되면, 기존 import하는 파일에서 타입 에러가 발생할 수 있다. 기존 props 인터페이스를 호환하도록 하라.
- `@radix-ui/react-dialog`는 이미 설치되어 있다. 중복 설치하지 마라.
- purple variant에서 `dark:` 사용은 허용 — CSS 변수로 purple이 정의되지 않았으므로.
- 컴포넌트 파일명은 소문자 kebab-case.
