# Contact Split (문의 분할)

## 개요

- 목적: 하나의 문의(Contact)를 여러 개의 하위 문의로 분할한다. 업체가 한 도면 파일에 여러 도면을 합쳐서 보내는 경우, 현장에 내리는 파일은 도면 1개당 1파일이어야 하므로 분할이 필요하다.
- 도메인: CRM > 문의 관리 > 문의 분할
- 배경:
  - 업체가 한 도면 파일에 여러 도면을 합쳐서 보내는 경우가 있음
  - 현장에 내리는 파일은 도면 1개당 1파일이어야 함
  - 따라서 하나의 문의를 여러 개의 하위 문의로 분할하는 기능 필요
  - 빈도: 간헐적 소수 (2~3종이 대부분)

## 데이터 모델

### Contact 테이블 추가 컬럼 (`contacts`)

| Column            | Type                     | Notes                                         |
| ----------------- | ------------------------ | --------------------------------------------- |
| parent_contact_id | UUID? (FK → contacts.id) | 분할 원본 참조 (자기참조, ON DELETE SET NULL) |
| split_index       | Int?                     | 하위 순번 (1, 2, 3...)                        |
| split_count       | Int?                     | 원본에만 기록 — 총 분할 수                    |
| stage_completed   | Boolean (default false)  | 현재 공정 단계 완료 체크 (분할 그룹 전용)     |

Relations: Contact 1:N Contact (self-reference via parent_contact_id)

## 분할 규칙

### 분할 대상 조건

- `parent_contact_id == null` (이미 하위 문의가 아닌 것)
- `split_count == null` (이미 분할된 원본이 아닌 것)
- `processStage`가 초기 단계 (`null` 또는 `drawing`)인 일반 문의만

### 분할 개수

- 최소 2개, 최대 10개

### 하위번호 형식

원본의 `inquiryNumber` 또는 `workNumber`에 `-N` suffix 추가:

- 예: `260413-O-001` → `260413-O-001-1`, `260413-O-001-2`, `260413-O-001-3`

### 자식에 복사되는 정보

companyName, email, phone, position, inquiryType, deliveryMethod, deliveryAddress, deliveryName, deliveryPhone, deliveryType, deliveryCompanyName, deliveryCompanyPhone, deliveryCompanyAddress, deliveryNote, receiptMethod, isUrgent, contactType, source, orderType, boxShape, material

> `inquiryType` 필드의 카드 UX(1-click 분류 및 재분류 컨텍스트 메뉴)는 [inquiry-classification-ux.md](./inquiry-classification-ux.md) 참조. task 16 이후 분류 CTA 는 공용 `InquiryClassifyButtons` 컴포넌트(`src/components/contacts/InquiryClassifyButtons.tsx`)와 `useClassifyInquiryType` 훅을 기준으로 Admin/Worker 양쪽에서 동일하게 동작한다.

### 자식에 복사되지 않는 정보

- drawingFileUrl, drawingFileName — 관리자가 각각 업로드
- subject — 각각 입력 또는 자동 생성
- processStage — 각각 독립적으로 진행
- revisionRequest 관련 필드들 (revisionRequestTitle, revisionRequestContent, revisionRequestedAt, revisionRequestFileUrl, revisionRequestFileName, revisionRequestHistory)

### 원본 처리

- `splitCount` 설정 (분할 수)
- 원본 도면파일 보관
- 읽기전용 참조용으로 유지

## 그룹 진행 방식 (핵심 비즈니스 규칙)

1. 각 하위 문의는 개별적으로 `stageCompleted = true`로 체크 가능
2. 그룹 내 모든 하위 문의의 `stageCompleted`가 `true`이면 "다음 단계로 이동" 가능
3. 일괄 이동 시 모든 하위 문의의 `processStage`가 다음 단계로 변경되고, `stageCompleted`는 `false`로 리셋
4. 하나라도 `stageCompleted`가 `false`이면 일괄 이동 불가

#### 실시간 업데이트

- `toggleStageCompleted` 완료 후 부모 Contact(children 포함)를 재조회하여 `contact:updated` 소켓 이벤트 발행
- `advanceSplitGroupStage` 완료 후 동일하게 부모 Contact를 `contact:updated`로 발행 (기존 `contact:group-stage-advanced` 유지)
- Admin/Worker 프론트엔드 모두 `contact:group-stage-advanced`, `contact:split` 이벤트 구독

#### 타임라인 기록 규칙

- `toggleStageCompleted` 시 자식 contactId + 부모 contactId 양쪽에 타임라인 기록
- `advanceSplitGroupStage` 시 각 자식 contactId + 부모 contactId에 타임라인 기록
- 부모 타임라인의 metadata에 어떤 자식/어떤 변경인지 기록

#### 작업완료 확인 모달

- 분할 하위 문의의 개별 "작업완료" 버튼 클릭 시 확인 모달 표시
- 모달 메시지에 해당 하위 문의 번호 포함 (예: "260413-O-001-1 작업완료 처리하시겠습니까?")

## 목록 표시

### 관리자 문의 목록

- 그룹핑: 원본(`splitCount > 0`)이 그룹 헤더, 하위 문의는 들여쓰기
- 접기/펼치기 토글
- 그룹 헤더에 진행률 표시 (N/M 완료)
- 하위 문의(`parentContactId != null`)는 최상위 목록에서 제외

### 거래처 포탈

- 원본 숨김, 자식만 노출

## API 엔드포인트

| Method | Path                                        | Auth    | Description                    |
| ------ | ------------------------------------------- | ------- | ------------------------------ |
| POST   | /api/v1/contacts/:id/split                  | API Key | 문의 분할 (N개 하위 문의 생성) |
| GET    | /api/v1/contacts/:id/children               | API Key | 하위 문의 목록 조회            |
| PATCH  | /api/v1/contacts/:id/stage-completed        | API Key | 단계 완료 체크 토글            |
| POST   | /api/v1/contacts/:id/children/advance-stage | API Key | 그룹 일괄 다음 단계 이동       |

### POST /api/v1/contacts/:id/split

문의를 N개의 하위 문의로 분할한다.

**Request Body:**

| 필드  | 타입 | Required | 설명           |
| ----- | ---- | -------- | -------------- |
| count | Int  | Y        | 분할 수 (2~10) |

**Response (201):**

```json
{
  "parent": { "id": "uuid", "splitCount": 3 },
  "children": [
    { "id": "uuid", "splitIndex": 1, "inquiryNumber": "260413-O-001-1" },
    { "id": "uuid", "splitIndex": 2, "inquiryNumber": "260413-O-001-2" },
    { "id": "uuid", "splitIndex": 3, "inquiryNumber": "260413-O-001-3" }
  ]
}
```

**에러:**

| Code | 조건                                                   |
| ---- | ------------------------------------------------------ |
| 404  | 문의가 존재하지 않음                                   |
| 400  | 이미 분할된 문의 (splitCount != null)                  |
| 400  | 하위 문의 (parentContactId != null)                    |
| 400  | processStage가 초기 단계가 아님 (null, drawing만 허용) |
| 400  | count가 2~10 범위 밖                                   |

### GET /api/v1/contacts/:id/children

하위 문의 목록을 조회한다. splitIndex 오름차순 정렬.

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "splitIndex": 1,
      "inquiryNumber": "260413-O-001-1",
      "processStage": "drawing",
      "stageCompleted": true
    }
  ],
  "total": 3,
  "completedCount": 1,
  "allCompleted": false
}
```

### PATCH /api/v1/contacts/:id/stage-completed

하위 문의의 단계 완료 체크를 토글한다.

**Request Body:**

| 필드           | 타입    | Required | 설명      |
| -------------- | ------- | -------- | --------- |
| stageCompleted | boolean | Y        | 완료 여부 |

**Response (200):** 수정된 Contact 객체

**에러:**

| Code | 조건                                       |
| ---- | ------------------------------------------ |
| 404  | 문의가 존재하지 않음                       |
| 400  | 하위 문의가 아님 (parentContactId == null) |

### POST /api/v1/contacts/:id/children/advance-stage

그룹 내 모든 하위 문의를 다음 공정 단계로 일괄 이동한다.

**Response (200):**

```json
{
  "previousStage": "drawing",
  "newStage": "sample",
  "advancedCount": 3
}
```

**에러:**

| Code | 조건                                       |
| ---- | ------------------------------------------ |
| 404  | 문의가 존재하지 않음                       |
| 400  | 분할 원본이 아님 (splitCount == null)      |
| 400  | 모든 하위 문의가 완료되지 않음             |
| 400  | 다음 단계가 존재하지 않음 (이미 최종 단계) |

## 접근 권한

| 역할    | 분할 실행 | 하위 목록 조회 | 단계 완료 체크 | 일괄 이동 |
| ------- | --------- | -------------- | -------------- | --------- |
| admin   | O         | O              | O              | O         |
| worker  | X         | O (조회만)     | O              | X         |
| company | X         | O (자기 것만)  | X              | X         |

## 완료 기준

1. [ ] Contact 테이블에 분할 관련 컬럼 4개 추가 (Prisma migration)
2. [ ] POST /contacts/:id/split 구현
3. [ ] GET /contacts/:id/children 구현
4. [ ] PATCH /contacts/:id/stage-completed 구현
5. [ ] POST /contacts/:id/children/advance-stage 구현
6. [ ] 관리자 문의 목록 그룹핑 UI
7. [ ] 분할 모달 UI
8. [ ] 거래처 포탈 하위 문의 노출
9. [ ] tsc --noEmit 통과
10. [ ] pnpm lint 통과
