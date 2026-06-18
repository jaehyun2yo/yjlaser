# Phase 5: 문서 동기화 + 마무리 (docs-sync-wrap)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/changelog/CHANGELOG.md` — 이전 task(task 20, 21) 의 기록 포맷 확인. 동일 포맷으로 이번 task 를 기록한다.
- `docs/features-list.md` — 기능 상태 목록. 이번 task 관련 항목(웹하드 자동 이동, 컨텍스트 메뉴 웹하드 연결) 갱신 위치 확인.
- `docs/specs/features/drawing-workflow.md` §W.1 — Phase 0 에서 업데이트된 최종 정책.
- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 에서 업데이트된 메뉴 스펙.
- `docs/specs/features/worker-portal.md` — Phase 0 에서 체크될 Completion Criteria.
- `docs/specs/api/endpoints/webhard.md` — Phase 0 에서 업데이트된 URL 규약.
- `/tasks/22-contact-webhard-navigate/docs-diff.md` — Phase 0 문서 변경 기록.
- `.claude/rules/spec-code-sync.md` — Spec-Code 동기화 규칙. 이번 phase 의 행동 기준.

그리고 이전 phase 의 작업물을 모두 확인하라 (Phase 1~4 의 모든 산출물):

- `webhard-api/src/folders/_lib/resolve-company-root.util.ts` (Phase 1 신규)
- `webhard-api/src/folders/folders.service.ts` (Phase 1 수정)
- `webhard-api/src/contacts/contacts.service.ts` (Phase 1 수정)
- `webhard-api/src/contacts/dto/` (Phase 1 수정)
- `src/lib/types/contact.ts` (Phase 1 수정)
- `webhard-api/src/folders/_lib/resolve-company-root.util.spec.ts` (Phase 2 신규)
- Phase 2 에서 확장된 기존 spec 파일들
- `src/app/webhard/components/containers/WebhardMain.tsx` (Phase 3 수정)
- `src/__tests__/webhard/webhard-main-fileid.test.tsx` (Phase 3 신규)
- `src/lib/utils/webhard-url.ts` (Phase 4 신규)
- `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` (Phase 4 수정)
- `src/app/worker/_components/WorkerContextMenu.tsx` (Phase 4 수정)
- `src/__tests__/lib/webhard-url.test.ts` (Phase 4 신규)
- `src/__tests__/contacts/context-menu-webhard-link.test.tsx` (Phase 4 신규)

## 작업 내용

### 1. Spec-Code 정합성 최종 확인

Phase 1~4 에서 구현한 코드를 다시 훑으며, Phase 0 이 작성한 문서와 **불일치가 없는지** 확인한다. 불일치가 있으면:

- 코드가 맞고 문서가 틀렸다 → 문서 수정
- 문서가 맞고 코드가 틀렸다 → 이는 Phase 1~4 에서 정책에서 벗어난 구현이므로, 해당 phase 의 코드를 수정 (이 phase 에서 함께 커밋 OK — spec-code-sync.md Rule 2 준수)

체크 포인트:

- `resolveCompanyRoot` 의 3 단계 fallback 순서가 `drawing-workflow.md §W.1` 규칙과 일치하는가?
- `relocateContactFiles` silent bail-out 이 제거되었는가?
- Contact 응답 DTO 에 `webhardFileId` 가 포함되고, 값이 "최신 DrawingRevision 의 `webhardFileIds[0]`" 규칙대로 채워지는가?
- 웹하드 페이지 URL 이 `/webhard?folderId=...&fileId=...` 형식을 정확히 따르는가?
- 컨텍스트 메뉴의 disabled 조건이 `webhard_folder_id == null` 과 정확히 일치하는가?
- `worker-portal.md` 의 "작업 파일 열기 (웹하드 연결)" 체크가 Phase 0 에서 반영되었는가?

### 2. `docs/changelog/CHANGELOG.md` 기록

이전 task(task 20, 21) 의 포맷을 따라 새 엔트리 추가. 날짜는 2026-04-24 (task 22 created_at 기준).

포함할 내용:

- Task 22 contact-webhard-navigate 요약
- 주요 변경 두 가지:
  1. `relocateContactFiles` company 탐색 정책 통일 (silent bail-out 제거, LGU+ 가상 업체 도면 자동 이동 복구)
  2. Admin · Worker 문의카드 우클릭 메뉴에 "웹하드에서 열기" 항목 추가 (폴더 이동 + 파일 하이라이트)
- Breaking change 표시: `relocateContactFiles` 반환값에는 변경 없음, API 계약 불변. **Not a breaking change**.
- 추가된 신규 파일 및 수정된 파일 요약 (3~5 줄)

### 3. `docs/features-list.md` 상태 갱신

관련 기능 항목의 상태를 업데이트:

- "웹하드 자동 이동 (Inquiry 분류 시)" — 정책 통일로 LGU+ 가상업체 지원 확장 표시
- "문의카드 컨텍스트 메뉴 — 웹하드 연결" — 신규 추가, Admin + Worker 공통 명시

기존 항목 구조 · 포맷을 읽고 동일하게 작성.

### 4. 통합 AC 검증

전체 빌드 · 테스트 통과 확인:

```bash
pnpm build
```

```bash
npx tsc --noEmit
```

```bash
pnpm test
```

```bash
cd webhard-api && pnpm build
```

```bash
cd webhard-api && pnpm test
```

```bash
pnpm lint
```

모두 통과해야 한다.

### 5. (선택) 로컬 스모크 체크

코드 검증 범위 내에서 수행. 브라우저 실행은 이 phase 에서 강제하지 않음 (UI 플로우는 헤드리스 테스트 기반).

## Acceptance Criteria

위 5 개 검증 커맨드(pnpm build / tsc / pnpm test / webhard-api build / webhard-api test / lint) 를 **병렬 실행** (단일 assistant 메시지 + Bash 6 개) 하여 모두 통과.

AC 만족 시 `/tasks/22-contact-webhard-navigate/index.json` 의 phase 5 status 를 `"completed"` 로, 그리고 `/tasks/index.json` 의 task 22 status 를 `"completed"` 로 변경.

## AC 검증 방법

위 병렬 실행 결과 모두 통과 시 `"completed"` 처리. 하나라도 실패하면 원인에 따라:

- 문서·코드 불일치 → 1~3 단계 재수행 후 재검증
- 기존 phase 의 회귀 → 해당 phase 로 되돌아가 근본 원인 수정 후 재검증

3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **이 phase 에서 새 기능을 추가하지 마라**. 순수 문서 동기화 + 통합 검증. 코드 수정은 spec-code 불일치 해결 시에만 허용 (그 외 변경 금지).
- CHANGELOG · features-list 작성 시 이전 task 포맷을 정확히 따라 일관성 유지. 이번 task 만 튀는 포맷 금지.
- 기존 CHANGELOG 엔트리를 지우거나 수정하지 마라 — 추가만.
- features-list 기존 항목 구조 유지. 새 항목 추가는 기존 섹션 내 적절한 위치에.
- 통합 AC 중 하나라도 깨지면 커밋 전 반드시 원인 파악 후 수정. "적당히 넘어가기" 금지.
- 한글 커밋: `docs(contact-webhard-navigate): phase 5 — docs-sync-wrap`.
