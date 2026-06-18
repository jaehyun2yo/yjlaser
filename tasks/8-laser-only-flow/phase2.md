# Phase 2: 프론트엔드 — 업체 대시보드 + 관리자 공정보드 + 작업자 앱

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/laser-only-company-inquiry.md` (Phase 0에서 업데이트됨)
- `CLAUDE.md` (프로젝트 컨벤션)
- `/tasks/8-laser-only-flow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- Phase 1에서 추가된 백엔드 API: `POST /contacts/:id/complete-laser`
- Phase 1에서 수정된 `contacts.service.ts`의 `updateProcessStage` 레이저 전용 분기

반드시 다음 파일들을 꼼꼼히 읽어라:

- `src/lib/utils/processStages.ts` (공정 단계 정의)
- `src/app/company/dashboard/_components/OrderProgressBar.tsx` (업체 대시보드 프로그레스 바)
- `src/app/company/dashboard/page.tsx` (업체 대시보드 페이지)
- `src/app/company/dashboard/types.ts` (업체 대시보드 타입)
- `src/app/company/dashboard/utils.ts` (업체 대시보드 유틸)
- `src/app/(admin)/admin/process-board/_components/ProcessMoveModal.tsx` (관리자 공정 이동 모달)
- `src/app/(admin)/admin/process-board/page.tsx` (관리자 공정 보드)
- `src/app/worker/_components/StaffContactCard.tsx` (작업자 카드)

## 배경

레이저 전용 업체의 문의(`inquiry_type = 'laser_cutting'`)는 3단계만 거친다:

- 접수 → 레이저가공 → 완료

이 흐름을 프론트엔드 3개 영역에 반영해야 한다:

1. **업체 대시보드**: OrderProgressBar에서 3단계만 표시
2. **관리자 공정보드**: 레이저 전용 문의의 이동 옵션에서 완료만 제공
3. **작업자 앱**: 레이저 전용 문의에 "레이저가공 완료" 버튼

## 작업 내용

### 1. `processStages.ts` — 레이저 전용 단계 배열 추가

파일: `src/lib/utils/processStages.ts`

레이저 전용 업체용 단계 배열을 추가하라:

```typescript
export const LASER_ONLY_STAGES: ProcessStageInfo[] = [
  { id: 'laser', label: '접수', order: 1, ... },        // 접수 = 레이저 대기
  { id: 'laser', label: '레이저가공', order: 2, ... },  // 현재 단계
  { id: null, label: '완료', order: 3, ... },            // 완료
];
```

주의: 위는 개념적 구조이다. 실제 구현에서는 기존 `ProcessStageInfo` 타입과 호환되도록 구현하라. 핵심은:

- 레이저 전용 문의에 대해 3단계를 표현할 수 있는 별도 배열/함수를 제공하는 것
- `isLaserOnlyInquiry(inquiryType: string | null): boolean` 헬퍼 함수 추가

### 2. `OrderProgressBar.tsx` — 레이저 전용 3단계 표시

파일: `src/app/company/dashboard/_components/OrderProgressBar.tsx`

Props에 `inquiryType`을 추가하라 (optional, 기본값 null):

```typescript
interface OrderProgressBarProps {
  currentStage: ProcessStage;
  isStarted: boolean;
  inquiryType?: string | null; // 추가
}
```

`inquiryType === 'laser_cutting'`인 경우:

- `PROCESS_STAGES_ARRAY` 대신 레이저 전용 3단계 배열을 사용
- 3단계: 접수 → 레이저가공 → 완료
- `processStage === 'laser'`이면 "레이저가공" 단계가 "진행중"
- `status === 'delivered'`이면 모든 단계 완료 표시

단, 이 컴포넌트는 `status`를 직접 받지 않는다. `isStarted`와 `currentStage`만 받으므로:

- `currentStage === null && isStarted === false`: 접수 상태 (하지만 laser_cutting은 laser에서 시작하므로 이 경우는 없음)
- `currentStage === 'laser'`: 레이저가공 진행중
- `currentStage === null && (status가 delivered)`: 완료 — 이 경우를 처리하려면 `isCompleted` prop 추가 필요

**`isCompleted` prop을 추가하라** (optional boolean):

- 부모 컴포넌트에서 `status === 'delivered'`일 때 `isCompleted={true}` 전달
- 레이저 전용 + isCompleted이면 3단계 모두 완료 표시

### 3. 업체 대시보드 페이지에서 props 전달

파일: `src/app/company/dashboard/page.tsx` 또는 관련 컴포넌트

`OrderProgressBar`에 `inquiryType`과 `isCompleted`를 전달하라.
데이터 소스(API 응답)에서 `inquiry_type`과 `status` 필드를 활용.

### 4. `ProcessMoveModal.tsx` — 레이저 전용 완료 옵션

파일: `src/app/(admin)/admin/process-board/_components/ProcessMoveModal.tsx`

이 모달을 읽고, 레이저 전용 문의의 이동 옵션을 수정하라:

- 해당 문의의 `inquiry_type`을 확인 (props나 데이터에서)
- `inquiry_type === 'laser_cutting'`이고 현재 `processStage === 'laser'`이면:
  - 기존 다음 단계 목록(cutting, creasing, delivery) 대신 **"레이저가공 완료"** 버튼만 표시
  - 클릭 시 `POST /api/admin/contacts/{id}/complete-laser` 호출
  - 성공 시 모달 닫기 + 목록 갱신

### 5. 작업자 앱 — 레이저가공 완료 버튼

파일: `src/app/worker/_components/StaffContactCard.tsx` (또는 적절한 작업자 카드 컴포넌트)

레이저 전용 문의(`inquiry_type === 'laser_cutting'`, `processStage === 'laser'`)에 대해:

- "레이저가공 완료" 버튼 표시
- 클릭 시 `POST /api/admin/contacts/{id}/complete-laser` 호출 (또는 worker용 API가 있으면 그것 사용)
- 성공 시 카드 상태 갱신

작업자 카드 컴포넌트 구조를 먼저 읽고, 기존 패턴(버튼 스타일, API 호출 방식, 토스트 알림)을 따라 구현하라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/8-laser-only-flow/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `OrderProgressBar`의 기존 7단계 표시를 깨뜨리지 마라. 레이저 전용일 때만 3단계를 보여주는 **분기**를 추가하는 것이다.
- 스타일은 기존 컴포넌트 패턴을 따라라. `@/lib/styles`의 상수를 사용하라. `dark:` 클래스를 직접 사용하지 마라.
- React Query 캐시 무효화: 완료 처리 후 관련 쿼리를 `queryKeys` 팩토리로 무효화하라. `window.location.reload()` 금지.
- `console.log` 금지. `logger.createLogger()` 사용.
- 기존 테스트를 깨뜨리지 마라.
- inquiry_type 정보가 기존 API 응답에 없는 컴포넌트가 있을 수 있다. 그 경우 데이터 흐름을 추적하여 필요한 곳에 `inquiry_type` 필드를 추가하라.
