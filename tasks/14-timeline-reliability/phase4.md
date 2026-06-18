# Phase 4: 문서 동기화 + CHANGELOG (final-sync)

## 사전 준비

- `yjlaser_website/.claude/rules/spec-code-sync.md`
- `docs/changelog/CHANGELOG.md`
- `docs/specs/features/drawing-workflow.md` (Phase 0 갱신본)
- `docs/specs/features/drawing-revision-history.md` (Phase 0 갱신본)
- `docs/specs/api/nestjs-endpoints.md` (Phase 0 갱신본)
- `/tasks/14-timeline-reliability/docs-diff.md`

Phase 1~3 산출물 확인:

- Phase 1: `contact-timeline.service.ts` fallback 로직, DTO 확장
- Phase 2: `auto-contact.service.ts` 트랜잭션화, `recordChange` throw 전환
- Phase 3: 신규 테스트 14건

## 작업 내용

### 1. 코드 ↔ spec 정합성 재검증

다음 항목을 실제 구현과 대조:

**drawing-workflow.md `타임라인 신뢰성 보장` 섹션**:

- Fallback 파생 규칙이 실제 `buildFallbackTimeline` 구현과 일치?
- 트랜잭션 보장 설명이 실제 `createNewContact` 트랜잭션 구조와 일치?

**drawing-revision-history.md `실패 처리 정책`**:

- `createInitialRevision` 트랜잭션 내부 await 실제 구현 반영?

**nestjs-endpoints.md `Fallback 동작`**:

- timeline 응답의 `fallback?: boolean` 필드 기술?

괴리 발견 시 spec 파일만 수정. **코드 건드리지 마라.**

### 2. `docs/changelog/CHANGELOG.md` 업데이트

엔트리 추가 (최신이 위):

```markdown
## 2026-04-17 — timeline-reliability

### 기능 개선

- 통합 타임라인 API에 **fallback 응답** 추가. `contact_status_history`/`drawing_revisions`이
  모두 비어있을 때, `contacts` 테이블에서 최소 이벤트(`created` + 조건부 `drawing_revision initial`)를
  파생해 응답한다. 과거 fire-and-forget 실패분이 UI에서 "타임라인 기록이 없습니다."로
  표시되던 문제 완화.
- `AutoContactService.createNewContact`를 Prisma 트랜잭션화. Contact 생성 + `recordChange('created')` +
  `createInitialRevision`이 원자적으로 보장되며, 하나라도 실패하면 Contact 자체가 롤백된다.
- `ContactTimelineService.recordChange`를 throw 동작으로 전환 (내부 warning 삼킴 제거).
  `Prisma.TransactionClient` 주입 지원.
- `DrawingRevisionService.createInitialRevision`/`createRevision`에 `tx` 파라미터 지원.

### 버그 수정

- 레이저 가공 등 특정 문의에서 타임라인이 비어 보이던 회귀 원인(fire-and-forget `.catch()`로
  조용히 실패 삼킴) 해소.

### 내부

- `TimelineItemDto`에 `fallback?: boolean` 옵셔널 필드 추가 (UI 구분용).
- `src/lib/types/contact.ts` 동기화.
- 실제 PostgreSQL 기반 신규 테스트 14건 추가.
```

### 3. `docs/features-list.md` (존재 시)

- `timeline-reliability` 항목 shipped로 표기. 파일 없으면 skip.

### 4. `docs-diff.md` 확인

- `scripts/gen-docs-diff.py`가 자동 생성한 파일 — 이 phase에서 갱신 안 함. 내용 확인만.

## Acceptance Criteria

```bash
grep -A 3 "timeline-reliability" docs/changelog/CHANGELOG.md | head -5 && \
grep -c "타임라인 신뢰성 보장" docs/specs/features/drawing-workflow.md && \
grep -c "실패 처리 정책" docs/specs/features/drawing-revision-history.md
```

CHANGELOG 엔트리 존재 + spec 갱신 유지.

추가 최종 검증:

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

전체 통과.

## AC 검증 방법

AC 커맨드 실행. 통과하면 `/tasks/14-timeline-reliability/index.json`의 phase 4 status를 `"completed"`로 변경.
3회 실패 시 `"error"` + `error_message`.

## 주의사항

- **이 phase는 문서 전용.** 코드 변경 금지.
- CHANGELOG 엔트리는 **한글**로. 기존 스타일 준수.
- spec 괴리 발견 시 spec을 코드에 맞춰 수정.
- Phase 4 완료 후 `/tasks/index.json`의 task-level status가 `"completed"`로 자동 업데이트됨 (`run-phases.py` 담당).
- 기존 테스트 깨지지 않기.
