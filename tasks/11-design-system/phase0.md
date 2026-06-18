# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md` (프로젝트 컨벤션, 스타일 규칙)
- `/yjlaser_website/CLAUDE.md` (프로젝트별 상세 규칙)
- `/src/lib/styles/README.md` (기존 스타일 시스템 가이드)
- `/src/lib/styles/index.ts` (스타일 모듈 통합 진입점)
- `/src/lib/styles/colors.ts` (현재 색상 상수)
- `/src/app/globals.css` (CSS 변수, @theme 설정)
- `/docs/changelog/CHANGELOG.md`

## 작업 내용

### 1. 디자인 시스템 스펙 문서 생성

`docs/specs/features/design-system.md` 파일을 생성한다.

문서에 포함할 내용:

1. **개요**: CSS 변수 기반 디자인 토큰 시스템으로 전환. Tailwind v4 `@theme` 활용. TS 상수는 얇은 래핑 레이어로 유지.

2. **토큰 택소노미** — 아래 구조를 문서화:
   - **Text Colors** (~15개): primary, secondary, muted, disabled, brand, brandHover, success, warning, error, info, successStrong, warningStrong, errorStrong, infoStrong, white, inverted
   - **Background Colors** (~15개): page, card, muted, elevated, overlay, brand, brandHover, brandLight, success, warning, error, info, successSolid, warningSolid, errorSolid, infoSolid
   - **Border Colors** (~8개): default, strong, light, brand, success, warning, error, info
   - **Spacing Scale**: space-1(4px) ~ space-12(48px)
   - **Radius**: sm(6px), md(8px), lg(10px), xl(12px), full
   - **Shadow**: sm, md, lg, xl

3. **UI 컴포넌트 목록**:
   - P0: Button, Input, Card, Badge, Modal
   - P1: Select, Table, Textarea, Checkbox, Switch, Alert
   - P2: Dropdown, Tabs, Tooltip, Skeleton, IconButton
   - 패턴: CVA + Radix UI + Tailwind

4. **마이그레이션 전략**:
   - Phase 1-3: 토큰 시스템 구축 (기존 코드 영향 없음)
   - Phase 4-5: 컴포넌트 생성 (기존 코드 영향 없음)
   - Phase 6-10: 영역별 마이그레이션
   - Phase 11: deprecated alias 제거

5. **규칙**:
   - `dark:` 클래스 직접 사용 금지 — CSS 변수가 자동 처리
   - 새 컴포넌트 사용 시 `@/components/ui/` import
   - 색상은 `TEXT_COLOR`, `BG_COLOR` 등 TS 상수 또는 `text-foreground`, `bg-card` 등 시맨틱 유틸리티 사용

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase에서는 코드를 수정하지 않는다. 문서만 생성한다.
- 기존 `src/lib/styles/README.md`는 수정하지 마라 — Phase 12에서 최종 동기화한다.
- 문서는 영어로 작성한다 (프로젝트 CLAUDE.md 규칙: CLAUDE.md 및 docs는 영어).
