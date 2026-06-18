# Phase 3: 기타 스타일 모듈 리팩토링

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/app/globals.css` (Phase 1 — CSS 변수, @theme 토큰)
- `/src/lib/styles/colors.ts` (Phase 2 — 새 시맨틱 토큰 + deprecated alias)

그리고 아래 파일들을 전부 읽어라 (리팩토링 대상):

- `/src/lib/styles/typography.ts`
- `/src/lib/styles/buttons.ts`
- `/src/lib/styles/layout.ts`
- `/src/lib/styles/navigation.ts`
- `/src/lib/styles/mobile.ts`
- `/src/lib/styles/search.ts`
- `/src/lib/styles/webhard.ts`
- `/src/lib/styles/themes.ts`
- `/src/lib/styles/contactFormStyles.ts`
- `/src/lib/styles/index.ts`

## 작업 내용

### 1. `typography.ts` 리팩토링

**목표**: 색상을 분리하여 타이포그래피가 크기/굵기/줄높이만 담당하도록 변경.

현재 문제:

```typescript
// BAD: caption에 색상이 하드코딩
caption: 'text-xs font-normal leading-normal text-gray-600 dark:text-gray-400',
```

수정 방향:

```typescript
// GOOD: 색상 제거, 크기/굵기/줄높이만
caption: 'text-xs font-normal leading-normal',
// 사용처에서: `${TYPOGRAPHY.caption} ${TEXT_COLOR.muted}`
```

변경할 항목:

- `caption`: `text-gray-600 dark:text-gray-400` 제거
- `overline`: `text-gray-500 dark:text-gray-500` 제거
- `link.large`, `link.base`, `link.small`: `text-[#ED6C00] hover:text-[#d15f00]` 제거 → 사용처에서 `TEXT_COLOR.brand`와 조합

### 2. `buttons.ts` 리팩토링

**목표**: 새 CSS 변수 기반 토큰으로 전환. `dark:` 직접 사용 제거.

변경 방향:

- `BUTTON_STYLES.primary`: `bg-[#ED6C00] hover:bg-[#d15f00]` → `bg-brand hover:bg-brand-hover`
- `BUTTON_STYLES.danger`: `bg-red-600 hover:bg-red-700` → `bg-error hover:bg-error/90`
- `INPUT_STYLES`: `focus:ring-[#ED6C00] focus:border-[#ED6C00]` → `focus:ring-brand focus:border-brand`
- `CHECKBOX_STYLES`: `text-[#ED6C00] focus:ring-[#ED6C00]` → `text-brand focus:ring-brand`
- `STEP_STYLES`: `text-[#ED6C00] dark:text-[#ff8533]` → `text-brand`
- `DASHBOARD_ACTION_BUTTON`: inline `dark:` 클래스 제거, 새 토큰 사용
- `DASHBOARD_STATUS_BADGE`: brand hex → `bg-brand`

**핵심 규칙**: `[#ED6C00]`과 `[#d15f00]` 하드코딩을 모두 `brand` / `brand-hover` 토큰으로 교체.

import 경로도 새 토큰 기반으로 업데이트:

```typescript
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from './colors';
```

이 import는 유지하되, 참조하는 키를 새 시맨틱 키로 변경한다.

### 3. `layout.ts` 리팩토링

**목표**: colors.ts의 새 시맨틱 키 사용. 기존 import 구조 유지.

- `BADGE`: inline `dark:` 클래스 → 새 CSS 변수 기반 유틸리티로 교체
  - `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400` → `bg-success-light text-success-foreground`
  - warning, error, info, primary, purple도 동일
- `ICON_BUTTON`: `hover:bg-orange-50 text-[#ED6C00]` → `hover:bg-brand-light text-brand`
- `TAG.primary`: `bg-[#ED6C00]` → `bg-brand`
- `ACTIVITY_LOG_BADGE`: 전부 새 status 토큰으로 교체

### 4. `navigation.ts` 리팩토링

**목표**: brand hex 참조를 토큰으로 교체.

- `NAV_BUTTON.primary`: `bg-[#ED6C00] hover:bg-[#d15f00]` → `bg-brand hover:bg-brand-hover`
- `NAV_BUTTON.primaryOutline`: `text-[#ED6C00]` → `text-brand`
- `SIDEBAR.navItemActive`: `bg-[#ED6C00]` → `bg-brand`
- `HEADER_NAV_BUTTON.login`: `text-[#ED6C00] hover:text-[#ff8533]` → `text-brand hover:text-brand-hover`
- 기타 모든 `[#ED6C00]`, `[#d15f00]`, `[#ff8533]`, `[#c45500]` 참조 교체

### 5. `themes.ts` 리팩토링

**목표**: inline `dark:` 클래스 → 시맨틱 유틸리티.

- `COMPANY_THEME`: `bg-gray-50 dark:bg-gray-900` → `bg-background`, `text-gray-900 dark:text-white` → `text-foreground`
- `HOME_SECTION_TEXT.aboutCardTitle`: `group-hover:text-[#ED6C00]` → `group-hover:text-brand`
- `PORTFOLIO_THEME.filterActive`: `bg-[#ED6C00]` → `bg-brand`

### 6. `mobile.ts`, `search.ts`, `webhard.ts` 리팩토링

동일 원칙 적용:

- `[#ED6C00]` → `brand`
- inline `dark:` 패턴 → 시맨틱 CSS 변수 유틸리티
- 특히 `webhard.ts`의 `FOLDER_TREE`에서 `[#ED6C00]` 참조 다수 → `brand` 교체

### 7. `contactFormStyles.ts`는 이 phase에서 수정하지 않는다

contactFormStyles.ts는 Phase 10 (Public 마이그레이션)에서 반응형 패턴 전환과 함께 처리한다.

### 8. `index.ts` re-export 확인

`index.ts`의 export 목록이 변경된 파일들과 일치하는지 확인한다. 새로 추가되거나 제거된 export가 있으면 반영한다.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **TYPOGRAPHY에서 색상을 제거하면 기존 사용처에서 스타일이 누락될 수 있다.** 하지만 이 phase에서는 style 모듈만 변경한다. 사용처 수정은 Phase 6-10에서 처리한다. caption, overline, link의 색상 제거로 인한 빌드 오류는 발생하지 않는다 (문자열 상수이므로 타입 에러 없음).
- **export 이름을 변경하지 마라.** `BUTTON_STYLES`, `INPUT_STYLES` 등의 이름은 그대로 유지. 값만 새 토큰으로 교체.
- `contactFormStyles.ts`는 건드리지 마라 — Phase 10에서 처리.
- `bg-brand`, `text-brand` 등의 유틸리티가 Phase 1에서 `@theme inline`에 등록되었는지 반드시 확인한 후 사용하라.
