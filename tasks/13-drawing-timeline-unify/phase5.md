# Phase 5: 문서 동기화 + CHANGELOG (final-sync)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/.claude/rules/spec-code-sync.md` — 코드/스펙 동기화 규칙
- `docs/changelog/CHANGELOG.md` — 기존 변경 기록 스타일
- `docs/specs/features/drawing-workflow.md` (Phase 0 갱신본)
- `docs/specs/features/drawing-revision-history.md` (Phase 0 갱신본)
- `docs/specs/features/design-system.md` (Phase 0 갱신본)
- `docs/specs/api/nestjs-endpoints.md` (Phase 0 갱신본)
- `/tasks/13-drawing-timeline-unify/docs-diff.md`
- `docs/features-list.md` (존재 시)

그리고 이전 phase들의 실제 구현 diff를 확인하라:

- Phase 1 산출물: `webhard-api/src/contacts/drawing-revision.service.ts`, `webhard-api/prisma/schema.prisma` (+ 마이그레이션), 테스트 spec
- Phase 2 산출물: `webhard-api/src/contacts/contact-timeline.service.ts`, `dto/timeline-item.dto.ts`
- Phase 3 산출물: `src/components/ContactTimeline.tsx`, 삭제된 `DrawingRevisionTimeline.tsx`, `ContactDetailView.tsx`, 거래처 페이지
- Phase 4 산출물: `src/app/globals.css`, E2E

이전 phase에서 만들어진 코드와 문서를 꼼꼼히 비교하고, 괴리가 있으면 문서 쪽을 업데이트하라.

## 작업 내용

### 1. 코드 ↔ spec 정합성 재검증

Phase 0에서 먼저 갱신한 spec과 최종 구현이 일치하는지 전수 검증. 아래 항목 각각 확인:

**drawing-workflow.md**:

- 섹션 W "웹하드 자동 저장" 정책이 실제 `syncRevisionToWebhard` 구현과 일치하는가?
- 각 업로드 경로(A, B, D, E, F)에 "WebhardFile 자동 생성" 문구가 그대로 있는가?
- 섹션 "데이터 모델 변경"의 `webhardFileIds` 필드 설명이 실제 Prisma schema와 일치?
- "접근 권한" 표가 실제 Guard 동작(거래처 세션 시 forCompany 서버 필터)과 일치?

**drawing-revision-history.md**:

- `webhard_file_ids` 컬럼 설명 vs 실제 schema
- "UI 구성" 통합 타임라인 단일 섹션 기술 vs 실제 ContactTimeline 컴포넌트
- "접근 권한" 표 업데이트

**nestjs-endpoints.md**:

- `GET /contacts/:id/timeline` 응답 shape 예시가 실제 DTO(`TimelineItemDto`)와 완전히 일치해야 한다. payload 필드 이름/타입 모두.

**design-system.md**:

- `@theme` 토큰 관리 섹션의 코드 예시가 실제 `globals.css` 블록과 일치
- "dark: 금지" "@theme inline 금지" 명시 유지

**specs/api/endpoints/webhard.md, integration.md**:

- 각 엔드포인트 설명에 "WebhardFile 자동 생성" 문구 그대로 존재
- 경로 C (link-webhard-file) "재사용" 명시 유지

괴리 발견 시 해당 spec 파일만 수정. **코드는 절대 건드리지 마라.**

### 2. `docs/changelog/CHANGELOG.md` 업데이트

**형식**: 기존 엔트리 스타일 (프로젝트 관례) 따라.

새 엔트리 추가 (최신이 위):

```markdown
## 2026-04-17 — drawing-timeline-unify

### 기능 개발

- 문의 상세 화면의 "타임라인"과 "도면 이력" 두 섹션을 **통합 타임라인** 단일 섹션으로 합침. 공정/유형 변경과 도면 수정을 시간순으로 인터리브하여 렌더.
- 모든 도면 업로드 경로(관리자/거래처/Worker/stage_change/DXF 매칭)에서 WebhardFile이 자동 생성되도록 개선. 저장 위치는 `{거래처루트}/문의-{workNumber}/` 하위로 통일. 파일명 프리픽스(`{workNumber} {originalName}`) 유지.
- DrawingRevision에 `webhardFileIds String[]` 필드 추가 (Prisma 마이그레이션: `drawing_revisions_webhard_link`).
- 통합 타임라인에서 도면 다운로드 인라인 지원 (파일 1개=단일 버튼, 다수=펼침 리스트).
- 기존 문의 생성 시 최초 파일이 v1 DrawingRevision으로 자동 등록되어 통합 타임라인에 자연스럽게 포함됨 (기존 `createInitialRevision` 유지).
- 거래처 포털 통합 타임라인 노출 — 서버 필터로 `isPublic=true` drawing_revision만 전송, 관리자 메타(note, admin actorName)는 마스킹.

### 버그 수정

- 타임라인 항목의 `NaN/NaN 오후 NaN:NaN` 깨진 날짜 포맷 수정. 백엔드 응답을 `createdAt` (camelCase, ISO 8601) 로 통일.
- 문의 상세 페이지의 "도면 수정 이력" Section 중복 렌더 제거.
- DrawingRevisionService.createRevision의 `timelineService.recordChange('drawing_revision')` 호출 제거 (통합 API가 DrawingRevision을 직접 읽으므로 ContactStatusHistory 중복 기록 불필요).
- 웹하드 사이드바/검색 드롭다운/검색 모달 배경 투명 문제 해결. 원인: `globals.css`의 `@theme` + `@theme inline` 충돌로 `bg-card`/`bg-muted`/`bg-background` 유틸 생성 실패. 매핑을 `@theme` 블록으로 통합하고 `@theme inline` 블록 제거.

### 내부

- `DrawingRevisionTimeline` 컴포넌트 및 `useDrawingRevisions` 훅 제거 (통합 타임라인으로 대체).
- `queryKeys.contacts.drawingRevisions` 키 제거.
- E2E 테스트 추가: 타임라인 권한 필터 + 웹하드 배경 투명 회귀 방지.
```

### 3. `docs/features-list.md` 갱신 (존재 시)

- `drawing-timeline-unify` 또는 관련 feature 항목 상태 업데이트 (completed/shipped 표기).
- 파일이 없으면 생성하지 말고 skip.

### 4. Spec 파일 최종 정합 확인

- Phase 0에서 변경한 문서들과 최종 구현 간 괴리 있으면 spec 쪽 업데이트.
- 기본 원칙: 실제 코드 동작이 진실의 원천. 코드가 문서와 다르면 문서 수정.

### 5. docs-diff.md 확인

- `scripts/gen-docs-diff.py`가 자동 생성한 파일 — 이 phase에서는 갱신하지 않음. 단 내용 확인하여 Phase 0 이후 변경이 모두 포함되었는지 스캔.

## Acceptance Criteria

```bash
grep -A 3 "drawing-timeline-unify" docs/changelog/CHANGELOG.md | head -5 && grep -c "통합 타임라인" docs/specs/features/drawing-workflow.md
```

- CHANGELOG에 엔트리 존재 + drawing-workflow.md에 "통합 타임라인" 1회 이상 노출.

추가 최종 검증 (독립 실행):

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

전체 빌드 + 테스트 통과.

## AC 검증 방법

위 AC 커맨드 모두 실행. 통과하면 `/tasks/13-drawing-timeline-unify/index.json`의 phase 5 status를 `"completed"`로 변경.
수정 3회 이상 시도해도 실패하면 `"error"` + `error_message` 기록.

## 주의사항

- **이 phase는 문서/CHANGELOG 전용.** 코드 변경 일체 금지. Phase 1-4에서 실제 구현 완료.
- CHANGELOG 엔트리는 **한글**로 작성 (프로젝트 규칙).
- 기존 엔트리 스타일 흉내내라 — 마크다운 헤더 레벨, 리스트 포맷, 날짜 형식 등.
- spec 괴리 발견 시 spec을 코드에 맞춰 수정. 코드 건드리지 마라.
- `docs-diff.md`는 건드리지 마라. `gen-docs-diff.py`가 관리.
- Phase 5는 최종 phase이므로 이 phase 완료 후 `/tasks/index.json`의 task-level status가 `"completed"`로 자동 업데이트된다 (`run-phases.py` 담당).
- 기존 테스트를 깨뜨리지 마라.
