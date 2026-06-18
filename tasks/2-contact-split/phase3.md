# Phase 3: NestJS — 그룹 쿼리 + 단계완료 체크 + 일괄 이동 API

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/contact-split.md` (이번 기능 스펙)
- `/tasks/2-contact-split/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/contacts/contacts.service.ts` — Phase 2에서 추가된 `splitContact()`, `getChildren()` 메서드 확인
- `webhard-api/src/contacts/contacts.controller.ts` — Phase 2에서 추가된 엔드포인트 확인
- `webhard-api/src/contacts/dto/split-contact.dto.ts` — Phase 2에서 생성된 DTO 확인

현재 코드를 반드시 읽어라:

- `webhard-api/src/contacts/contacts.service.ts` — `findAll()` 메서드의 구현을 완전히 이해하라. 필터, 페이지네이션, 정렬, include 등 모든 로직.
- `webhard-api/src/contacts/dto/query-contact.dto.ts` — 기존 쿼리 DTO의 파라미터를 이해하라.
- `src/lib/utils/processStages.ts` — 프론트엔드의 공정 단계 정의와 순서를 확인하라. 이 파일에 정의된 단계 순서가 "다음 단계"를 결정하는 기준이다.

## 작업 내용

### 1. findAll() 수정 — 그룹핑 지원

`contacts.service.ts`의 `findAll()` 메서드를 수정한다.

**핵심 변경사항**:

- 기본 쿼리의 `where` 조건에 `parentContactId: null` 추가 (하위 문의는 최상위 목록에서 제외)
- `splitCount > 0`인 Contact에는 `children`을 include (splitIndex ASC 정렬)
- children include에도 workerNotes, drawingRevisions 등 기존 include 옵션 동일 적용

**구체적 로직**:

```
// 1. 기존 where 조건에 추가
where: {
  ...existingWhere,
  parentContactId: null,  // 하위 문의 제외
}

// 2. include에 children 추가
include: {
  ...existingIncludes,
  children: {
    where: { deletedAt: null },
    orderBy: { splitIndex: 'asc' },
    include: {
      // 기존 contact include와 동일한 옵션 (workerNotes 등)
    }
  }
}
```

**주의**: `getStatusCounts()`도 수정하여 하위 문의(`parentContactId != null`)를 카운트에서 제외하라. 그렇지 않으면 분할 시 카운트가 부풀려진다.

### 2. 거래처 조회 수정 — 원본 숨김

`findByCompany()` 메서드를 수정한다:

- `splitCount > 0`인 Contact는 결과에서 제외 (원본 숨김)
- 하위 문의(`parentContactId != null`)는 정상적으로 표시 (개별 문의로 노출)

### 3. 단계 완료 체크 API

#### DTO: `ToggleStageCompletedDto`

```typescript
// stageCompleted: boolean (@IsBoolean)
```

#### 서비스 메서드: `toggleStageCompleted(id: string, dto: ToggleStageCompletedDto)`

1. Contact 조회 (NotFoundException)
2. `parentContactId`가 null이 아닌지 확인 (분할 하위 문의에서만 사용 가능, BadRequestException)
3. `stageCompleted` 값을 dto.stageCompleted로 업데이트
4. 타임라인에 `changeType: 'stage_completed_toggle'` 기록

#### 컨트롤러 엔드포인트:

```
PATCH /contacts/:id/stage-completed
  - @Body() dto: ToggleStageCompletedDto
  - 반환: Contact
```

### 4. 그룹 일괄 다음 단계 이동 API

#### DTO: `AdvanceSplitGroupStageDto`

```typescript
// nextStage: string (@IsString) — 이동할 다음 공정 단계
// actorType: optional string
// actorName: optional string
```

#### 서비스 메서드: `advanceSplitGroupStage(parentId: string, dto: AdvanceSplitGroupStageDto)`

핵심 비즈니스 규칙 (반드시 준수):

1. **유효성 검증**:
   - 원본 Contact가 존재하고 `splitCount > 0`이어야 한다 (BadRequestException)
   - 모든 자식의 `stageCompleted`가 `true`여야 한다 (BadRequestException: "모든 하위 문의의 현재 단계가 완료되어야 합니다. 미완료: N건")

2. **공정 단계 순서 검증**:
   - `dto.nextStage`가 현재 자식들의 processStage보다 다음 순서여야 한다
   - 공정 단계 순서: `drawing` → `drawing_confirmed` → `laser` → `cutting` → `creasing` → `delivery`
   - 이 순서는 `src/lib/utils/processStages.ts`에 정의되어 있으므로, 백엔드에도 동일한 순서를 상수로 정의하라

3. **일괄 업데이트** (Prisma $transaction):
   - 모든 자식의 `processStage`를 `dto.nextStage`로 변경
   - 모든 자식의 `stageCompleted`를 `false`로 리셋
   - 공정 단계에 맞는 타임스탬프 필드도 업데이트 (기존 `updateProcessStage` 로직 참고)

4. **타임라인 기록**: 각 자식에 `process_stage_change` 기록

5. **WebSocket 이벤트**: `contact:group-stage-advanced` 이벤트 발행

#### 컨트롤러 엔드포인트:

```
POST /contacts/:id/children/advance-stage
  - @Body() dto: AdvanceSplitGroupStageDto
  - 반환: { children: Contact[], nextStage: string }
```

### 5. 공정 단계 순서 상수 정의

`webhard-api/src/contacts/constants/process-stages.ts` 파일을 생성하여 공정 단계 순서를 정의:

```typescript
export const PROCESS_STAGE_ORDER: string[] = [
  'drawing',
  'sample',
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
];

export function getNextStage(current: string): string | null {
  const idx = PROCESS_STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx === PROCESS_STAGE_ORDER.length - 1) return null;
  return PROCESS_STAGE_ORDER[idx + 1];
}

export function isValidStageTransition(from: string, to: string): boolean {
  const fromIdx = PROCESS_STAGE_ORDER.indexOf(from);
  const toIdx = PROCESS_STAGE_ORDER.indexOf(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
}
```

## Acceptance Criteria

```bash
cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-contact-split/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `findAll()`의 기존 동작을 깨뜨리지 마라. 분할 관련 조건은 기존 필터에 추가하는 방식이다.
- 페이지네이션 카운트에서도 하위 문의를 제외해야 한다 (total 카운트가 맞아야 함).
- `getStatusCounts()`에서도 하위 문의를 제외하라. 그렇지 않으면 상태별 카운트가 부풀려진다.
- 공정 단계 순서 상수는 프론트엔드의 `processStages.ts`와 일치해야 한다. 프론트엔드 파일을 읽어서 확인하라.
- 기존 `updateProcessStage()` 메서드는 수정하지 마라. 개별 Contact의 단계 변경은 기존 방식 그대로 동작해야 한다.
- 기존 테스트를 깨뜨리지 마라.
