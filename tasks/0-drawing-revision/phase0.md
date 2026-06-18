# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/db/prisma-tables.md`
- `docs/specs/api/nestjs-endpoints.md`
- `docs/specs/api/endpoints/integration.md`
- `docs/changelog/CHANGELOG.md`
- `docs/specs/features/delivery-management-v2.md` (기존 기능 스펙 작성 패턴 참고)
- `webhard-api/prisma/schema.prisma` (Contact, ContactStatusHistory 모델 구조 파악)

## 작업 내용

### 1. 기능 스펙 작성: `docs/specs/features/drawing-revision-history.md`

기존 스펙 파일 패턴(`delivery-management-v2.md` 등)을 참고하여 아래 내용을 포함:

- **개요**: 도면 수정 히스토리 기능의 목적과 배경
- **데이터 모델**: DrawingRevision 테이블 구조
  ```
  drawing_revisions 테이블:
  - id (UUID PK)
  - contact_id (UUID FK → contacts)
  - version (Int, contact 단위 자동 증가)
  - process_stage (VarChar(30)?, 수정 시점의 공정 단계)
  - reason (VarChar(30): domuson_fit | sample_revision | field_correction | laser_processing | initial | other)
  - reason_detail (Text?, 자유 입력)
  - files (JSONB, Array<{ url, name, size, mimeType }>)
  - actor_type (VarChar(20): admin | worker | system | external)
  - actor_name (VarChar(100)?)
  - source (VarChar(30): stage_change | manual | auto_initial | integration)
  - is_public (Boolean, default false)
  - note (Text?)
  - created_at (TimestampTZ)
  ```
- **API 엔드포인트** 목록 (내부 5개 + Integration 1개)
- **트리거 방식**: 공정 단계 변경 후 모달 (drawing, drawing_confirmed만) + 수동 등록
- **접근 권한**: admin 전체, worker 조회만, company 공개 항목만
- **자동 v1 등록**: 새 문의 생성 시 drawingFileUrl 존재하면 v1 자동 등록

### 2. API 엔드포인트 문서 업데이트: `docs/specs/api/nestjs-endpoints.md`

Contacts 섹션에 아래 엔드포인트 추가:

```
| GET    | /contacts/:id/drawing-revisions          | 도면 수정 이력 조회        |
| POST   | /contacts/:id/drawing-revisions          | 도면 수정 등록            |
| POST   | /contacts/:id/drawing-revisions/upload-urls | 도면 업로드 presigned URL |
| GET    | /drawing-revisions/:revisionId/download  | 도면 파일 다운로드 URL    |
| PATCH  | /drawing-revisions/:revisionId/visibility | 공개 여부 변경           |
```

### 3. Integration API 문서 업데이트: `docs/specs/api/endpoints/integration.md`

Drawing Revisions 섹션 추가:

```
| POST   | /integration/drawing-revisions           | 외부 프로그램 도면 수정 등록 |
```

요청/응답 형식 포함.

### 4. DB 테이블 문서 업데이트: `docs/specs/db/prisma-tables.md`

Contact Domain 섹션에 `drawing_revisions` 테이블 추가. 기존 `contact_status_history` 테이블 문서 형식을 따를 것.

### 5. CHANGELOG 업데이트: `docs/changelog/CHANGELOG.md`

최상단에 추가:

```markdown
## [Unreleased] - 2026-04-13

### Added

- 도면 수정 히스토리 기능: 공정 단계별 도면 변경 이력 추적
  - DrawingRevision 테이블 추가
  - 공정 단계 변경 시 도면 업로드 모달
  - 도면 수정 타임라인 UI
  - 외부 프로그램용 Integration API
  - 거래처 공개 설정
```

## Acceptance Criteria

```bash
# 문서 파일 존재 확인
test -f docs/specs/features/drawing-revision-history.md && echo "PASS: feature spec" || echo "FAIL"
test -f docs/specs/db/prisma-tables.md && echo "PASS: db spec" || echo "FAIL"
test -f docs/specs/api/nestjs-endpoints.md && echo "PASS: api spec" || echo "FAIL"
test -f docs/changelog/CHANGELOG.md && echo "PASS: changelog" || echo "FAIL"
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/0-drawing-revision/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드를 수정하지 마라. 이 phase는 문서만 다룬다.
- 기존 문서의 형식과 스타일을 정확히 따라라.
- 기존 내용을 삭제하지 마라. 추가만 하라.
- 영어로 작성된 문서는 영어로, 한글 문서는 한글로 유지.
