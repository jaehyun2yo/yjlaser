# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 하드 룰)
- `docs/specs/features/drawing-revision-history.md` (기존 도면 수정 이력 스펙)
- `docs/specs/features/contact-split.md` (문의 분할 스펙 — processStage 관련)
- `docs/specs/features/contact-order-unification.md` (Contact/Order 통합 설계)
- `docs/API.md` (API 명세서)
- `docs/specs/api/nestjs-endpoints.md` (엔드포인트 인덱스)
- `docs/specs/db/prisma-tables.md` (DB 테이블 명세)
- `webhard-api/src/contacts/constants/process-stages.ts` (공정 단계 정의)
- `webhard-api/src/contacts/drawing-revision.service.ts` (기존 도면 서비스)
- `webhard-api/src/contacts/dto/drawing-revision.dto.ts` (기존 DTO)
- `webhard-api/src/integration/drawing-revisions/drawing-revisions.controller.ts` (Integration API)
- `webhard-api/src/integration/orders/auto-contact.service.ts` (자동 문의 생성)

## 작업 내용

### 1. `docs/specs/features/drawing-workflow.md` — 신규 생성

이번 기능의 전체 스펙을 작성한다. 아래 내용을 포함:

#### 1.1 개요

- 목적: 도면이 공정 단계를 거치며 업데이트되는 과정을 한 문의(Contact) 단위로 자동 관리
- 도메인: CRM > 문의 관리 > 도면 워크플로우
- 배경: 도무송 목형 제작 과정에서 도면은 접수 → 도면작업 → 샘플 → 목형의뢰(도면확정) → 현장가공까지 여러 번 수정됨. 기존에는 이력 추적이 불완전.

#### 1.2 핵심 요구사항

**A. 상태별 최신 도면 조회**

- 문의 요약에서 현재 processStage에 맞는 최신 도면을 원클릭 다운로드
- 조회 규칙:

| processStage      | 최신 도면 기준                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------- |
| drawing           | reason=initial 또는 domuson_fit의 최신 revision                                          |
| sample            | reason=sample_revision의 최신 (없으면 이전 단계 fallback)                                |
| drawing_confirmed | processStage=drawing_confirmed의 최신 revision                                           |
| laser ~ creasing  | reason=field_correction 또는 laser_processing의 최신 (없으면 drawing_confirmed fallback) |

**B. 도면 타임라인 (상세보기)**

- 문의 상세에서 모든 도면 수정 이력을 processStage별로 그룹핑하여 타임라인 표시
- 각 그룹: 단계명, 도면 수, 최신 날짜
- 각 항목: 버전, 사유, 파일 다운로드, 수행자, 일시
- 수정요청(revision_request) 도면도 동일 타임라인에 통합

**C. 파일명 프리픽스**

- 웹하드에서 자동 문의 생성 시, WebhardFile.name 앞에 문의번호 추가
- 형식: `{inquiryNumber 또는 workNumber} {originalName}`
- WebhardFile.originalName은 유지 (중복 체크용)

**D. 거래처 도면 업로드 (방법 A + B)**

- 방법 A: 거래처 포탈 > 문의 상세 > "도면 업로드" 영역
  - 용도 선택: 수정도면 제출 / 목형의뢰 도면 / 기타
  - 목형의뢰 선택 시 processStage → drawing_confirmed 자동 변경
- 방법 B: 거래처 웹하드 업로드 후 문의 연결 선택
  - 업로드 완료 후 "관련 문의 있나요?" UI
  - 진행 중인 문의 목록 표시 → 선택 시 연결

**E. Worker 도면 업로드**

- Worker 포탈에서 도면 업로드 가능 (actorType: worker)
- 사유 선택: 도무송 맞춤 / 샘플 수정 / 현장 보정 / 기타

**F. DXF 자동 매칭**

- Integration API: 관리프로그램이 DXF 파일을 업로드할 때 파일명에서 workNumber(YYMMDD-F-NNN) 파싱
- 해당 Contact에 DrawingRevision 생성 (reason: laser_processing, source: integration)
- 매칭 실패 시 에러 응답

**G. 수정요청 통합**

- 기존 revisionRequest\* 필드의 파일 첨부 → DrawingRevision에도 등록 (reason: revision_request)
- DrawingRevision 타임라인에서 수정요청 도면도 함께 표시

**H. 관리자 수동 문의 연결**

- 미매칭 Contact에 "기존 문의 연결" 버튼
- 같은 업체의 활성 문의 목록 → 선택 → 도면 복사 + 원본 삭제

#### 1.3 매칭 전략 (3단계 fallback)

1. 문의번호 파싱 (YYMMDD-O/F-NNN) → 직접 매칭 (100% 안전)
2. fallback: 새 Contact 생성 + 관리자 알림 (수동 연결 대기)

- 파일명 유사도/단독 문의 추측 매칭은 하지 않음 (오매칭 방지)

#### 1.4 새 API 엔드포인트

| Method | Path                                              | Auth    | Description                     |
| ------ | ------------------------------------------------- | ------- | ------------------------------- |
| GET    | /api/v1/contacts/:id/latest-drawing               | API Key | 현재 단계 기준 최신 도면        |
| POST   | /api/v1/contacts/:id/company-drawing              | Company | 거래처 도면 업로드              |
| POST   | /api/v1/contacts/:id/link-webhard-file            | Company | 웹하드 파일 → 문의 연결         |
| POST   | /api/v1/contacts/:id/merge-drawing-from/:sourceId | Admin   | 수동 문의 연결 (도면 이동)      |
| POST   | /api/v1/integration/dxf-match-upload              | API Key | DXF workNumber 자동 매칭 업로드 |

#### 1.5 접근 권한

| 역할    | 도면 조회          | 도면 업로드     | 문의 연결       | 수동 연결 |
| ------- | ------------------ | --------------- | --------------- | --------- |
| admin   | 모든 이력          | O               | -               | O         |
| worker  | 모든 이력 (조회만) | O (사유 선택)   | -               | X         |
| company | isPublic=true만    | O (자기 문의만) | O (자기 문의만) | X         |

### 2. `docs/specs/features/drawing-revision-history.md` — 업데이트

기존 스펙에 아래 내용 추가/수정:

- reason enum에 `revision_request` 추가 (설명: 거래처 수정요청 도면 제출)
- 접근 권한: worker → 등록 O (기존 X에서 변경)
- 트리거 방식에 "5. 거래처 업로드", "6. Worker 업로드" 추가
- API 엔드포인트에 새 엔드포인트 추가

### 3. `docs/API.md` — 업데이트

위 1.4의 새 엔드포인트 5개를 적절한 섹션에 추가.

### 4. `docs/specs/api/nestjs-endpoints.md` — 업데이트

엔드포인트 인덱스에 새 엔드포인트 추가.

## Acceptance Criteria

```bash
# 문서 파일 존재 확인
test -f docs/specs/features/drawing-workflow.md && echo "OK" || echo "FAIL"
```

문서 변경만 수행하는 phase이므로 빌드 검증은 불필요.

## AC 검증 방법

위 AC 커맨드를 실행하라. 통과하면 `/tasks/12-drawing-workflow/index.json`의 phase 0 status를 `"completed"`로 변경하라.

## 주의사항

- 코드를 수정하지 마라. 이 phase는 문서 전용이다.
- 기존 drawing-revision-history.md의 완료 기준 체크리스트를 제거하지 마라 (추가만).
- API.md의 기존 엔드포인트를 변경하지 마라 (추가만).
- 한글로 작성하되, 코드 식별자/기술 용어는 영어 허용.
