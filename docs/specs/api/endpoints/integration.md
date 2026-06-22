# Integration API — 외부 프로그램 연동

Base URL: `/api/v1`
Auth: `X-API-Key` header (`ApiKeyGuard`) — 별도 표기 없으면 모든 엔드포인트에 적용

---

## 외부 프로그램별 사용 API

| 프로그램                    | 사용 엔드포인트                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 유진레이저목형 관리프로그램 | `POST /integration/contacts/auto`, `POST /integration/events`, `PATCH /integration/orders/:id/status`, `PATCH /integration/orders/:id/process-stage`, `GET /integration/orders`, `POST /integration/sync-logs`, `GET /integration/sync-logs/check-duplicate`, `POST /integration/programs/heartbeat`                                                                                                                     |
| 레이저네스팅프로그램        | `GET /integration/nesting-tasks/pending`, `PATCH /integration/nesting-tasks/:taskId/status`, `POST /integration/nesting-tasks/:taskId/result`, `POST /integration/events` (nesting_started/completed), `POST /integration/laser-completions`, `PATCH /integration/orders/:id/status`, `PATCH /integration/orders/:id/process-stage`, `POST /integration/inventory/items/:id/out`, `POST /integration/programs/heartbeat` |
| 외부웹하드동기화프로그램    | `POST /integration/files/register`, `POST /integration/sync-logs`, `GET /integration/sync-logs/check-duplicate`, `POST /integration/contacts/auto`, `POST /integration/programs/heartbeat`                                                                                                                                                                                                                               |
| yjlaser_website (관리자)    | `POST /integration/api-keys`, `GET /integration/api-keys`, `DELETE /integration/api-keys/:id`, `GET /integration/sync-logs/pipeline-backlog`                                                                                                                                                                                                                                                                             |

---

## Programs

### POST /api/v1/integration/programs/heartbeat

프로그램 생존 신호를 전송합니다. 동일 `programType + instanceName` 조합이 있으면 upsert합니다.

**사용 프로그램:** 모든 외부 프로그램 (관리프로그램, 네스팅프로그램, 동기화프로그램)

**Request Body:**

| 필드         | 타입   | Required | 설명                                                         |
| ------------ | ------ | -------- | ------------------------------------------------------------ |
| programType  | string | Y        | 프로그램 분류 (e.g. `nesting_program`, `management_program`) |
| instanceName | string | Y        | 인스턴스 고유명                                              |
| version      | string | N        | 프로그램 버전                                                |
| hostname     | string | N        | 실행 호스트명 (클라이언트에서 자동 감지)                     |
| metadata     | object | N        | 추가 메타데이터                                              |

**Response (200):**

```json
{
  "id": "uuid",
  "program_type": "nesting_program",
  "instance_name": "nesting-01",
  "status": "online",
  "last_seen_at": "2026-03-24T12:00:00.000Z"
}
```

---

### GET /api/v1/integration/programs

등록된 모든 프로그램 목록을 조회합니다. 120초 이상 heartbeat 없으면 `offline`으로 표시됩니다.

**사용 프로그램:** yjlaser_website (관리자 대시보드)

**Request:** 파라미터 없음

**Response (200):**

```json
[
  {
    "id": "uuid",
    "program_type": "nesting_program",
    "instance_name": "nesting-01",
    "status": "online",
    "version": "1.2.0",
    "hostname": "DESKTOP-ABC",
    "last_seen_at": "2026-03-24T12:00:00.000Z",
    "metadata": {},
    "created_at": "2026-01-01T00:00:00.000Z"
  }
]
```

---

## Events

### POST /api/v1/integration/events

주문 관련 이벤트를 기록합니다. 특정 이벤트 타입은 주문 상태를 자동 전환합니다.

자동 상태 전환 매핑:

- `file_synced` -> `drawing_received`
- `file_classified` -> `file_classified`
- `nesting_started` -> `nesting_queued`
- `nesting_completed` -> `nesting_complete` (+ 합판 자동 출고)

**사용 프로그램:** 관리프로그램, 네스팅프로그램

**Request Body:**

| 필드      | 타입          | Required | 설명                                                  |
| --------- | ------------- | -------- | ----------------------------------------------------- |
| orderId   | string (UUID) | Y        | 주문 ID                                               |
| eventType | string        | Y        | 이벤트 타입 (e.g. `file_synced`, `nesting_completed`) |
| source    | string        | Y        | 이벤트 발생 프로그램명                                |
| actorName | string        | N        | 수행자 이름                                           |
| data      | object        | N        | 이벤트 상세 데이터                                    |
| message   | string        | N        | 이벤트 설명 메시지                                    |

**`nesting_completed` 이벤트 `data` 예시 (합판 자동 출고):**

```json
{
  "plywood_usage": [{ "item_id": "uuid", "quantity": 2 }]
}
```

**Response (201):**

```json
{
  "id": "uuid",
  "order_id": "uuid",
  "event_type": "file_synced",
  "from_status": "received",
  "to_status": "drawing_received",
  "source": "management_program",
  "actor_name": null,
  "data": {},
  "message": null,
  "created_at": "2026-03-24T12:00:00.000Z"
}
```

---

### POST /api/v1/integration/events/batch

여러 이벤트를 일괄 기록합니다. 각 이벤트에 대해 자동 상태 전환이 개별 적용됩니다.

**사용 프로그램:** 관리프로그램

**Request Body:**

| 필드   | 타입             | Required | 설명                                                |
| ------ | ---------------- | -------- | --------------------------------------------------- |
| events | CreateEventDto[] | Y        | 이벤트 배열 (각 항목은 POST /events 의 Body와 동일) |

**Response (201):**

```json
[{ "id": "uuid", "order_id": "...", "event_type": "...", "...": "..." }]
```

---

### GET /api/v1/integration/events

이벤트 목록을 조회합니다 (페이지네이션).

**Request Query Parameters:**

| 필드      | 타입          | Required | 설명                     |
| --------- | ------------- | -------- | ------------------------ |
| source    | string        | N        | 소스 프로그램 필터       |
| eventType | string        | N        | 이벤트 타입 필터         |
| orderId   | string (UUID) | N        | 주문 ID 필터             |
| dateFrom  | string        | N        | 시작 날짜 (ISO 8601)     |
| dateTo    | string        | N        | 종료 날짜 (ISO 8601)     |
| page      | number        | N        | 페이지 번호 (기본값: 1)  |
| limit     | number        | N        | 페이지 크기 (기본값: 50) |

**Response (200):**

```json
{
  "events": [{ "id": "...", "order_id": "...", "event_type": "...", "...": "..." }],
  "total": 100,
  "page": 1,
  "limit": 50,
  "hasMore": true
}
```

---

## Orders

### GET /api/v1/integration/orders/stats

주문 현황 통계를 조회합니다.

**사용 프로그램:** yjlaser_website (관리자 대시보드)

**Request:** 파라미터 없음

**Response (200):**

```json
{
  "by_status": { "received": 5, "drawing": 3, "cutting": 2, "delivered": 10 },
  "by_priority": { "urgent": 2, "normal": 6, "low": 2 },
  "recent_week": 8,
  "total": 20,
  "active": 10
}
```

---

### GET /api/v1/integration/orders/workshop

작업장(현장) 전용 주문 조회. 가공/후처리/납품 단계의 주문만 반환합니다.

**사용 프로그램:** yjlaser_website (작업자 UI)

**Request Query Parameters:**

| 필드   | 타입   | Required | 설명                                     |
| ------ | ------ | -------- | ---------------------------------------- |
| stage  | enum   | N        | `cutting`, `post_processing`, `delivery` |
| period | enum   | N        | `today`, `week`, `all`                   |
| search | string | N        | 업체명/제목/작업번호 검색                |

**Response (200):**

```json
{
  "orders": [{ "id": "...", "status": "cutting_ready", "...": "..." }],
  "grouped": {
    "cutting": [],
    "post_processing": [],
    "delivery": []
  },
  "counts": { "cutting": 3, "post_processing": 1, "delivery": 2, "total": 6 }
}
```

---

### GET /api/v1/integration/orders

주문 목록을 조회합니다 (페이지네이션, 필터, 정렬).

**사용 프로그램:** 관리프로그램, yjlaser_website

**Request Query Parameters:**

| 필드        | 타입   | Required | 설명                                                                                                              |
| ----------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| status      | enum   | N        | 단일 상태 필터 (`received`, `drawing`, `confirmed`, `production`, `cutting`, `finishing`, `delivered`, `on_hold`) |
| statuses    | string | N        | 쉼표 구분 복수 상태 필터 (e.g. `cutting,finishing`)                                                               |
| companyName | string | N        | 업체명 부분 일치 검색 (대소문자 무관)                                                                             |
| priority    | enum   | N        | `urgent`, `normal`, `low`                                                                                         |
| contactId   | number | N        | Contact ID 필터                                                                                                   |
| workNumber  | string | N        | 현장작업번호 정확 일치 (e.g. `260409-F-001`)                                                                      |
| page        | number | N        | 페이지 번호 (기본값: 1)                                                                                           |
| limit       | number | N        | 페이지 크기 (기본값: 50)                                                                                          |
| dateFrom    | string | N        | 생성일 시작 (ISO 8601)                                                                                            |
| dateTo      | string | N        | 생성일 종료 (ISO 8601)                                                                                            |
| sortBy      | string | N        | 정렬 필드: `created_at`(기본값), `updated_at`, `company_name`, `status`, `priority`, `received_at`                |
| sortOrder   | string | N        | `asc` 또는 `desc` (기본값: `desc`)                                                                                |

**Response (200):**

```json
{
  "orders": [
    {
      "id": "uuid",
      "contact_id": 123,
      "inquiry_number": "260324-O-001",
      "company_name": "원컴퍼니",
      "customer_name": "홍길동",
      "customer_phone": "010-1234-5678",
      "title": "목형 제작 의뢰",
      "description": null,
      "order_type": "standard",
      "status": "received",
      "priority": "normal",
      "drawing_file_count": 0,
      "webhard_folder_id": null,
      "dxf_classified_count": 0,
      "dxf_total_price": 0,
      "nesting_sheet_count": null,
      "nesting_utilization": null,
      "received_at": "2026-03-24T09:00:00.000Z",
      "confirmed_at": null,
      "cutting_started_at": null,
      "cutting_completed_at": null,
      "post_processing_started_at": null,
      "post_processing_completed_at": null,
      "delivered_at": null,
      "scheduled_auto_complete_at": null,
      "delivery_method": null,
      "delivery_address": null,
      "delivery_note": null,
      "memo": null,
      "created_at": "2026-03-24T09:00:00.000Z",
      "updated_at": "2026-03-24T09:00:00.000Z",
      "event_count": 1,
      "task_count": 0,
      "delivery_count": 0
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 50,
  "hasMore": true
}
```

---

### GET /api/v1/integration/orders/numbers/next

당일 기준 다음 사무실작업번호와 현장작업번호를 반환합니다.

**Request:** 파라미터 없음

**Response (200):**

```json
{
  "nextInquiryNumber": "260324-O-003",
  "nextWorkNumber": "260324-F-005"
}
```

---

### GET /api/v1/integration/orders/companies/search

업체명으로 등록된 거래처를 검색합니다 (활성 상태만, 최대 1건).

**Request Query Parameters:**

| 필드 | 타입   | Required | 설명                              |
| ---- | ------ | -------- | --------------------------------- |
| name | string | Y        | 업체명 (부분 일치, 대소문자 무관) |

**Response (200):**

```json
{
  "companies": [
    {
      "company_name": "원컴퍼니",
      "manager_name": "홍길동",
      "manager_phone": "010-1234-5678",
      "manager_email": "hong@example.com"
    }
  ]
}
```

---

### GET /api/v1/integration/orders/:id

주문 상세를 조회합니다 (이벤트, 작업, 배송 이력 포함).

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 주문 ID |

**Response (200):**

기본 주문 필드 (GET /orders 응답과 동일) + 아래 추가 필드:

```json
{
  "...": "...(기본 주문 필드)",
  "events": [
    {
      "id": "uuid",
      "event_type": "status_changed",
      "from_status": "received",
      "to_status": "drawing",
      "source": "admin",
      "actor_name": "관리자",
      "data": null,
      "message": null,
      "created_at": "2026-03-24T10:00:00.000Z"
    }
  ],
  "tasks": [
    {
      "id": "uuid",
      "title": "레이저 가공",
      "status": "in_progress",
      "priority": "normal",
      "assigned_to": null,
      "task_type": null,
      "machine_name": "레이저1호기",
      "started_at": "2026-03-24T11:00:00.000Z",
      "completed_at": null,
      "created_at": "2026-03-24T10:30:00.000Z"
    }
  ],
  "deliveries": [
    {
      "id": "uuid",
      "delivery_type": "direct_delivery",
      "status": "pending",
      "recipient_name": "홍길동",
      "scheduled_date": "2026-03-25T09:00:00.000Z",
      "delivered_at": null,
      "tracking_number": null,
      "created_at": "2026-03-24T12:00:00.000Z"
    }
  ]
}
```

**Error:** `404` Order not found

---

### POST /api/v1/integration/orders

주문을 생성합니다. 자동으로 `order_created` 이벤트가 기록됩니다.

**Request Body:**

| 필드             | 타입   | Required | 설명                                      |
| ---------------- | ------ | -------- | ----------------------------------------- |
| contactId        | number | N        | 연결할 Contact ID                         |
| inquiryNumber    | string | N        | 사무실작업번호 (e.g. `260324-O-001`)      |
| companyName      | string | Y        | 업체명                                    |
| customerName     | string | N        | 담당자명                                  |
| customerPhone    | string | N        | 담당자 전화번호                           |
| title            | string | Y        | 주문 제목                                 |
| description      | string | N        | 주문 설명                                 |
| orderType        | string | N        | 주문 유형 (기본값: `standard`)            |
| priority         | enum   | N        | `urgent`, `normal`(기본값), `low`         |
| webhardFolderId  | string | N        | 웹하드 폴더 ID                            |
| deliveryMethod   | string | N        | 납품 방법                                 |
| deliveryAddress  | string | N        | 납품 주소                                 |
| memo             | string | N        | 메모                                      |
| source           | string | N        | 접수 경로 (`website`, `webhard`, `phone`) |
| originalFilename | string | N        | 원본 파일명 (중복 체크용)                 |

**Response (201):** 주문 객체 (GET /orders 응답의 단일 항목과 동일)

---

### PATCH /api/v1/integration/orders/:id

주문 정보를 수정합니다 (상태 제외).

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 주문 ID |

**Request Body:**

| 필드               | 타입   | Required | 설명                      |
| ------------------ | ------ | -------- | ------------------------- |
| companyName        | string | N        | 업체명                    |
| customerName       | string | N        | 담당자명                  |
| customerPhone      | string | N        | 담당자 전화번호           |
| title              | string | N        | 주문 제목                 |
| description        | string | N        | 주문 설명                 |
| priority           | enum   | N        | `urgent`, `normal`, `low` |
| webhardFolderId    | string | N        | 웹하드 폴더 ID            |
| drawingFileCount   | number | N        | 도면 파일 수 (>= 0)       |
| dxfClassifiedCount | number | N        | DXF 분류 완료 수 (>= 0)   |
| dxfTotalPrice      | number | N        | DXF 총 가격 (>= 0)        |
| deliveryMethod     | string | N        | 납품 방법                 |
| deliveryAddress    | string | N        | 납품 주소                 |
| deliveryNote       | string | N        | 납품 비고                 |
| memo               | string | N        | 메모                      |

**Response (200):** 주문 객체

**Error:** `404` Order not found

---

### PATCH /api/v1/integration/orders/:id/status

주문 상태를 전환합니다. 유효하지 않은 상태 전환은 거부됩니다.

**사용 프로그램:** 관리프로그램, 네스팅프로그램, yjlaser_website

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 주문 ID |

**Request Body:**

| 필드      | 타입   | Required | 설명             |
| --------- | ------ | -------- | ---------------- |
| status    | enum   | Y        | 전환할 상태      |
| actorName | string | N        | 수행자 이름      |
| message   | string | N        | 상태 변경 메시지 |

**상태 전환 규칙 (8단계):**

| 현재 상태  | 전환 가능 상태                                               |
| ---------- | ------------------------------------------------------------ |
| received   | drawing, confirmed, on_hold                                  |
| drawing    | confirmed, received, on_hold                                 |
| confirmed  | production, drawing, on_hold                                 |
| production | cutting, confirmed, on_hold                                  |
| cutting    | finishing, delivered, on_hold                                |
| finishing  | delivered, cutting, on_hold                                  |
| delivered  | (없음)                                                       |
| on_hold    | received, drawing, confirmed, production, cutting, finishing |

**부가 동작:**

- `confirmed` 전환 시: `confirmedAt` 타임스탬프 자동 기록
- `cutting` 전환 시: `cuttingStartedAt` 타임스탬프 자동 기록
- `finishing` 전환 시: `postProcessingStartedAt` 타임스탬프 자동 기록
- `delivered` 전환 시: `deliveredAt` 타임스탬프 자동 기록
- `production` 전환 시: Contact에 현장작업번호(`workNumber`, e.g. `260324-F-001`) 자동 부여
- `on_hold` 전환 시: Contact의 이전 상태 저장 (`previousStatus`)
- 연결된 Contact 테이블 상태도 자동 동기화

**Response (200):** 주문 객체

**Errors:**

- `404` Order not found
- `400` Cannot transition from '{from}' to '{to}'. Valid: {list}

---

### GET /api/v1/integration/orders/:id/events

특정 주문의 이벤트 이력을 조회합니다.

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 주문 ID |

**Response (200):**

```json
[
  {
    "id": "uuid",
    "order_id": "uuid",
    "event_type": "status_changed",
    "from_status": "received",
    "to_status": "drawing",
    "source": "admin",
    "actor_name": "관리자",
    "data": null,
    "message": null,
    "created_at": "2026-03-24T10:00:00.000Z"
  }
]
```

**Error:** `404` Order not found

---

### GET /api/v1/integration/orders/:id/timeline

특정 주문의 기존 `OrderEvent`와 신규 `JobEvent`를 병합한 운영 타임라인을 조회합니다.

**권한:** `X-API-Key`가 `job/read` permission을 가져야 합니다.

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 주문 ID |

**Response (200):**

```json
{
  "order_id": "uuid",
  "contact_id": 123,
  "company_name": "원컴퍼니",
  "production_status": "DXF_READY",
  "confirmation_status": "CONFIRMED",
  "classification_status": "CLASSIFIED",
  "nesting_status": null,
  "billing_status": null,
  "events": [
    {
      "timeline_id": "job_event:uuid",
      "source_model": "job_event",
      "event_id": "uuid",
      "order_id": "uuid",
      "event_type": "drawing.classified",
      "source": "management_program",
      "source_worker": "management_program",
      "occurred_at": "2026-06-19T09:05:00.000Z",
      "received_at": "2026-06-19T09:05:02.000Z",
      "created_at": "2026-06-19T09:05:03.000Z",
      "result": "success",
      "state_apply_status": "applied",
      "failure_id": null,
      "order_event_id": "uuid",
      "job_id": "job-001",
      "from_status": null,
      "to_status": null,
      "actor_name": null,
      "message": null,
      "processed_count": 1,
      "duration_ms": 250
    }
  ],
  "failures": []
}
```

**현재 구현 메모:**

- `timeline_id`는 `order_event:<id>` 또는 `job_event:<id>`로 namespace 처리합니다.
- 정렬 기준은 `occurred_at` 내림차순입니다. `OrderEvent`는 `createdAt`,
  `JobEvent`는 `occurredAt`을 사용합니다.
- `JobEvent.payload`와 `idempotencyKey`는 select하지 않고 응답에도 포함하지 않습니다.

**Errors:**

| 상태 | 조건                                 |
| ---- | ------------------------------------ |
| 401  | 유효한 session 또는 `X-API-Key` 없음 |
| 403  | API key에 `job/read` permission 없음 |
| 404  | Order not found                      |

---

## Deliveries

### GET /api/v1/integration/deliveries/schedule

기간별 납품 스케줄을 조회합니다 (완료/반품 제외).

**Request Query Parameters:**

| 필드     | 타입   | Required | 설명                 |
| -------- | ------ | -------- | -------------------- |
| dateFrom | string | Y        | 시작 날짜 (ISO 8601) |
| dateTo   | string | Y        | 종료 날짜 (ISO 8601) |

**Response (200):**

```json
[
  {
    "id": "uuid",
    "order_id": "uuid",
    "delivery_type": "direct_delivery",
    "status": "preparing",
    "recipient_name": "홍길동",
    "recipient_phone": "010-1234-5678",
    "address": "서울시 강남구...",
    "tracking_number": null,
    "courier_company": null,
    "scheduled_date": "2026-03-25T09:00:00.000Z",
    "shipped_at": null,
    "delivered_at": null,
    "note": null,
    "created_at": "2026-03-24T09:00:00.000Z",
    "updated_at": "2026-03-24T09:00:00.000Z",
    "order": {
      "id": "uuid",
      "title": "목형 제작",
      "company_name": "원컴퍼니"
    }
  }
]
```

---

### GET /api/v1/integration/deliveries

납품 목록을 조회합니다 (페이지네이션).

**Request Query Parameters:**

| 필드     | 타입          | Required | 설명                                                          |
| -------- | ------------- | -------- | ------------------------------------------------------------- |
| status   | enum          | N        | `pending`, `preparing`, `in_transit`, `delivered`, `returned` |
| dateFrom | string        | N        | 예정일 시작 (ISO 8601)                                        |
| dateTo   | string        | N        | 예정일 종료 (ISO 8601)                                        |
| orderId  | string (UUID) | N        | 주문 ID 필터                                                  |
| page     | number        | N        | 페이지 번호 (기본값: 1)                                       |
| limit    | number        | N        | 페이지 크기 (기본값: 50)                                      |

**Response (200):**

```json
{
  "deliveries": [{ "...": "...(납품 객체)" }],
  "total": 20,
  "page": 1,
  "limit": 50,
  "hasMore": false
}
```

---

### GET /api/v1/integration/deliveries/:id

납품 상세를 조회합니다.

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 납품 ID |

**Response (200):** 납품 객체 (order 정보 포함)

**Error:** `404` Delivery not found

---

### POST /api/v1/integration/deliveries

납품을 생성합니다. 주문이 존재해야 합니다.

**Request Body:**

| 필드           | 타입              | Required | 설명                                                             |
| -------------- | ----------------- | -------- | ---------------------------------------------------------------- |
| orderId        | string (UUID)     | Y        | 주문 ID                                                          |
| deliveryType   | enum              | Y        | `pickup` (수령), `courier` (택배), `direct_delivery` (직접 배달) |
| recipientName  | string            | N        | 수령인 이름                                                      |
| recipientPhone | string            | N        | 수령인 전화번호                                                  |
| address        | string            | N        | 배송 주소                                                        |
| scheduledDate  | string (ISO 8601) | N        | 납품 예정일                                                      |
| note           | string            | N        | 비고                                                             |

**Response (201):** 납품 객체

**Error:** `404` Order not found

---

### PATCH /api/v1/integration/deliveries/:id

납품 정보를 수정합니다 (상태 제외).

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 납품 ID |

**Request Body:**

| 필드           | 타입              | Required | 설명            |
| -------------- | ----------------- | -------- | --------------- |
| recipientName  | string            | N        | 수령인 이름     |
| recipientPhone | string            | N        | 수령인 전화번호 |
| address        | string            | N        | 배송 주소       |
| trackingNumber | string            | N        | 운송장 번호     |
| courierCompany | string            | N        | 택배사명        |
| scheduledDate  | string (ISO 8601) | N        | 납품 예정일     |
| note           | string            | N        | 비고            |

**Response (200):** 납품 객체

**Error:** `404` Delivery not found

---

### PATCH /api/v1/integration/deliveries/:id/status

납품 상태를 전환합니다. 유효하지 않은 전환은 거부됩니다.

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 납품 ID |

**Request Body:**

| 필드   | 타입 | Required | 설명        |
| ------ | ---- | -------- | ----------- |
| status | enum | Y        | 전환할 상태 |

**상태 전환 규칙:**

| 현재 상태  | 전환 가능 상태      |
| ---------- | ------------------- |
| pending    | preparing           |
| preparing  | in_transit, pending |
| in_transit | delivered, returned |
| delivered  | (없음)              |
| returned   | preparing           |

**부가 동작:**

- `in_transit` 전환 시: `shippedAt` 타임스탬프 자동 기록
- `delivered` 전환 시: `deliveredAt` 타임스탬프 자동 기록 + 연결된 주문 상태도 `delivered`로 전환

**Response (200):** 납품 객체

**Errors:**

- `404` Delivery not found
- `400` Cannot transition from '{from}' to '{to}'. Valid: {list}

---

## Inventory

### GET /api/v1/integration/inventory/alerts

재고 부족 알림 목록을 조회합니다 (현재 재고 <= 최소 재고, 활성 품목만).

**Request:** 파라미터 없음

**Response (200):**

```json
[
  {
    "id": "uuid",
    "name": "합판 3x6 9T",
    "category": "plywood",
    "unit": "장",
    "current_stock": 2,
    "min_stock": 5,
    "shortage": 3
  }
]
```

---

### GET /api/v1/integration/inventory/items

재고 품목 목록을 조회합니다 (페이지네이션).

**Request Query Parameters:**

| 필드     | 타입    | Required | 설명                                                              |
| -------- | ------- | -------- | ----------------------------------------------------------------- |
| category | enum    | N        | `plywood`, `steel_plate`, `blade`, `sponge`, `packaging`, `other` |
| isActive | boolean | N        | 활성 상태 필터                                                    |
| page     | number  | N        | 페이지 번호 (기본값: 1)                                           |
| limit    | number  | N        | 페이지 크기 (기본값: 50)                                          |

**Response (200):**

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "합판 3x6 9T",
      "category": "plywood",
      "unit": "장",
      "current_stock": 15,
      "min_stock": 5,
      "is_low_stock": false,
      "width": 900,
      "height": 1800,
      "thickness": 9,
      "unit_price": 12000,
      "supplier": "목재상사",
      "location": "창고 A-1",
      "is_active": true,
      "memo": null,
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-03-24T09:00:00.000Z"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 50,
  "hasMore": false
}
```

---

### GET /api/v1/integration/inventory/items/:id

재고 품목 상세를 조회합니다 (최근 20건 거래 이력 포함).

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 품목 ID |

**Response (200):**

```json
{
  "...": "...(품목 기본 필드)",
  "recent_transactions": [
    {
      "id": "uuid",
      "item_id": "uuid",
      "type": "out",
      "quantity": 2,
      "previous_stock": 17,
      "new_stock": 15,
      "order_id": "uuid",
      "reason": "네스팅 자동 출고",
      "actor_name": "system",
      "created_at": "2026-03-24T10:00:00.000Z"
    }
  ]
}
```

**Error:** `404` Inventory item not found

---

### POST /api/v1/integration/inventory/items

재고 품목을 생성합니다.

**Request Body:**

| 필드         | 타입   | Required | 설명                                                              |
| ------------ | ------ | -------- | ----------------------------------------------------------------- |
| name         | string | Y        | 품목명                                                            |
| category     | enum   | Y        | `plywood`, `steel_plate`, `blade`, `sponge`, `packaging`, `other` |
| unit         | string | Y        | 단위 (e.g. `장`, `개`, `m`)                                       |
| currentStock | number | N        | 초기 재고 (기본값: 0, >= 0)                                       |
| minStock     | number | N        | 최소 재고 알림 기준 (기본값: 0, >= 0)                             |
| width        | number | N        | 너비 (mm)                                                         |
| height       | number | N        | 높이 (mm)                                                         |
| thickness    | number | N        | 두께 (mm)                                                         |
| unitPrice    | number | N        | 단가 (원, >= 0)                                                   |
| supplier     | string | N        | 공급업체명                                                        |
| location     | string | N        | 보관 위치                                                         |
| memo         | string | N        | 메모                                                              |

**Response (201):** 품목 객체

---

### PATCH /api/v1/integration/inventory/items/:id

재고 품목 정보를 수정합니다 (재고 수량 직접 변경은 adjust 사용).

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 품목 ID |

**Request Body:**

| 필드      | 타입    | Required | 설명             |
| --------- | ------- | -------- | ---------------- |
| name      | string  | N        | 품목명           |
| category  | enum    | N        | 카테고리         |
| unit      | string  | N        | 단위             |
| minStock  | number  | N        | 최소 재고 (>= 0) |
| width     | number  | N        | 너비             |
| height    | number  | N        | 높이             |
| thickness | number  | N        | 두께             |
| unitPrice | number  | N        | 단가 (>= 0)      |
| supplier  | string  | N        | 공급업체명       |
| location  | string  | N        | 보관 위치        |
| isActive  | boolean | N        | 활성 상태        |
| memo      | string  | N        | 메모             |

**Response (200):** 품목 객체

**Error:** `404` Inventory item not found

---

### POST /api/v1/integration/inventory/items/:id/in

재고 입고를 기록합니다.

**사용 프로그램:** yjlaser_website (관리자)

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 품목 ID |

**Request Body:**

| 필드      | 타입   | Required | 설명                |
| --------- | ------ | -------- | ------------------- |
| quantity  | number | Y        | 입고 수량 (>= 0.01) |
| reason    | string | N        | 입고 사유           |
| actorName | string | N        | 수행자 이름         |

**Response (200):**

```json
{
  "item": { "...": "...(업데이트된 품목)" },
  "transaction": {
    "id": "uuid",
    "item_id": "uuid",
    "type": "in",
    "quantity": 10,
    "previous_stock": 15,
    "new_stock": 25,
    "order_id": null,
    "reason": "정기 입고",
    "actor_name": "관리자",
    "created_at": "2026-03-24T10:00:00.000Z"
  }
}
```

**Error:** `404` Inventory item not found

---

### POST /api/v1/integration/inventory/items/:id/out

재고 출고를 기록합니다. 현재 재고가 부족하면 거부됩니다.

**사용 프로그램:** 네스팅프로그램, yjlaser_website

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 품목 ID |

**Request Body:**

| 필드      | 타입          | Required | 설명                |
| --------- | ------------- | -------- | ------------------- |
| quantity  | number        | Y        | 출고 수량 (>= 0.01) |
| orderId   | string (UUID) | N        | 연관 주문 ID        |
| reason    | string        | N        | 출고 사유           |
| actorName | string        | N        | 수행자 이름         |

**Response (200):** `{ item, transaction }` (입고와 동일 구조, type: `out`)

**Errors:**

- `404` Inventory item not found
- `400` Insufficient stock: current {n}, requested {n}

---

### POST /api/v1/integration/inventory/items/:id/adjust

재고를 절대값으로 조정합니다 (실사 반영).

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 품목 ID |

**Request Body:**

| 필드      | 타입   | Required | 설명              |
| --------- | ------ | -------- | ----------------- |
| newStock  | number | Y        | 조정 후 재고 수량 |
| reason    | string | N        | 조정 사유         |
| actorName | string | N        | 수행자 이름       |

**Response (200):** `{ item, transaction }` (type: `adjust`, quantity = newStock - previousStock)

**Error:** `404` Inventory item not found

---

### GET /api/v1/integration/inventory/items/:id/transactions

품목별 거래 이력을 조회합니다 (페이지네이션).

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 품목 ID |

**Request Query Parameters:**

| 필드     | 타입   | Required | 설명                                   |
| -------- | ------ | -------- | -------------------------------------- |
| type     | string | N        | 거래 유형 필터 (`in`, `out`, `adjust`) |
| dateFrom | string | N        | 시작 날짜 (ISO 8601)                   |
| dateTo   | string | N        | 종료 날짜 (ISO 8601)                   |
| page     | number | N        | 페이지 번호 (기본값: 1)                |
| limit    | number | N        | 페이지 크기 (기본값: 50)               |

**Response (200):**

```json
{
  "transactions": [{ "...": "...(거래 객체)" }],
  "total": 50,
  "page": 1,
  "limit": 50,
  "hasMore": false
}
```

**Error:** `404` Inventory item not found

---

## Sync Logs

### POST /api/v1/integration/sync-logs

DXF 파일 동기화 로그를 기록합니다.

**사용 프로그램:** 외부웹하드동기화프로그램, 관리프로그램

**Request Body:**

| 필드         | 타입   | Required | 설명                                                               |
| ------------ | ------ | -------- | ------------------------------------------------------------------ |
| filename     | string | Y        | 파일명                                                             |
| status       | enum   | Y        | `synced`, `company_not_found`, `api_error`, `duplicate`, `skipped` |
| companyName  | string | N        | 업체명 (파일명에서 추출)                                           |
| contactId    | number | N        | 자동 생성된 Contact ID                                             |
| orderId      | string | N        | 자동 생성된 Order ID                                               |
| errorMessage | string | N        | 에러 메시지                                                        |
| md5Hash      | string | N        | 파일 MD5 해시                                                      |
| metadata     | object | N        | 추가 메타데이터                                                    |

**Response (201):** Prisma SyncLog 객체 (raw)

---

### GET /api/v1/integration/sync-logs

동기화 로그 목록을 조회합니다 (페이지네이션).

**Request Query Parameters:**

| 필드     | 타입   | Required | 설명                     |
| -------- | ------ | -------- | ------------------------ |
| status   | enum   | N        | 상태 필터                |
| dateFrom | string | N        | 시작 날짜 (ISO 8601)     |
| dateTo   | string | N        | 종료 날짜 (ISO 8601)     |
| page     | number | N        | 페이지 번호 (기본값: 1)  |
| limit    | number | N        | 페이지 크기 (기본값: 50) |

**Response (200):**

```json
{
  "logs": [{ "...": "...(SyncLog 객체)" }],
  "total": 200,
  "page": 1,
  "limit": 50,
  "hasMore": true
}
```

---

### GET /api/v1/integration/sync-logs/stats

일별 동기화 통계를 조회합니다.

**Request Query Parameters:**

| 필드 | 타입   | Required | 설명                                 |
| ---- | ------ | -------- | ------------------------------------ |
| date | string | N        | 조회 날짜 (YYYY-MM-DD, 기본값: 오늘) |

**Response (200):**

```json
{
  "date": "2026-03-24",
  "synced": 15,
  "company_not_found": 2,
  "api_error": 0,
  "duplicate": 3,
  "skipped": 1,
  "total": 21
}
```

---

### GET /api/v1/integration/sync-logs/pipeline-backlog

웹하드 업로드 → 라우팅 → 자동문의 생성 파이프라인에서 최근 실패 또는 skip 항목을 조회합니다.

**사용 프로그램:** yjlaser_website (관리자 대시보드)

**Request Query Parameters:**

| 필드  | 타입   | Required | 설명                           |
| ----- | ------ | -------- | ------------------------------ |
| limit | number | N        | 조회 건수 (기본값: 50, 최소 1) |

**Response (200):**

```json
[
  {
    "id": 7,
    "filename": "drawing.dxf",
    "companyName": "원컴퍼니",
    "stage": "auto_contact",
    "status": "skipped",
    "reasonCode": "auto_contact_excluded_folder",
    "fileId": "file-uuid",
    "folderId": "folder-uuid",
    "context": {
      "folderPath": "/원컴퍼니/자동문의제외"
    },
    "createdAt": "2026-05-10T12:00:00.000Z"
  }
]
```

**보안 / 마스킹 정책:**

- 응답은 `sync_logs.metadata.auditKind='webhard_pipeline'` 이벤트만 반환합니다.
- `context`에는 `url`, `token`, `apiKey`, `secret`, `password`, `authorization`, `cookie` 계열 필드를 저장하거나 반환하지 않습니다.
- R2 presigned URL, raw API key, token, secret은 trace/backlog에 포함하지 않습니다.

**현재 기록되는 reasonCode:**

| stage        | status  | reasonCode                     | 발생 위치                                     |
| ------------ | ------- | ------------------------------ | --------------------------------------------- |
| routing      | failed  | `routing_failed`               | presign/confirm/batch confirm 라우팅 예외     |
| auto_contact | skipped | `auto_contact_excluded_folder` | 자동문의 제외 폴더 정책에 의해 생성 생략      |
| auto_contact | skipped | `company_folder_unresolved`    | 상위 업체 폴더 해석 실패로 자동문의 생성 생략 |

**Error:**

| 상태 | 조건                       |
| ---- | -------------------------- |
| 400  | `limit`이 양의 정수가 아님 |

---

### GET /api/v1/integration/sync-logs/check-duplicate

MD5 해시로 중복 파일을 체크합니다 (status=synced 인 로그만 대상).

**사용 프로그램:** 외부웹하드동기화프로그램

**Request Query Parameters:**

| 필드    | 타입   | Required | 설명          |
| ------- | ------ | -------- | ------------- |
| md5Hash | string | Y        | 파일 MD5 해시 |

**Response (200):**

```json
{ "duplicate": true }
```

---

## API Keys

> **인증 방식이 다릅니다:** `SessionAuthGuard` + `AdminGuard` (관리자 세션 쿠키 인증)
> `X-API-Key`가 아닌 관리자 로그인 세션으로만 접근 가능합니다.

### POST /api/v1/integration/api-keys

새 API 키를 생성합니다. 평문 키는 이 응답에서만 확인 가능합니다.

**사용 프로그램:** yjlaser_website (관리자 설정 페이지)

**Request Body:**

| 필드        | 타입     | Required | 설명                                   |
| ----------- | -------- | -------- | -------------------------------------- |
| name        | string   | Y        | API 키 이름 (e.g. "네스팅프로그램 키") |
| programType | string   | Y        | 프로그램 유형 (e.g. `nesting_program`) |
| permissions | string[] | N        | 권한 목록 (기본값: `[]`)               |

**Response (201):**

```json
{
  "id": "uuid",
  "key": "yjl_a1b2c3d4e5f6..."
}
```

---

### GET /api/v1/integration/api-keys

등록된 API 키 목록을 조회합니다 (키 해시는 노출되지 않음).

**Response (200):**

```json
[
  {
    "id": "uuid",
    "name": "네스팅프로그램 키",
    "program_type": "nesting_program",
    "permissions": [],
    "is_active": true,
    "last_used_at": "2026-03-24T12:00:00.000Z",
    "created_at": "2026-01-01T00:00:00.000Z"
  }
]
```

---

### DELETE /api/v1/integration/api-keys/:id

API 키를 삭제합니다.

**Path Parameters:**

| 필드 | 타입          | Required | 설명      |
| ---- | ------------- | -------- | --------- |
| id   | string (UUID) | Y        | API 키 ID |

**Response (200):**

```json
{ "success": true }
```

---

## Process Stage — 공정 단계 (2계층 시스템)

주문의 상세 공정 진행을 추적합니다. `status`(1계층)는 대분류, `processStage`(2계층)는 실제 작업 단계를 나타냅니다.

### 공정 단계 목록

| processStage        | label                 | 구분   | → status 자동 매핑 |
| ------------------- | --------------------- | ------ | ------------------ |
| `null`              | 공정 시작 전          | —      | `received`         |
| `drawing`           | 도면작업              | 사무실 | `drawing`          |
| `sample`            | 샘플제작 및 확인      | 사무실 | `confirmed`        |
| `drawing_confirmed` | 도면 확정 및 목형의뢰 | 현장   | `confirmed`        |
| `laser`             | 레이저 가공           | 현장   | `cutting`          |
| `cutting`           | 칼 작업               | 현장   | `finishing`        |
| `creasing`          | 오시작업              | 현장   | `finishing`        |
| `delivery`          | 납품                  | 현장   | `delivered`        |

### 부가 동작

- `processStage` 변경 시 `status`가 위 매핑 테이블에 따라 자동 전환됩니다.
- 사무실 단계 → 현장 단계 전환 시 현장작업번호(`workNumber`, F-xxx)가 자동 부여됩니다.

---

### GET /api/v1/integration/orders/process-stages/list

사용 가능한 공정 단계 목록과 status 매핑 정보를 반환합니다.

**Response (200):**

```json
{
  "stages": [
    { "id": "drawing", "label": "도면작업", "category": "office", "order": 1 },
    { "id": "sample", "label": "샘플제작 및 확인", "category": "office", "order": 2 },
    {
      "id": "drawing_confirmed",
      "label": "도면 확정 및 목형의뢰",
      "category": "field",
      "order": 3
    },
    { "id": "laser", "label": "레이저 가공", "category": "field", "order": 4 },
    { "id": "cutting", "label": "칼 작업", "category": "field", "order": 5 },
    { "id": "creasing", "label": "오시작업", "category": "field", "order": 6 },
    { "id": "delivery", "label": "납품", "category": "field", "order": 7 }
  ],
  "stage_to_status": {
    "drawing": "drawing",
    "sample": "confirmed",
    "drawing_confirmed": "confirmed",
    "laser": "cutting",
    "cutting": "finishing",
    "creasing": "finishing",
    "delivery": "delivered"
  }
}
```

---

### GET /api/v1/integration/orders/:id/process-stage

Order에 연결된 Contact의 현재 공정 단계를 조회합니다.

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 주문 ID |

**Response (200):**

```json
{
  "order_id": "uuid",
  "contact_id": "uuid",
  "process_stage": "laser",
  "status": "cutting",
  "work_number": "260324-F-001",
  "inquiry_number": null,
  "inquiry_type": "mold_request",
  "company_name": "원컴퍼니"
}
```

**Errors:**

- `404` Order not found
- `404` Linked contact not found for this order

---

### PATCH /api/v1/integration/orders/:id/process-stage

Order에 연결된 Contact의 공정 단계를 변경합니다. `status`도 자동 전환됩니다.

**사용 프로그램:** 관리프로그램, 네스팅프로그램

**Path Parameters:**

| 필드 | 타입          | Required | 설명    |
| ---- | ------------- | -------- | ------- |
| id   | string (UUID) | Y        | 주문 ID |

**Request Body:**

| 필드         | 타입           | Required | 설명                             |
| ------------ | -------------- | -------- | -------------------------------- |
| processStage | string \| null | N        | 변경할 공정 단계 (null = 초기화) |
| actorName    | string         | N        | 수행자 이름                      |

**Request 예시:**

```json
{
  "processStage": "cutting",
  "actorName": "홍길동"
}
```

**Response (200):**

```json
{
  "order_id": "uuid",
  "id": "contact-uuid",
  "process_stage": "cutting",
  "previous_stage": "laser",
  "previous_status": "cutting",
  "work_number": "260324-F-001",
  "status": "finishing",
  "inquiry_type": "mold_request",
  "updated_at": "2026-03-24T10:00:00.000Z",
  "status_changed": true
}
```

**Errors:**

- `404` Order not found / Linked contact not found
- `400` Invalid process stage '{stage}'. Valid: drawing, sample, drawing_confirmed, laser, cutting, creasing, delivery

---

## Nesting Tasks

레이저네스팅프로그램이 서버에 등록된 네스팅 작업 큐를 가져가고 진행 상태와 결과 수치를 보고하는 API입니다.

**사용 프로그램:** 레이저네스팅프로그램

**인증:** `X-API-Key` (`ApiKeyGuard`)

### GET /api/v1/integration/nesting-tasks/pending

pending 상태 작업을 priority 오름차순, createdAt 오름차순으로 조회합니다.

**Query Parameters:**

| 필드  | 타입 | Required | 설명                             |
| ----- | ---- | -------- | -------------------------------- |
| limit | int  | N        | 기본 10, 서버에서 1~100으로 보정 |

**Response (200):**

```json
{
  "tasks": [
    {
      "task_id": "ntask_abc123",
      "order_id": "order_456",
      "created_at": "2026-03-25T10:30:00.000Z",
      "priority": 1,
      "dxf_file_urls": ["https://files.example/drawing-1.dxf"],
      "sheet_width": 1220,
      "sheet_height": 2440,
      "options": {
        "algorithm": "auto",
        "optimization_mode": "balanced",
        "gap": 3
      }
    }
  ]
}
```

### PATCH /api/v1/integration/nesting-tasks/:taskId/status

작업 상태를 갱신합니다. 허용 전이는 `pending -> in_progress -> completed/failed`입니다. 같은 상태 재보고는 멱등 처리합니다.

**Request Body:**

| 필드    | 타입   | Required | 설명                                                   |
| ------- | ------ | -------- | ------------------------------------------------------ |
| status  | enum   | Y        | `pending`, `in_progress`, `completed`, `failed`        |
| message | string | N        | 작업자/프로그램 상태 메시지. 빈 문자열은 null로 저장됨 |

**Response (200):**

```json
{
  "success": true,
  "task_id": "ntask_abc123",
  "status": "in_progress"
}
```

**Errors:** `400` invalid transition, `401` 인증 실패, `404` 작업 없음, `409` 다른 워커가 먼저 상태 변경

### POST /api/v1/integration/nesting-tasks/:taskId/result

네스팅 결과 요약 수치를 저장합니다. 완료 상태 전환은 별도 status endpoint로 호출합니다.

**Request Body:**

| 필드             | 타입  | Required | 설명              |
| ---------------- | ----- | -------- | ----------------- |
| total_sheets     | int   | Y        | 사용한 총 시트 수 |
| total_usage_rate | float | Y        | 전체 사용률       |
| unplaced_count   | int   | Y        | 미배치 도면 수    |

**Response (200):**

```json
{
  "success": true,
  "task_id": "ntask_abc123"
}
```

**Errors:** `400` DTO 검증 실패, `401` 인증 실패, `404` 작업 없음

---

## Laser Completions

### POST /api/v1/integration/laser-completions

레이저네스팅프로그램이 DXF 파일명에서 추출한 현장작업번호(`workNumber`) 목록으로 레이저 전용 문의를 완료 처리합니다. `contactId`를 모르는 외부 프로그램용 wrapper이며, 기존 `POST /api/v1/contacts/:id/complete-laser`와 같은 `completeLaserOnlyContact` 정책을 재사용합니다.

**사용 프로그램:** 레이저네스팅프로그램, 레이저 전용 연동프로그램

**인증:** `X-API-Key` (`ApiKeyGuard`)

**Request Body:**

| 필드        | 타입     | Required | 설명                                                                |
| ----------- | -------- | -------- | ------------------------------------------------------------------- |
| workNumbers | string[] | Y        | DXF 파일명에서 추출한 현장작업번호 목록. 서버에서 trim 후 중복 제거 |
| actorName   | string   | N        | 타임라인 actor 이름. 없으면 `source`, 둘 다 없으면 기본값 사용      |
| source      | string   | N        | 호출 프로그램 식별자 (e.g. `laser_nesting_program`)                 |
| message     | string   | N        | 완료 타임라인 note로 기록할 메시지                                  |
| sheet       | object   | N        | 합판 단위 부가 정보. `sheetIndex`, `drawingCount` 지원              |

**Request 예시:**

```json
{
  "workNumbers": ["260409-F-001", "260409-F-002"],
  "actorName": "nesting_program",
  "source": "laser_nesting_program",
  "message": "네스팅 배치완료 후 레이저 전용 문의 자동 완료",
  "sheet": {
    "sheetIndex": 1,
    "drawingCount": 2
  }
}
```

**처리 규칙:**

- `workNumbers`는 trim 후 중복 제거하며, `summary.requested`와 `results`는 중복 제거 후 개수 기준입니다.
- 각 `workNumber`는 `Contact.workNumber`에서 조회하고, `deletedAt != null` 문의는 제외합니다.
- Contact가 없으면 해당 항목만 `not_found`로 반환하고 나머지는 계속 처리합니다.
- `inquiryType != laser_cutting`이면 완료하지 않고 `not_laser_only`로 반환합니다.
- 이미 `status=completed`이고 `processStage=null`이면 `already_completed`로 멱등 성공 처리합니다.
- 레이저 전용 문의는 `completeLaserOnlyContact`를 호출해 `status=completed`, `processStage=null`, 타임라인 기록, socket/event emit, 문의 폴더 `완료/` 이동을 기존 정책대로 수행합니다.
- 폴더 이동 실패는 기존 정책대로 Best Effort + warn 로깅이며 완료 상태 전환은 유지됩니다.
- 항목별 내부 실패는 `failed`로 기록하고, 같은 요청의 나머지 항목 처리는 계속합니다.

**Response (200):**

```json
{
  "success": true,
  "summary": {
    "requested": 2,
    "completed": 1,
    "alreadyCompleted": 0,
    "notFound": 0,
    "skipped": 1,
    "failed": 0
  },
  "results": [
    {
      "workNumber": "260409-F-001",
      "status": "completed",
      "contactId": "contact-uuid-1",
      "message": "레이저 전용 문의 완료 처리됨"
    },
    {
      "workNumber": "260409-F-002",
      "status": "not_laser_only",
      "contactId": "contact-uuid-2",
      "message": "레이저 전용 문의가 아니므로 완료 처리하지 않음"
    }
  ]
}
```

**Result status:**

| status              | 의미                                              | summary 필드       |
| ------------------- | ------------------------------------------------- | ------------------ |
| `completed`         | 레이저 전용 문의 완료 처리 성공                   | `completed`        |
| `already_completed` | 이미 완료 상태인 레이저 전용 문의. 멱등 성공      | `alreadyCompleted` |
| `not_found`         | 해당 `workNumber`의 Contact 없음                  | `notFound`         |
| `not_laser_only`    | 레이저 전용 문의가 아니므로 완료 처리하지 않음    | `skipped`          |
| `failed`            | 항목 처리 중 예외 발생. 나머지 항목은 계속 처리됨 | `failed`           |

`success`는 `failed=0`이면 `true`입니다. `not_found`, `not_laser_only`, `already_completed`는 배치 처리 결과이며 HTTP 오류가 아닙니다.

**Errors:**

| 상태 | 조건                                                     |
| ---- | -------------------------------------------------------- |
| 400  | DTO 검증 실패 (`workNumbers` 누락, 빈 배열, 타입 불일치) |
| 401  | 유효한 session 또는 `X-API-Key` 없음                     |

**Python 호출 예시:**

```python
import requests

BASE_URL = "https://api.yjlaser.com/api/v1"
API_KEY = "..."

work_numbers = ["260409-F-001", "260409-F-002"]

response = requests.post(
    f"{BASE_URL}/integration/laser-completions",
    headers={"X-API-Key": API_KEY},
    json={
        "workNumbers": work_numbers,
        "actorName": "nesting_program",
        "source": "laser_nesting_program",
        "message": "네스팅 배치완료 후 레이저 전용 문의 자동 완료",
        "sheet": {"sheetIndex": 1, "drawingCount": len(work_numbers)},
    },
    timeout=10,
)
response.raise_for_status()
result = response.json()
```

---

## Auto Contact

### POST /api/v1/integration/contacts/auto

DXF 파일 파싱 결과로 Contact + Order를 자동 생성합니다. 사무실작업번호(O) 또는 현장작업번호(F)를 자동 부여합니다. 현장 직행 대상(mold_request, laser_cutting)은 현장작업번호만 부여됩니다.

**사용 프로그램:** 관리프로그램 (DXF 파일 분류 시)

**Request Body:**

| 필드          | 타입   | Required | 설명                                |
| ------------- | ------ | -------- | ----------------------------------- |
| inquiry_title | string | Y        | 문의 제목 (보통 DXF 파일명)         |
| company_name  | string | Y        | 업체명                              |
| phone         | string | N        | 전화번호 (기본값: `-`)              |
| email         | string | N        | 이메일 (기본값: `auto@yjlaser.com`) |
| drawing_notes | string | N        | 도면 비고 (규격, 가격 등)           |

**Response (201):**

```json
{
  "contactId": "uuid-string",
  "orderId": "uuid",
  "inquiryNumber": "260324-O-001"
}
```

### companyName 정규화 정책 (task 23, 2026-04-24)

외부 프로그램이 `POST /api/v1/files/batch-confirm` 또는 `POST /api/v1/integration/contacts/auto` 를 호출할 때, Contact 생성에 사용되는 `companyName` 은 **폴더명 원본이 아니라 `matchCompanyInfo` 가 매칭한 `Company.companyName` 정규형을 우선 사용**한다. 매칭 실패 시 fallback 으로 폴더명 원본을 사용 (양 끝 공백 trim 적용).

- 목적: 업체 대시보드(`/company/orders`) 에서 `findByCompany` 로 조회 시 업체 입장의 정규 업체명과 자동 생성 Contact 의 `companyName` 이 일치하도록 보장. QA 에서 "대성목형 자동생성 Contact 가 업체 대시보드에 안 보인다" 는 제보가 이 불일치에서 비롯됨.
- `findByCompany` 는 동시에 insensitive match (대소문자 · 공백 무시) 로 하위 호환 보강. 기존 exact match 만 쓸 때 누락되던 레거시 Contact 도 조회된다.
- **`matchCompanyInfo` 2단계 매칭 (2026-04-27 hotfix)**:
  1. 1차: `isApproved=true` + `companyName` insensitive equals
  2. 1차 fail 시 2차: `isApproved` 무관 + `companyName` insensitive equals
  - 미승인 업체도 가입돼 있으면 정규형 사용 → 사용자가 로그인 후 자기 회사 정규명으로 dashboard 매칭이 작동.
- 상세 훅 정책은 `docs/specs/features/contact-webhard-folder.md` 참고.

**`matchCompanyInfo` 3단계 매칭 (task 24, 2026-04-27)**

1. 0차: `CompanyFolderAlias status='approved'` folderName 일치 → companyId.
2. 1차/2차: `Company.companyName` insensitive equals (task 23 의 2단계 — `isApproved=true` 우선, fallback `isApproved` 무관).
3. 3차: `normalizeCompanyName` 정규화 후보 1개 이상 → 모두 `CompanyFolderAlias status='pending'` upsert (멱등 — 기존 row status 보존). 본 단계에서는 매칭 결과 미적용, 폴더명 원본 fallback.

3차의 pending alias 는 admin 이 `POST /api/v1/companies/folder-aliases/:id/approve` 로 승인할 때까지 매칭에 사용되지 않는다. 관련 신규 endpoint: `GET/POST/PATCH/DELETE /api/v1/companies/folder-aliases` (Phase 3, AdminAuthGuard). 상세 정책: `docs/specs/features/external-sync-company-folder.md`.

### 외부웹하드 자동문의 실시간 반영/성능 정책 (2026-05-12)

- `POST /api/v1/files/batch-confirm` 후 내부 `batchTriggerAutoContact`가 생성한 신규 Contact는 `ContactsGateway.emitContactCreated`를 통해 `/contacts` namespace의 admin/worker 룸에 `contact:created`를 발행한다.
- 이벤트 payload는 Worker 알림이 즉시 렌더링할 수 있도록 `id`, `inquiry_number`, `work_number`, `inquiry_title`, `company_name`, `status`, `process_stage`, `source='webhard'`, `inquiry_type`, `drawing_file_name`, `webhard_folder_id`, `created_at`을 포함한다.
- batch 자동문의는 폴더 경로/업체명 해석을 캐시하고 서로 다른 업체+파일명 그룹을 제한 병렬로 시작한다. 동일 업체+파일명은 중복 문의 방지를 위해 같은 그룹에서 순차 실행한다.

### POST /api/v1/companies/folder-aliases (task 25, 2026-04-28)

Admin 이 `(folderName, companyId)` 매핑을 직접 등록 + 즉시 승인하는 매뉴얼 매핑 endpoint. 기존 `POST :id/approve` 와의 차이: pending row 검수가 아니라 **운영자의 명시적 의도 매핑** — pending row 없이 바로 `status='approved'` 생성. `normalizeCompanyName` 후에도 매칭 안 되는 폴더명 (`{업체명}({사이즈})`, `{업체명}_old` 등) 케이스 대응.

**인증**: `AdminSessionGuard` (admin 세션 한정 — `ApiKeyGuard` 가 외부 X-API-Key 인증 시 `userType: 'admin'` 을 부여하므로 단순 `AdminGuard` 는 우회 가능. 본 endpoint 는 `apiKeyInfo` 존재 시 거절). 외부 프로그램·API key 호출 불가.

**Request Body:**

| 필드            | 타입    | Required | 설명                                                                                               |
| --------------- | ------- | -------- | -------------------------------------------------------------------------------------------------- |
| folderName      | string  | Y        | 외부웹하드 원본 폴더명 (`CompanyFolderAlias.folderName`)                                           |
| companyId       | number  | Y        | 매핑 대상 가입 업체 id (`Company.id`)                                                              |
| cascadeBackfill | boolean | N        | 기본 `true`. true 면 미통합 contact 일괄 통합 (`relocateAfterAliasApproved` 호출). false 면 매핑만 |

**Response (201 Created):**

```json
{
  "alias": {
    "id": 123,
    "folderName": "대성목형(2265-1295)",
    "companyId": 4,
    "status": "approved",
    "approvedBy": "admin",
    "approvedAt": "2026-04-28T09:30:00.000Z",
    "createdAt": "2026-04-28T09:30:00.000Z",
    "updatedAt": "2026-04-28T09:30:00.000Z"
  },
  "backfill": {
    "relocated": 5,
    "skipped": 2
  }
}
```

`backfill` 은 `cascadeBackfill=true` (default) 일 때만 포함. `cascadeBackfill=false` 면 `{ alias }` 만 반환 (`backfill === undefined`).

**Errors:**

| 상태 | 조건                                                             |
| ---- | ---------------------------------------------------------------- |
| 400  | DTO 검증 실패 (`folderName` / `companyId` 누락 또는 타입 불일치) |
| 401  | admin 세션 없음 (`AdminSessionGuard` 실패)                       |
| 403  | admin 권한 아님 또는 X-API-Key 호출 (`AdminSessionGuard` 실패)   |
| 404  | `companyId` 가 비존재 — `NotFoundException`                      |

**동작:**

1. Company 존재 검증 (없으면 `NotFoundException` — `cascadeBackfill` 분기 전에 선검사).
2. `(folderName, companyId)` upsert with `status='approved'`, `approvedBy = req.user.userId ?? 'admin'`, `approvedAt = now`.
3. 동일 `folderName` 의 다른 `pending` row → 자동 `rejected` (기존 approve 정책과 동일, 한 폴더당 한 업체로 단일 매핑 보존).
4. `cascadeBackfill: true` (default) 면 `ContactFolderSyncService.relocateAfterAliasApproved(folderName, companyId, tx)` 호출 → 기존 외부 미통합 contact 가입 업체 폴더로 일괄 이동.

**멱등:**

- 동일 `(folderName, companyId)` 재호출 → alias status 변경 없이 보존 (`upsert` 의 update 도 `approvedBy` / `approvedAt` 만 갱신).
- `cascadeBackfill: true` 재호출 시 backfill 도 멱등 — `relocateAfterAliasApproved` 가 `companyId IS NULL` 조건으로 필터하므로 이미 이동된 contact 자동 제외.

**기존 `POST :id/approve` 와의 차이:**

| 항목                   | `POST :id/approve` (task 24)                  | `POST /folder-aliases` (task 25)               |
| ---------------------- | --------------------------------------------- | ---------------------------------------------- |
| 진입로                 | 외부 동기화가 자동 등록한 pending alias 검수  | admin 의 명시적 의도 매핑 (pending 없이)       |
| `cascadeBackfill` 기본 | `false`                                       | `true`                                         |
| 동작                   | pending → approved 전환 + 다른 pending reject | upsert (없으면 create, 있으면 update) approved |
| 멱등                   | 이미 approved 면 부작용 없이 `{ alias }` 반환 | 항상 alias 갱신 + cascadeBackfill 멱등 실행    |

**관련:**

- spec: [task 25 — webhard-visibility-and-external-inquiry-fix](../../features/webhard-visibility-and-external-inquiry-fix.md) §정책 — Bug 2
- 운영 절차: [external-sync-company-folder §운영 절차](../../features/external-sync-company-folder.md)
- 서비스: `webhard-api/src/companies/folder-alias.service.ts` `createApprovedAlias`
- 컨트롤러: `webhard-api/src/companies/companies.controller.ts` `createFolderAlias` (line 197-204)
- DTO: `webhard-api/src/companies/dto/folder-alias.dto.ts` `CreateFolderAliasDto`

## Files

### POST /api/v1/integration/files/register

외부웹하드동기화프로그램이 이미 업로드한 파일의 metadata를 자체 웹하드
`WebhardFile`로 등록합니다. 이 endpoint는 upload session을 만들거나 파일 bytes를
Google Drive/R2로 업로드하지 않습니다.

**사용 프로그램:** 외부웹하드동기화프로그램

**권한:** `X-API-Key`가 `file/register` permission을 가져야 합니다. Admin/company
session cookie만으로는 호출할 수 없습니다. API key의 `programType`과 body의
`source_worker`가 일치해야 합니다.

**Request Body:**

| 필드               | 타입            | Required | 설명                                             |
| ------------------ | --------------- | -------- | ------------------------------------------------ |
| idempotency_key    | string          | Y        | 재전송 식별 key. 현재 DB에 별도 저장하지 않음    |
| source_worker      | string          | Y        | `external_webhard_sync` 등 등록 주체 worker type |
| order_id           | string          | N        | 연결 주문 ID. 현재 응답 echo 용도                |
| company_id         | number          | N        | 업체 ID                                          |
| folder_id          | UUID            | Y\*      | 웹하드 폴더 ID. `google_drive`일 때 필수         |
| storage_provider   | enum            | Y        | `google_drive`, `r2_legacy`, `local_test`        |
| drive_file_id      | string          | Y\*      | Google Drive file id. `google_drive`일 때 필수   |
| file_kind          | string          | Y        | 파일 분류                                        |
| path               | string          | Y        | 외부 프로그램이 전달한 저장 경로 또는 key        |
| original_name_safe | string          | Y        | sanitization 완료된 원본 파일명                  |
| mime_type          | string          | Y        | MIME type                                        |
| size_bytes         | number          | Y        | 파일 크기 byte                                   |
| content_hash       | string \| null  | Y        | content hash. 계산 불가 시 `null`                |
| uploaded_at        | ISO date string | Y        | 외부 프로그램 업로드 완료 시각                   |

**Response (201):**

```json
{
  "file_id": "file-uuid",
  "order_id": "ord-001",
  "duplicate": false,
  "status": "FILE_RECEIVED"
}
```

**현재 구현 메모:**

- 내부적으로 `FilesService.confirmUpload`를 재사용합니다.
- `drive_file_id`가 있으면 같은 `drive_file_id`, 없으면 같은 `path`의 기존 metadata를
  조회합니다. 이미 있으면 새 파일 row를 만들지 않고 기존 `file_id`로
  `duplicate=true`를 반환합니다.
- `google_drive` 요청은 기존 confirm 경계에서 Drive metadata와 대상 folder readiness를
  확인합니다.
- Provider mapping은 `google_drive -> google_drive`, `r2_legacy -> r2`,
  `local_test -> r2`입니다. 알 수 없는 `storage_provider`는 400입니다.
- 파일 등록 service는 start/success/failure 로그를 남깁니다. 로그에는
  `sourceWorker`, `provider`, `count=1`, `elapsedMs`, `duplicate`, `fileId`,
  `errorType` 같은 운영 식별값만 포함하고, `idempotency_key`, 원본 path, 파일명,
  API key/token, 고객 데이터는 포함하지 않습니다.
- `idempotency_key` 전용 저장소와 동시 요청까지 막는 DB unique 제약은 아직 없습니다.

**Errors:**

| 상태 | 조건                                                                                        |
| ---- | ------------------------------------------------------------------------------------------- |
| 400  | DTO 검증 실패, Google Drive 필수 `folder_id/drive_file_id` 누락                             |
| 401  | 유효한 session 또는 `X-API-Key` 없음                                                        |
| 403  | API key에 `file/register` permission 없음, session principal 호출, `source_worker` mismatch |

---

## Contacts

### GET /api/v1/contacts/:id/latest-drawing-url

마지막으로 업로드된 "최신 도면" 파일의 R2 presigned 다운로드 URL 을 반환한다.

- **목적:** Next.js 라우트 `GET /api/contacts/:id/latest-drawing/download` 의 백엔드 프록시 target. Admin/Worker/Company 카드 UI 의 "최신 도면 다운로드" 원클릭에 사용된다. Worker 문의 카드의 다운로드 버튼은 현재 공정 단계가 아니라 마지막 업로드 리비전을 최신 도면으로 간주한다.
- **인증:** `ApiKeyGuard` 필수 (`X-API-Key` header). **Next.js 프록시 경유만 허용** — 외부 프로그램/브라우저 직접 호출 금지.
- **내부 로직:** `DrawingRevisionService.getLatestUploaded(contactId)` 재사용. `DrawingRevision.createdAt DESC` 기준 첫 번째 리비전의 첫 번째 파일을 반환한다.
- **파일명 prefix:** `workNumber`가 있으면 공정 단계와 무관하게 `[현장작업번호]`를 붙이고, 없을 때만 `[사무실작업번호]`를 붙인다. 기존 `[O]`/`[F]` prefix는 제거 후 선택된 작업번호 하나만 다시 붙인다.

**Path Parameters:**

| 필드 | 타입          | Required | 설명       |
| ---- | ------------- | -------- | ---------- |
| id   | string (UUID) | Y        | Contact ID |

**Response (200):**

```json
{
  "url": "https://r2.example.com/presigned...",
  "fileName": "도면_v3.dxf"
}
```

**Fallback 동작:**

- 마지막 업로드 DrawingRevision 이 없을 경우 — `contact.drawingFileUrl`(최초 업로드된 단일 도면 경로) 로 **조용히 fallback**. 이 경우에도 응답 shape 은 `{ url, fileName }` 로 동일하며 파일명 prefix 규칙도 동일하게 적용한다.
- `drawingFileUrl` 조차 없으면 `404 Not Found`.

**Errors:**

| 상태 | 조건                                                       |
| ---- | ---------------------------------------------------------- |
| 401  | `X-API-Key` 헤더 누락/불일치 (`ApiKeyGuard` 실패)          |
| 404  | Contact 없음, 또는 최신 리비전·`drawingFileUrl` 둘 다 없음 |
| 500  | R2 presigned URL 발급 실패                                 |

**주의:**

- 응답의 `url` 은 R2 presigned URL 로 만료 시간이 있다 (기본 1시간). 클라이언트는 즉시 다운로드에 사용해야 하며 저장/공유 금지.
- 본 엔드포인트는 다운로드용 "최신"의 단일 소스를 제공하므로, worker 카드 / admin 상세뷰 / 거래처 포털 모두 이 경로를 통해 동일한 결과를 받는다.

---

## Drawing Revisions

### POST /api/v1/integration/drawing-revisions

외부 프로그램에서 도면 수정을 등록합니다. actor_type은 `external`, source는 `integration`으로 고정됩니다. version은 해당 contact의 최대 version + 1로 자동 증가합니다.

> **부가 동작**: 성공 시 files 각 요소당 WebhardFile 레코드도 자동 생성됩니다. 저장 위치 (task 19 이후): `{거래처루트}/문의-{buildInquiryFolderName({inquiryNumber, workNumber})}/[{대표번호}] {originalName}` — 납품 완료된 문의는 `{거래처루트}/완료/문의-.../` 하위로 이관 (drawing-workflow.md §W.1 참고). 생성된 WebhardFile ID 목록은 DrawingRevision 의 `webhardFileIds` 필드에 저장됩니다.
>
> **Webhard 동기화 실패 전파 (task 19)**: Webhard 폴더 확보·파일 이동이 실패하면 DrawingRevision 레코드는 성공 저장한 뒤 응답에 옵셔널 `webhardWarning?: { code: 'NO_INQUIRY_NUMBER' | 'FOLDER_CREATE_FAILED' | 'RELOCATE_FAILED'; message: string }` 필드가 포함됩니다. 외부 프로그램은 이 필드가 있으면 로그·재시도 판단에 사용 (없으면 완전 성공).

**사용 프로그램:** 유진레이저목형 관리프로그램, 레이저네스팅프로그램

**Request Body:**

| 필드         | 타입     | Required | 설명                                                                        |
| ------------ | -------- | -------- | --------------------------------------------------------------------------- |
| contactId    | string   | Y        | 문의 UUID                                                                   |
| processStage | string   | N        | 수정 시점 공정 단계                                                         |
| reason       | string   | Y        | domuson_fit/sample_revision/field_correction/laser_processing/initial/other |
| reasonDetail | string   | N        | 사유 상세 (reason=other일 때 필수)                                          |
| files        | object[] | Y        | [{ url: string, name: string, size: number, mimeType: string }]             |
| actorName    | string   | N        | 수행 프로그램/사용자명                                                      |
| isPublic     | boolean  | N        | 거래처 공개 여부 (기본 false)                                               |
| note         | string   | N        | 메모                                                                        |

**Response (201):**

```json
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
  "actorType": "external",
  "actorName": "관리프로그램",
  "source": "integration",
  "isPublic": false,
  "note": null,
  "createdAt": "2026-04-13T10:00:00.000Z"
}
```

**Errors:**

- `404` Contact not found
- `400` Validation error (missing required fields)

---

## DXF Match

### POST /api/v1/integration/dxf-match/upload

관리프로그램이 DXF 파일명에서 workNumber(YYMMDD-F-NNN)를 정규식 파싱하여 Contact에 자동 매칭합니다. 매칭 성공 시 DrawingRevision을 생성합니다.

> **부가 동작**: 성공 시 files 각 요소당 WebhardFile 레코드도 자동 생성됩니다. 저장 위치는 `{거래처루트}/문의-{workNumber}/{workNumber} {originalName}` (drawing-workflow.md 섹션 W 참고). 생성된 WebhardFile ID 목록은 DrawingRevision의 `webhardFileIds` 필드에 저장됩니다.

**사용 프로그램:** 유진레이저목형 관리프로그램

**Request Body:**

| 필드      | 타입   | Required | 설명                                                |
| --------- | ------ | -------- | --------------------------------------------------- |
| fileName  | string | Y        | DXF 파일명 (앞부분에서 YYMMDD-F-NNN 패턴 자동 파싱) |
| fileUrl   | string | Y        | 업로드된 파일 URL                                   |
| actorName | string | N        | 프로그램/사용자명 (기본값: "관리프로그램")          |

**Response (200):**

```json
{
  "matched": true,
  "contactId": "uuid",
  "workNumber": "260413-F-001",
  "revisionVersion": 4
}
```

**에러 (400):**

```json
{
  "matched": false,
  "workNumber": "260413-F-001",
  "error": "해당 workNumber의 문의를 찾을 수 없습니다"
}
```

상세 매칭 전략은 `docs/specs/features/drawing-workflow.md` 섹션 F 참고.

---

## File Transfer (미구현 - 501)

> 웹하드에서 작업폴더로의 자동 다운로드 파이프라인. 향후 구현 예정이며 현재 모든 엔드포인트가 `501 Not Implemented`를 반환합니다.

### POST /api/v1/integration/file-transfer/queue

파일 전송 큐에 작업을 추가합니다.

**Response (501):**

```json
{
  "status": 501,
  "message": "File transfer pipeline is not yet implemented. This interface is reserved for future development."
}
```

---

### GET /api/v1/integration/file-transfer/status

파일 전송 상태를 조회합니다.

**Response (501):** 위와 동일

---

### POST /api/v1/integration/file-transfer/confirm

파일 전송 완료를 확인합니다.

**Response (501):** 위와 동일
