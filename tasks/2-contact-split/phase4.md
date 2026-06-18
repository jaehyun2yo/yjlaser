# Phase 4: 프론트엔드 — 분할 모달 UI

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/contact-split.md` (이번 기능 스펙)
- `/tasks/2-contact-split/docs-diff.md` (이번 task의 문서 변경 기록)
- `CLAUDE.md` (프로젝트 컨벤션 — 스타일링, React Query, 소켓, 파일 구조 등)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/contacts.controller.ts` — Phase 2/3에서 추가된 엔드포인트 확인
- `webhard-api/src/contacts/dto/split-contact.dto.ts` — DTO 구조 확인

현재 프론트엔드 코드를 반드시 읽어라:

- `src/app/(admin)/admin/contacts/ContactDetailModal.tsx` — 전체 파일. 현재 모달 구조, 액션 버튼 배치, 상태 관리 방식을 완전히 이해하라. 분할 버튼은 이 모달에 추가된다.
- `src/app/(admin)/admin/contacts/_components/ContactCardActions.tsx` — 카드 액션 컴포넌트 구조 참고.
- `src/app/(admin)/admin/contacts/[id]/inquiry-type-selector.tsx` — 모달 내 UI 컴포넌트 패턴 참고.
- `src/lib/api/nestjs-server-client.ts` — NestJS API 호출 패턴 이해. 기존 `server*` 함수들의 구현 방식을 따라야 한다.
- `src/app/actions/contacts.ts` — Server Action 패턴 이해.
- `src/lib/react-query/queryKeys.ts` — queryKeys 팩토리 사용 패턴 이해.
- `src/lib/styles.ts` — 스타일 상수 (TYPOGRAPHY, TEXT_COLOR, BUTTON_STYLES 등). 반드시 이 상수를 사용하라. `dark:` 클래스 직접 사용 금지.

## 작업 내용

### 1. API 호출 함수 추가

`src/lib/api/nestjs-server-client.ts`에 추가:

```typescript
// serverSplitContact(id: string, data: { count: number; items?: Array<{ subject?: string; description?: string }> })
// → POST /contacts/{id}/split
// 반환: { parent: Contact, children: Contact[] }

// serverGetContactChildren(parentId: string)
// → GET /contacts/{parentId}/children
// 반환: Contact[]
```

기존 `serverUpdateContactStatus`, `serverUpdateContactProcessStage` 등의 패턴을 정확히 따르라.

### 2. Server Action 추가

`src/app/actions/contacts.ts`에 추가:

```typescript
// splitContact(id: string, data: { count: number; items?: Array<{ subject?: string; description?: string }> })
// → serverSplitContact 호출
// → revalidatePath('/admin/contacts')
```

### 3. queryKeys 추가

`src/lib/react-query/queryKeys.ts`의 contacts 섹션에 추가:

```typescript
// children: (parentId: string) => ['contacts', parentId, 'children']
```

### 4. SplitContactModal 컴포넌트 생성

`src/app/(admin)/admin/contacts/_components/SplitContactModal.tsx`:

**Props**:

```typescript
interface SplitContactModalProps {
  contact: Contact; // 분할 대상 원본 문의
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void; // 분할 성공 후 콜백 (목록 갱신 등)
}
```

**UI 구조**:

1. 모달 헤더: "문의 분할" + 원본 문의번호 표시
2. 분할 개수 입력: 숫자 입력 (2~10, 기본값 2)
3. 각 항목 폼 (개수만큼 동적 생성):
   - 제목 입력 (placeholder: "원본제목 (1)")
   - 설명 입력 (textarea, optional)
4. 미리보기: 생성될 하위번호 목록 (`O-001-1`, `O-001-2` 등)
5. 하단 버튼: [취소] [분할 실행]

**동작**:

- 분할 개수 변경 시 항목 폼 동적 추가/삭제
- "분할 실행" 클릭 시:
  1. Server Action 호출
  2. 로딩 표시
  3. 성공: toast "N종으로 분할되었습니다", onSuccess() 호출, 모달 닫기
  4. 실패: 에러 메시지 표시
- React Query: 성공 시 `queryKeys.contacts.all` 및 관련 쿼리 무효화

**스타일링 규칙**:

- `@/lib/styles.ts`의 상수 사용 (TYPOGRAPHY, TEXT_COLOR, BUTTON_STYLES)
- `dark:` 클래스 직접 사용 금지
- 기존 모달 컴포넌트 패턴 참고 (ContactDetailModal 내부의 모달 사용 방식)

### 5. ContactDetailModal에 분할 버튼 추가

`src/app/(admin)/admin/contacts/ContactDetailModal.tsx`에서:

1. 액션 버튼 영역에 "도면 분할" 버튼 추가
2. 버튼 표시 조건:
   - `contact.parentContactId == null` (하위 문의가 아닌 경우)
   - `contact.splitCount == null || contact.splitCount === 0` (아직 분할되지 않은 경우)
   - `contact.processStage == null || contact.processStage === 'drawing'` (도면작업 초기)
3. 클릭 시 SplitContactModal 열기
4. 분할 성공 시 ContactDetailModal 새로고침 (쿼리 무효화)

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-contact-split/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `ContactDetailModal.tsx`는 61KB짜리 큰 파일이다. 기존 구조를 최대한 유지하고, 분할 관련 코드만 추가하라.
- 모달 상태 관리는 기존 패턴(useState)을 따르라.
- `console.log` 사용 금지. `logger.createLogger('SplitContactModal')`을 사용하라.
- `window.location.reload()` 사용 금지. React Query 무효화로 처리하라.
- 상대 경로 import 금지. `@/` 사용.
- 기존 테스트를 깨뜨리지 마라.
- `'use client'` 디렉티브가 필요한지 확인하라 (모달은 인터랙티브이므로 필요할 가능성 높음).
