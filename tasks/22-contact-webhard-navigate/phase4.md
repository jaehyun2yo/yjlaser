# Phase 4: Frontend — 우클릭 메뉴 "웹하드에서 열기" 항목 추가 (context-menu-webhard-link)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 에서 추가된 "웹하드에서 열기" 메뉴 항목 스펙 (최상단 배치, FolderOpen 아이콘, disabled 조건, 툴팁).
- `docs/specs/features/worker-portal.md` — Completion Criteria 에서 이번 phase 에서 체크될 "작업 파일 열기 (웹하드 연결)" 항목.
- `docs/specs/api/endpoints/webhard.md` — `/webhard?folderId=...&fileId=...` URL 규약.
- `/tasks/22-contact-webhard-navigate/docs-diff.md` — Phase 0 문서 변경 기록.
- `CLAUDE.md` (프로젝트 루트) — Hard Rules: `<Button>` 사용, `@/` import, `dark:` 금지, logger 사용 등. 디자인 토큰 사용.

그리고 이전 phase 의 작업물을 확인하라:

- `src/lib/types/contact.ts` — Phase 1 에서 `webhardFileId` 필드 추가됨. 이 phase 에서 사용.
- `src/app/webhard/components/containers/WebhardMain.tsx` — Phase 3 에서 `fileId` 쿼리 지원 추가됨. 이 phase 의 메뉴가 생성한 URL 을 Phase 3 가 해석하는 구조.

이 phase 가 수정할 기존 코드 파일들을 읽고 구조 파악:

- `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` — Admin 문의카드 재분류 메뉴. 자체 구현 (`fixed` 포지셔닝 + viewport 경계 보정). 이 파일에 "웹하드에서 열기" 항목 추가.
- `src/app/worker/_components/WorkerContextMenu.tsx` — Worker 카드 재분류+긴급+분할 메뉴. 동일 패턴.
- `src/app/(admin)/admin/contacts/_components/WebhardFileInfo.tsx` — 기존 "웹하드에서 보기" 버튼이 `/webhard?folderId=...` URL 패턴을 이미 사용. 동일 패턴 재사용 참고.
- `src/components/ui/` 디렉토리 — `<Button>`, `<Badge>` 등 공통 컴포넌트. 필요 시 사용.

## 작업 내용

### 1. `src/lib/utils/webhard-url.ts` (신규)

공통 URL 빌더 유틸.

```ts
export function buildWebhardUrl(
  folderId: string | null | undefined,
  fileId?: string | null | undefined
): string | null {
  if (!folderId) return null;
  const params = new URLSearchParams({ folderId });
  if (fileId) params.set('fileId', fileId);
  return `/webhard?${params.toString()}`;
}
```

folderId 가 falsy 면 null 반환 — 호출처에서 disabled 상태 판단에 사용.

### 2. `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` 수정

기존 메뉴 항목 배열(재분류 "칼선의뢰로 변경", "목형의뢰로 변경") **위**에 새 항목 추가:

- 라벨: "웹하드에서 열기"
- 아이콘: `lucide-react` 의 `FolderOpen` (import 추가)
- disabled 조건: `!contact.webhardFolderId` (또는 `contact.webhard_folder_id`, 기존 파일의 필드 네이밍에 맞춤)
- disabled 시 `title` 속성: `"웹하드 폴더 미생성"`
- 클릭 핸들러: `router.push(buildWebhardUrl(contact.webhardFolderId, contact.webhardFileId)!)` (disabled 아닐 때만 호출되므로 `!` 단언 가능). `router` 는 `useRouter()` from `next/navigation`.
- 메뉴 항목 아래에 `<hr>` 구분선 또는 divider 컴포넌트 추가 (기존 재분류 블록과 시각적 분리)

기존 재분류 항목의 스타일·아이콘 사용 패턴(`Scissors`, `Hammer`)을 그대로 따라간다. `BG_COLOR.hoverMuted` 등 디자인 토큰 유지.

클릭 후 메뉴 자동 닫기: 기존 재분류 클릭 핸들러가 `onClose()` 를 호출하는 패턴을 따른다.

### 3. `src/app/worker/_components/WorkerContextMenu.tsx` 수정

동일 패턴. 기존 재분류/긴급/분할 항목들 **위**에 "웹하드에서 열기" 항목 추가 + `<hr>` 로 분리.

Worker 페이지의 Contact 타입 필드명 확인 필요 — 현재 `contact.webhard_folder_id`(snake_case) 와 `contact.webhardFolderId`(camelCase) 중 어느 쪽을 쓰는지. 기존 파일의 다른 필드 접근 패턴을 보고 동일하게 사용.

### 4. 간소화된 프론트엔드 테스트

#### `src/__tests__/lib/webhard-url.test.ts` (신규, 필수)

순수 유틸 함수 테스트:

```ts
describe('buildWebhardUrl', () => {
  it('returns null when folderId is falsy', () => { ... });
  it('returns /webhard?folderId=X when fileId is omitted', () => { ... });
  it('returns /webhard?folderId=X&fileId=Y when both provided', () => { ... });
  it('treats empty-string fileId as absent', () => { ... });
});
```

4 개 케이스. 순수 함수라 mock 없이 직접 호출. `URLSearchParams` 의 출력 순서는 플랫폼 의존이 아니라 삽입 순서를 따르므로 단언 가능.

#### `src/__tests__/contacts/context-menu-webhard-link.test.tsx` (신규, 간소화)

2 개 케이스 (Admin 메뉴만 대상):

| #   | 케이스                               | assertion                                                                                           |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | `webhardFolderId: 'abc'` + 메뉴 클릭 | `router.push('/webhard?folderId=abc&fileId=xyz')` 호출됨                                            |
| 2   | `webhardFolderId: null`              | 메뉴 항목 렌더되지만 `aria-disabled="true"` 또는 `disabled` 속성, 클릭해도 `router.push` 호출 안 됨 |

`next/navigation` 의 `useRouter` 를 Jest mock. React Testing Library 의 `render` + `getByRole('menuitem', { name: /웹하드에서 열기/ })`. Worker 메뉴 테스트는 중복이라 생략 (같은 패턴).

testing.md 원칙에 따라 케이스 수는 최소화. 복잡한 렌더링 모킹 불필요.

## Acceptance Criteria

```bash
npx tsc --noEmit
```

```bash
pnpm test -- --testPathPattern="(webhard-url|context-menu-webhard-link)"
```

```bash
pnpm build
```

```bash
pnpm lint
```

네 커맨드 모두 통과.

## AC 검증 방법

위 네 커맨드를 **병렬로 실행** (단일 assistant 메시지 + Bash 4 개). 모두 통과하면 `/tasks/22-contact-webhard-navigate/index.json` 의 phase 4 status 를 `"completed"` 로 변경.

3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **기존 메뉴 항목 동작을 바꾸지 마라**. 재분류(칼선/목형) · 긴급 · 분할 항목은 기존 그대로. "웹하드에서 열기" 만 최상단에 **추가**.
- **메뉴 자체의 포지셔닝 · outside-click 로직 건드리지 말 것**. 기존 viewport 경계 보정, Escape 키, mousedown outside 리스너 모두 유지.
- `<hr>` 구분선 스타일은 기존 메뉴의 디자인 토큰(`BORDER_COLOR.default` 등) 활용.
- **`router.push` 사용 (same-tab). `window.open` 또는 `<a target="_blank">` 사용 금지** — 사용자 결정 사항.
- Contact 타입 필드명 camelCase/snake_case 혼용 주의. 기존 파일이 쓰던 방식 따라감. 필요하면 Phase 1 에서 추가한 `webhardFileId` 를 프론트 Contact 타입에 맞게 (camelCase 가 일반적) 통일.
- `dark:` Tailwind 클래스 금지. 디자인 토큰(`BG_COLOR`, `TEXT_COLOR` 등) 또는 `bg-brand`/`text-success` 같은 CSS 변수 기반 유틸 사용.
- `@/` 절대 import. 상대 import 금지.
- Phase 3 에서 구현한 `fileId` 쿼리 해석 로직 전제. URL 형식을 임의로 바꾸지 말 것 — Phase 3 와 정확히 일치해야 한다.
- 한글 커밋: `feat(contact-webhard-navigate): phase 4 — context-menu-webhard-link`.
