# Design System Guide

## Overview

CSS variable-based design token system with automatic dark mode. Tokens are defined in `globals.css` and consumed via Tailwind CSS v4 utilities. TypeScript constants in this directory provide a convenience API for class name composition.

## File Structure

```
src/lib/styles/
├── index.ts              # Re-export entry point (@/lib/styles)
├── colors.ts             # Semantic color tokens (TEXT_COLOR, BG_COLOR, BORDER_COLOR, etc.)
├── typography.ts         # Typography scale (TYPOGRAPHY)
├── layout.ts             # Layout, badge, alert, table, modal, transition constants
├── buttons.ts            # Button, input, checkbox, filter styles
├── navigation.ts         # Nav, sidebar, header, bottom nav styles
├── themes.ts             # Page-specific themes (company, portfolio, home)
├── mobile.ts             # Mobile floating actions, slide menu
├── search.ts             # Search modal styles
├── webhard.ts            # Webhard-specific styles (folder tree, badges)
├── contactFormStyles.ts  # Contact form responsive styles
└── README.md             # This file

src/components/ui/        # CVA + Radix UI component library
├── button.tsx
├── input.tsx
├── textarea.tsx
├── select.tsx
├── checkbox.tsx
├── switch.tsx
├── modal.tsx
├── card.tsx
├── badge.tsx
├── alert.tsx
├── table.tsx
├── tabs.tsx
├── dropdown.tsx
├── tooltip.tsx
├── skeleton.tsx
└── icon-button.tsx

src/app/globals.css       # CSS custom properties (:root / .dark)
```

## CSS Variable Token System

All design tokens are defined as CSS custom properties in `globals.css`:

```css
:root {
  --brand: #ed6c00;
  --brand-hover: #d15f00;
  --brand-light: #fff7ed;
  --success: oklch(0.55 0.17 145);
  --warning: oklch(0.75 0.15 85);
  --error: oklch(0.55 0.2 25);
  --info: oklch(0.55 0.15 250);
  --space-4: 1rem;
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), ...;
  /* ... */
}

.dark {
  --brand: #ff8533;
  --brand-hover: #ed6c00;
  --brand-light: rgba(237, 108, 0, 0.15);
  /* ... */
}
```

Tailwind CSS v4 auto-generates utility classes: `bg-brand`, `text-success`, `border-info`, etc.

## Usage

### 1. UI Components (preferred for new code)

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

function Example() {
  return (
    <Card>
      <CardHeader>Title</CardHeader>
      <CardContent>
        <Input placeholder="Name" />
        <Badge variant="success">Active</Badge>
        <Button variant="primary">Submit</Button>
      </CardContent>
    </Card>
  );
}
```

### 2. Semantic Color Constants

```tsx
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

function Example() {
  return (
    <div className={`${BG_COLOR.card} ${BORDER_COLOR.default} border rounded-lg p-4`}>
      <p className={TEXT_COLOR.primary}>Main text</p>
      <p className={TEXT_COLOR.secondary}>Supporting text</p>
      <span className={TEXT_COLOR.brand}>Brand accent</span>
      <p className={TEXT_COLOR.success}>Success message</p>
    </div>
  );
}
```

### 3. Typography

```tsx
import { TYPOGRAPHY } from '@/lib/styles';

function Example() {
  return (
    <div>
      <h1 className={TYPOGRAPHY.h1}>Heading 1</h1>
      <p className={TYPOGRAPHY.body.base}>Body text</p>
      <span className={TYPOGRAPHY.caption}>Caption</span>
    </div>
  );
}
```

## Best Practices

### DO

```tsx
// Use UI components for interactive elements
<Button variant="primary">Submit</Button>
<Input error="Required field" />
<Badge variant="warning">Pending</Badge>

// Use semantic color tokens
<p className={TEXT_COLOR.primary}>Text</p>
<div className={BG_COLOR.card}>Card</div>

// Use CSS variable tokens directly in Tailwind
<div className="bg-brand text-white">Brand block</div>
```

### DON'T

```tsx
// Don't use dark: classes manually
<p className="text-gray-900 dark:text-gray-100">Bad</p>

// Don't use raw hex brand color
<div className="bg-[#ED6C00]">Bad</div>

// Don't use BUTTON_STYLES/INPUT_STYLES for new code
<button className={BUTTON_STYLES.primary}>Bad</button>

// Don't use deprecated color keys for new code
<p className={TEXT_COLOR.tertiary}>Bad — use TEXT_COLOR.secondary</p>
```

## Available Semantic Keys

### TEXT_COLOR (new)

`primary`, `secondary`, `muted`, `disabled`, `white`, `inverted`, `brand`, `brandHover`, `success`, `successStrong`, `warning`, `warningStrong`, `error`, `errorStrong`, `info`, `infoStrong`, `hoverPrimary`, `hoverBrand`, `hoverError`

### BG_COLOR (new)

`page`, `card`, `muted`, `elevated`, `overlay`, `brand`, `brandHover`, `brandLight`, `success`, `warning`, `error`, `info`, `successSolid`, `warningSolid`, `errorSolid`, `infoSolid`, `hoverMuted`, `hoverCard`, `hoverBrand`, `hoverError`

### BORDER_COLOR (new)

`default`, `strong`, `light`, `brand`, `success`, `warning`, `error`, `info`, `transparent`, `hoverBrand`

### Other Exports

- `TYPOGRAPHY` — h1–h6, body (large/base/small), caption, overline, button, label, link
- `BUTTON_STYLES` — primary, secondary, modal, headerNav, danger, ghost (legacy string constants)
- `INPUT_STYLES` — base, focus, full, searchSmall (legacy string constants)
- `LAYOUT` — container, card, section, flex utilities
- `BADGE`, `ALERT`, `TABLE`, `MODAL` — legacy string constants
- `NAV_BUTTON`, `SIDEBAR`, `BOTTOM_NAV` — navigation styles
- `COMPANY_THEME`, `PORTFOLIO_THEME`, `HOME_SECTION_BG` — page themes
