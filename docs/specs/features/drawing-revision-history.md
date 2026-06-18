# Drawing Revision History (도면 수정 히스토리)

## 개요

- 목적: 문의(Contact) 단위로 도면 수정 이력을 추적한다. 사무실 작업(도면작업, 샘플 제작)부터 현장 작업(도면확정, 레이저 가공)까지 각 공정 단계에서 발생하는 도면 변경을 버전별로 관리하여, 관리자와 거래처가 도면 변경 히스토리를 한눈에 파악할 수 있도록 한다.
- 도메인: CRM > 문의 관리 > 도면 수정 이력
- 배경:
  - 도무송 목형 제작 과정에서 도면은 여러 차례 수정된다 (도무송 맞춤 수정, 샘플 수정, 현장 보정, 레이저 가공 수정 등)
  - 현재는 수정된 도면이 별도 이력 없이 덮어쓰기되어 이전 버전 추적이 불가능
  - 외부 프로그램(관리프로그램, 네스팅프로그램)에서도 도면 수정이 발생하므로 Integration API 필요

## 데이터 모델

### DrawingRevision 테이블 (`drawing_revisions`)

| Column           | Type          | Notes                                                                                            |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| id               | UUID (PK)     |                                                                                                  |
| contact_id       | UUID (FK)     | → contacts (cascade)                                                                             |
| version          | Int           | contact 단위 자동 증가 (1, 2, 3, ...)                                                            |
| process_stage    | VarChar(30)?  | 수정 시점의 공정 단계 (drawing, sample, drawing_confirmed, laser, cutting, inspection, delivery) |
| reason           | VarChar(30)   | domuson_fit \| sample_revision \| field_correction \| laser_processing \| initial \| other       |
| reason_detail    | Text?         | 자유 입력 (reason이 other일 때 필수)                                                             |
| files            | JSONB         | Array<{ url, name, size, mimeType }>                                                             |
| webhard_file_ids | String[]      | **NEW** — 자동 생성된 WebhardFile ID 목록 (DrawingRevision↔WebhardFile 링크). 기본값 빈 배열.    |
| actor_type       | VarChar(20)   | admin \| worker \| system \| external \| company                                                 |
| actor_name       | VarChar(100)? | 수행자 이름                                                                                      |
| source           | VarChar(30)   | stage_change \| manual \| auto_initial \| integration                                            |
| is_public        | Boolean       | default false — 거래처 공개 여부                                                                 |
| note             | Text?         | 관리자 메모                                                                                      |
| created_at       | TimestampTZ   |                                                                                                  |

Indexes: (contact_id, version), (contact_id, created_at DESC)

Relations: Contact 1:N DrawingRevision

### reason 값 설명

| reason           | 설명                               | 주요 발생 단계           |
| ---------------- | ---------------------------------- | ------------------------ |
| initial          | 최초 도면 등록 (문의 생성 시 자동) | 접수                     |
| domuson_fit      | 도무송 맞춤 도면 수정              | drawing                  |
| sample_revision  | 샘플 제작 후 도면 수정             | sample                   |
| field_correction | 현장 작업 중 보정                  | drawing_confirmed, laser |
| laser_processing | 레이저 가공을 위한 도면 수정       | laser, cutting           |
| revision_request | 거래처 수정요청 도면 제출          | 모든 단계                |
| other            | 기타 (reason_detail 필수)          | 모든 단계                |

### source 값 설명

| source       | 설명                            |
| ------------ | ------------------------------- |
| stage_change | 공정 단계 변경 시 모달에서 등록 |
| manual       | 관리자 수동 등록                |
| auto_initial | 문의 생성 시 자동 v1 등록       |
| integration  | 외부 프로그램 API를 통한 등록   |

## API 엔드포인트

### 내부 API (브라우저 프론트엔드)

| Method | Path                                               | Auth    | Description               |
| ------ | -------------------------------------------------- | ------- | ------------------------- |
| GET    | /api/v1/contacts/:id/drawing-revisions             | API Key | 도면 수정 이력 조회       |
| POST   | /api/v1/contacts/:id/drawing-revisions             | API Key | 도면 수정 등록            |
| POST   | /api/v1/contacts/:id/drawing-revisions/upload-urls | API Key | 도면 업로드 presigned URL |
| GET    | /api/v1/drawing-revisions/:revisionId/download     | API Key | 도면 파일 다운로드 URL    |
| PATCH  | /api/v1/drawing-revisions/:revisionId/visibility   | API Key | 공개 여부 변경            |

### Drawing Workflow API (도면 워크플로우)

| Method | Path                                              | Auth    | Description                |
| ------ | ------------------------------------------------- | ------- | -------------------------- |
| GET    | /api/v1/contacts/:id/latest-drawing               | API Key | 현재 단계 기준 최신 도면   |
| POST   | /api/v1/contacts/:id/company-drawing              | Company | 거래처 도면 업로드         |
| POST   | /api/v1/contacts/:id/link-webhard-file            | Company | 웹하드 파일 → 문의 연결    |
| POST   | /api/v1/contacts/:id/merge-drawing-from/:sourceId | Admin   | 수동 문의 연결 (도면 이동) |

### Integration API (외부 프로그램)

| Method | Path                                  | Auth    | Description                  |
| ------ | ------------------------------------- | ------- | ---------------------------- |
| POST   | /api/v1/integration/drawing-revisions | API Key | 외부 프로그램 도면 수정 등록 |
| POST   | /api/v1/integration/dxf-match/upload  | API Key | DXF 파일명 기반 자동 매칭    |

### GET /api/v1/contacts/:id/drawing-revisions

도면 수정 이력을 조회한다. 최신 버전이 먼저 오는 내림차순 정렬.

**Query Parameters:**

| 필드      | 타입    | Required | 설명                        |
| --------- | ------- | -------- | --------------------------- |
| is_public | boolean | N        | 공개 항목만 필터 (거래처용) |

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "contactId": "uuid",
      "version": 3,
      "processStage": "laser",
      "reason": "laser_processing",
      "reasonDetail": null,
      "files": [
        {
          "url": "https://r2.example.com/...",
          "name": "도면_v3.dxf",
          "size": 102400,
          "mimeType": "application/dxf"
        }
      ],
      "actorType": "admin",
      "actorName": "관리자",
      "source": "manual",
      "isPublic": false,
      "note": "레이저 가공 최적화",
      "createdAt": "2026-04-13T10:00:00.000Z"
    }
  ],
  "total": 3
}
```

### POST /api/v1/contacts/:id/drawing-revisions

도면 수정을 등록한다. version은 해당 contact의 최대 version + 1로 자동 증가.

**Request Body:**

| 필드         | 타입     | Required | 설명                                                  |
| ------------ | -------- | -------- | ----------------------------------------------------- |
| processStage | string   | N        | 수정 시점 공정 단계                                   |
| reason       | string   | Y        | 수정 사유 (enum)                                      |
| reasonDetail | string   | N        | 사유 상세 (reason=other일 때 필수)                    |
| files        | object[] | Y        | 파일 목록 [{ url, name, size, mimeType }]             |
| actorType    | string   | Y        | admin \| worker \| system \| external                 |
| actorName    | string   | N        | 수행자 이름                                           |
| source       | string   | Y        | stage_change \| manual \| auto_initial \| integration |
| isPublic     | boolean  | N        | 공개 여부 (기본 false)                                |
| note         | string   | N        | 메모                                                  |

**Response (201):** 생성된 DrawingRevision 객체. Webhard 동기화가 부분 실패한 경우 `webhardWarning?: { code, message }` 필드가 함께 포함된다 (§7.1 참고). Revision 레코드 자체는 성공 저장된 상태.

### POST /api/v1/contacts/:id/drawing-revisions/upload-urls

R2 presigned URL을 발급한다. 클라이언트가 직접 R2에 업로드 후, POST /drawing-revisions에서 URL을 등록.

**Request Body:**

| 필드  | 타입     | Required | 설명                                               |
| ----- | -------- | -------- | -------------------------------------------------- |
| files | object[] | Y        | [{ name: string, size: number, mimeType: string }] |

**Response (200):**

```json
{
  "uploadUrls": [
    {
      "name": "도면_v3.dxf",
      "uploadUrl": "https://r2.example.com/presigned...",
      "key": "drawing-revisions/uuid/..."
    }
  ]
}
```

### GET /api/v1/drawing-revisions/:revisionId/download

도면 파일 다운로드용 presigned URL을 발급한다.

**Query Parameters:**

| 필드      | 타입   | Required | 설명                 |
| --------- | ------ | -------- | -------------------- |
| fileIndex | number | N        | 파일 인덱스 (기본 0) |

**Response (200):**

```json
{
  "downloadUrl": "https://r2.example.com/presigned...",
  "fileName": "도면_v3.dxf",
  "expiresIn": 3600
}
```

### PATCH /api/v1/drawing-revisions/:revisionId/visibility

도면 수정 이력의 공개 여부를 변경한다.

**Request Body:**

| 필드     | 타입    | Required | 설명      |
| -------- | ------- | -------- | --------- |
| isPublic | boolean | Y        | 공개 여부 |

**Response (200):** 수정된 DrawingRevision 객체

### 최신 도면 다운로드 API (task 17 Phase 4)

카드/리스트 UI 에서 "최신 도면 다운로드"를 1-click 으로 제공하기 위한 사용자-facing 다운로드 라우트. 관리자·Worker·거래처가 모두 사용한다.

"최신" 판단은 다운로드용 계약과 화면 조회용 계약이 다르다. `GET /api/v1/contacts/:id/latest-drawing-url` 은 마지막으로 업로드된 DrawingRevision(`createdAt DESC`)을 사용하고, `GET /api/v1/contacts/:id/latest-drawing` 화면 조회는 현재 공정 기준 선택 규칙을 유지한다.

#### Next.js 라우트 — `GET /api/contacts/:id/latest-drawing/download`

- 인증: **admin-session | company-session | erp-session 중 하나**로 허용. 어느 세션에도 해당하지 않으면 `401`.
  - worker 카드 타임라인 다운로드 아이콘이 `erp-session`으로 접근할 수 있어야 한다는 피드백에 대한 대응 (기존 `GET /api/drawing-revisions/:revisionId/download` 도 동일하게 erp 허용으로 확장 — nextjs-routes.md 참고).
- 내부: NestJS `GET /api/v1/contacts/:id/latest-drawing-url` 로 프록시. NestJS 측은 `DrawingRevisionService.getLatestUploaded(contactId)` 결과의 첫 번째 파일에 presigned URL 을 발급한다.
- 응답:
  ```json
  { "url": "https://r2.example.com/presigned...", "fileName": "도면_v3.dxf" }
  ```
- fallback 규칙: 마지막 업로드 DrawingRevision 이 없을 경우, `contact.drawingFileUrl`(과거 단일 업로드 경로) 로 **조용히 fallback**. fallback 시에도 동일 응답 shape 유지. `contact.drawingFileUrl` 조차 없으면 `404`.
- 에러:
  - `401 Unauthorized` — 3종 세션 모두 실패.
  - `404 Not Found` — 리비전 + fallback 모두 없음.
  - `500 Internal Server Error` — presigned URL 발급 실패.

#### NestJS 엔드포인트 — `GET /api/v1/contacts/:id/latest-drawing-url`

- 인증: `ApiKeyGuard` 필수. Next.js 프록시 경유만 허용 (브라우저 직접 호출 금지).
- 자세한 request/response shape + 에러 케이스는 `docs/specs/api/endpoints/integration.md` 의 해당 엔트리 참고.

#### 소비처

- Worker 카드(`OfficeContactCard` / `StaffContactCard`) 의 다운로드 아이콘: 카드 펼침 없이 최신 도면 다운로드.
- Admin 문의 상세뷰(`/admin/contacts/:id`) "첨부 파일 > 도면" 항목: 기존 `drawingFileUrl` 직접 다운로드 대신 본 라우트 사용.
- 위 두 경로 모두 다운로드용 최신 기준을 공유하므로, Worker/Admin/Company 다운로드 버튼은 마지막 업로드 파일을 동일하게 받는다.
- 파일명은 `buildInquiryFileName` 공통 유틸을 사용해 `/drawing-revisions/:id/download` 와 동일한 포맷을 보장한다. `workNumber`가 있으면 F 번호를 우선하고, 없을 때만 O 번호를 쓰며, 기존 O/F prefix는 제거 후 하나만 붙인다.

### POST /api/v1/integration/drawing-revisions

외부 프로그램에서 도면 수정을 등록한다. 내부 POST와 동일하나 actor_type이 `external`로 고정되고, source가 `integration`으로 고정.

**Request Body:**

| 필드         | 타입     | Required | 설명                            |
| ------------ | -------- | -------- | ------------------------------- |
| contactId    | string   | Y        | 문의 UUID                       |
| processStage | string   | N        | 수정 시점 공정 단계             |
| reason       | string   | Y        | 수정 사유 (enum)                |
| reasonDetail | string   | N        | 사유 상세                       |
| files        | object[] | Y        | [{ url, name, size, mimeType }] |
| actorName    | string   | N        | 수행 프로그램/사용자명          |
| isPublic     | boolean  | N        | 공개 여부 (기본 false)          |
| note         | string   | N        | 메모                            |

**Response (201):** 생성된 DrawingRevision 객체

## 트리거 방식

### 1. 공정 단계 변경 시 모달 (자동 트리거)

- **트리거 조건**: 공정 단계가 `drawing` 또는 `drawing_confirmed`로 변경될 때
- **동작**: 관리자에게 도면 수정 업로드 모달을 표시
- **모달 내용**: 수정 사유 선택, 파일 업로드, 메모 입력
- **스킵 가능**: 도면 수정이 없는 경우 건너뛸 수 있음
- **source**: `stage_change`

### 2. 수동 등록

- **트리거 조건**: 관리자가 문의 상세 > 도면 수정 탭에서 직접 등록
- **source**: `manual`

### 3. 자동 v1 등록

- **트리거 조건**: 새 문의 생성 시 `drawingFileUrl`이 존재하는 경우
- **동작**: version 1로 자동 등록 (reason: `initial`, source: `auto_initial`, actor_type: `system`)
- **files**: 기존 `drawingFileUrl`에서 추출
- **트랜잭션**: 문의 생성은 이제 `ContactsService.createContact` 에서도 `$transaction` 내 await 로 `createInitialRevision` 을 호출한다(phase 3). 실패 시 Contact 생성 자체 롤백.

### 4. Integration API

- **트리거 조건**: 외부 프로그램에서 API 호출
- **source**: `integration`
- **actor_type**: `external`

### 5. 거래처 업로드

- **트리거 조건**: 거래처 포탈에서 도면 업로드 (방법 A: 직접 업로드, 방법 B: 웹하드 파일 연결)
- **source**: `manual`
- **actor_type**: `company`
- **동작**: 용도(purpose)에 따라 reason 매핑 (revision_submit → revision_request, mold_request → field_correction, other → other)
- **특수 동작**: mold_request 선택 시 processStage → drawing_confirmed 자동 변경
- **부가 동작**: Contact.drawingFileUrl 업데이트, 웹하드 연결 시 WebhardFile.inquiryNumber 업데이트

### 6. Worker 업로드

- **트리거 조건**: Worker 포탈에서 도면 업로드 (기존 drawing-revisions POST 엔드포인트 사용)
- **source**: `manual`
- **actor_type**: `worker`
- **동작**: 사유 선택 (domuson_fit / sample_revision / field_correction / other)

### 7. WebhardFile 자동 생성 규칙 (공통)

도면 수정 등록 시 WebhardFile 레코드도 자동 생성된다. 생성된 WebhardFile의 ID 목록은 `drawing_revisions.webhard_file_ids` 컬럼에 저장된다.

- **대상 source**: `manual`(관리자/거래처/Worker), `integration`, `stage_change`
- **저장 위치 표** (drawing-workflow.md §W.1 참고):

  | 필드   | 공식                                                                                                                    |
  | ------ | ----------------------------------------------------------------------------------------------------------------------- |
  | folder | `{거래처루트}/문의-{buildInquiryFolderName({inquiryNumber, workNumber})}/` (납품 완료 시 `{거래처루트}/완료/문의-.../`) |
  | name   | `buildInquiryFileName({contact, revision, originalName: file.name})` — 예: `[260420-F-004] 원본명.DXF`                  |

- **예외 — `auto_initial`**: 기존 `registerFilesToWebhard` 로직이 별도로 WebhardFile을 등록하므로 `DrawingRevision.createRevision` 경로에서는 중복 생성을 방지한다 (source === 'auto_initial'이면 skip)
- **예외 — link-webhard-file**: 이미 존재하는 WebhardFile을 재사용하므로 신규 생성하지 않고 `inquiryNumber` + `folderId`만 갱신

#### 7.1 Best-Effort 실패 전파 (`webhardWarning`)

`DrawingRevision.createRevision` → `syncRevisionToWebhard`(`drawing-revision.service.ts:402`) 의 실패는 task 18 까지 `.catch(() => [] as string[])` 로 조용히 무시되어, 클라이언트는 webhard 동기화 실패를 전혀 인지할 수 없었다. task 19 부터는 **Revision 레코드 자체는 성공**으로 처리하되, `POST /api/v1/contacts/:id/drawing-revisions` 응답에 `webhardWarning?` 필드를 포함시켜 UI 에 경고를 띄울 수 있도록 한다.

- `.catch` 는 제거하되 에러를 throw 하지 않고 객체로 변환하여 반환한다. 이미 생성된 `DrawingRevision` 은 롤백하지 않는다.
- 응답 스키마(기존 `DrawingRevision` shape 그대로 + 옵셔널 필드 추가):

  ```ts
  interface DrawingRevisionResponse extends DrawingRevision {
    webhardWarning?: {
      code: 'NO_INQUIRY_NUMBER' | 'FOLDER_CREATE_FAILED' | 'RELOCATE_FAILED' | 'UNKNOWN';
      message: string;
    };
  }
  ```

- **code 의미**:

  | code                   | 의미                                                                                                              |
  | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
  | `NO_INQUIRY_NUMBER`    | Contact 에 `inquiryNumber` / `workNumber` 둘 다 없어 폴더명을 만들 수 없음 — 미분류 상태 등.                      |
  | `FOLDER_CREATE_FAILED` | `ensureInquiryFolder` 단계에서 예외(DB/권한 등) 로 폴더 확보 실패.                                                |
  | `RELOCATE_FAILED`      | 폴더는 확보했으나 `relocateContactFiles` 가 파일 이동에 실패 (일부 파일이 미이동).                                |
  | `UNKNOWN`              | 위 세 분기에 해당하지 않는 예외가 `syncRevisionToWebhard` 내부에서 발생한 경우 fallback. 메시지는 원 예외 문자열. |

- 프론트는 이 필드가 있으면 toast 경고를 띄운다 (Revision 자체는 정상 반영). 상세 UX 는 `worker-portal.md` 도면 업로드 섹션 참고.
- 동일 규칙은 `POST /api/v1/contacts/:id/company-drawing`, Worker 업로드 경로(동일 엔드포인트 재사용) 에도 적용된다.

## 실패 처리 정책

- `createInitialRevision`은 AutoContactService의 Contact 생성 트랜잭션 내부에서
  await 호출. 실패 시 Contact 생성 자체가 롤백된다.
- 외부 업로드(`createRevision`, `company-drawing` 등)는 요청 트랜잭션 내부에서
  await. 실패 시 호출자에게 예외 반환.
- 응답이 비어있는 타임라인은 `GET /contacts/:id/timeline`의 fallback으로 최소
  이벤트(`created` + initial drawing)를 파생 제공한다. 자세한 규칙은
  drawing-workflow.md의 "타임라인 신뢰성 보장" 섹션 참고.

## 접근 권한

| 역할    | 조회                                                            | 등록            | 수정 (공개 여부) |
| ------- | --------------------------------------------------------------- | --------------- | ---------------- |
| admin   | 모든 이력                                                       | O               | O                |
| worker  | 모든 이력 (조회만)                                              | O (사유 선택)   | X                |
| company | 통합 타임라인 (서버에서 isPublic=true 필터 + admin 메타 마스킹) | O (자기 문의만) | X                |

## UI 구성

### 관리자: 문의 상세 > 통합 타임라인

- 공정/유형/업체 변경(`status_change`)과 도면 수정(`drawing_revision`)을 하나의 시간순 리스트로 렌더 (drawing-workflow.md 섹션 B 참고)
- `drawing_revision` 항목: 버전 뱃지, 공정 단계, 수정 사유, 파일 목록 + 인라인 다운로드 버튼, 수행자, 일시, 공개/비공개 토글
- `status_change` 항목: 변경 유형, from→to 값, 수행자, 일시
- "도면 수정 등록" 버튼 (수동 등록)

### 거래처 포털: 문의 상세 > 통합 타임라인 (공개 항목만, 관리자 메타 마스킹)

- 관리자와 동일한 단일 컴포넌트를 사용하되, 응답 데이터는 서버 필터 처리
- 포함 조건: `kind === 'status_change'` 전체, `kind === 'drawing_revision'` 중 `isPublic=true`인 항목만
- 마스킹: `actorName`/`actorType`은 "YJLaser"로 통일, `note`는 응답에서 제거
- 파일 다운로드 링크는 인라인 노출, 그 외는 읽기 전용

## 완료 기준

1. [x] DrawingRevision 테이블 생성 (Prisma migration)
2. [x] 내부 API 5개 엔드포인트 구현
3. [x] Integration API 2개 엔드포인트 구현 (drawing-revisions + dxf-match/upload)
4. [x] 문의 생성 시 drawingFileUrl 존재하면 v1 자동 등록
5. [x] 공정 단계 변경 시 도면 수정 모달 표시 (drawing, drawing_confirmed)
6. [x] 도면 수정 타임라인 UI (관리자)
7. [x] 거래처 포털 공개 이력 조회
8. [x] tsc --noEmit 통과
9. [x] pnpm lint 통과
