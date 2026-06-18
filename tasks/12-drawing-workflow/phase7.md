# Phase 7: 문서 동기화 + 마무리

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-workflow.md` (이번 기능 전체 스펙)
- `/tasks/12-drawing-workflow/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase 전체의 작업물을 확인하라. 아래 디렉토리의 변경된 파일들을 모두 읽어라:

- `webhard-api/src/contacts/` (Phase 1, 3 — 서비스, 컨트롤러, DTO)
- `webhard-api/src/integration/dxf-match/` (Phase 2 — DXF 매칭)
- `webhard-api/src/integration/orders/auto-contact.service.ts` (Phase 2 — 파일명 프리픽스)
- `src/components/DrawingRevisionTimeline.tsx` (Phase 4 — 그룹핑)
- `src/app/(admin)/admin/contacts/_components/` (Phase 4 — 관리자 UI)
- `src/app/company/orders/` (Phase 5 — 거래처 포탈)
- `src/app/worker/_components/` (Phase 6 — Worker 포탈)
- `src/app/api/` (Phase 4, 5, 6 — API 라우트)

## 작업 내용

### 1. docs/ 문서 동기화

이번 task에서 변경된 모든 코드를 읽고, 아래 문서들과 비교하여 불일치를 수정하라:

#### 1.1 `docs/specs/features/drawing-workflow.md`

- 실제 구현된 API 엔드포인트, DTO, 로직과 스펙 비교
- 차이가 있으면 스펙을 실제 구현에 맞게 업데이트

#### 1.2 `docs/specs/features/drawing-revision-history.md`

- 새로 추가된 reason, 트리거 방식, 접근 권한 반영 확인
- 완료 기준 체크리스트 업데이트

#### 1.3 `docs/API.md`

- Phase 1~3에서 추가된 모든 NestJS 엔드포인트가 문서에 있는지 확인
- 요청/응답 형식이 실제 DTO와 일치하는지 확인

#### 1.4 `docs/specs/api/nestjs-endpoints.md`

- 새 엔드포인트 인덱스에 추가 확인

#### 1.5 `docs/specs/db/prisma-tables.md`

- DrawingRevision 모델에 변경이 있으면 반영 (새 필드 등)
- 변경 없으면 skip

#### 1.6 `CLAUDE.md`

- Modules 목록에 DxfMatch 관련 내용 추가 필요 여부 확인
- Routes 목록에 새 라우트 추가 필요 여부 확인

### 2. CHANGELOG 기록

`docs/changelog/CHANGELOG.md`에 이번 변경사항 기록:

```markdown
## YYYY-MM-DD — 도면 워크플로우 통합 관리

### 추가

- 상태별 최신 도면 조회 API (`GET /contacts/:id/latest-drawing`)
- 거래처 포탈 도면 업로드 (문의 상세 + 웹하드 연결)
- Worker 포탈 도면 업로드
- DXF 자동 매칭 Integration API (`POST /integration/dxf-match/upload`)
- 관리자 수동 문의 연결 (도면 이동)
- 도면 타임라인 단계별 그룹핑 UI
- 문의 카드 최신 도면 원클릭 다운로드
- 웹하드 파일명에 문의번호 자동 프리픽스

### 변경

- DrawingRevision reason에 revision_request 추가
- Worker 도면 업로드 권한 추가 (기존 admin 전용 → admin + worker + company)
- 수정요청 파일 첨부 시 DrawingRevision 자동 생성
```

날짜는 실제 작업 완료 날짜를 사용하라.

### 3. 코드 정리

- 사용하지 않는 import 제거
- 빌드 경고 확인 및 수정

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 7 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase에서는 새로운 기능 코드를 작성하지 마라. 문서 동기화와 정리만.
- CHANGELOG 작성 시 한글로 작성하라 (CLAUDE.md 규칙).
- 기존 문서의 다른 섹션(이번 task와 무관한 부분)을 변경하지 마라.
- CLAUDE.md 200줄 제한에 주의하라. 불필요하게 길어지지 않도록.
- 기존 테스트를 깨뜨리지 마라.
