# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/db/prisma-tables.md`
- `docs/specs/api/nestjs-endpoints.md`
- `docs/specs/api/endpoints/integration.md`
- `docs/changelog/CHANGELOG.md`
- `docs/specs/features/drawing-revision-history.md` (기존 기능 스펙 작성 패턴 참고)
- `webhard-api/prisma/schema.prisma` (Contact 모델 구조 파악)

## 작업 내용

### 1. 기능 스펙 작성: `docs/specs/features/contact-split.md`

기존 스펙 파일 패턴(`drawing-revision-history.md` 등)을 참고하여 아래 내용을 포함:

- **개요**: 문의 분할 기능의 목적과 배경
  - 업체가 한 도면 파일에 여러 도면을 합쳐서 보내는 경우가 있음
  - 현장에 내리는 파일은 도면 1개당 1파일이어야 함
  - 따라서 하나의 문의를 여러 개의 하위 문의로 분할하는 기능 필요
  - 빈도: 간헐적 소수 (2~3종이 대부분)

- **데이터 모델**: Contact 테이블에 추가되는 필드

  ```
  contacts 테이블 추가 컬럼:
  - parent_contact_id (UUID? FK → contacts.id, ON DELETE SET NULL): 분할 원본 참조
  - split_index (Int?): 하위 순번 (1, 2, 3...)
  - split_count (Int?): 원본에만 기록 — 총 분할 수
  - stage_completed (Boolean, default false): 현재 공정 단계 완료 체크 (분할 그룹 전용)
  ```

- **분할 규칙**:
  - 분할 대상: `parent_contact_id == null` && `split_count == null` && processStage가 초기(`null` 또는 `drawing`)인 일반 문의만
  - 분할 개수: 2~10개
  - 하위번호 형식: 원본의 inquiryNumber 또는 workNumber에 `-N` suffix 추가
    - 예: `260413-O-001` → `260413-O-001-1`, `260413-O-001-2`, `260413-O-001-3`
  - 자식에 복사되는 정보: companyName, email, phone, position, inquiryType, deliveryMethod, deliveryAddress, deliveryName, deliveryPhone, deliveryType, deliveryCompanyName, deliveryCompanyPhone, deliveryCompanyAddress, deliveryNote, receiptMethod, isUrgent, contactType, source, orderType, boxShape, material
  - 자식에 복사되지 않는 정보: drawingFileUrl, drawingFileName (관리자가 각각 업로드), subject (각각 입력 또는 자동 생성), processStage (각각 독립), revisionRequest 관련 필드들
  - 원본: splitCount 설정, 원본 도면파일 보관, 읽기전용 참조용

- **그룹 진행 방식** (핵심 비즈니스 규칙):
  1. 각 하위 문의는 개별적으로 `stageCompleted = true`로 체크 가능
  2. 그룹 내 모든 하위 문의의 `stageCompleted`가 `true`이면 "다음 단계로 이동" 가능
  3. 일괄 이동 시 모든 하위 문의의 processStage가 다음 단계로 변경되고, stageCompleted는 false로 리셋
  4. 하나라도 stageCompleted가 false이면 일괄 이동 불가

- **목록 표시**:
  - 그룹핑: 원본(splitCount > 0)이 그룹 헤더, 하위 문의는 들여쓰기
  - 접기/펼치기 토글
  - 그룹 헤더에 진행률 표시 (N/M 완료)
  - 하위 문의(parentContactId != null)는 최상위 목록에서 제외
  - 거래처 포탈: 원본 숨김, 자식만 노출

- **API 엔드포인트** 목록:
  ```
  POST   /contacts/:id/split                    문의 분할
  GET    /contacts/:id/children                  하위 문의 목록
  PATCH  /contacts/:id/stage-completed           단계 완료 체크 토글
  POST   /contacts/:id/children/advance-stage    그룹 일괄 다음 단계 이동
  ```

### 2. API 엔드포인트 문서 업데이트: `docs/specs/api/nestjs-endpoints.md`

Contacts 섹션에 아래 엔드포인트 추가:

```
| POST   | /contacts/:id/split                  | 문의 분할 (N개 하위 문의 생성)    |
| GET    | /contacts/:id/children               | 하위 문의 목록 조회              |
| PATCH  | /contacts/:id/stage-completed        | 단계 완료 체크 토글              |
| POST   | /contacts/:id/children/advance-stage | 그룹 일괄 다음 단계 이동          |
```

### 3. DB 테이블 문서 업데이트: `docs/specs/db/prisma-tables.md`

Contact Domain 섹션의 contacts 테이블에 분할 관련 컬럼 4개 추가:

```
| parent_contact_id | UUID? (FK → contacts.id) | 분할 원본 참조 (자기참조)        |
| split_index       | Int?                     | 하위 순번 (1, 2, 3...)          |
| split_count       | Int?                     | 원본: 총 분할 수                 |
| stage_completed   | Boolean (default false)  | 현재 공정 단계 완료 체크          |
```

### 4. CHANGELOG 업데이트: `docs/changelog/CHANGELOG.md`

최상단에 추가:

```markdown
## 2026-04-13

### feat: 문의 분할 기능

- 한 문의에 여러 도면이 합쳐진 경우, 개별 하위 문의로 분할 가능
  - Contact 테이블에 분할 관련 필드 추가 (parent_contact_id, split_index, split_count, stage_completed)
  - 분할 API (POST /contacts/:id/split)
  - 하위번호 자동 생성 (O-001-1, O-001-2 형식)
  - 그룹 진행 방식: 개별 단계 완료 체크 → 모두 완료 시 일괄 다음 단계 이동
  - 목록 그룹핑 UI (원본 헤더 + 들여쓰기 + 접기/펼치기)
  - 거래처 포탈: 하위 문의 개별 노출
```

## Acceptance Criteria

```bash
test -f docs/specs/features/contact-split.md && echo "PASS: feature spec" || echo "FAIL"
test -f docs/specs/db/prisma-tables.md && echo "PASS: db spec" || echo "FAIL"
test -f docs/specs/api/nestjs-endpoints.md && echo "PASS: api spec" || echo "FAIL"
test -f docs/changelog/CHANGELOG.md && echo "PASS: changelog" || echo "FAIL"
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/2-contact-split/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드를 수정하지 마라. 이 phase는 문서만 다룬다.
- 기존 문서의 형식과 스타일을 정확히 따라라.
- 기존 내용을 삭제하지 마라. 추가만 하라.
- 영어로 작성된 문서는 영어로, 한글 문서는 한글로 유지.
