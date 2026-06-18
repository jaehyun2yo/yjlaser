# Phase 2: 문서 동기화 + CHANGELOG

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/CLOUDFLARE_SETUP.md`
- `docs/WEBHARD_ARCHITECTURE.md`
- `docs/changelog/CHANGELOG.md`
- `CLAUDE.md` (프로젝트 컨벤션)
- `/tasks/7-upload-cors-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- Phase 0에서 업데이트된 문서들
- Phase 1에서 수정된 파일들:
  - `webhard-api/src/storage/storage.service.ts`
  - `src/lib/r2/client.ts`
  - `scripts/setup-r2-cors.ts` (신규)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 실제 변경된 내용을 확인한 뒤 작업하라.

## 작업 내용

### 1. CHANGELOG 기록

파일: `docs/changelog/CHANGELOG.md`

최상단에 오늘 날짜(2026-04-15)로 항목을 추가하라:

내용:

- **fix**: 웹하드 파일 업로드 CORS 오류 수정
  - R2 버킷 CORS 설정 스크립트 추가 (`scripts/setup-r2-cors.ts`)
  - AWS SDK v3 체크섬 비활성화 (`requestChecksumCalculation: "WHEN_REQUIRED"`)
  - 영향 범위: `webhard-api/src/storage/storage.service.ts`, `src/lib/r2/client.ts`

기존 CHANGELOG 형식과 스타일을 정확히 따르라.

### 2. 문서 불일치 검증

이번 task에서 변경된 모든 코드를 읽고, `docs/` 관련 문서와 비교하여 불일치가 있는지 확인하라.

특히 확인할 항목:

- `docs/CLOUDFLARE_SETUP.md`의 R2 CORS 섹션이 실제 `scripts/setup-r2-cors.ts`의 CORS 규칙과 일치하는지
- `docs/WEBHARD_ARCHITECTURE.md`의 업로드 플로우 설명이 실제 코드와 일치하는지
- `docs/specs/api/endpoints/webhard.md`에 멀티파트 업로드 엔드포인트가 누락되어 있지 않은지

불일치가 있으면 수정하라.

### 3. docs/features-list.md 갱신 (존재하는 경우)

`docs/features-list.md` 파일이 존재하면, 웹하드 업로드 관련 항목의 상태를 확인하고 필요시 갱신하라.
파일이 없으면 이 단계를 건너뛰어라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/7-upload-cors-fix/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase는 문서 동기화와 CHANGELOG만 다룬다. 코드를 수정하지 마라.
- CHANGELOG는 기존 형식을 정확히 따라라. 새로운 형식을 만들지 마라.
- 기존 테스트를 깨뜨리지 마라.
