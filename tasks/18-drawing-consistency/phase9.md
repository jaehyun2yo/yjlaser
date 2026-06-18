# Phase 9: docs-sync

## 사전 준비

- task 18 의 전체 phase 산출물 (phase 0~8) — 이 phase 는 마지막 문서 동기화 및 E2E 작성.
- `tasks/18-drawing-consistency/docs-diff.md` — phase 0 이후 누적 문서 변경.
- `docs/changelog/CHANGELOG.md` — phase 0 에서 skeleton 만 작성. 여기서 최종 문구.
- `e2e/` 기존 스펙 — `e2e/contact-feedback-pack.spec.ts` 의 테스트 구조, `playwright.config.ts` 설정 참고.
- `docs/testing.md` — 테스트 전략. 커버리지 숫자 목표 없음.
- `docs/specs/features/drawing-workflow.md`, `drawing-revision-history.md`, `contact-urgent-ui.md` — 코드와 정합성 최종 확인.
- `docs/specs/db/prisma-tables.md` — webhard_folders 섹션이 phase 0 에서 업데이트된 4 컬럼과 실제 스키마 일치 여부.
- `docs/features-list.md` (있으면) — 상태 갱신.

이유: 마지막 phase 는 문서/테스트 동기화 전용. 코드·스펙의 괴리를 이 시점에 zero 로 맞춘다.

## 작업 내용

### 1. `e2e/drawing-consistency.spec.ts` 신규

아래 5개 시나리오 작성. `webhard-api/prisma/seed.ts` 의 `seedDrawingConsistencyFixtures()` (phase 7 에서 추가됨) 를 활용.

```ts
import { test, expect } from '@playwright/test';

test.describe('drawing-consistency', () => {
  test('E1: 칼선의뢰 접수 시 `칼선의뢰/문의-{O}/` 폴더 자동 생성 + 파일 이동', async ({
    page,
    request,
  }) => {
    // 1. API: POST /api/v1/contacts { inquiryType: 'cutting_request', drawingFileUrl }
    // 2. NestJS admin 로그인 후 /api/v1/folders/tree 로 구조 조회
    // 3. 결과에 {업체}/칼선의뢰/문의-{O-번호}/ 경로 존재 확인
    // 4. 해당 폴더의 WebhardFile.name 이 '[{O-번호}] 원본명' 포맷인지
  });

  test('E2: 도면 확정(F 발급) 시 폴더 rename + 파일 이동 + 관리자 UI 실시간 반영', async ({
    page,
    context,
    request,
  }) => {
    // 1. 사전: E1 완료 상태의 Contact 사용 (O 만 있음)
    // 2. 브라우저 A: 관리자 상세 페이지 /admin/contacts/{id} 열기
    // 3. 브라우저 B: PATCH /api/v1/contacts/{id}/process-stage { processStage: 'drawing_confirmed' } → F 발급 유발
    // 4. A 페이지에서 소켓으로 타임라인 갱신 확인 (대기 5초, 타임라인에 새 status_change 행 + 폴더 rename 반영)
    // 5. /api/v1/folders/tree 재조회 → 폴더명이 문의-{O}_{F} 로 rename 됐는지
  });

  test('E3: 원본 + 수정본 공존 시 타임라인에 v1, v2 모두 노출', async ({ page, request }) => {
    // 1. 사전 seed: Contact with drawing_revisions [initial v1, domuson_fit v2]
    // 2. 관리자 상세 페이지 열기
    // 3. 타임라인에 v1 (초기 도면) 와 v2 (도무송 맞춤) 두 배지 모두 보이는지
  });

  test('E4: 다운로드 응답 파일명 [번호] 원본명 포맷', async ({ request }) => {
    // 1. 사전 seed: Contact with workNumber, DrawingRevision with files
    // 2. GET /api/v1/contacts/drawing-revisions/{revisionId}/download (ApiKey 인증)
    // 3. response.fileName === '[{F-번호}] 원본명.DXF' 확인
  });

  test('E5: 두 세션 실시간 반영 (A 업로드 → B 상세 화면 자동 갱신)', async ({ browser }) => {
    // 1. 컨텍스트 2개 생성 — A, B 둘 다 admin 세션
    // 2. A: /admin/contacts/{id} 열기
    // 3. B: POST /drawing-revisions { files, reason } 호출
    // 4. A 페이지에서 소켓으로 새 도면 수정 행 자동 표시 대기 (5초 timeout)
    // 5. expect(locator('text=도면 수정 v2')).toBeVisible()
  });
});
```

E2E 실행은 dev 서버 + 테스트 DB 필요. AC 에서는 `npx playwright test e2e/drawing-consistency.spec.ts` 로 명시하되, 환경 이슈 시 스펙 작성만으로 통과 인정 (task 17 phase 6 선례).

### 2. `docs/changelog/CHANGELOG.md` 최종 기입

`[Unreleased]` 블록의 `2026-04-20 — drawing-consistency (task 18)` 헤더 아래에:

```
- 파일명 규칙 통일: `[260420-F-004] 원본명.DXF` 포맷. O/F 선택 기준은 revision.processStage → contact.processStage → inquiryType fallback.
- 폴더 구조 통일: `{업체명}/{칼선의뢰|목형의뢰}/문의-{O}_{F}/`. F 추가 발급 시 rename.
- `createInitialRevision` 트랜잭션화 (fire-and-forget 제거). 실패 시 Contact 생성 롤백.
- 백필 스크립트 2종: `backfill-initial-revisions.ts` (원본 v1 복구), `migrate-webhard-inquiry-folders.ts` (폴더·파일명 일괄 정리). 기본 dry-run, --apply 명시 시만 실행.
- 관리자 상세 페이지 타임라인 실시간 반영: `ContactTimelineRealtime` 클라이언트 래퍼 도입, 8개 이벤트 구독.
- Prisma schema: `WebhardFolder` 에 `inquiryNumber`, `workNumber`, `contactId`, `folderKind` 4 컬럼 추가.
- 다운로드 실패 개선: R2 key 추출 시 `decodeURIComponent` 적용. companyName/classify 실패 시 관리자 Notification + Sentry 경고.
- Breaking change 없음. 기존 API 응답 shape 유지.
```

### 3. `docs/features-list.md` 상태 갱신 (존재 시)

해당 섹션에 task 18 완료 표시. 파일이 없으면 스킵.

### 4. spec-code 정합 최종 확인

다음 파일들을 각각 열어 실제 코드 동작과 기술 내용이 일치하는지 `/project:spec-check` 또는 수동 검토:

- `docs/specs/features/drawing-workflow.md` §W (phase 0 재작성) ↔ `FoldersService.ensureInquiryFolder` 구현 (phase 5)
- `docs/specs/features/drawing-revision-history.md` §"WebhardFile 자동 생성 규칙" ↔ `syncRevisionToWebhard` + `buildInquiryFileName`
- `docs/specs/db/prisma-tables.md` §webhard_folders ↔ `schema.prisma` WebhardFolder 모델
- `docs/specs/api/endpoints/integration.md` ↔ phase 에서 엔드포인트 추가 없음, 변경 없음
- `docs/specs/api/nextjs-routes.md` ↔ phase 에서 라우트 추가 없음, 변경 없음

불일치 발견 시 spec 수정 (코드 변경 금지 — 코드는 phase 0~8 에서 이미 확정).

### 5. 마이그레이션 실행 가이드 문서

`docs/guides/` 디렉토리에 `drawing-consistency-migration.md` 신설:

````
# drawing-consistency 백필 실행 가이드 (task 18)

## 1. 사전 준비

- DB 백업 필수
- Supabase staging 환경에서 먼저 검증 권장

## 2. 실행 순서

### 2-1. 원본 v1 백필 (안전)

```bash
cd webhard-api
npx tsx scripts/backfill-initial-revisions.ts            # dry-run
npx tsx scripts/backfill-initial-revisions.ts --apply    # 실행
````

### 2-2. folder_kind 백필 (무영향)

```bash
npx tsx scripts/migrate-webhard-inquiry-folders.ts --backfill-folder-kind --apply
```

### 2-3. 폴더·파일명 정리 (영향 있음)

```bash
npx tsx scripts/migrate-webhard-inquiry-folders.ts            # dry-run 결과 확인
npx tsx scripts/migrate-webhard-inquiry-folders.ts --apply    # 실행
```

## 3. 롤백

- folder 이동은 `WebhardLog.action='migrate_move'` 조회해 수동 역처리 가능
- 파일명 rename 은 `originalName` 이 보존되어 있어 재생성 가능

````

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
````

E2E (`npx playwright test e2e/drawing-consistency.spec.ts`) 는 dev 환경 준비 필요 — 미준비 시 스펙 작성만으로 pass 인정 (index.json error_message 에 환경 사유 기록).

## AC 검증 방법

위 통합 커맨드 통과 시 phase 9 status `"completed"`. 3회 실패 시 `"error"` + error_message.

## 주의사항

- 이 phase 는 코드 변경 최소. **spec 문서와 E2E 작성** 이 주.
- CHANGELOG 에 Breaking change 있으면 반드시 명시. 이번 task 는 응답 shape 유지 → 없음.
- 마이그레이션 가이드는 운영자용 — 스태깅에서 먼저 실행하도록 강조.
- E2E 가 dev 환경 미비로 실패하면 `index.json` 에 `error_message` 로 기록하고 수동 검증으로 대체 (task 17 phase 6 선례와 동일).
- docs-diff 재생성은 runner 가 자동 처리. 수동 `git diff` 출력을 diff 파일에 덮어쓰지 마라.
- `docs/guides/drawing-consistency-migration.md` 작성 시 민감 정보(실제 DB 호스트, API 키 등) 넣지 마라.
- `docs/specs/features/drawing-workflow.md` 의 §W.2 "과거 규칙" 섹션은 phase 0 에서 이동된 내용. 여기서 다시 삭제하지 마라 (역사 보존).
- `features-list.md` 파일이 존재하지 않으면 새로 만들지 말고 skip. 이 task 만을 위한 신규 파일 생성은 CLAUDE.md 원칙 위반.
