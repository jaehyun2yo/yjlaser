# Phase 12: 문서 동기화 + CHANGELOG

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md` (Phase 0에서 생성)
- `/tasks/11-design-system/docs-diff.md`

그리고 이번 task에서 변경된 모든 파일을 파악하라:

```bash
git log --oneline --name-only feat-design-system..HEAD
```

또는 task 시작 이후 변경된 파일 목록:

```bash
git diff --name-only $(git log --oneline | tail -20 | head -1 | cut -d' ' -f1) HEAD
```

그리고 아래 문서들을 읽어라:

- `/docs/changelog/CHANGELOG.md`
- `/src/lib/styles/README.md`
- `/src/lib/styles/index.ts`
- `/src/lib/styles/colors.ts` (Phase 11 이후 최종 상태)

## 작업 내용

### 1. `docs/specs/features/design-system.md` 최종 동기화

Phase 0에서 작성한 스펙 문서를 실제 구현 결과와 비교하여 불일치를 수정한다:

- 토큰 택소노미: 실제 `colors.ts`의 최종 키 목록과 비교
- 컴포넌트 목록: 실제 `src/components/ui/`의 파일 목록과 비교
- 사용 규칙: 실제로 적용된 패턴 반영

### 2. `docs/changelog/CHANGELOG.md` 업데이트

이번 task의 변경사항을 기록한다:

```markdown
## [2026-04-17] Design System Overhaul

### Added

- CSS variable-based design token system (`globals.css` @theme)
- Semantic color tokens: brand, success, warning, error, info
- Spacing, radius, shadow tokens
- UI component library (CVA + Radix):
  - Form: Button, Input, Textarea, Select, Checkbox, Switch
  - Display: Card, Badge, Alert, Modal, Table, Tabs, Dropdown, Tooltip, Skeleton, IconButton

### Changed

- Color constants (`TEXT_COLOR`, `BG_COLOR`, `BORDER_COLOR`) reduced from ~360 keys to ~45 semantic keys
- All `dark:` manual classes replaced with CSS variable-based automatic dark mode
- Typography constants no longer include hardcoded colors
- All `[#ED6C00]` brand hex references replaced with `brand` token
- Migrated all components and pages to new design system

### Removed

- Deprecated color aliases (backward compatibility layer)
- Unused style constants replaced by UI components
- JS-based responsive styles in contactFormStyles (replaced with Tailwind responsive)
```

날짜는 실제 커밋 날짜로 기록.

### 3. `src/lib/styles/README.md` 업데이트

README를 현재 디자인 시스템 구조에 맞게 전면 재작성한다:

- 파일 구조 (현재 디렉토리 상태 반영)
- CSS 변수 토큰 시스템 설명
- 사용 방법 (새 시맨틱 키 + UI 컴포넌트)
- Best practices (DO/DON'T 예시 업데이트)
- 사용 가능한 모든 키 목록 (최종 상태 반영)

### 4. `CLAUDE.md` 스타일 규칙 업데이트

`/yjlaser_website/CLAUDE.md`의 Conventions 섹션에서:

- "Styling" 항목 업데이트:
  - 기존: "Import from `@/lib/styles.ts`" → 유지 (진입점은 동일)
  - 추가: UI 컴포넌트 사용 규칙 (`@/components/ui/` import)
  - 추가: CSS 변수 토큰 기반 (dark: 불필요)
- "Hard Rules" 섹션:
  - "No `dark:` classes — use style constants" 업데이트 → "No `dark:` classes — CSS variables handle dark mode automatically"
  - 추가: "Use `<Button>`, `<Input>`, `<Badge>` etc. from `@/components/ui/` — do not use BUTTON_STYLES, INPUT_STYLES string constants for new code"

### 5. 최종 검증

- `docs/specs/features/design-system.md`와 실제 코드의 일치 확인
- 모든 `docs/` 파일에서 outdated reference가 없는지 확인
- `CLAUDE.md`의 규칙이 현재 코드베이스와 일치하는지 확인

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 12 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase에서는 **코드를 수정하지 않는다** (docs, README, CLAUDE.md만 수정).
- CHANGELOG의 날짜는 실제 날짜로. 이번 task 전체가 하루에 완료되면 하나의 날짜. 여러 날에 걸치면 시작일-종료일 범위.
- `CLAUDE.md`의 "< 200 lines" 제한을 유지하라. 필요하면 기존 내용을 압축.
- 이 phase가 전체 task의 마지막이므로, 모든 문서가 코드와 일치하는지 꼼꼼히 확인하라.
