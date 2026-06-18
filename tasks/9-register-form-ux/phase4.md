# Phase 4: 문서 동기화 + 마무리

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/register-form-ux.md` (Phase 0에서 작성된 기능 스펙)
- `/tasks/9-register-form-ux/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이번 task에서 변경된 모든 코드를 반드시 읽어라:

- `src/lib/validation/register-validation.ts` (Phase 1 — 공유 검증 모듈)
- `src/app/actions/register.ts` (Phase 1 — 서버 액션 리팩터링)
- `src/__tests__/validation/register-validation.test.ts` (Phase 1 — 단위 테스트)
- `src/app/register/page.tsx` (Phase 2, 3 — 제어 컴포넌트 + 실시간 검증)

## 작업 내용

### 1. `docs/specs/features/register-form-ux.md` 최종 동기화

Phase 0에서 작성한 스펙과 실제 구현된 코드를 비교하여 불일치를 수정한다:

- 실제 함수 시그니처가 스펙과 다르면 스펙을 업데이트
- 추가된 필드나 변경된 동작이 있으면 스펙에 반영
- 스펙에 기술했으나 구현하지 않은 항목이 있으면 제거하거나 "미구현" 표시

### 2. `docs/changelog/CHANGELOG.md` 업데이트

기존 CHANGELOG 형식을 따라 아래 내용을 추가:

```markdown
## [Unreleased]

### 개선

- 업체등록 폼 UX 개선: 검증 실패 시 폼 데이터 보존, 필드별 에러 메시지 표시
- 클라이언트 실시간 검증 추가 (onBlur/onChange)
- 이메일 형식 검증, 사업자등록번호 형식 검증 추가
- NestJS 연결 실패 시 명확한 에러 메시지 표시
```

날짜와 버전 형식은 기존 CHANGELOG의 최신 항목 형식을 따르라.

### 3. `docs/features-list.md` 상태 갱신

이 파일이 존재하면 업체등록 관련 항목의 상태를 업데이트한다. 존재하지 않으면 이 단계를 건너뛴다.

### 4. 코드-문서 불일치 최종 점검

아래 문서들을 읽고, 이번 task의 코드 변경으로 인해 내용이 틀어진 부분이 있는지 확인:

- `CLAUDE.md`의 Architecture, Routes, Auth 섹션
- `docs/specs/api/` 하위 문서 (API 변경이 있었다면)

이번 task는 프론트엔드만 변경하므로 API 스펙이나 DB 스펙 변경은 없어야 한다. 만약 서버 액션의 반환 타입 변경이 API 문서에 영향을 준다면 해당 문서도 업데이트한다.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/9-register-form-ux/index.json`의 phase 4 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase에서는 소스 코드를 수정하지 마라. 문서만 수정한다.
- CHANGELOG에 기존 항목을 수정하지 마라. 새 항목만 추가.
- 기존 테스트를 깨뜨리지 마라.
