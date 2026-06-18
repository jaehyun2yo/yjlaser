# 외부 프로그램 연동 API 레퍼런스

YJLaser NestJS 백엔드의 Integration API 레퍼런스.
외부 프로그램(관리프로그램, 네스팅프로그램, 동기화프로그램)에서 사용하는 엔드포인트를 정리합니다.

> 엔드포인트별 상세 스펙: [specs/api/endpoints/integration.md](specs/api/endpoints/integration.md)

---

## 목차

- [1. Quick Start](#1-quick-start)
- [2. 작업번호 체계](#2-작업번호-체계)
- [3. 프로그램별 사용 API 요약](#3-프로그램별-사용-api-요약)
- [4. 인증 (Authentication)](#4-인증-authentication)
- [5. 공통 규칙](#5-공통-규칙)
- [6. Programs — 프로그램 하트비트](#6-programs--프로그램-하트비트)
- [7. Orders — 주문 관리](#7-orders--주문-관리)
- [8. Events — 이벤트 기록](#8-events--이벤트-기록)
- [9. Deliveries — 납품 관리](#9-deliveries--납품-관리)
- [10. Inventory — 재고 관리](#10-inventory--재고-관리)
- [11. Sync Logs — 동기화 로그](#11-sync-logs--동기화-로그)
- [12. Auto Contact — 자동 문의 생성](#12-auto-contact--자동-문의-생성)
- [13. 에러 처리](#13-에러-처리)
- [14. Python 코드 예시](#14-python-코드-예시)

---

## 1. Quick Start

### Base URL

| 환경      | URL                               |
| --------- | --------------------------------- |
| 로컬 개발 | `http://localhost:4000/api/v1`    |
| 프로덕션  | `https://yjlaser.net/api/webhard` |

### 최소 연동 예시 (Python)

```python
import requests

BASE_URL = "https://yjlaser.net/api/webhard"
API_KEY = "yjl_a1b2c3d4..."  # 관리자에게 발급 요청

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 하트비트 전송
requests.post(f"{BASE_URL}/integration/programs/heartbeat", json={
    "programType": "management_program",
    "instanceName": "mgmt-pc-01",
    "version": "2.1.0"
}, headers=headers)

# 주문 목록 조회
response = requests.get(f"{BASE_URL}/integration/orders", headers=headers)
orders = response.json()
```

---

## 2. 작업번호 체계

Contact(문의)에는 두 종류의 작업번호가 부여됩니다. DB 컬럼명은 레거시이지만, 실제 의미는 아래와 같습니다.

| 구분               | DB 컬럼          | API 필드명      | 형식                                 | 부여 시점                                                       |
| ------------------ | ---------------- | --------------- | ------------------------------------ | --------------------------------------------------------------- |
| **사무실작업번호** | `inquiry_number` | `inquiryNumber` | `YYMMDD-O-NNN` (e.g. `260409-O-001`) | Contact 자동 생성 시 (사무실 작업 대상)                         |
| **현장작업번호**   | `work_number`    | `workNumber`    | `YYMMDD-F-NNN` (e.g. `260409-F-001`) | Contact 자동 생성 시 (현장 직행 대상) 또는 `production` 전환 시 |

### 부여 규칙

- **사무실 작업** (cutting_request 등) → `inquiryNumber`에 `O-xxx` 부여, `workNumber`는 null
- **현장 직행** (mold_request, laser_cutting) → `workNumber`에 `F-xxx` 부여, `inquiryNumber`는 null
- `production` 상태 전환 시 `workNumber`가 없으면 자동 부여
- 번호는 일별 시퀀스로 자동 증가 (PostgreSQL UPSERT 기반, 동시성 안전)

> **참고:** `inquiryNumber`라는 필드명은 과거 "의뢰번호" 시절의 레거시 네이밍입니다. 실제로는 사무실작업번호를 의미합니다.

---

## 3. 프로그램별 사용 API 요약

### 유진레이저목형 관리프로그램

DXF 파일 분류, 주문 생성, 상태 관리.

| 기능           | Method | Endpoint                                 |
| -------------- | ------ | ---------------------------------------- |
| 하트비트       | POST   | `/integration/programs/heartbeat`        |
| 자동 문의 생성 | POST   | `/integration/contacts/auto`             |
| 주문 목록 조회 | GET    | `/integration/orders`                    |
| 주문 상태 변경 | PATCH  | `/integration/orders/:id/status`         |
| 공정 단계 조회 | GET    | `/integration/orders/:id/process-stage`  |
| 공정 단계 변경 | PATCH  | `/integration/orders/:id/process-stage`  |
| 이벤트 기록    | POST   | `/integration/events`                    |
| 이벤트 일괄    | POST   | `/integration/events/batch`              |
| 동기화 로그    | POST   | `/integration/sync-logs`                 |
| 중복 체크      | GET    | `/integration/sync-logs/check-duplicate` |

### 레이저네스팅프로그램

네스팅 실행, 합판 자동 출고, 상태 전환.

| 기능           | Method | Endpoint                                |
| -------------- | ------ | --------------------------------------- |
| 하트비트       | POST   | `/integration/programs/heartbeat`       |
| 레이저 완료    | POST   | `/integration/laser-completions`        |
| 주문 상태 변경 | PATCH  | `/integration/orders/:id/status`        |
| 공정 단계 변경 | PATCH  | `/integration/orders/:id/process-stage` |
| 이벤트 기록    | POST   | `/integration/events`                   |
| 합판 출고      | POST   | `/integration/inventory/items/:id/out`  |

### 외부웹하드동기화프로그램

LGU+ 웹하드 → 자체 웹하드 파일 동기화.

| 기능           | Method | Endpoint                                 |
| -------------- | ------ | ---------------------------------------- |
| 하트비트       | POST   | `/integration/programs/heartbeat`        |
| 자동 문의 생성 | POST   | `/integration/contacts/auto`             |
| 동기화 로그    | POST   | `/integration/sync-logs`                 |
| 중복 체크      | GET    | `/integration/sync-logs/check-duplicate` |

---

## 4. 인증 (Authentication)

### API Key 방식

모든 Integration 엔드포인트는 `X-API-Key` 헤더 인증이 필요합니다.

```
X-API-Key: yjl_a1b2c3d4e5f6...
```

- 형식: `yjl_` 접두사 + 64자 hex 문자열
- 발급: 관리자 대시보드 → 설정 → API 키 관리
- 평문 키는 **발급 시 1회만** 표시되므로 즉시 저장할 것
- 서버에서 5분간 캐시하여 반복 요청 시 DB 조회 생략

### 인증 실패 응답

```json
// 401 Unauthorized
{
  "statusCode": 401,
  "message": "Invalid or missing API key"
}
```

---

## 5. 공통 규칙

### 요청 형식

- Content-Type: `application/json`
- 날짜: ISO 8601 형식 (`2026-03-24T09:00:00.000Z`)
- ID: UUID v4 형식 (`550e8400-e29b-41d4-a716-446655440000`)

### 페이지네이션

리스트 API는 공통 페이지네이션 파라미터를 사용합니다.

| 파라미터 | 타입   | 기본값 | 설명        |
| -------- | ------ | ------ | ----------- |
| page     | number | 1      | 페이지 번호 |
| limit    | number | 50     | 페이지 크기 |

응답 형식:

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "limit": 50,
  "hasMore": true
}
```

### 정렬

| 파라미터  | 타입   | 기본값       | 설명              |
| --------- | ------ | ------------ | ----------------- |
| sortBy    | string | `created_at` | 정렬 필드         |
| sortOrder | string | `desc`       | `asc` 또는 `desc` |

---

## 6. Programs — 프로그램 하트비트

프로그램 생존 상태를 모니터링합니다. 120초 이상 heartbeat가 없으면 `offline`으로 표시됩니다.

### POST /integration/programs/heartbeat

프로그램 생존 신호를 전송합니다 (upsert).

**Request:**

```json
{
  "programType": "management_program",
  "instanceName": "mgmt-pc-01",
  "version": "2.1.0",
  "hostname": "DESKTOP-ABC",
  "metadata": { "os": "Windows 10" }
}
```

| 필드         | 타입   | 필수 | 설명                                                       |
| ------------ | ------ | ---- | ---------------------------------------------------------- |
| programType  | string | Y    | `management_program`, `nesting_program`, `sync_program` 등 |
| instanceName | string | Y    | 인스턴스 고유명                                            |
| version      | string | N    | 프로그램 버전                                              |
| hostname     | string | N    | 호스트명                                                   |
| metadata     | object | N    | 추가 메타데이터                                            |

**Response (200):**

```json
{
  "id": "uuid",
  "program_type": "management_program",
  "instance_name": "mgmt-pc-01",
  "status": "online",
  "last_seen_at": "2026-03-24T12:00:00.000Z"
}
```

### GET /integration/programs

등록된 프로그램 목록을 조회합니다.

**Response (200):**

```json
[
  {
    "id": "uuid",
    "program_type": "management_program",
    "instance_name": "mgmt-pc-01",
    "status": "online",
    "version": "2.1.0",
    "hostname": "DESKTOP-ABC",
    "last_seen_at": "2026-03-24T12:00:00.000Z",
    "metadata": {},
    "created_at": "2026-01-01T00:00:00.000Z"
  }
]
```

---

## 7. Orders — 주문 관리

### 주문 상태 흐름 (8단계)

```
received → drawing → confirmed → production → cutting → finishing → delivered
                                                                         ↓
                                                                    completed
     ↑                                                                   ↑
     └──────────────── on_hold (어디서든 진입/복귀 가능) ─────────────────┘
```

### 상태 전환 규칙

| 현재 상태  | 전환 가능 상태                                                          |
| ---------- | ----------------------------------------------------------------------- |
| received   | drawing, confirmed, on_hold                                             |
| drawing    | confirmed, received, on_hold                                            |
| confirmed  | production, drawing, completed, on_hold                                 |
| production | cutting, confirmed, on_hold                                             |
| cutting    | finishing, delivered, completed, on_hold                                |
| finishing  | delivered, cutting, on_hold                                             |
| delivered  | (없음 — 최종 상태)                                                      |
| completed  | (없음 — 최종 상태)                                                      |
| on_hold    | received, drawing, confirmed, production, cutting, finishing, completed |

### 우선순위

| 값     | 설명 |
| ------ | ---- |
| urgent | 긴급 |
| normal | 보통 |
| low    | 낮음 |

### GET /integration/orders

주문 목록을 조회합니다.

**Query Parameters:**

| 파라미터    | 타입   | 설명                                                                            |
| ----------- | ------ | ------------------------------------------------------------------------------- |
| status      | enum   | 단일 상태 필터                                                                  |
| statuses    | string | 쉼표 구분 복수 상태 (e.g. `cutting,finishing`)                                  |
| companyName | string | 업체명 부분 일치 검색                                                           |
| priority    | enum   | 우선순위 필터                                                                   |
| contactId   | number | Contact ID 필터                                                                 |
| workNumber  | string | 현장작업번호 정확 일치 (e.g. `260409-F-001`)                                    |
| dateFrom    | string | 생성일 시작 (ISO 8601)                                                          |
| dateTo      | string | 생성일 종료 (ISO 8601)                                                          |
| page        | number | 페이지 번호 (기본값: 1)                                                         |
| limit       | number | 페이지 크기 (기본값: 50)                                                        |
| sortBy      | string | `created_at`, `updated_at`, `company_name`, `status`, `priority`, `received_at` |
| sortOrder   | string | `asc` / `desc` (기본값: `desc`)                                                 |

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

### GET /integration/orders/stats

주문 현황 통계.

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

### GET /integration/orders/numbers/next

다음 사무실작업번호와 현장작업번호를 반환합니다.

**Response (200):**

```json
{
  "nextInquiryNumber": "260324-O-003",
  "nextWorkNumber": "260324-F-005"
}
```

### GET /integration/orders/companies/search?name={검색어}

업체명으로 등록 거래처를 검색합니다 (활성 상태만).

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

### GET /integration/orders/:id

주문 상세 조회 (이벤트, 작업, 배송 이력 포함).

**Response (200):** 기본 주문 필드 + `events[]`, `tasks[]`, `deliveries[]`

### POST /integration/orders

주문을 생성합니다. `order_created` 이벤트가 자동 기록됩니다.

**Request:**

```json
{
  "companyName": "원컴퍼니",
  "title": "목형 제작 의뢰",
  "contactId": 123,
  "inquiryNumber": "260324-O-001",
  "customerName": "홍길동",
  "customerPhone": "010-1234-5678",
  "priority": "normal",
  "webhardFolderId": "uuid",
  "source": "webhard",
  "originalFilename": "도면.dxf"
}
```

| 필드             | 타입   | 필수 | 설명                                    |
| ---------------- | ------ | ---- | --------------------------------------- |
| companyName      | string | Y    | 업체명                                  |
| title            | string | Y    | 주문 제목                               |
| contactId        | number | N    | 연결할 Contact ID                       |
| inquiryNumber    | string | N    | 사무실작업번호 (e.g. `260324-O-001`)    |
| customerName     | string | N    | 담당자명                                |
| customerPhone    | string | N    | 담당자 전화번호                         |
| description      | string | N    | 주문 설명                               |
| orderType        | string | N    | 주문 유형 (기본값: `standard`)          |
| priority         | enum   | N    | `urgent` / `normal` / `low`             |
| webhardFolderId  | string | N    | 웹하드 폴더 ID                          |
| deliveryMethod   | string | N    | 납품 방법                               |
| deliveryAddress  | string | N    | 납품 주소                               |
| memo             | string | N    | 메모                                    |
| source           | string | N    | 접수 경로 (`website`/`webhard`/`phone`) |
| originalFilename | string | N    | 원본 파일명 (중복 체크용)               |

### PATCH /integration/orders/:id

주문 정보를 수정합니다 (상태 제외).

| 필드               | 타입   | 설명                    |
| ------------------ | ------ | ----------------------- |
| companyName        | string | 업체명                  |
| customerName       | string | 담당자명                |
| customerPhone      | string | 담당자 전화번호         |
| title              | string | 주문 제목               |
| description        | string | 주문 설명               |
| priority           | enum   | 우선순위                |
| webhardFolderId    | string | 웹하드 폴더 ID          |
| drawingFileCount   | number | 도면 파일 수 (>= 0)     |
| dxfClassifiedCount | number | DXF 분류 완료 수 (>= 0) |
| dxfTotalPrice      | number | DXF 총 가격 (>= 0)      |
| deliveryMethod     | string | 납품 방법               |
| deliveryAddress    | string | 납품 주소               |
| deliveryNote       | string | 납품 비고               |
| memo               | string | 메모                    |

### PATCH /integration/orders/:id/status

주문 상태를 전환합니다.

**Request:**

```json
{
  "status": "cutting",
  "actorName": "홍길동",
  "message": "레이저 가공 시작"
}
```

**부가 동작:**

- `confirmed` → `confirmedAt` 자동 기록
- `cutting` → `cuttingStartedAt` 자동 기록
- `finishing` → `postProcessingStartedAt` 자동 기록
- `delivered` → `deliveredAt` 자동 기록
- `production` → Contact에 현장작업번호(`workNumber`, e.g. `260324-F-001`) 자동 부여
- `on_hold` → Contact 이전 상태 저장
- 연결된 Contact 테이블 상태도 자동 동기화

**Error (400):**

```json
{
  "statusCode": 400,
  "message": "Cannot transition from 'received' to 'cutting'. Valid: drawing, confirmed, on_hold"
}
```

### GET /integration/orders/:id/events

주문의 이벤트 이력을 조회합니다.

---

### 공정 단계 (Process Stage) — 2계층 시스템

`status`는 대분류, `processStage`는 실제 작업 단계입니다. `processStage` 변경 시 `status`가 자동 전환됩니다.

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

사무실→현장 전환 시 현장작업번호(`workNumber`, F-xxx)가 자동 부여됩니다.

### GET /integration/orders/process-stages/list

사용 가능한 공정 단계 목록과 status 매핑 정보를 반환합니다.

### GET /integration/orders/:id/process-stage

Order에 연결된 Contact의 현재 공정 단계를 조회합니다.

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

### PATCH /integration/orders/:id/process-stage

공정 단계를 변경합니다. `status`도 자동 전환됩니다.

**Request:**

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
  "status": "finishing",
  "work_number": "260324-F-001",
  "status_changed": true
}
```

---

### POST /integration/laser-completions

레이저네스팅프로그램이 DXF 파일명에서 추출한 `workNumber` 목록으로 레이저 전용 문의(`inquiryType=laser_cutting`)를 완료 처리합니다. 외부 프로그램이 `contactId`를 모를 때 쓰는 wrapper이며, 기존 `POST /contacts/:id/complete-laser` 정책을 재사용합니다.

**Request:**

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

- `workNumbers`는 trim 후 중복 제거됩니다. 응답의 `requested`와 `results`는 중복 제거 후 기준입니다.
- Contact 없음은 `not_found`, 레이저 전용 문의가 아니면 `not_laser_only`로 반환하며 배치 처리를 계속합니다.
- 이미 `status=completed`, `processStage=null`이면 `already_completed`로 멱등 성공 처리합니다.
- 레이저 전용 문의는 `status=completed`, `processStage=null`로 전환하고 타임라인, socket/event emit, 문의 폴더 `완료/` 이동을 기존 완료 로직으로 수행합니다.
- 항목 내부 실패는 `failed`로 반환하고 나머지 항목은 계속 처리합니다. `success`는 `failed=0`이면 `true`입니다.

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

**Status 값:**

| status              | 의미                      |
| ------------------- | ------------------------- |
| `completed`         | 완료 처리 성공            |
| `already_completed` | 이미 완료된 문의          |
| `not_found`         | 해당 workNumber 문의 없음 |
| `not_laser_only`    | 레이저 전용 문의가 아님   |
| `failed`            | 항목 처리 중 예외 발생    |

**Python 예시:**

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
print(response.json())
```

**Errors:** `400` DTO 검증 실패, `401` 유효한 session/API key 없음.

---

## 8. Events — 이벤트 기록

주문 관련 이벤트를 기록합니다. 특정 이벤트는 주문 상태를 자동 전환합니다.

### 자동 상태 전환 매핑

| eventType           | 주문 상태 전환       | 비고                |
| ------------------- | -------------------- | ------------------- |
| `file_synced`       | → `drawing_received` |                     |
| `file_classified`   | → `file_classified`  |                     |
| `nesting_started`   | → `nesting_queued`   |                     |
| `nesting_completed` | → `nesting_complete` | 합판 자동 출고 가능 |

### POST /integration/events

단일 이벤트를 기록합니다.

**Request:**

```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "file_synced",
  "source": "sync_program",
  "actorName": "시스템",
  "data": { "filename": "도면_A.dxf" },
  "message": "파일 동기화 완료"
}
```

| 필드      | 타입   | 필수 | 설명               |
| --------- | ------ | ---- | ------------------ |
| orderId   | UUID   | Y    | 주문 ID            |
| eventType | string | Y    | 이벤트 타입        |
| source    | string | Y    | 발생 프로그램명    |
| actorName | string | N    | 수행자 이름        |
| data      | object | N    | 이벤트 상세 데이터 |
| message   | string | N    | 설명 메시지        |

**`nesting_completed` 이벤트의 `data` 예시 (합판 자동 출고):**

```json
{
  "plywood_usage": [{ "item_id": "uuid", "quantity": 2 }]
}
```

### POST /integration/events/batch

여러 이벤트를 일괄 기록합니다.

**Request:**

```json
{
  "events": [
    { "orderId": "uuid-1", "eventType": "file_synced", "source": "sync_program" },
    { "orderId": "uuid-2", "eventType": "file_synced", "source": "sync_program" }
  ]
}
```

### GET /integration/events

이벤트 목록을 조회합니다.

| 파라미터  | 타입   | 설명               |
| --------- | ------ | ------------------ |
| source    | string | 소스 프로그램 필터 |
| eventType | string | 이벤트 타입 필터   |
| orderId   | UUID   | 주문 ID 필터       |
| dateFrom  | string | 시작 날짜          |
| dateTo    | string | 종료 날짜          |
| page      | number | 페이지 번호        |
| limit     | number | 페이지 크기        |

---

## 9. Deliveries — 납품 관리

### 납품 상태 흐름

```
pending → preparing → in_transit → delivered
                  ↑                    ↓
                  └──── returned ──────┘
```

### 상태 전환 규칙

| 현재 상태  | 전환 가능 상태      |
| ---------- | ------------------- |
| pending    | preparing           |
| preparing  | in_transit, pending |
| in_transit | delivered, returned |
| delivered  | (없음)              |
| returned   | preparing           |

### 납품 유형

| 값              | 설명      |
| --------------- | --------- |
| pickup          | 수령      |
| courier         | 택배      |
| direct_delivery | 직접 배달 |

### GET /integration/deliveries/schedule?dateFrom=...&dateTo=...

기간별 납품 스케줄 (완료/반품 제외).

### GET /integration/deliveries

납품 목록 조회 (페이지네이션).

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| status   | enum   | 상태 필터    |
| dateFrom | string | 예정일 시작  |
| dateTo   | string | 예정일 종료  |
| orderId  | UUID   | 주문 ID 필터 |
| page     | number | 페이지 번호  |
| limit    | number | 페이지 크기  |

### GET /integration/deliveries/:id

납품 상세 조회.

### POST /integration/deliveries

납품을 생성합니다.

**Request:**

```json
{
  "orderId": "uuid",
  "deliveryType": "direct_delivery",
  "recipientName": "홍길동",
  "recipientPhone": "010-1234-5678",
  "address": "서울시 강남구...",
  "scheduledDate": "2026-03-25T09:00:00.000Z",
  "note": "오전 배달 요청"
}
```

### PATCH /integration/deliveries/:id

납품 정보 수정 (상태 제외).

| 필드           | 타입   | 설명            |
| -------------- | ------ | --------------- |
| recipientName  | string | 수령인 이름     |
| recipientPhone | string | 수령인 전화번호 |
| address        | string | 배송 주소       |
| trackingNumber | string | 운송장 번호     |
| courierCompany | string | 택배사명        |
| scheduledDate  | string | 납품 예정일     |
| note           | string | 비고            |

### PATCH /integration/deliveries/:id/status

납품 상태를 전환합니다.

**Request:**

```json
{ "status": "in_transit" }
```

**부가 동작:**

- `in_transit` → `shippedAt` 자동 기록
- `delivered` → `deliveredAt` 자동 기록 + 연결된 주문도 `delivered`로 전환

---

## 10. Inventory — 재고 관리

### 재고 카테고리

| 값          | 설명   |
| ----------- | ------ |
| plywood     | 합판   |
| steel_plate | 철판   |
| blade       | 칼날   |
| sponge      | 스폰지 |
| packaging   | 포장재 |
| other       | 기타   |

### GET /integration/inventory/alerts

재고 부족 알림 (현재 재고 <= 최소 재고, 활성 품목만).

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

### GET /integration/inventory/items

재고 품목 목록 조회.

| 파라미터 | 타입    | 설명        |
| -------- | ------- | ----------- |
| category | enum    | 카테고리    |
| isActive | boolean | 활성 상태   |
| page     | number  | 페이지 번호 |
| limit    | number  | 페이지 크기 |

### GET /integration/inventory/items/:id

품목 상세 (최근 20건 거래 이력 포함).

### POST /integration/inventory/items

품목 생성.

**Request:**

```json
{
  "name": "합판 3x6 9T",
  "category": "plywood",
  "unit": "장",
  "currentStock": 20,
  "minStock": 5,
  "width": 900,
  "height": 1800,
  "thickness": 9,
  "unitPrice": 12000,
  "supplier": "목재상사",
  "location": "창고 A-1"
}
```

### PATCH /integration/inventory/items/:id

품목 정보 수정 (재고 수량은 in/out/adjust 사용).

### POST /integration/inventory/items/:id/in

재고 입고.

**Request:**

```json
{
  "quantity": 10,
  "reason": "정기 입고",
  "actorName": "관리자"
}
```

**Response (200):**

```json
{
  "item": { "...": "업데이트된 품목" },
  "transaction": {
    "id": "uuid",
    "type": "in",
    "quantity": 10,
    "previous_stock": 15,
    "new_stock": 25,
    "reason": "정기 입고",
    "actor_name": "관리자",
    "created_at": "2026-03-24T10:00:00.000Z"
  }
}
```

### POST /integration/inventory/items/:id/out

재고 출고. 재고 부족 시 `400` 에러.

**Request:**

```json
{
  "quantity": 2,
  "orderId": "uuid",
  "reason": "네스팅 가공",
  "actorName": "system"
}
```

**Error (400):**

```json
{
  "statusCode": 400,
  "message": "Insufficient stock: current 1, requested 2"
}
```

### POST /integration/inventory/items/:id/adjust

재고를 절대값으로 조정 (실사 반영).

**Request:**

```json
{
  "newStock": 18,
  "reason": "실사 반영",
  "actorName": "관리자"
}
```

### GET /integration/inventory/items/:id/transactions

품목별 거래 이력 조회.

| 파라미터 | 타입   | 설명                  |
| -------- | ------ | --------------------- |
| type     | string | `in`, `out`, `adjust` |
| dateFrom | string | 시작 날짜             |
| dateTo   | string | 종료 날짜             |
| page     | number | 페이지 번호           |
| limit    | number | 페이지 크기           |

---

## 11. Sync Logs — 동기화 로그

외부 웹하드 동기화 결과를 기록합니다.

### 동기화 상태

| 값                | 설명        |
| ----------------- | ----------- |
| synced            | 동기화 성공 |
| company_not_found | 업체 미확인 |
| api_error         | API 오류    |
| duplicate         | 중복 파일   |
| skipped           | 건너뜀      |

### POST /integration/sync-logs

동기화 로그를 기록합니다.

**Request:**

```json
{
  "filename": "원컴퍼니_도면A.dxf",
  "status": "synced",
  "companyName": "원컴퍼니",
  "contactId": 123,
  "orderId": "uuid",
  "md5Hash": "d41d8cd98f00b204e9800998ecf8427e",
  "metadata": { "fileSize": 1024000 }
}
```

| 필드         | 타입   | 필수 | 설명                   |
| ------------ | ------ | ---- | ---------------------- |
| filename     | string | Y    | 파일명                 |
| status       | enum   | Y    | 동기화 상태            |
| companyName  | string | N    | 업체명                 |
| contactId    | number | N    | 자동 생성된 Contact ID |
| orderId      | string | N    | 자동 생성된 Order ID   |
| errorMessage | string | N    | 에러 메시지            |
| md5Hash      | string | N    | 파일 MD5 해시          |
| metadata     | object | N    | 추가 메타데이터        |

### GET /integration/sync-logs

동기화 로그 목록 조회.

| 파라미터 | 타입   | 설명        |
| -------- | ------ | ----------- |
| status   | enum   | 상태 필터   |
| dateFrom | string | 시작 날짜   |
| dateTo   | string | 종료 날짜   |
| page     | number | 페이지 번호 |
| limit    | number | 페이지 크기 |

### GET /integration/sync-logs/stats?date=2026-03-24

일별 동기화 통계.

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

### GET /integration/sync-logs/check-duplicate?md5Hash=...

MD5 해시로 중복 파일 체크 (synced 상태인 로그만 대상).

**Response (200):**

```json
{ "duplicate": true }
```

---

## 12. Auto Contact — 자동 문의 생성

DXF 파일 파싱 결과로 Contact + Order를 자동 생성합니다.

### POST /integration/contacts/auto

**Request:**

```json
{
  "inquiry_title": "원컴퍼니_도면A",
  "company_name": "원컴퍼니",
  "phone": "010-1234-5678",
  "email": "info@onecompany.com",
  "drawing_notes": "합판 3T, 500x300mm, 단가 15,000원"
}
```

| 필드          | 타입   | 필수 | 설명                                |
| ------------- | ------ | ---- | ----------------------------------- |
| inquiry_title | string | Y    | 문의 제목 (보통 DXF 파일명)         |
| company_name  | string | Y    | 업체명                              |
| phone         | string | N    | 전화번호 (기본값: `-`)              |
| email         | string | N    | 이메일 (기본값: `auto@yjlaser.com`) |
| drawing_notes | string | N    | 도면 비고 (규격, 가격 등)           |

**Response (201):**

```json
{
  "contactId": "uuid-string",
  "orderId": "uuid",
  "inquiryNumber": "260324-O-001"
}
```

---

## 13. 에러 처리

### HTTP 상태 코드

| 코드 | 의미                  | 대응                     |
| ---- | --------------------- | ------------------------ |
| 200  | 성공                  | —                        |
| 201  | 생성 성공             | —                        |
| 400  | 요청 오류 (검증 실패) | 요청 Body/파라미터 확인  |
| 401  | 인증 실패             | API Key 확인             |
| 404  | 리소스 없음           | ID 확인                  |
| 500  | 서버 내부 오류        | 관리자에게 문의          |
| 501  | 미구현                | file-transfer 엔드포인트 |

### 에러 응답 형식

```json
{
  "statusCode": 400,
  "message": "에러 메시지",
  "error": "Bad Request"
}
```

### 검증 에러 (class-validator)

```json
{
  "statusCode": 400,
  "message": ["companyName must be a string", "title should not be empty"],
  "error": "Bad Request"
}
```

### 재시도 권장

| 상황              | 재시도 | 설명                         |
| ----------------- | ------ | ---------------------------- |
| 401               | X      | API Key 오류 — 키 재확인     |
| 400               | X      | 요청 데이터 오류 — 수정 필요 |
| 404               | X      | 리소스 없음 — ID 확인        |
| 500               | O      | 서버 오류 — 3회까지 재시도   |
| 네트워크 타임아웃 | O      | 연결 실패 — 지수 백오프 적용 |

---

## 14. Python 코드 예시

### API 클라이언트 클래스

```python
import requests
import hashlib
import socket
import time
from typing import Optional


class YJLaserAPI:
    """YJLaser Integration API 클라이언트."""

    def __init__(self, base_url: str, api_key: str, program_type: str, instance_name: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        }
        self.program_type = program_type
        self.instance_name = instance_name

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """공통 요청 메서드 (자동 재시도 포함)."""
        url = f"{self.base_url}{path}"
        for attempt in range(3):
            try:
                resp = requests.request(method, url, headers=self.headers, timeout=30, **kwargs)
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.HTTPError:
                if resp.status_code < 500:
                    raise  # 4xx는 재시도 불가
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
            except requests.exceptions.ConnectionError:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

    # ── 하트비트 ──

    def heartbeat(self, version: str = None):
        """프로그램 하트비트 전송."""
        payload = {
            "programType": self.program_type,
            "instanceName": self.instance_name,
            "hostname": socket.gethostname(),
        }
        if version:
            payload["version"] = version
        return self._request("POST", "/integration/programs/heartbeat", json=payload)

    # ── 주문 ──

    def get_orders(self, status: str = None, page: int = 1, limit: int = 50) -> dict:
        """주문 목록 조회."""
        params = {"page": page, "limit": limit}
        if status:
            params["status"] = status
        return self._request("GET", "/integration/orders", params=params)

    def get_order(self, order_id: str) -> dict:
        """주문 상세 조회."""
        return self._request("GET", f"/integration/orders/{order_id}")

    def create_order(self, company_name: str, title: str, **kwargs) -> dict:
        """주문 생성."""
        payload = {"companyName": company_name, "title": title, **kwargs}
        return self._request("POST", "/integration/orders", json=payload)

    def update_order_status(self, order_id: str, status: str,
                            actor_name: str = None, message: str = None) -> dict:
        """주문 상태 전환."""
        payload = {"status": status}
        if actor_name:
            payload["actorName"] = actor_name
        if message:
            payload["message"] = message
        return self._request("PATCH", f"/integration/orders/{order_id}/status", json=payload)

    # ── 이벤트 ──

    def create_event(self, order_id: str, event_type: str, source: str = None, **kwargs) -> dict:
        """이벤트 기록."""
        payload = {
            "orderId": order_id,
            "eventType": event_type,
            "source": source or self.program_type,
            **kwargs,
        }
        return self._request("POST", "/integration/events", json=payload)

    # ── 재고 ──

    def stock_out(self, item_id: str, quantity: float,
                  order_id: str = None, reason: str = None) -> dict:
        """재고 출고."""
        payload = {"quantity": quantity}
        if order_id:
            payload["orderId"] = order_id
        if reason:
            payload["reason"] = reason
        return self._request("POST", f"/integration/inventory/items/{item_id}/out", json=payload)

    # ── 동기화 로그 ──

    def log_sync(self, filename: str, status: str, **kwargs) -> dict:
        """동기화 로그 기록."""
        payload = {"filename": filename, "status": status, **kwargs}
        return self._request("POST", "/integration/sync-logs", json=payload)

    def check_duplicate(self, file_path: str) -> bool:
        """파일 MD5 해시로 중복 체크."""
        md5 = hashlib.md5(open(file_path, "rb").read()).hexdigest()
        result = self._request("GET", "/integration/sync-logs/check-duplicate",
                               params={"md5Hash": md5})
        return result.get("duplicate", False)

    # ── 자동 문의 ──

    def auto_contact(self, inquiry_title: str, company_name: str, **kwargs) -> dict:
        """DXF 파일로 자동 문의+주문 생성."""
        payload = {
            "inquiry_title": inquiry_title,
            "company_name": company_name,
            **kwargs,
        }
        return self._request("POST", "/integration/contacts/auto", json=payload)
```

### 관리프로그램 사용 예시

```python
api = YJLaserAPI(
    base_url="https://yjlaser.net/api/webhard",
    api_key="yjl_your_api_key_here",
    program_type="management_program",
    instance_name="mgmt-pc-01",
)

# 1. 하트비트 (30초 간격 권장, 별도 스레드에서)
api.heartbeat(version="2.1.0")

# 2. DXF 파일 분류 후 자동 문의 생성
result = api.auto_contact(
    inquiry_title="원컴퍼니_도면A",
    company_name="원컴퍼니",
    drawing_notes="합판 3T, 500x300mm",
)
order_id = result["orderId"]

# 3. 이벤트 기록
api.create_event(order_id, "file_classified", data={"count": 5, "total_price": 75000})

# 4. 주문 정보 업데이트
api._request("PATCH", f"/integration/orders/{order_id}", json={
    "dxfClassifiedCount": 5,
    "dxfTotalPrice": 75000,
})

# 5. 동기화 로그
api.log_sync("원컴퍼니_도면A.dxf", "synced",
             companyName="원컴퍼니", orderId=order_id,
             md5Hash="abc123def456...")
```

### 네스팅프로그램 사용 예시

```python
api = YJLaserAPI(
    base_url="https://yjlaser.net/api/webhard",
    api_key="yjl_your_api_key_here",
    program_type="nesting_program",
    instance_name="nesting-pc-01",
)

# 1. 네스팅 시작 이벤트
api.create_event(order_id, "nesting_started")

# 2. 네스팅 완료 + 합판 자동 출고
api.create_event(order_id, "nesting_completed", data={
    "plywood_usage": [
        {"item_id": "plywood-uuid-1", "quantity": 2},
        {"item_id": "plywood-uuid-2", "quantity": 1},
    ]
})

# 3. 또는 수동으로 재고 출고
api.stock_out("plywood-uuid-1", quantity=2, order_id=order_id, reason="네스팅 가공")
```

### 동기화프로그램 사용 예시

```python
api = YJLaserAPI(
    base_url="https://yjlaser.net/api/webhard",
    api_key="yjl_your_api_key_here",
    program_type="sync_program",
    instance_name="sync-nas-01",
)

# 1. 파일 중복 체크
if api.check_duplicate("/path/to/원컴퍼니_도면A.dxf"):
    print("중복 파일 — 건너뜀")
else:
    # 2. 자동 문의 생성
    result = api.auto_contact("원컴퍼니_도면A", "원컴퍼니")

    # 3. 동기화 로그 기록
    api.log_sync("원컴퍼니_도면A.dxf", "synced",
                 companyName="원컴퍼니",
                 contactId=result["contactId"],
                 orderId=result["orderId"],
                 md5Hash="abc123...")
```

---

## 변경 이력

| 날짜       | 내용                                  |
| ---------- | ------------------------------------- |
| 2026-04-09 | 초판 작성 — 전체 Integration API 정리 |

---

**최종 업데이트**: 2026-04-09
**작성자**: YJLaser 개발팀
