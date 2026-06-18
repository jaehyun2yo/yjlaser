# Phase 3: frontend-modal

## 사전 준비

아래를 반드시 읽어 현 모달 구현·공통 모달 패턴·응답 타입을 파악하라:

- `tasks/19-worker-drawing-upload/phase2.md` — 응답에 추가된 `webhardWarning` 필드. 이 phase 는 이 필드를 읽어 toast 를 띄운다.
- `tasks/19-worker-drawing-upload/docs-diff.md` — 문서 diff.
- `docs/specs/features/worker-portal.md` (phase 0 에서 업데이트된 UX 요구사항).
- `src/app/worker/_components/WorkerDrawingUpload.tsx` — 현 구현. 자체 `fixed inset-0 z-50` div 로 모달 구현. `input[type=file]` + `ref.click()`. 드래그드랍 없음. body scroll lock 없음. overlay click 무시.
- `src/components/modals/BaseModal.tsx` — 공통 모달. overlay click · ESC · body scroll lock 이미 내장. 이 phase 는 이 컴포넌트로 래핑.
- `src/components/modals/DrawingRevisionModal.tsx` — admin 용 참고 예시. BaseModal 사용 패턴 확인.
- `src/app/worker/_components/ConfirmModal.tsx` — 현 error/success alert 용. 유지.
- `src/app/worker/_components/StaffContactCard.tsx:454`, `OfficeContactCard.tsx:475` — `WorkerDrawingUpload` 호출처. props 계약 유지.
- `src/__tests__/worker/` — 기존 테스트 구조.

이유: BaseModal 로 교체하면 overlay click / ESC / scroll lock 3 가지 요구사항이 자동 해결되므로 직접 구현하지 않는다 (task 18 선례: `DrawingRevisionModal` 과 동일한 패턴 재사용).

## 작업 내용

### 1. `WorkerDrawingUpload.tsx` 재작성

- 루트 JSX `<div className="fixed inset-0 ...">` 를 `<BaseModal isOpen onClose={onClose} title="도면 업로드" subtitle={companyName}>` 으로 교체. 헤더의 X 버튼은 BaseModal 이 제공하므로 중복 제거.
- 파일 선택 영역 (현 `<button onClick={() => fileInputRef.current?.click()}>`) 을 `<div>` 로 변경하고 다음을 추가:
  - `onDragEnter / onDragOver`: `e.preventDefault()` + `setIsDragActive(true)`.
  - `onDragLeave`: `setIsDragActive(false)`.
  - `onDrop`: `e.preventDefault()` + `setIsDragActive(false)` + `e.dataTransfer.files[0]` 에 대해 `validateFile` 실행 후 `setSelectedFile`.
  - 클릭 시 여전히 `fileInputRef.current?.click()` 호출 (두 방식 공존).
  - `isDragActive === true` 일 때 border 색·배경 하이라이트 (Tailwind: `border-[#ED6C00] bg-orange-50`).
- `handleUpload` 의 `createResponse` 파싱 부분 수정:
  ```ts
  const createData: { webhardWarning?: { code: string; message: string } } =
    await createResponse.json();
  setSelectedFile(null);
  setSuccessModal(true);
  if (createData.webhardWarning) {
    // 기존 ConfirmModal 재활용: errorModal state 대신 warningModal 추가하거나
    // 성공 모달 메시지에 경고 본문을 append
    setWarningMessage(createData.webhardWarning.message);
  }
  await queryClient.refetchQueries({
    queryKey: queryKeys.contacts.timeline(contactId),
    type: 'active',
  });
  await queryClient.invalidateQueries({
    queryKey: queryKeys.contacts.detail(contactId),
  });
  ```
  (상세 refetch / invalidate 전략은 phase 4 에서 최종 조정 — 여기서는 warning 처리만 핵심.)
- 드래그드랍 validate: 기존 `validateFile` 재사용 (확장자·크기).

### 2. toast / warning 표출 방식

프로젝트에 기존 toast 유틸 (예: sonner, react-hot-toast) 이 있으면 그걸 사용. 없으면 `ConfirmModal` 을 재활용하여 `warningModal` state 로 "업로드 완료 (경고: ...)" 표시.

우선순위: `src/components/ui/` 나 `src/lib/ui/` 에서 `toast` 또는 `useToast` 검색 → 있으면 채용. 없으면 ConfirmModal 확장.

### 3. 기존 기능 보존

- `reason` select 옵션 4 종 (`domuson_fit`, `sample_revision`, `field_correction`, `other`) 및 `REASON_LABELS` 상수 **그대로 유지** — 서버 매핑 없음 (사유는 Revision 메타로만 기록).
- 파일 검증 (`validateFile`, `ALLOWED_EXTENSIONS`, `MAX_FILE_SIZE`) 그대로.
- 성공 모달 (`ConfirmModal`) → onClose 연결 유지.

### 4. 테스트 확장

`src/__tests__/worker/WorkerDrawingUpload.test.tsx` (없으면 신규):

- M1: 드래그 진입 → 하이라이트 클래스 (`border-[#ED6C00]` 또는 data-drag-active) 적용.
- M2: 파일 drop 시 `selectedFile` state 업데이트 (UI 상 선택 파일명 표시 확인).
- M3: 비허용 확장자 파일 drop → 에러 모달 표출, `selectedFile` 변경 없음.
- M4: overlay click → `onClose` prop 호출 (BaseModal 기본 동작 검증).
- M5: ESC 키 → `onClose` 호출.
- M6: mutation 응답에 `webhardWarning` 있을 때 warning 메시지 노출 (toast mock 또는 ConfirmModal 확인).
- M7: 업로드 성공 + warning 없을 때 일반 성공 모달 노출.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="WorkerDrawingUpload"
```

## AC 검증 방법

위 커맨드 통과 시 `tasks/19-worker-drawing-upload/index.json` 의 phase 3 status 를 `"completed"`. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- `BaseModal` 이 이미 overlay click / ESC / body scroll lock 을 제공 — 이 세 기능을 **직접 구현하지 말 것**.
- 기존 자체 `<div className="fixed inset-0 ...">` 는 완전히 제거. 이중 모달 구조 금지.
- 드래그드랍 영역은 기존 파일 선택 버튼과 **같은 UI 요소**. 별도 드롭존 시각 영역 신설 금지 (UX 단순성).
- `useSocketNamespace` · 카드 레벨 소켓 구독 추가 **금지** — phase 4 업무.
- `reason` select 의 옵션·value·label 변경 금지. 서버는 이 값을 Revision 메타로만 저장.
- `handleUpload` 의 3 단계 (presigned URL → PUT → DrawingRevision 생성) 흐름 유지. 순서 재배치 금지.
- 기존 `StaffContactCard` / `OfficeContactCard` 의 `<WorkerDrawingUpload contactId companyName onClose />` props 계약 **변경 금지**.
