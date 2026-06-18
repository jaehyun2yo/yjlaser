# Phase 1: classify-cta-cleanup

## 사전 준비

- `docs/specs/features/inquiry-classification-ux.md` §9 (Phase 0 에서 추가됨) — ring/pulse 제거 결정 배경. **why** 를 숙지한 후 구현.
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — `ring-2 ring-orange-300 ring-offset-1 animate-pulse` 가 **3곳**에 박혀 있다:
  - line 77 (label-only mode 미분류 뱃지)
  - line 97-100 (inline-action 칼선 버튼 className)
  - line 114-117 (inline-action 목형 버튼 className)
- `src/components/contacts/InquiryClassifyButtons.tsx` — line 30-34 `commonButton` 상수에 동일 클래스. `gap-1` 은 line 38.
- `src/__tests__/components/InquiryTypeBadge.test.tsx`, `src/__tests__/components/contacts/InquiryClassifyButtons.test.tsx` — pulse/ring assertion 이 있는지 확인.

## 작업 내용

### 1. `InquiryTypeBadge` ring/pulse 제거 (3곳)

**파일**: `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx`

- **line 77** (label-only mode 미분류 뱃지):
  - 변경 전: `className={\`${BADGE.warning} flex-shrink-0 ${TRANSITION_STYLES.colors} animate-pulse ring-2 ring-orange-300 ring-offset-1\`}`
  - 변경 후: `className={\`${BADGE.warning} flex-shrink-0 ${TRANSITION_STYLES.colors}\`}`
- **line 97-100** (inline-action 칼선 버튼):
  - `ring-2 ring-orange-300 ring-offset-1 animate-pulse` 라인 삭제. `disabled:opacity-60 disabled:cursor-not-allowed` 와 `${TRANSITION_STYLES.colors}` 만 남김.
- **line 114-117** (inline-action 목형 버튼): 동일 패턴.

### 2. `InquiryClassifyButtons` ring/pulse 제거 + gap 확대

**파일**: `src/components/contacts/InquiryClassifyButtons.tsx`

- **line 30-34** `commonButton` 상수:
  - `ring-2 ring-orange-300 ring-offset-1 animate-pulse` 라인 전체 삭제. 나머지(`cursor-pointer`, `disabled:opacity-60 disabled:cursor-not-allowed`, `${TRANSITION_STYLES.colors} rounded-full font-medium whitespace-nowrap`) 유지.
- **line 38** wrapper className:
  - 변경 전: `className="flex gap-1 flex-shrink-0 flex-wrap"`
  - 변경 후: `className="flex gap-2 flex-shrink-0 flex-wrap"`

### 3. 테스트 회귀 대응

```bash
pnpm test -- --testPathPattern="InquiryTypeBadge|InquiryClassifyButtons"
```

실행 후 실패 케이스만 최소 수정:

- `ring-2`, `ring-orange-300`, `animate-pulse` 를 **존재 assert** 하는 케이스 → **부재 assert** 로 전환 (예: `expect(btn.className).not.toContain('animate-pulse')`) 또는 assertion 자체 제거.
- 분류 클릭 동작, isPending 스피너, optimistic update 관련 테스트는 **절대 건드리지 말 것**.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="InquiryTypeBadge|InquiryClassifyButtons"
```

단일 메시지에 Bash 병렬로 발사. 모두 통과 시 `tasks/17-contact-feedback-pack/index.json` 의 phase 1 status 를 `"completed"` 로 변경. 3회 이상 실패 시 `"error"` + `"error_message"`.

## 주의사항

- **명시된 className 제거/변경 외에는 건드리지 말 것**. `BADGE.info/success/warning` 토큰 자체 변경 금지.
- `gap-2` 는 `flex gap-2` 로 유지 (`gap-x-2` 로 바꾸지 말 것).
- 분류 버튼 click handler, optimistic update, rollback 로직 **전혀 건드리지 말 것** — 순수 시각 변경.
- `dark:` 클래스 금지 원칙 유지 (변경하는 className 에 dark: 추가 금지).
- Phase 1 는 UI 변경만 — NestJS/Prisma 건드리지 않는다.
