# Phase 10: 마이그레이션 — Public + Worker + Auth

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/lib/styles/colors.ts` (Phase 2)
- `/src/lib/styles/contactFormStyles.ts` (현재 상태 — 이 phase에서 리팩토링)
- `/src/components/ui/` (Phase 4-5)
- Phase 6-9에서 적용된 마이그레이션 패턴 참조

홈페이지 관련 컴포넌트도 확인하라:

- `/src/components/home/` — HeroVideoSection, AboutUsSection 등
- `/src/components/contact/` — StepIndicator, BoxShapeSelector 등
- `/src/components/portfolio/` — PortfolioForm, PortfolioDeleteButton 등

## 작업 내용

### 대상 디렉토리

1. `src/app/contact/` — 문의 폼 (~3개 파일)
2. `src/app/about/` — 회사 소개 (~8개 파일)
3. `src/app/login/` — 로그인 (~2개 파일)
4. `src/app/register/` — 회원가입 (~2개 파일)
5. `src/app/worker/` — 작업자 포탈 (~5개 파일)
6. `src/app/portfolio/` — 포트폴리오 (~5개 파일)
7. `src/app/notice/` — 공지사항 (~3개 파일)
8. `src/app/blog/` — 블로그 (~3개 파일)
9. `src/app/layout.tsx` — 루트 레이아웃
10. `src/components/home/` — 홈페이지 전용 컴포넌트 (~10개 파일)
11. `src/components/contact/` — 문의 전용 컴포넌트 (~3개 파일)
12. `src/components/portfolio/` — 포트폴리오 전용 컴포넌트 (~5개 파일)

### dark: 위반 수정 (이 영역의 주요 위반)

| 파일                                                 | 위반 수 | 내용                                                                              |
| ---------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `login/LoginForm.tsx`                                | 8건     | `dark:placeholder-white/25`, `dark:focus:ring-0`, `dark:focus:bg-white/[0.07]` 등 |
| `contact/ContactForm.tsx`                            | 4건     | `dark:border-[#ED6C00]/50`, `dark:!text-[#ff8533]` 등                             |
| `about/_components/IntroTab/MainStory.tsx`           | 4건     | `dark:to-gray-600` gradient                                                       |
| `about/_components/FacilityTab/FacilityList.tsx`     | 2건     | gradient dark                                                                     |
| `about/_components/ProcessTab/ProcessSteps.tsx`      | 1건     | gradient dark                                                                     |
| `about/page.tsx`                                     | 1건     | gradient                                                                          |
| `notice/page.tsx`, `notice/[slug]/page.tsx`          | 각 1건  | gradient                                                                          |
| `register/page.tsx`                                  | 2건     |                                                                                   |
| `portfolio/PortfolioPageClient.tsx`                  | 2건     |                                                                                   |
| `portfolio/_components/PortfolioMagazineGallery.tsx` | 2건     |                                                                                   |
| `worker/_components/QATestPanel.tsx`                 | 5건     |                                                                                   |

### LoginForm 특수 처리

LoginForm은 dark: 위반이 가장 많고, 특수한 입력 스타일을 사용한다:

```typescript
// BEFORE (6개 입력 필드에서 반복)
className={`w-full px-5 py-4 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder-gray-400 dark:placeholder-white/25 text-base focus:outline-none focus:border-[#ED6C00]/50 focus:ring-2 focus:ring-[#ED6C00]/20 dark:focus:ring-0 dark:focus:bg-white/[0.07] transition-all duration-200 disabled:opacity-50`}

// AFTER — 새 Input 컴포넌트를 사용하거나, 로그인 전용 스타일 상수를 만들어라
```

LoginForm의 경우, 기존 `<Input>` 컴포넌트와 다른 스타일 (투명 배경, 글래스 효과)을 사용하므로:

- `<Input>` 컴포넌트에 `variant="glass"` 또는 `variant="transparent"` 추가를 검토
- 또는 LoginForm 전용 스타일을 colors.ts에 추가하지 말고, 인라인으로 시맨틱 유틸리티 사용:
  ```
  bg-card/5 border-border/50 text-foreground placeholder:text-muted-foreground/50 focus:border-brand/50 focus:ring-brand/20
  ```

### contactFormStyles.ts 리팩토링

현재 JS 기반 반응형(`useContactFormStyles` 훅)을 Tailwind 반응형으로 전환:

```typescript
// BEFORE: 3개 breakpoint별 별도 값
container: {
  mobile: 'w-full py-3 px-2 max-w-full mx-auto',
  tablet: 'w-full py-7 px-6 max-w-3xl mx-auto',
  desktop: 'w-full py-8 px-8 max-w-4xl mx-auto',
}

// AFTER: Tailwind 반응형
container: 'w-full py-3 px-2 max-w-full md:py-7 md:px-6 md:max-w-3xl lg:py-8 lg:px-8 lg:max-w-4xl mx-auto',
```

변환 후 `useContactFormStyles` 훅과 `getContactFormStyle` 함수를 제거하거나, 단순 객체 export로 대체한다. 사용처인 `ContactForm.tsx`에서 `getStyle('container')` 호출을 `CONTACT_STYLES.container`로 변경.

### 홈페이지 컴포넌트 처리

`src/components/home/`의 컴포넌트는 홈페이지 전용이다. `HOME_SECTION_BG`, `HOME_SECTION_TEXT`, `HOME_CARD` 상수를 사용하므로:

- Phase 3에서 이미 리팩토링된 상수를 참조
- 추가로 inline `[#ED6C00]` → `brand` 변환

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 10 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **LoginForm의 시각적 디자인을 변경하지 마라.** 글래스 효과, 투명 배경 등은 유지. dark: 클래스를 제거하되 동일한 시각적 결과를 CSS 변수로 구현.
- **ContactForm의 로직을 변경하지 마라.** 반응형 스타일 전환만 수행. 폼 유효성 검사, 제출 로직은 건드리지 않는다.
- **홈페이지 3D 컴포넌트 (Three.js)를 건드리지 마라.** HeroBoxScene, BoxNetScene 등 Three.js 기반 컴포넌트의 JS 로직은 변경 금지. wrapper의 CSS className만 변경 가능.
- **포트폴리오 페이지는 항상 라이트 모드** (`data-portfolio-page="true"`). 이 규칙을 유지하라.
- gradient 패턴은 CSS 변수로 완벽 대체가 어렵다. `dark:from-gray-800` 같은 gradient dark 패턴은 `BG_COLOR` 상수로 대체하거나, 불가능하면 그대로 유지하고 주석으로 `// TODO: gradient dark mode — requires manual dark: here` 남겨라.
