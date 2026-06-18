# Phase 6: 사무실 → 현장 전환 — 프론트엔드 에러 처리 (stage-transition-frontend)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/specs/features/drawing-workflow.md` §W.1 (Phase 0 업데이트 포함) — 전환 정책.
- `docs/specs/features/design-system.md` — 에러 모달/토스트 UI 컨벤션.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.
- Phase 5 산출물 — 백엔드 에러 응답 shape. `code` 필드 기반 분기.

그리고 현재 구조를 이해하라:

**사무실→현장 전환 UI 는 2 개 파일에 분산되어 있다. 둘 다 수정 필요:**

- `src/app/worker/_components/OfficeAdvanceButton.tsx` — **Worker 대시보드 전용**. 클릭 핸들러, 낙관적 업데이트(line 65-95: `queryKeys.processBoard.board({workCategory:'office'|'unclassified'|'field'})` **3 개 카테고리 동시 롤백/갱신**), `ConfirmModal` 로 에러 표시(line 43, 161-170). `queryKeys.contacts.detail()` 은 **사용 안 함**.
- `src/app/(admin)/admin/contacts/[id]/update-process-stage-button.tsx` — **Admin 상세 페이지 전용**. `queryKeys.contacts.all` + `queryKeys.contacts.detail(contactId)` + `queryKeys.processBoard.all` 무효화, `alert()` 로 에러 표시 (line 47). 낙관적 업데이트 없음.

- `src/app/actions/contacts.ts:52-81` `updateProcessStage` Server Action — **현재 반환 shape: `{ success, error: string }`**. Phase 6 에서 `error` 를 객체로 확장하면 위 2 개 버튼의 `result.error` (문자열 가정) 접근이 깨지므로 **함께 수정 필수**.
- `src/lib/api/nestjs-server-client.ts` `serverUpdateContactProcessStage` — NestJS HTTP 호출 래퍼.
- `src/lib/react-query/queryKeys.ts` — Contact 쿼리 키 팩토리 (`contacts.detail`, `contacts.all`, `processBoard.board`, `processBoard.all`).
- `src/components/ui/modal.tsx` 및 기존 `ConfirmModal` (worker 쪽) — 에러 표시 UI. 공용 `ErrorModal` 신규 생성은 불필요 — 기존 `ConfirmModal` 의 `type="error"` 분기 재사용.
- `src/app/worker/_components/WorkerContextMenu.tsx` — 전환 버튼 없음 (재분류·긴급·분할만). Phase 6 대상 아님.

## 작업 내용

### 1. 공용 에러 메시지 매핑 유틸 (신규)

`src/lib/utils/stage-transition-errors.ts` **신규**:

```ts
export interface StageTransitionErrorDetail {
  title: string;
  message: string;
}

export function mapStageTransitionError(error: unknown): StageTransitionErrorDetail {
  // error 는 updateProcessStage 가 반환하는 { code?: string; message: string } 또는 문자열.
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message ?? '')
        : '';

  if (code === 'INQUIRY_NUMBER_REQUIRED') {
    return {
      title: '도면 확정 불가',
      message:
        '이 문의에 문의번호(O-번호)가 할당되어 있지 않아 현장 작업으로 전환할 수 없습니다. 관리자에게 문의번호 발급을 요청하세요.',
    };
  }
  if (code === 'FOLDER_CREATION_FAILED') {
    return {
      title: '웹하드 폴더 생성 실패',
      message:
        '문의 폴더를 생성할 수 없습니다. 업체 정보(Company) 가 정상 등록되어 있는지 확인하세요.',
    };
  }
  return {
    title: '전환 실패',
    message: message || '공정 단계 전환에 실패했습니다.',
  };
}
```

이 유틸은 worker / admin 양쪽 전환 버튼이 **같은 메시지 매핑** 을 재사용하도록 한다.

### 2. Worker `OfficeAdvanceButton.tsx` 에러 분기 추가

기존 파일의 흐름(낙관적 업데이트 → 실패 시 롤백 → `ConfirmModal` 로 에러 표시) 을 **그대로 유지**. `errorModal` 상태를 단순 문자열에서 `{title, message}` 로 확장하고 `mapStageTransitionError` 로 메시지 생성.

```tsx
const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

// ... 기존 낙관적 업데이트 로직 유지 ...

if (!result.success) {
  // 기존 3 개 카테고리 롤백 코드 유지 (processBoard.board office/unclassified/field)
  queryClient.setQueryData(officeQueryKey, previousOfficeData);
  queryClient.setQueryData(unclassifiedQueryKey, previousUnclassifiedData);
  if (isCategoryTransition) {
    queryClient.setQueryData(fieldQueryKey, previousFieldData);
  }
  setErrorModal(mapStageTransitionError(result.error));
  return;
}

// ConfirmModal 렌더부: message={errorModal?.message || ''} title={errorModal?.title || '오류'}
```

주의:

- `queryKeys.contacts.detail()` 을 **여기서 도입하지 마라**. worker 는 리스트 캐시(processBoard.board) 기반이므로 기존 구조 유지.
- 네트워크 예외(catch 블록) 에서도 동일 `mapStageTransitionError` 호출.

### 3. Admin `update-process-stage-button.tsx` 에러 분기 추가

기존 `alert()` 를 Modal 로 교체하거나, 최소 `mapStageTransitionError(result.error).message` 로 사용자 친화적 문구 사용.

```tsx
if (result.success) {
  // 기존 invalidate 유지
  queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(contactId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
  router.refresh();
} else {
  const { title, message } = mapStageTransitionError(result.error);
  // 기존 alert 대신 ConfirmModal 재사용 — 또는 최소 alert 메시지 문구 개선
  alert(`${title}\n${message}`);
}
```

프로젝트에 공용 `ErrorModal` 이 없고 admin 페이지가 이미 `alert()` 기반이므로, 이 phase 에서는 **alert 메시지만 개선**하고 Modal 전환은 별도 task 로 유보해도 된다 (scope 폭주 방지). 사용자에게 구분된 에러 코드는 이미 `mapStageTransitionError` 로 전달됨.

### 4. Server Action 반환 shape 확장 (하위 호환)

**`src/app/actions/contacts.ts:52-81`** 의 `updateProcessStage` 는 현재 `{ success: boolean; error?: string }` 반환. 이를 `error` 가 `string | { code?: string; message: string }` 양쪽을 수용하도록 확장 (union 타입).

```ts
export interface StageTransitionError {
  code?: string;
  message: string;
  statusCode?: number;
}

export async function updateProcessStage(
  contactId: string,
  processStage: ProcessStage
): Promise<{ success: boolean; error?: string | StageTransitionError }> {
  'use server';
  try {
    const actor = await getActorFromSession();
    const stageResult = await serverUpdateContactProcessStage(contactId, processStage, actor);
    if (!stageResult.success) {
      // NestJS 에러 응답이 { code, message } 구조이면 객체로 전달, 아니면 문자열 fallback
      return { success: false, error: stageResult.error };
    }
    revalidatePath('/admin/contacts');
    revalidatePath(`/admin/contacts/${contactId}`);
    revalidatePath('/company/dashboard');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}
```

### 5. `serverUpdateContactProcessStage` 확장 (`src/lib/api/nestjs-server-client.ts`)

기존 함수가 현재 어떤 shape 으로 에러를 반환하는지 확인 후, NestJS 422 응답의 `{ code, message }` 를 구조화하여 전달하도록 수정:

```ts
// try/catch 내부
if (err.response?.status === 422 && err.response.data?.code) {
  return {
    success: false,
    error: {
      code: err.response.data.code,
      message: err.response.data.message,
      statusCode: 422,
    },
  };
}
// fallback: 기존 문자열 메시지 유지 — 호출부 호환.
```

`mapStageTransitionError` 는 string / object 양쪽을 처리하므로, 점진적 전환 중 일부 경로가 문자열만 반환해도 동작한다.

### 6. ErrorModal 신규 생성 금지

공용 `ErrorModal` 컴포넌트를 **새로 만들지 말 것**. 이유:

- worker 쪽은 이미 `ConfirmModal` 의 `type="error"` 분기를 재사용 중.
- admin 쪽은 기존 `alert()` 기반 — Modal 전환은 scope 확대. 이 task 에서는 메시지 문구만 개선.
- 공용 Modal 컴포넌트 도입은 별도 디자인 시스템 task 에서.

## Acceptance Criteria

프론트엔드 phase:

```bash
pnpm build
```

```bash
npx tsc --noEmit
```

```bash
pnpm test
```

### 테스트

`src/__tests__/utils/stage-transition-errors.test.ts` **신규** (순수 유틸):

- `mapStageTransitionError({ code: 'INQUIRY_NUMBER_REQUIRED', message: '...' })` → title='도면 확정 불가'
- `mapStageTransitionError({ code: 'FOLDER_CREATION_FAILED', message: '...' })` → title='웹하드 폴더 생성 실패'
- `mapStageTransitionError('네트워크 오류 문자열')` → title='전환 실패', message='네트워크 오류 문자열'
- `mapStageTransitionError(undefined)` → 기본 메시지

`src/__tests__/worker/office-advance-button.test.tsx` **확장 또는 신규**:

- 성공 응답 → `queryKeys.processBoard.board(...)` 3 개 무효화 호출 확인, 에러 모달 미표시
- 422 `INQUIRY_NUMBER_REQUIRED` → `ConfirmModal` type='error' 로 "도면 확정 불가" 메시지 표시
- 422 `FOLDER_CREATION_FAILED` → "웹하드 폴더 생성 실패" 메시지
- 모든 실패 케이스 → 3 카테고리 낙관적 업데이트 롤백 확인 (`queryClient.setQueryData` spy)

`src/__tests__/admin/update-process-stage-button.test.tsx` **확장 또는 신규**:

- 성공 응답 → `contacts.all`, `contacts.detail`, `processBoard.all` 무효화 + `router.refresh()` 호출
- 422 응답 → `alert()` 에 `mapStageTransitionError` 결과 title + message 포함

## AC 검증 방법

위 3 커맨드 병렬 실행 후 모두 통과 시 phase 6 status `"completed"`.

3 회 이상 실패 시 `"error"` + `error_message`.

## 주의사항

- **백엔드 에러 shape 일관성**: Phase 5 에서 정의한 `code` / `message` 필드 사용. 임의 변경 금지.
- 낙관적 업데이트 롤백은 **반드시 이전 데이터 백업 → 실패 시 복원** 패턴. `queryClient.invalidateQueries` 만으로는 사용자가 보는 UI 가 한순간 잘못된 상태일 수 있다.
- `window.location.reload()` 금지 (프로젝트 Hard Rule). 쿼리 무효화로 갱신.
- `ErrorModal` 이 이미 있으면 재사용. 새로 만들지 말 것. `src/components/ui/` 확인.
- 에러 메시지는 사용자 친화적 한글. 기술 용어(`inquiryNumber`, `FOLDER_CREATION_FAILED`) 를 그대로 노출하지 말 것.
- QA 환경에서 실제로 이 에러가 발생하는지 재현 테스트를 **이 phase 실행 중 최소 1 회** 수행 (사용자 수동 확인). 서버 에러 로그 + 프론트 모달 양쪽 검증.
- 한글 커밋: `feat(qa-contact-worker-v1): phase 6 — stage-transition-frontend`.
