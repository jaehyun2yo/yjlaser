# Phase 3: 문서 동기화 + CHANGELOG

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/laser-only-company-inquiry.md`
- `docs/WEBHARD_ARCHITECTURE.md`
- `docs/changelog/CHANGELOG.md`
- `docs/specs/api/nestjs-endpoints.md`
- `CLAUDE.md` (프로젝트 컨벤션)
- `/tasks/8-laser-only-flow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- Phase 1: `webhard-api/src/contacts/contacts.service.ts`, `contacts.controller.ts`, `src/app/api/admin/contacts/[id]/complete-laser/route.ts`
- Phase 2: `src/lib/utils/processStages.ts`, `OrderProgressBar.tsx`, `ProcessMoveModal.tsx`, `StaffContactCard.tsx`

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 실제 변경된 내용을 확인한 뒤 작업하라.

## 작업 내용

### 1. CHANGELOG 기록

파일: `docs/changelog/CHANGELOG.md`

최상단에 오늘 날짜(2026-04-15)로 항목을 추가하라:

내용:

- **feat**: 레이저 전용 업체 문의 공정 단축
  - 레이저가공 완료 시 칼작업/오시작업 스킵, 바로 완료 처리
  - 업체 대시보드: 3단계 프로그레스 바 (접수 → 레이저가공 → 완료)
  - 관리자 공정보드: 레이저 전용 문의 완료 옵션 추가
  - 작업자 앱: 레이저가공 완료 버튼 추가
  - API: `POST /contacts/:id/complete-laser`

기존 CHANGELOG 형식과 스타일을 정확히 따르라.

### 2. API 문서 업데이트

파일: `docs/specs/api/nestjs-endpoints.md`

새로 추가된 엔드포인트를 기록하라:

- `POST /api/v1/contacts/:id/complete-laser` — 레이저 전용 문의 즉시 완료

### 3. 문서 불일치 검증

이번 task에서 변경된 모든 코드를 읽고, `docs/` 관련 문서와 비교하여 불일치가 있는지 확인하라.

특히 확인할 항목:

- `docs/specs/features/laser-only-company-inquiry.md`가 실제 구현과 일치하는지
- `src/lib/utils/processStages.ts`의 레이저 전용 단계 정의가 문서와 일치하는지
- 공정 이동 로직(`updateProcessStage`)의 레이저 전용 분기가 문서와 일치하는지

불일치가 있으면 수정하라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/8-laser-only-flow/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase는 문서 동기화와 CHANGELOG만 다룬다. 코드를 수정하지 마라.
- CHANGELOG는 기존 형식을 정확히 따라라.
- 기존 테스트를 깨뜨리지 마라.
