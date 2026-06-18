# Phase 5: 프론트엔드 UI — 모달 + 타임라인

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-revision-history.md`
- `/tasks/0-drawing-revision/docs-diff.md` (이번 task의 문서 변경 기록)
- `CLAUDE.md` — 프론트엔드 컨벤션 (스타일 상수, React Query, useEffect cleanup 등)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `src/lib/types/contact.ts` — Phase 4에서 추가한 DrawingRevision 타입
- `src/lib/react-query/queryKeys.ts` — Phase 4에서 추가한 drawingRevisions 키
- `src/lib/hooks/useDrawingRevisions.ts` — Phase 4에서 생성한 훅
- `src/lib/api/nestjs-server-client.ts` — Phase 4에서 추가한 서버 함수들
- `src/app/api/contacts/[id]/drawing-revisions/route.ts` — Phase 4에서 생성한 API 프록시

아래 기존 코드를 반드시 읽고 UI 패턴을 이해하라:

- `src/components/modals/ConfirmModal.tsx` — 모달 컴포넌트 패턴 (BaseModal 사용법, props, 스타일)
- `src/components/ContactTimeline.tsx` — 전체 파일. 타임라인 UI 패턴 (dot + vertical line, 색상, 레이블)
- `src/components/DownloadButton.tsx` — 파일 다운로드 버튼 패턴
- `src/components/ProcessStageIndicatorToggle.tsx` — 전체 파일. 공정 단계 변경 흐름, handleConfirm 로직
- `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx` — 전체 파일. Section 컴포넌트, 섹션 배치 순서
- `src/lib/styles.ts` — TEXT_COLOR, BG_COLOR, BORDER_COLOR, BADGE 등 스타일 상수
- `src/lib/utils/processStages.ts` — getProcessStageInfo(), ProcessStage 타입

## 작업 내용

### 1. 도면 수정 등록 모달: `src/components/modals/DrawingRevisionModal.tsx`

'use client' 컴포넌트. 기존 `ConfirmModal` 패턴을 참고하되, 파일 업로드 기능이 포함된 더 복잡한 모달.

**Props 인터페이스:**

```typescript
interface DrawingRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: number;
  processStage?: string | null; // 현재 공정 단계 (stage_change 모드)
  source?: 'stage_change' | 'manual'; // 트리거 소스
  onComplete?: () => void;
}
```

**UI 구성:**

1. **제목**: "도면 수정 등록" (source='stage_change'이면 "도면이 수정되었나요?" 부제 추가)
2. **파일 드롭존/선택**:
   - `<input type="file" multiple accept=".pdf,.ai,.dxf,.dwg,.cdr,.eps,.svg,.png,.jpg,.jpeg" />`
   - 선택된 파일 목록 표시 (파일명 + 크기 + 삭제 버튼)
   - 드래그앤드롭은 선택사항 (기본 input으로도 충분)
3. **수정 사유 선택**:
   - `<select>` 또는 커스텀 드롭다운
   - 옵션: 도무송 맞춤(domuson_fit), 샘플 수정(sample_revision), 현장 보정(field_correction), 레이저 가공(laser_processing), 기타(other)
   - "기타" 선택 시 자유입력 텍스트 필드 표시
4. **메모** (선택): `<textarea>` (maxLength: 500)
5. **버튼**:
   - source='stage_change': "건너뛰기"(onClose) + "등록"(submit)
   - source='manual': "취소"(onClose) + "등록"(submit)

**업로드 흐름:**

1. 사용자가 "등록" 클릭
2. `serverGetDrawingRevisionUploadUrls(contactId, files)` 호출 → presigned URL 배열 획득
3. 각 파일을 presigned URL로 R2에 직접 PUT 업로드 (Promise.all, 동시 3개 제한은 선택사항)
4. 모든 업로드 완료 후 `serverCreateDrawingRevision(contactId, { reason, reasonDetail, files: [...], processStage, source })` 호출
5. 성공 시: queryClient로 drawingRevisions + contacts.detail 무효화, onComplete 호출, onClose
6. 에러 시: 에러 메시지 표시

**스타일**: `@/lib/styles.ts`의 상수 사용. `dark:` 클래스 직접 사용 금지.

### 2. 도면 수정 히스토리 타임라인: `src/components/DrawingRevisionTimeline.tsx`

'use client' 컴포넌트. 기존 `ContactTimeline.tsx`의 세로 타임라인 패턴을 참고.

**Props 인터페이스:**

```typescript
interface DrawingRevisionTimelineProps {
  revisions: DrawingRevision[];
  contactId: number;
  showVisibilityToggle?: boolean; // admin에서만 true
}
```

**UI 구성:**

- 세로 라인 + 원형 도트 (기존 ContactTimeline과 동일한 시각적 패턴)
- 색상: teal 계열 (기존 타임라인과 구분)
- 각 항목 표시:
  - **상단**: 버전 뱃지 "v{version}" + 날짜/시간 (상대 시간 또는 절대)
  - **사유**: 한글 라벨 (domuson_fit→"도무송 맞춤", sample_revision→"샘플 수정", field_correction→"현장 보정", laser_processing→"레이저 가공", initial→"초기 도면", other→"기타")
  - **공정 단계**: getProcessStageInfo()로 라벨 변환
  - **작업자**: actor_name (없으면 actor_type 표시)
  - **파일 목록**: 각 파일에 DownloadButton (apiUrl: `/api/drawing-revisions/{revisionId}/download?fileIndex={i}`)
  - **메모**: note가 있으면 표시
  - **공개 뱃지**: isPublic이면 "공개" 뱃지, showVisibilityToggle이면 클릭으로 토글

**정렬**: 최신 수정이 위에 (createdAt DESC). revisions 배열을 역순으로 렌더링.

### 3. ProcessStageIndicatorToggle 수정: `src/components/ProcessStageIndicatorToggle.tsx`

기존 컴포넌트에 도면 업로드 모달 트리거를 추가.

**변경사항:**

1. 상단에 state 추가:

```typescript
const [showDrawingRevisionModal, setShowDrawingRevisionModal] = useState(false);
const [completedStageForRevision, setCompletedStageForRevision] = useState<string | null>(null);
```

2. `handleConfirm` 콜백 수정 — `result.success` 블록 내에서, 기존 invalidation/refresh 이후:

```typescript
// 도면 수정 모달 트리거 (drawing, drawing_confirmed 단계에서만)
const DRAWING_REVISION_STAGES = ['drawing', 'drawing_confirmed'];
if (DRAWING_REVISION_STAGES.includes(stageToUpdate)) {
  setCompletedStageForRevision(stageToUpdate);
  setShowDrawingRevisionModal(true);
}
```

3. 컴포넌트 JSX 최하단에 (ConfirmModal 다음에) DrawingRevisionModal 렌더링:

```tsx
{
  contactId && (
    <DrawingRevisionModal
      isOpen={showDrawingRevisionModal}
      onClose={() => {
        setShowDrawingRevisionModal(false);
        setCompletedStageForRevision(null);
      }}
      contactId={contactId}
      processStage={completedStageForRevision}
      source="stage_change"
      onComplete={() => {
        setShowDrawingRevisionModal(false);
        setCompletedStageForRevision(null);
      }}
    />
  );
}
```

4. DrawingRevisionModal import 추가.

### 4. ContactDetailView 수정: `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx`

"도면 및 샘플 정보" 섹션과 "납품업체 정보" 섹션 사이에 "도면 수정 이력" 섹션을 추가.

**변경사항:**

1. import 추가:

```typescript
import { DrawingRevisionTimeline } from '@/components/DrawingRevisionTimeline';
import { DrawingRevisionModal } from '@/components/modals/DrawingRevisionModal';
import { useDrawingRevisions } from '@/lib/hooks/useDrawingRevisions';
```

2. 컴포넌트 내에서 drawingRevisions 훅 호출:

```typescript
const { data: revisions = [], isLoading: isRevisionsLoading } = useDrawingRevisions(contact.id, {
  enabled: isExpanded, // 카드가 펼쳐졌을 때만 로드
});
```

3. 도면 수정 등록 모달 state:

```typescript
const [showRevisionModal, setShowRevisionModal] = useState(false);
```

4. 새 Section 추가 ("도면 및 샘플 정보" 섹션 다음):

```tsx
<Section title="도면 수정 이력">
  <div className="flex items-center justify-between mb-2">
    <span className={`text-xs ${TEXT_COLOR.muted}`}>
      {revisions.length > 0 ? `총 ${revisions.length}건` : ''}
    </span>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShowRevisionModal(true);
      }}
      className={`text-xs ${TEXT_COLOR.accent} hover:underline`}
    >
      + 도면 수정 등록
    </button>
  </div>
  {isRevisionsLoading ? (
    <div className="flex items-center gap-2 py-2">
      <FaSpinner className={`animate-spin text-xs ${TEXT_COLOR.muted}`} />
      <span className={`text-xs ${TEXT_COLOR.muted}`}>로딩 중...</span>
    </div>
  ) : revisions.length > 0 ? (
    <DrawingRevisionTimeline
      revisions={revisions}
      contactId={contact.id}
      showVisibilityToggle={true}
    />
  ) : (
    <p className={`text-xs ${TEXT_COLOR.dim} py-2`}>도면 수정 이력이 없습니다.</p>
  )}
</Section>
```

5. DrawingRevisionModal 렌더링 (컴포넌트 JSX 최하단):

```tsx
<DrawingRevisionModal
  isOpen={showRevisionModal}
  onClose={() => setShowRevisionModal(false)}
  contactId={contact.id}
  processStage={contact.process_stage}
  source="manual"
  onComplete={() => setShowRevisionModal(false)}
/>
```

### 5. ContactTimeline 확장: `src/components/ContactTimeline.tsx`

기존 ContactTimeline에 `drawing_revision` changeType 렌더링 추가.

**변경사항:**

1. 색상 매핑 함수에 추가:

```typescript
case 'drawing_revision':
  return 'text-teal-500';  // 또는 bg-teal-500 (기존 패턴에 맞게)
```

2. 라벨 함수에 추가:

```typescript
case 'drawing_revision': {
  const version = entry.metadata?.revisionVersion;
  const fileCount = entry.metadata?.fileCount;
  return `도면 수정 v${version || '?'}${fileCount ? ` (${fileCount}개 파일)` : ''}`;
}
```

3. 기존 타임라인 엔트리의 세부 표시에 `drawing_revision` 케이스 추가 (간략 표시).

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/0-drawing-revision/index.json`의 phase 5 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `dark:` 클래스를 직접 사용하지 마라. `@/lib/styles.ts`의 상수만 사용.
- `console.log` 금지. `logger.createLogger()` 사용.
- `window.location.reload()` 금지. React Query invalidation 사용.
- `@/` 절대경로 import만 사용.
- 기존 `ContactTimeline.tsx`의 렌더링 로직을 꼼꼼히 읽고 수정하라. switch/case 또는 if-else 분기 형태를 파악하고 해당 패턴에 맞춰 추가.
- `ProcessStageIndicatorToggle.tsx`의 기존 로직을 깨뜨리지 마라. handleConfirm의 기존 동작(invalidation, refresh, alert 등)은 그대로 유지. 모달 트리거만 추가.
- `ContactDetailView.tsx`의 기존 섹션 순서와 스타일을 정확히 유지. 새 섹션은 "도면 및 샘플 정보"와 "납품업체 정보" 사이에 삽입.
- 모달에서 파일 업로드 중 로딩 상태를 표시하라 (isSubmitting state + 스피너).
- useEffect cleanup: 모달이 닫힐 때 진행 중인 업로드가 있다면 적절히 처리 (최소한 상태 초기화).
