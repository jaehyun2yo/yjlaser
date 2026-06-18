# Phase 5: docs-sync-changelog

## 사전 준비

아래를 모두 읽어 phase 1~4 의 실제 구현과 phase 0 문서 diff 의 불일치 여부를 파악하라:

- `tasks/19-worker-drawing-upload/index.json` — 전체 task 구조 + 각 phase status (모두 completed 여야 함).
- `tasks/19-worker-drawing-upload/phase0.md`, `phase1.md`, `phase2.md`, `phase3.md`, `phase4.md` — 각 phase 의 작업 내용.
- `tasks/19-worker-drawing-upload/phase{1,2,3,4}-output.json` — 각 phase 의 실제 실행 결과 (claude agent stdout). 여기서 명시되지 않은 추가 변경 파악.
- `docs/specs/features/drawing-workflow.md` §W.1 (phase 0 에서 선반영된 상태) — 실제 phase 1 코드와 대조.
- `docs/specs/features/drawing-revision-history.md` — phase 2 의 `webhardWarning` 응답 형태와 대조.
- `docs/specs/features/worker-portal.md` — phase 3 의 모달 UX 와 대조.
- `docs/changelog/CHANGELOG.md` — phase 0 에서 추가한 skeleton.
- `docs/features-list.md` (있으면) — FEAT-011 worker-portal 상태 갱신.
- `git diff master...HEAD -- docs/` (run-phases.py 실행 전 baseline 대비) — 전체 문서 변경 총합 확인.

이유: 구현 과정에서 phase 0 에 쓴 설계와 실제 코드가 미세하게 달라지는 경우가 많다. 이 phase 는 그 간극을 닫는 마지막 체크.

## 작업 내용

### 1. 구현-스펙 대조 및 수정

phase 1~4 에서 바뀐 다음 항목이 각 스펙 문서에 정확히 반영되어 있는지 확인, 불일치 발견 시 즉시 수정:

- `ensureInquiryFolder` 새 시그니처 (단일 인자 contactId, inquiryType 파라미터 없음) → `drawing-workflow.md` §W.1.
- `renameInquiryFolderForContact`, `moveInquiryFolderToCompleted` 신규 메서드 → `drawing-workflow.md` §W.1 에 호출 조건 명시.
- `syncRevisionToWebhard` 반환 타입 (`{ webhardFiles, warning? }`) → `drawing-revision-history.md` §7.
- Worker 모달의 드래그드랍·BaseModal 기반 UX → `worker-portal.md`.
- 타임라인 staleTime 30s + 카드 레벨 소켓 구독 → `worker-portal.md` 또는 `drawing-workflow.md`.

### 2. `docs/changelog/CHANGELOG.md` 본문 작성

phase 0 에서 skeleton 만 있던 엔트리를 본문으로 채운다:

```markdown
### 2026-04-21 — worker-drawing-upload (task 19)

**Worker 도면 업로드 UX 개선 + 웹하드 폴더 정책 재설계**

**사용자 영향 버그 수정 (6건)**

1. Worker 도면 업로드 모달에 드래그드랍 지원 추가.
2. 모달 오픈 시 뒤 영역 클릭·body 스크롤 잠금 (BaseModal 기반 재작성).
3. 본인 업로드 직후 타임라인 즉시 반영 (refetchQueries + staleTime 30s).
4. 문의 폴더 자동 생성 및 두 번째 도면 저장 문제 해결 (ensureInquiryFolder 재설계).
5. 타 사용자 업로드 시 펼쳐진 카드 실시간 반영 (카드 레벨 소켓 구독).
6. 5 번 버그와 동일 원인 — staleTime + enabled 조합 해결로 완전 해소.

**아키텍처 변경**

- 웹하드 폴더 구조: `{업체}/{칼선의뢰|목형의뢰}/문의-{번호}/` → `{업체}/문의-{O}_{F}/` 단순화.
  - 기존 template (칼선의뢰, 목형의뢰) 은 거래처 원본 업로드 수신 경로로 유지.
  - F 번호 추가 발급 시 폴더명 자동 rename.
  - 납품 완료 시 `{업체}/완료/문의-{O}_{F}/` 로 이동.
- `syncRevisionToWebhard` 에러 전파: `.catch` 제거 후 응답에 `webhardWarning?` 필드. 프론트는 toast 로 안내.
- 원본 도면 + Worker revision 모두 동일 `문의-{번호}/` 폴더로 `relocateContactFiles` 일괄 이동.

**영향 파일**

- 백엔드: `folders.service.ts`, `drawing-revision.service.ts`, `contacts.service.ts`, `inquiry-filename.util.ts`.
- 프론트: `WorkerDrawingUpload.tsx`, `useContactTimeline.ts`, `useTimelineRealtime.ts` (신규), `StaffContactCard.tsx`, `OfficeContactCard.tsx`.
- DB: 기존 `webhard_folders` 컬럼 (task 18 추가분) 활용 — 이번 task 는 스키마 변경 없음.

**호환성**

- 기존 rootFolder / template 에 저장된 파일은 건드리지 않음. 새 문의부터 새 구조 적용.
- 응답 성공 컨트랙트 유지 — `webhardWarning` 은 optional 추가 필드.
```

### 3. `docs/features-list.md` 갱신 (있으면)

- FEAT-011 worker-portal 항목: "도면 업로드 UX 개선 (드래그드랍·scroll lock·실시간 반영) — 2026-04-21" 추가.

### 4. 최종 린트·타입 체크

문서만 수정했더라도 혹시 링크 깨짐·typo 로 인한 build 실패 방지를 위해 AC 커맨드 실행.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && cd webhard-api && pnpm build
```

독립 커맨드이므로 **병렬 실행 권장** — 단일 assistant 메시지에 Bash 3 개 tool_use 블록으로 동시 발사.

## AC 검증 방법

세 커맨드 모두 통과 시 `tasks/19-worker-drawing-upload/index.json` 의 phase 5 status 를 `"completed"`, task-level `completed_at` 을 `scripts/run-phases.py` 가 자동 기록. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- 이 phase 는 **코드 수정 금지** — docs + CHANGELOG + features-list 만.
- phase 1~4 산출물과 스펙이 다르면 **스펙을 수정** (코드 기준 정합성). 코드 수정 금지.
- CHANGELOG 는 phase 0 에서 만든 skeleton 의 위치를 유지. 새 헤더 추가 금지.
- features-list.md 가 없으면 이 단계는 skip.
- 미완료 phase 가 하나라도 있으면 (index.json 에서 `"completed"` 아닌 항목) 이 phase 를 진행하지 말고 `"error"` 기록 후 중단.
