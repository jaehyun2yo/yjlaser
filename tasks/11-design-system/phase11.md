# Phase 11: Deprecated Alias 제거 + 정리

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `/CLAUDE.md`, `/yjlaser_website/CLAUDE.md`
- `/docs/specs/features/design-system.md`
- `/tasks/11-design-system/docs-diff.md`

그리고 이전 phase의 작업물을 반드시 확인하라:

- `/src/lib/styles/colors.ts` (Phase 2 — deprecated alias 확인)
- Phase 6-10에서 마이그레이션된 결과물 전체 확인 (git log --oneline -20)

## 작업 내용

### 1. Deprecated Alias 참조 확인

마이그레이션이 완료되었으므로, deprecated 키가 아직 사용되는 곳이 있는지 확인한다.

```bash
# deprecated 키 사용처 검색 예시
grep -r "TEXT_COLOR\.\(tertiary\|strong\|subtle\|dim\|bright\)" src/ --include="*.tsx" --include="*.ts" -l
grep -r "TEXT_COLOR\.\(errorMid\|errorDeep\|errorDark\|redLight\)" src/ --include="*.tsx" --include="*.ts" -l
grep -r "BG_COLOR\.\(white\|gray\|light\|lightGray\)" src/ --include="*.tsx" --include="*.ts" -l
```

**아직 deprecated 키를 사용하는 파일이 있으면:**

- 해당 파일을 새 시맨틱 키로 변환하라
- 모든 참조가 제거된 후에만 deprecated alias를 삭제하라

### 2. `src/lib/styles/colors.ts`에서 deprecated alias 제거

Phase 2에서 생성한 `TEXT_DEPRECATED`, `BG_DEPRECATED`, `BORDER_DEPRECATED` 객체를 삭제한다.

```typescript
// BEFORE
export const TEXT_COLOR = { ...TEXT_NEW, ...TEXT_DEPRECATED } as const;

// AFTER
export const TEXT_COLOR = { ...TEXT_NEW } as const;
// TEXT_DEPRECATED 객체 자체도 삭제
```

`BG_COLOR`, `BORDER_COLOR`도 동일.

### 3. deprecated alias 테스트 제거

`src/__tests__/lib/styles/deprecated-aliases.test.ts`를 삭제한다. 이 테스트는 마이그레이션 기간 동안 alias 존재를 보장하기 위한 것이었으므로, alias가 제거되면 불필요.

### 4. 토큰 스냅샷 테스트 업데이트

`src/__tests__/lib/styles/tokens.test.ts`의 스냅샷을 갱신한다:

```bash
pnpm test -- --testPathPattern="tokens" -u
```

### 5. 미사용 import 정리

마이그레이션으로 인해 사용되지 않는 import가 남아있을 수 있다:

```typescript
// 예: BUTTON_STYLES를 더 이상 사용하지 않는 파일
import { TEXT_COLOR, BUTTON_STYLES } from '@/lib/styles';
// → BUTTON_STYLES 제거 (Button 컴포넌트로 대체됨)
```

모든 `.tsx` 파일에서 unused import를 정리한다.

### 6. 미사용 스타일 상수 정리

`src/lib/styles/` 모듈에서 더 이상 참조되지 않는 상수가 있으면 제거한다. 예:

- `BUTTON_STYLES`는 `<Button>` 컴포넌트로 대체되었으므로, 참조가 0이면 삭제 가능
- `INPUT_STYLES`도 동일
- `BADGE`, `ALERT`, `MODAL`, `TABLE`, `DROPDOWN`, `ICON_BUTTON`도 각 컴포넌트로 대체되었으면 삭제 검토

**삭제 전 반드시 grep으로 참조 확인:**

```bash
grep -r "BUTTON_STYLES" src/ --include="*.tsx" --include="*.ts" -l
```

참조가 남아있으면 삭제하지 마라.

### 7. `index.ts` re-export 정리

삭제된 상수가 있으면 `src/lib/styles/index.ts`의 export에서도 제거한다.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/11-design-system/index.json`의 phase 11 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- **deprecated 키가 아직 사용되는 곳이 1개라도 있으면 해당 키를 삭제하지 마라.** grep으로 반드시 확인.
- **스타일 상수(BUTTON_STYLES 등)도 참조가 0인 것만 삭제.** 1건이라도 참조가 있으면 유지.
- `contactFormStyles.ts`에서 `useContactFormStyles` 훅이 Phase 10에서 제거되었다면, 이 파일도 정리한다. 제거되지 않았다면 그대로 둔다.
- 이 phase 이후 모든 `src/lib/styles/` 파일에서 `dark:` 접두사가 없어야 한다 (gradient 등 예외 제외).
- `pnpm test -- -u` (스냅샷 업데이트)는 tokens.test.ts에만 적용. 다른 테스트의 스냅샷을 함부로 갱신하지 마라.
