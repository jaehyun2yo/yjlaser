# Design System Specification

## Overview

Transition from hardcoded Tailwind `dark:` class pairs in TS constants to a **CSS custom property-based design token system**. Leverages Tailwind CSS v4 `@theme` integration so tokens are available as native utility classes (e.g., `text-foreground`, `bg-card`). The existing TypeScript constants (`TEXT_COLOR`, `BG_COLOR`, etc.) remain as a thin wrapping layer that references semantic utility classes instead of raw `dark:` pairs.

### Goals

- Single source of truth for colors, spacing, radius, and shadows in CSS custom properties
- Automatic dark mode via CSS variable swap — no `dark:` classes in component code
- Incremental migration — existing code continues to work throughout
- CVA + Radix UI component library under `@/components/ui/`
- Static gates block newly changed design debt: literal `className="...${TOKEN}..."`, raw brand hex in changed admin/webhard/style files, and `dark:` classes in changed style scopes.

### Non-Goals

- Redesigning the visual identity (brand color `#ED6C00` stays)
- Changing the Tailwind CSS v4 or Next.js 15 stack
- Removing the TS constant layer entirely (it stays as a convenience API)

---

## Token Taxonomy

All tokens are backed by CSS custom properties in `globals.css` (`:root` / `.dark` blocks). Tailwind CSS v4 auto-generates utility classes from these properties (e.g., `--brand` → `bg-brand`, `text-brand`). The TS constants in `colors.ts` map semantic keys to these Tailwind utility class names.

### Static Gate Contracts

- `src/__tests__/lib/styles/literal-classname-static-gate.test.ts` scans production source for literal class strings that accidentally contain template interpolation text and must pass before landing UI migrations.
- `src/__tests__/lib/styles/static-gate.test.ts` scans changed admin/webhard/style files for `dark:` and raw brand hex values such as `#ED6C00`, `#d15f00`, and `#ff8533`.
- `tests/static/changed-lines-static-gates.test.ts` blocks new production lines that add relative imports in `src/`, raw React Query key arrays, or explicit `any`.

### Text Colors (19 semantic tokens)

| Token           | Tailwind Utility           | Usage                    |
| --------------- | -------------------------- | ------------------------ |
| `primary`       | `text-foreground`          | Main body text           |
| `secondary`     | `text-muted-foreground`    | Supporting text          |
| `muted`         | `text-muted-foreground/70` | De-emphasized text       |
| `disabled`      | `text-muted-foreground/50` | Disabled state           |
| `white`         | `text-white`               | Text on dark backgrounds |
| `inverted`      | `text-background`          | Inverted context         |
| `brand`         | `text-brand`               | Brand accent text        |
| `brandHover`    | `hover:text-brand-hover`   | Brand hover state        |
| `success`       | `text-success`             | Success messages         |
| `successStrong` | `text-success-foreground`  | Strong success           |
| `warning`       | `text-warning`             | Warning messages         |
| `warningStrong` | `text-warning-foreground`  | Strong warning           |
| `error`         | `text-destructive`         | Error messages           |
| `errorStrong`   | `text-error-foreground`    | Strong error             |
| `info`          | `text-info`                | Informational text       |
| `infoStrong`    | `text-info-foreground`     | Strong info              |
| `hoverPrimary`  | `hover:text-foreground`    | Hover to primary         |
| `hoverBrand`    | `hover:text-brand`         | Hover to brand           |
| `hoverError`    | `hover:text-destructive`   | Hover to error           |

### Background Colors (20 semantic tokens)

| Token          | Tailwind Utility       | Usage              |
| -------------- | ---------------------- | ------------------ |
| `page`         | `bg-background`        | Page background    |
| `card`         | `bg-card`              | Card surfaces      |
| `muted`        | `bg-muted`             | Muted sections     |
| `elevated`     | `bg-card`              | Elevated surfaces  |
| `overlay`      | `bg-black/50`          | Modal overlays     |
| `brand`        | `bg-brand`             | Primary CTA        |
| `brandHover`   | `hover:bg-brand-hover` | Primary CTA hover  |
| `brandLight`   | `bg-brand-light`       | Light brand accent |
| `success`      | `bg-success-light`     | Success background |
| `warning`      | `bg-warning-light`     | Warning background |
| `error`        | `bg-error-light`       | Error background   |
| `info`         | `bg-info-light`        | Info background    |
| `successSolid` | `bg-success`           | Solid success      |
| `warningSolid` | `bg-warning`           | Solid warning      |
| `errorSolid`   | `bg-error`             | Solid error        |
| `infoSolid`    | `bg-info`              | Solid info         |
| `hoverMuted`   | `hover:bg-muted`       | Hover to muted     |
| `hoverCard`    | `hover:bg-accent`      | Hover to card      |
| `hoverBrand`   | `hover:bg-brand-light` | Hover to brand     |
| `hoverError`   | `hover:bg-error-light` | Hover to error     |

### Border Colors (10 semantic tokens)

| Token         | Tailwind Utility     | Usage               |
| ------------- | -------------------- | ------------------- |
| `default`     | `border-border`      | Standard borders    |
| `strong`      | `border-border`      | Emphasized borders  |
| `light`       | `border-border/50`   | Subtle borders      |
| `brand`       | `border-brand`       | Brand accent border |
| `success`     | `border-success`     | Success state       |
| `warning`     | `border-warning`     | Warning state       |
| `error`       | `border-destructive` | Error state         |
| `info`        | `border-info`        | Info state          |
| `transparent` | `border-transparent` | No visible border   |
| `hoverBrand`  | `hover:border-brand` | Hover to brand      |

### Divide Colors (4 tokens)

| Token       | Usage               |
| ----------- | ------------------- |
| `default`   | Standard dividers   |
| `light`     | Light dividers      |
| `lightSoft` | Soft light dividers |
| `lighter`   | Lightest dividers   |

Note: Divide tokens still use `dark:` pairs (not yet migrated to CSS variables).

### Spacing Scale

| Token      | CSS Variable   | Value |
| ---------- | -------------- | ----- |
| `space-1`  | `--spacing-1`  | 4px   |
| `space-2`  | `--spacing-2`  | 8px   |
| `space-3`  | `--spacing-3`  | 12px  |
| `space-4`  | `--spacing-4`  | 16px  |
| `space-5`  | `--spacing-5`  | 20px  |
| `space-6`  | `--spacing-6`  | 24px  |
| `space-8`  | `--spacing-8`  | 32px  |
| `space-10` | `--spacing-10` | 40px  |
| `space-12` | `--spacing-12` | 48px  |

### Border Radius

| Token  | CSS Variable  | Value                      |
| ------ | ------------- | -------------------------- |
| `sm`   | `--radius-sm` | 6px                        |
| `md`   | `--radius-md` | 8px                        |
| `lg`   | `--radius-lg` | 10px                       |
| `xl`   | `--radius-xl` | 12px                       |
| `full` | —             | 9999px (Tailwind built-in) |

### Box Shadow

| Token | CSS Variable  | Value                                                                 |
| ----- | ------------- | --------------------------------------------------------------------- |
| `sm`  | `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)`                                       |
| `md`  | `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`    |
| `lg`  | `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`  |
| `xl`  | `--shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` |

---

## UI Components

### P0 — Core (Phase 4)

| Component  | Pattern                                                                                          | Notes                          |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| **Button** | CVA variants: `primary`, `secondary`, `ghost`, `destructive`, `outline` + sizes `sm`, `md`, `lg` | Replaces `BUTTON_STYLES`       |
| **Input**  | CVA + forwardRef, error state prop                                                               | Replaces `INPUT_STYLES`        |
| **Card**   | Compound: `Card`, `CardHeader`, `CardContent`, `CardFooter`                                      | Semantic bg/border tokens      |
| **Badge**  | CVA variants: `default`, `success`, `warning`, `error`, `info`, `outline`                        | Replaces `BADGE` constants     |
| **Modal**  | Radix Dialog primitive + overlay + content slots                                                 | Replaces inline modal patterns |

### P1 — Forms & Feedback (Phase 5)

| Component    | Pattern                                                                | Notes                      |
| ------------ | ---------------------------------------------------------------------- | -------------------------- |
| **Select**   | Radix Select primitive                                                 | Custom dropdown            |
| **Table**    | Compound: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | Replaces `TABLE` constants |
| **Textarea** | CVA + forwardRef, auto-resize option                                   | Extends Input pattern      |
| **Checkbox** | Radix Checkbox primitive                                               | Replaces `CHECKBOX_STYLES` |
| **Switch**   | Radix Switch primitive                                                 | Toggle control             |
| **Alert**    | CVA variants matching status tokens                                    | Replaces `ALERT` constants |

### P2 — Enhanced (Phase 5)

| Component      | Pattern                                   | Notes                         |
| -------------- | ----------------------------------------- | ----------------------------- |
| **Dropdown**   | Radix DropdownMenu primitive              | Replaces `DROPDOWN` constants |
| **Tabs**       | Radix Tabs primitive                      | Tab navigation                |
| **Tooltip**    | Radix Tooltip primitive                   | Info hover                    |
| **Skeleton**   | CSS animation, inherits parent dimensions | Loading placeholder           |
| **IconButton** | Extends Button with icon-only layout      | Replaces `ICON_BUTTON`        |

---

## Migration Strategy

### Phase Breakdown

| Phase | Name                    | Scope                                                             | Existing Code Impact         |
| ----- | ----------------------- | ----------------------------------------------------------------- | ---------------------------- |
| 0     | docs-update             | This spec document                                                | None                         |
| 1     | css-tokens              | CSS custom properties in `globals.css` `@theme`                   | None — additive only         |
| 2     | color-redesign          | Rewrite `colors.ts` to reference CSS variables                    | None — same export API       |
| 3     | style-modules           | Rewrite remaining style modules (`layout.ts`, `buttons.ts`, etc.) | None — same export API       |
| 4     | ui-form-components      | Create P0 + P1 components in `@/components/ui/`                   | None — new files only        |
| 5     | ui-display-components   | Create P2 components in `@/components/ui/`                        | None — new files only        |
| 6     | migrate-shared          | Migrate shared layouts, headers, navigation                       | Replaces inline classes      |
| 7     | migrate-admin-core      | Migrate admin dashboard core pages                                | Replaces inline classes      |
| 8     | migrate-admin-rest      | Migrate remaining admin pages                                     | Replaces inline classes      |
| 9     | migrate-company-webhard | Migrate company portal + webhard                                  | Replaces inline classes      |
| 10    | migrate-public-worker   | Migrate public pages + worker portal                              | Replaces inline classes      |
| 11    | cleanup                 | Remove deprecated aliases, dead code                              | Breaking — old names removed |
| 12    | docs-sync               | Update README, CLAUDE.md, style guide                             | None                         |

### Key Invariant

Phases 1–5 are **purely additive** — no existing import paths or constant names change. Existing components continue to work unmodified. Migration phases 6–10 swap implementations file by file. Phase 11 is the only breaking change (removing deprecated aliases).

---

## Tailwind v4 `@theme` 토큰 관리

`globals.css`에서 Tailwind v4의 `@theme` 블록은 CSS custom property를 Tailwind 유틸리티 클래스로 자동 노출시킨다. shadcn 컴포넌트가 사용하는 시맨틱 변수(`--color-card`, `--color-background`, `--color-muted`, `--color-border`, `--color-popover`, `--color-foreground`, `--color-accent`, `--color-primary`, `--color-secondary`, `--color-destructive` 등)도 반드시 `@theme { }` 블록 내부에 매핑을 직접 포함해야 한다.

### 규칙

- **`@theme { }` 블록 단일 사용**: shadcn 변수 매핑을 `@theme { }` 내부에 직접 작성한다.
- **`@theme inline { }` 블록 사용 금지**: 같은 파일 내에 `@theme`과 `@theme inline`이 공존하면 Tailwind v4가 유틸리티 생성에 실패하여 `bg-card`/`bg-muted`/`bg-background`가 transparent로 렌더링되는 회귀 이슈가 발생한다.
- **변경 시 수동 검증 필수**: light/dark 모두에서 사이드바, 검색 드롭다운, 검색 모달, Card 컴포넌트, Badge 컴포넌트의 배경 색상이 정상 표시되는지 육안 확인.

### 회귀 지점 (회귀 방지 메모)

- 커밋 `5a324f9 phase 2 color-redesign`에서 `BG_COLOR.card`를 `bg-white dark:bg-gray-800` → `bg-card`로 전환한 시점부터 투명 렌더링 문제가 발생.
- 원인: `globals.css`의 `@theme` + `@theme inline` 블록 충돌로 Tailwind v4가 `bg-card`/`bg-muted`/`bg-background` 유틸을 생성하지 못함.
- 해결: `@theme` 블록에 shadcn 변수 매핑 직접 포함 + `@theme inline` 블록 제거.

---

## Static Gate Baseline — 2026-05-10

AUDIT-18/AUDIT-19 adds a changed-file static gate instead of forcing the legacy codebase to zero `dark:`/raw brand hex in one migration.

### Gate Scope

The Jest gate checks currently changed or untracked files under:

- `src/app/webhard`
- `src/app/(admin)`
- `src/lib/styles`

Blocked patterns:

- `dark:`
- `#ED6C00`
- `#d15f00`
- `#ff8533`

### Current Baseline

The full static scan still reports legacy matches in existing admin/webhard/style files. Those are baseline debt and must be migrated file-by-file when each file is touched. The gate prevents new or modified files in the priority scope from reintroducing the blocked patterns.

### Verification Commands

```powershell
pnpm test -- --testPathPatterns="tokens|styles" --runInBand
rg -n "dark:|#ED6C00|#d15f00|#ff8533" src/app/webhard src/app/(admin) src/lib/styles
```

The `rg` command is expected to show baseline debt until the full migration is complete. A changed-file gate failure is blocking; a full-scope baseline hit is tracked debt.

### 검증 체크리스트

- [ ] 사이드바 배경 light/dark 양쪽 정상
- [ ] 검색 드롭다운 배경 light/dark 양쪽 정상
- [ ] 검색 모달 배경 light/dark 양쪽 정상
- [ ] Card 컴포넌트 배경 light/dark 양쪽 정상
- [ ] Badge 컴포넌트 배경 light/dark 양쪽 정상

---

## Rules

1. **No `dark:` classes in new component code** — CSS custom properties handle light/dark automatically via `:root` and `.dark` selectors. Existing deprecated keys in `colors.ts` still use `dark:` pairs for backward compatibility.

2. **New components use `@/components/ui/` imports** — all UI primitives live under this path with CVA + Radix UI patterns. Use `<Button>`, `<Input>`, `<Badge>`, etc. instead of `BUTTON_STYLES`, `INPUT_STYLES` string constants for new code.

3. **Colors via TS constants or semantic utilities** — use `TEXT_COLOR.primary`, `BG_COLOR.card` (TS constants from NEW section) or `text-foreground`, `bg-card` (Tailwind utilities backed by CSS variables). Never use raw color values like `text-gray-900 dark:text-gray-100`.

4. **One migration per area** — each phase migrated a specific area (admin, company, public). No partial migrations that leave a page half-converted.

5. **Deprecated keys preserved** — old constant names (TEXT_DEPRECATED, BG_DEPRECATED, BORDER_DEPRECATED in `colors.ts`) remain exported alongside new semantic keys. They are used by components not yet fully migrated. New code must only use NEW section keys.
