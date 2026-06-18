# Phase 6: 마이그레이션 — 공통 컴포넌트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/lib/styles/colors.ts` (Phase 2 — 새 시맨틱 키 + deprecated alias)
- `/src/lib/styles/buttons.ts` (Phase 3 — 새 토큰 기반)
- `/src/lib/styles/layout.ts` (Phase 3)
- `/src/components/ui/button.tsx` (Phase 4)
- `/src/components/ui/input.tsx` (Phase 4)
- `/src/components/ui/badge.tsx` (Phase 5)
- `/src/components/ui/card.tsx` (Phase 5)
- `/src/components/ui/modal.tsx` (Phase 5)
- `/src/components/ui/icon-button.tsx` (Phase 5)

## 작업 내용

### 대상 파일

`/src/components/` 하위의 모든 .tsx 파일 (~70개). `src/components/ui/`는 Phase 4-5에서 이미 처리했으므로 제외.

### 마이그레이션 규칙

모든 대상 파일에 대해 아래 변환을 적용한다:

#### 규칙 1: deprecated 색상 키 → 새 시맨틱 키

```typescript
// BEFORE
import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';
<p className={TEXT_COLOR.accent}>text</p>

// AFTER
import { TEXT_COLOR } from '@/lib/styles';
<p className={TEXT_COLOR.brand}>text</p>
```

주요 매핑 (전체는 colors.ts 참조):

- `TEXT_COLOR.accent` → `TEXT_COLOR.brand`
- `TEXT_COLOR.tertiary` → `TEXT_COLOR.secondary`
- `TEXT_COLOR.strong` → `TEXT_COLOR.primary`
- `BG_COLOR.white` → `BG_COLOR.card`
- `BG_COLOR.gray` → `BG_COLOR.page`
- `BG_COLOR.primary` → `BG_COLOR.brand`
- `BORDER_COLOR.default` → `BORDER_COLOR.default` (동일)

#### 규칙 2: dark: 직접 사용 제거

```typescript
// BEFORE
className="text-gray-900 dark:text-gray-100"

// AFTER
className={TEXT_COLOR.primary}
// 또는: className="text-foreground"
```

`src/components/` 내 dark: 위반 파일:

- `header/TabletHeader.tsx` (5건)
- `ui/badge.tsx` (2건 — Phase 5에서 처리 완료, 확인만)
- `portfolio/PortfolioHorizontalGallery.tsx` (2건)
- `DownloadButton.tsx` (1건)
- `Header.tsx` (1건)

#### 규칙 3: BUTTON_STYLES → `<Button>` 컴포넌트

```typescript
// BEFORE
import { BUTTON_STYLES } from '@/lib/styles';
<button className={BUTTON_STYLES.primary} onClick={...}>저장</button>

// AFTER
import { Button } from '@/components/ui/button';
<Button onClick={...}>저장</Button>
<Button variant="danger" onClick={...}>삭제</Button>
<Button variant="ghost" onClick={...}>취소</Button>
```

#### 규칙 4: BADGE → `<Badge>` 컴포넌트

```typescript
// BEFORE
import { BADGE } from '@/lib/styles';
<span className={BADGE.success}>완료</span>

// AFTER
import { Badge } from '@/components/ui/badge';
<Badge variant="success">완료</Badge>
```

#### 규칙 5: ICON_BUTTON → `<IconButton>` 컴포넌트

#### 규칙 6: BaseModal → `<Modal>` 컴포넌트

`src/components/modals/BaseModal.tsx`를 확인하고, 새 `Modal` 컴포넌트로 대체할 수 있는지 판단하라. 대체 가능하면:

- `ConfirmModal.tsx`, `DrawingRevisionModal.tsx` 등이 BaseModal을 import하는 경우 → 새 Modal로 전환
- BaseModal 자체는 이 phase 마지막에 삭제하거나 deprecated 주석을 남긴다

**대체 불가능한 경우**: BaseModal이 Radix Dialog와 호환되지 않는 복잡한 로직이 있으면, 그대로 두고 주석으로 TODO를 남겨라.

### 우선순위

1. dark: 위반 파일 5개 먼저 수정
2. Header, Footer, SiteShell 등 레이아웃 컴포넌트
3. 모달 컴포넌트 (BaseModal, ConfirmModal, etc.)
4. 나머지 컴포넌트

### 처리하지 않을 파일

- `src/components/home/` — 홈페이지 전용 컴포넌트는 Phase 10에서 처리
- `src/components/contact/` — Phase 10에서 처리
- `src/components/portfolio/` — Phase 10에서 처리

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 6 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **기존 동작을 변경하지 마라.** 스타일만 새 시스템으로 전환. 로직, 이벤트 핸들러, 데이터 흐름은 건드리지 않는다.
- **import 경로는 `@/` 절대 경로를 사용**하라 (프로젝트 규칙).
- BaseModal을 삭제하기 전에, 모든 import 참조를 확인하라. 참조가 남아있으면 빌드가 깨진다.
- `src/components/home/`, `src/components/contact/`, `src/components/portfolio/`는 이 phase에서 건드리지 마라.
- 기존 테스트가 깨지면 안 된다. 특히 `src/tests/unit/components/webhard/` 테스트.
