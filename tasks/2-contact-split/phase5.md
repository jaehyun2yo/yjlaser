# Phase 5: 프론트엔드 — 목록 그룹핑 + 진행률 + 일괄 이동 UI

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/contact-split.md` (이번 기능 스펙)
- `/tasks/2-contact-split/docs-diff.md` (이번 task의 문서 변경 기록)
- `CLAUDE.md` (프로젝트 컨벤션)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `src/app/(admin)/admin/contacts/_components/SplitContactModal.tsx` — Phase 4에서 생성된 분할 모달
- `src/lib/api/nestjs-server-client.ts` — Phase 4에서 추가된 API 함수들
- `src/app/actions/contacts.ts` — Phase 4에서 추가된 Server Action
- `webhard-api/src/contacts/contacts.controller.ts` — Phase 2/3에서 추가된 모든 엔드포인트

현재 프론트엔드 코드를 반드시 읽어라:

- `src/app/(admin)/admin/contacts/ContactsList.tsx` — 전체 파일. 문의 목록 렌더링 로직을 완전히 이해하라. 이 파일에 그룹핑 로직을 추가한다.
- `src/app/(admin)/admin/contacts/_components/ContactCard.tsx` — 카드 컴포넌트 구조
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — 카드 헤더 컴포넌트
- `src/app/(admin)/admin/contacts/_components/ContactCardSummary.tsx` — 카드 요약 컴포넌트
- `src/app/(admin)/admin/contacts/quick-process-stage-select.tsx` — 공정 단계 선택 드롭다운 (일괄 이동 UI에서 재사용 가능)
- `src/lib/utils/processStages.ts` — 공정 단계 정의와 순서
- `src/lib/styles.ts` — 스타일 상수

## 작업 내용

### 1. API 호출 함수 추가

`src/lib/api/nestjs-server-client.ts`에 추가:

```typescript
// serverToggleStageCompleted(id: string, data: { stageCompleted: boolean })
// → PATCH /contacts/{id}/stage-completed
// 반환: Contact

// serverAdvanceSplitGroupStage(parentId: string, data: { nextStage: string; actorType?: string; actorName?: string })
// → POST /contacts/{parentId}/children/advance-stage
// 반환: { children: Contact[], nextStage: string }
```

### 2. Server Action 추가

`src/app/actions/contacts.ts`에 추가:

```typescript
// toggleStageCompleted(id: string, stageCompleted: boolean)
// → serverToggleStageCompleted 호출
// → revalidatePath

// advanceSplitGroupStage(parentId: string, nextStage: string)
// → serverAdvanceSplitGroupStage 호출
// → revalidatePath
```

### 3. 순수 유틸리티 함수 추가

`src/app/(admin)/admin/contacts/_lib/split-utils.ts` 생성:

```typescript
// generateSplitNumber(baseNumber: string, index: number): string
// 예: generateSplitNumber("260413-O-001", 2) → "260413-O-001-2"

// calcGroupProgress(children: Contact[]): { completed: number; total: number; allCompleted: boolean }
// children의 stageCompleted 필드를 기준으로 진행률 계산

// canGroupAdvance(children: Contact[]): boolean
// 모든 children의 stageCompleted가 true인지 확인

// getNextProcessStage(currentStage: string): string | null
// processStages.ts의 순서에 따라 다음 단계 반환
```

### 4. SplitGroupCard 컴포넌트 생성

`src/app/(admin)/admin/contacts/_components/SplitGroupCard.tsx`:

분할된 문의 그룹을 표시하는 컴포넌트. 원본(부모)이 그룹 헤더, 하위 문의들이 들여쓰기되어 표시.

**Props**:

```typescript
interface SplitGroupCardProps {
  parent: Contact & { children: Contact[] };
  onContactClick: (contact: Contact) => void; // 상세 모달 열기
}
```

**UI 구조**:

```
┌──────────────────────────────────────────────────────┐
│ 📎 260413-O-001  원컴퍼니 (3종 분할)                    │
│    진행: 칼작업 2/3 완료                                │
│                                      [▼ 접기/펼치기]   │
├──────────────────────────────────────────────────────┤
│  ┌─ O-001-1  가차_목형       칼작업  [✓ 완료]          │
│  ├─ O-001-2  미니박스        칼작업  [ ] 진행중         │
│  └─ O-001-3  디스플레이      칼작업  [✓ 완료]          │
├──────────────────────────────────────────────────────┤
│  ⏳ 1건 남음 — 모두 완료되면 다음 단계 이동 가능         │
│  (또는)                                               │
│  ✅ 모두 완료! [전체 → 오시작업으로 이동]                │
└──────────────────────────────────────────────────────┘
```

**동작 상세**:

1. **그룹 헤더**:
   - 원본 문의번호 + 업체명 + "(N종 분할)" 뱃지
   - 진행률: "칼작업 2/3 완료"
   - 접기/펼치기 토글 (기본: 펼쳐진 상태)

2. **하위 문의 목록** (펼쳐진 상태):
   - 들여쓰기 + 연결선 (├─, └─)
   - 각 하위 문의: 번호 + 제목 + 공정단계 + 완료 체크박스
   - 체크박스 클릭 시 `toggleStageCompleted` Server Action 호출
   - 하위 문의 카드 클릭 시 상세 모달 열기 (onContactClick)

3. **하단 그룹 액션 영역**:
   - 모두 완료 전: "N건 남음 — 모두 완료되면 다음 단계 이동 가능" 메시지
   - 모두 완료 시: "[전체 → {다음단계}로 이동]" 버튼 활성화
   - 버튼 클릭 시 확인 모달 표시 후 `advanceSplitGroupStage` 호출
   - 성공 시: 쿼리 무효화, toast "오시작업으로 이동했습니다"

### 5. ContactsList 수정 — 그룹핑 렌더링

`src/app/(admin)/admin/contacts/ContactsList.tsx` 수정:

**렌더링 로직 변경**:

- API 응답에서 `splitCount > 0`인 Contact는 `SplitGroupCard`로 렌더링
- `splitCount`가 없거나 0인 Contact는 기존 `ContactCard`로 렌더링
- 하위 문의(`parentContactId != null`)는 API에서 이미 제외되어 오므로 프론트에서 추가 필터링 불필요

```tsx
// 렌더링 로직 (의사코드)
contacts.map((contact) => {
  if (contact.splitCount && contact.splitCount > 0 && contact.children) {
    return <SplitGroupCard key={contact.id} parent={contact} onContactClick={...} />;
  }
  return <ContactCard key={contact.id} contact={contact} />;
});
```

### 6. 거래처 포탈 수정 (최소)

거래처가 주문 목록을 보는 페이지에서:

- 원본(splitCount > 0)은 API 레벨에서 이미 제외됨 (Phase 3의 findByCompany 수정)
- 하위 문의는 일반 문의와 동일하게 표시됨
- 추가 프론트엔드 작업이 필요한지 확인하라:
  - `src/app/(company)/` 하위 경로에서 주문/문의 목록 페이지를 찾아 확인
  - 하위번호 (O-001-1) 형식이 정상 표시되는지 확인
  - 추가 작업 없이 동작하면 그대로 두라

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-contact-split/index.json`의 phase 5 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `ContactsList.tsx`의 기존 렌더링 로직을 깨뜨리지 마라. 분할되지 않은 일반 문의는 기존과 100% 동일하게 동작해야 한다.
- 스타일링은 반드시 `@/lib/styles.ts` 상수를 사용하라. `dark:` 클래스 직접 사용 금지.
- `console.log` 금지. logger 사용.
- `window.location.reload()` 금지. React Query 무효화.
- 상대 경로 import 금지. `@/` 사용.
- 접기/펼치기 상태는 `useState`로 컴포넌트 로컬 관리. 전역 상태 불필요.
- 체크박스 클릭과 카드 클릭 이벤트가 충돌하지 않도록 `e.stopPropagation()` 처리하라.
- `SplitGroupCard`는 `'use client'` 디렉티브 필요 (인터랙티브 — 접기/펼치기, 체크박스, 버튼 클릭).
- 기존 테스트를 깨뜨리지 마라.
- 거래처 포탈 수정은 필요한 경우에만 최소한으로 하라. 불필요하면 생략.
