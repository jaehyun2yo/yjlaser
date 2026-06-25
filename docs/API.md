# YJLaser 백엔드 API 명세서

NestJS 백엔드 (`webhard-api/`) 의 전체 REST API 문서입니다.
외부 프로그램 연동 시 이 문서를 참조하세요.

## 목차

- [개요](#개요)
- [인증](#인증)
- [공통 규격](#공통-규격)
- [1. Integration API (외부 프로그램 연동)](#1-integration-api-외부-프로그램-연동)
- [2. Core API (웹사이트/웹하드)](#2-core-api-웹사이트웹하드)
- [3. Worker API (현장 작업 관리)](#3-worker-api-현장-작업-관리)
- [에러 처리](#에러-처리)

---

## 개요

| 항목                  | 값                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------- |
| Base URL (Production) | `https://api.yjlaser.com/api/v1`                                                    |
| Base URL (Local)      | `http://localhost:4000/api/v1`                                                      |
| Global Prefix         | `/api/v1`                                                                           |
| Content-Type          | `application/json`                                                                  |
| CSRF                  | POST/PATCH/DELETE 요청에 CSRF 토큰 검증 (외부 프로그램은 API Key 인증 사용 시 면제) |

---

## 인증

### 1. API Key (외부 프로그램용) — **권장**

```
X-API-Key: <your-api-key>
```

- Integration API 전체 + Core API 일부에서 사용
- 관리자 대시보드에서 발급/관리

### 2. Session Cookie (웹사이트용)

- 로그인 후 `admin-session` 또는 `company-session` 쿠키 자동 발급
- ERP, Settings 등 내부 관리 기능에서 사용

### 3. Public (인증 불필요)

- Health check, 문의 생성, 포트폴리오/게시글 조회, Worker PIN 로그인 등

---

## 공통 규격

### 페이지네이션

페이지네이션 지원 엔드포인트는 다음 쿼리 파라미터를 공통 사용합니다:

| 파라미터 | 타입   | 기본값 | 설명             |
| -------- | ------ | ------ | ---------------- |
| `page`   | number | 1      | 페이지 번호      |
| `limit`  | number | 50     | 페이지당 항목 수 |

응답 형식:

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 50,
  "totalPages": 2
}
```

### 날짜 필터

| 파라미터   | 형식     | 예시         |
| ---------- | -------- | ------------ |
| `dateFrom` | ISO 8601 | `2024-01-01` |
| `dateTo`   | ISO 8601 | `2024-12-31` |

---

# 1. Integration API (외부 프로그램 연동)

> **인증**: `X-API-Key` 헤더 (API Key 관리 엔드포인트만 세션 인증)

---

## 1.1 API Key 관리

> **인증**: Session Cookie (Admin)

| Method | Endpoint                    | 설명              |
| ------ | --------------------------- | ----------------- |
| POST   | `/integration/api-keys`     | API Key 생성      |
| GET    | `/integration/api-keys`     | API Key 목록 조회 |
| DELETE | `/integration/api-keys/:id` | API Key 삭제      |

### POST `/integration/api-keys`

```json
// Request Body
{
  "name": "관리프로그램",           // 필수: 키 이름
  "programType": "management",     // 필수: 프로그램 유형
  "permissions": ["read", "write"] // 선택: 권한 목록
}

// Response
{
  "id": "uuid",
  "name": "관리프로그램",
  "key": "yjl_xxxxxxxxxxxx",
  "programType": "management",
  "permissions": ["read", "write"],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

## 1.2 주문(Order) 관리

| Method | Endpoint                                     | 설명                               |
| ------ | -------------------------------------------- | ---------------------------------- |
| GET    | `/integration/orders`                        | 주문 목록 조회 (필터/페이지네이션) |
| GET    | `/integration/orders/stats`                  | 주문 통계                          |
| GET    | `/integration/orders/workshop`               | 현장 작업 목록 (공정별 필터)       |
| GET    | `/integration/orders/numbers/next`           | 다음 작업번호 조회                 |
| GET    | `/integration/orders/companies/search?name=` | 업체명 검색                        |
| GET    | `/integration/orders/process-stages/list`    | 공정 단계 목록 (정적 데이터)       |
| GET    | `/integration/orders/:id`                    | 주문 상세 조회                     |
| GET    | `/integration/orders/:id/events`             | 주문 이벤트 이력                   |
| GET    | `/integration/orders/:id/process-stage`      | 주문 현재 공정 단계                |
| POST   | `/integration/orders`                        | 주문 생성                          |
| PATCH  | `/integration/orders/:id`                    | 주문 수정                          |
| PATCH  | `/integration/orders/:id/status`             | 주문 상태 변경                     |
| PATCH  | `/integration/orders/:id/process-stage`      | 공정 단계 변경                     |

### 주문 상태 (ContactStatus)

```
received → drawing → confirmed → production → cutting → finishing → delivered → completed
                                                                         ↓
                                                                      on_hold (보류)
```

**유효한 상태 전환:**

| 현재 상태    | 전환 가능한 상태                                                        |
| ------------ | ----------------------------------------------------------------------- |
| `received`   | drawing, confirmed, on_hold                                             |
| `drawing`    | confirmed, received, on_hold                                            |
| `confirmed`  | production, drawing, completed, on_hold                                 |
| `production` | cutting, confirmed, on_hold                                             |
| `cutting`    | finishing, delivered, completed, on_hold                                |
| `finishing`  | delivered, cutting, on_hold                                             |
| `delivered`  | (종료)                                                                  |
| `completed`  | (종료)                                                                  |
| `on_hold`    | received, drawing, confirmed, production, cutting, finishing, completed |

### 공정 단계 (Process Stage)

```
drawing → sample → drawing_confirmed → laser → cutting → creasing → delivery
```

### POST `/integration/orders` — 주문 생성

```json
// Request Body
{
  "companyName": "테스트업체", // 필수
  "title": "도무송 목형 제작", // 필수
  "contactId": 123, // 선택: 연결할 문의 ID
  "inquiryNumber": "INQ-001", // 선택: 문의번호
  "customerName": "홍길동", // 선택
  "customerPhone": "010-1234-5678", // 선택
  "description": "상세 설명", // 선택
  "orderType": "standard", // 선택
  "priority": "normal", // 선택: urgent | normal | low
  "webhardFolderId": "uuid", // 선택: 웹하드 폴더 연결
  "deliveryMethod": "direct", // 선택
  "deliveryAddress": "서울시...", // 선택
  "memo": "메모", // 선택
  "source": "webhard", // 선택: website | webhard | phone
  "originalFilename": "file.dxf" // 선택: 중복 체크용 원본 파일명
}
```

### PATCH `/integration/orders/:id` — 주문 수정

```json
{
  "companyName": "수정업체", // 선택
  "customerName": "김철수", // 선택
  "customerPhone": "010-0000-0000", // 선택
  "title": "수정된 제목", // 선택
  "description": "수정 설명", // 선택
  "priority": "urgent", // 선택: urgent | normal | low
  "webhardFolderId": "uuid", // 선택
  "drawingFileCount": 5, // 선택: 도면 파일 수 (≥0)
  "dxfClassifiedCount": 3, // 선택: DXF 분류 완료 수 (≥0)
  "dxfTotalPrice": 150000, // 선택: DXF 합계 금액 (≥0)
  "deliveryMethod": "courier", // 선택
  "deliveryAddress": "부산시...", // 선택
  "deliveryNote": "배송 참고", // 선택
  "memo": "메모 수정" // 선택
}
```

### PATCH `/integration/orders/:id/status` — 상태 변경

```json
{
  "status": "production", // 필수: ContactStatus enum
  "actorName": "관리프로그램", // 선택: 변경 주체
  "message": "생산 시작" // 선택: 이벤트 메시지
}
```

### PATCH `/integration/orders/:id/process-stage` — 공정 단계 변경

```json
{
  "processStage": "laser", // 선택: null로 초기화 가능
  "actorName": "관리프로그램" // 선택
}
```

### GET `/integration/orders` — 쿼리 파라미터

| 파라미터      | 타입   | 설명                               |
| ------------- | ------ | ---------------------------------- |
| `status`      | string | 단일 상태 필터                     |
| `statuses`    | string | 콤마 구분 다중 상태 필터           |
| `companyName` | string | 업체명 필터                        |
| `priority`    | string | 우선순위 필터 (urgent/normal/low)  |
| `contactId`   | number | 연결된 문의 ID                     |
| `workNumber`  | string | 작업번호 검색                      |
| `dateFrom`    | string | 시작 날짜                          |
| `dateTo`      | string | 종료 날짜                          |
| `sortBy`      | string | 정렬 기준 (기본: `created_at`)     |
| `sortOrder`   | string | 정렬 방향 (asc/desc, 기본: `desc`) |
| `page`        | number | 페이지 (기본: 1)                   |
| `limit`       | number | 페이지 크기 (기본: 50)             |

### GET `/integration/orders/workshop` — 현장 작업 조회

| 파라미터 | 타입   | 설명                                                  |
| -------- | ------ | ----------------------------------------------------- |
| `stage`  | string | 공정 필터: `cutting` / `post_processing` / `delivery` |
| `period` | string | 기간 필터: `today` / `week` / `all`                   |
| `search` | string | 검색어                                                |

---

## 1.3 자동 문의 생성 (Auto Contact)

| Method | Endpoint                     | 설명                             |
| ------ | ---------------------------- | -------------------------------- |
| POST   | `/integration/contacts/auto` | 외부 프로그램에서 자동 문의 생성 |

### POST `/integration/contacts/auto`

```json
// Request Body
{
  "inquiry_title": "긴급 도무송 제작",  // 필수
  "company_name": "테스트업체",         // 필수
  "phone": "010-1234-5678",           // 선택
  "email": "test@example.com",        // 선택
  "drawing_notes": "DXF 파일 첨부"     // 선택
}

// Response
{
  "success": true,
  "contactId": 123
}
```

---

## 1.4 납품(Delivery) 관리

| Method | Endpoint                             | 설명                    |
| ------ | ------------------------------------ | ----------------------- |
| GET    | `/integration/deliveries`            | 납품 목록 조회          |
| GET    | `/integration/deliveries/schedule`   | 납품 일정 조회 (기간별) |
| GET    | `/integration/deliveries/:id`        | 납품 상세 조회          |
| POST   | `/integration/deliveries`            | 납품 생성               |
| PATCH  | `/integration/deliveries/:id`        | 납품 수정               |
| PATCH  | `/integration/deliveries/:id/status` | 납품 상태 변경          |

### 납품 상태 (DeliveryStatus)

| 현재 상태    | 전환 가능           |
| ------------ | ------------------- |
| `pending`    | preparing           |
| `preparing`  | in_transit, pending |
| `in_transit` | delivered, returned |
| `delivered`  | (종료)              |
| `returned`   | preparing           |

### 납품 유형 (DeliveryType)

- `pickup` — 직접 수령
- `courier` — 택배
- `direct_delivery` — 직접 배송

### POST `/integration/deliveries` — 납품 생성

```json
{
  "orderId": "uuid", // 필수: 주문 UUID
  "deliveryType": "courier", // 필수: pickup | courier | direct_delivery
  "recipientName": "수령인", // 선택
  "recipientPhone": "010-1234-5678", // 선택
  "address": "서울시 강남구...", // 선택
  "scheduledDate": "2024-03-15", // 선택: ISO 8601
  "note": "배송 참고사항" // 선택
}
```

### PATCH `/integration/deliveries/:id` — 납품 수정

```json
{
  "recipientName": "수정된 수령인", // 선택
  "recipientPhone": "010-0000-0000", // 선택
  "address": "변경 주소", // 선택
  "trackingNumber": "1234567890", // 선택: 운송장 번호
  "courierCompany": "CJ대한통운", // 선택: 택배사
  "scheduledDate": "2024-03-20", // 선택
  "note": "수정 참고사항" // 선택
}
```

### PATCH `/integration/deliveries/:id/status`

```json
{
  "status": "in_transit" // 필수: pending | preparing | in_transit | delivered | returned
}
```

### GET `/integration/deliveries` — 쿼리 파라미터

| 파라미터   | 타입   | 설명                   |
| ---------- | ------ | ---------------------- |
| `status`   | string | 상태 필터              |
| `dateFrom` | string | 시작 날짜              |
| `dateTo`   | string | 종료 날짜              |
| `orderId`  | UUID   | 주문 ID 필터           |
| `page`     | number | 페이지 (기본: 1)       |
| `limit`    | number | 페이지 크기 (기본: 50) |

### GET `/integration/deliveries/schedule`

| 파라미터   | 타입   | 설명                |
| ---------- | ------ | ------------------- |
| `dateFrom` | string | **필수**: 시작 날짜 |
| `dateTo`   | string | **필수**: 종료 날짜 |

---

## 1.5 이벤트 로깅

| Method | Endpoint                    | 설명             |
| ------ | --------------------------- | ---------------- |
| POST   | `/integration/events`       | 이벤트 기록      |
| POST   | `/integration/events/batch` | 이벤트 일괄 기록 |
| GET    | `/integration/events`       | 이벤트 목록 조회 |

### POST `/integration/events`

```json
{
  "orderId": "uuid", // 필수: 주문 UUID
  "eventType": "status_change", // 필수: 이벤트 유형
  "source": "management_program", // 필수: 이벤트 발생 소스
  "actorName": "관리프로그램", // 선택
  "data": { "key": "value" }, // 선택: 추가 데이터
  "message": "상태 변경됨" // 선택
}
```

### POST `/integration/events/batch`

```json
{
  "events": [
    { "orderId": "uuid", "eventType": "...", "source": "..." },
    { "orderId": "uuid", "eventType": "...", "source": "..." }
  ]
}
```

### GET `/integration/events` — 쿼리 파라미터

| 파라미터    | 타입   | 설명                   |
| ----------- | ------ | ---------------------- |
| `source`    | string | 소스 필터              |
| `eventType` | string | 이벤트 유형 필터       |
| `orderId`   | UUID   | 주문 ID 필터           |
| `dateFrom`  | string | 시작 날짜              |
| `dateTo`    | string | 종료 날짜              |
| `page`      | number | 페이지 (기본: 1)       |
| `limit`     | number | 페이지 크기 (기본: 50) |

---

## 1.6 재고(Inventory) 관리

| Method | Endpoint                                        | 설명           |
| ------ | ----------------------------------------------- | -------------- |
| GET    | `/integration/inventory/items`                  | 재고 품목 목록 |
| GET    | `/integration/inventory/items/:id`              | 재고 품목 상세 |
| GET    | `/integration/inventory/items/:id/transactions` | 재고 거래 이력 |
| GET    | `/integration/inventory/alerts`                 | 재고 부족 알림 |
| POST   | `/integration/inventory/items`                  | 재고 품목 생성 |
| PATCH  | `/integration/inventory/items/:id`              | 재고 품목 수정 |
| POST   | `/integration/inventory/items/:id/in`           | 입고           |
| POST   | `/integration/inventory/items/:id/out`          | 출고           |
| POST   | `/integration/inventory/items/:id/adjust`       | 재고 수동 조정 |

### 재고 카테고리 (InventoryCategory)

- `plywood` — 합판
- `steel_plate` — 철판
- `blade` — 칼날
- `sponge` — 스펀지
- `packaging` — 포장재
- `other` — 기타

### POST `/integration/inventory/items` — 품목 생성

```json
{
  "name": "18mm 합판", // 필수
  "category": "plywood", // 필수: InventoryCategory
  "unit": "장", // 필수: 단위
  "currentStock": 100, // 선택 (≥0)
  "minStock": 10, // 선택: 최소 재고 (≥0)
  "width": 1220, // 선택: 가로 (mm)
  "height": 2440, // 선택: 세로 (mm)
  "thickness": 18, // 선택: 두께 (mm)
  "unitPrice": 25000, // 선택: 단가 (원, ≥0)
  "supplier": "목재상사", // 선택
  "location": "A동 1열", // 선택
  "memo": "메모" // 선택
}
```

### POST `/integration/inventory/items/:id/in` — 입고

```json
{
  "quantity": 50, // 필수 (≥0.01)
  "reason": "정기 입고", // 선택
  "actorName": "관리자" // 선택
}
```

### POST `/integration/inventory/items/:id/out` — 출고

```json
{
  "quantity": 5, // 필수 (≥0.01)
  "orderId": "uuid", // 선택: 연결 주문 ID
  "reason": "주문 소모", // 선택
  "actorName": "관리자" // 선택
}
```

### POST `/integration/inventory/items/:id/adjust` — 수동 조정

```json
{
  "newStock": 95, // 필수: 조정할 절대값
  "reason": "실사 조정", // 선택
  "actorName": "관리자" // 선택
}
```

### GET `/integration/inventory/items` — 쿼리 파라미터

| 파라미터   | 타입    | 설명                   |
| ---------- | ------- | ---------------------- |
| `category` | string  | 카테고리 필터          |
| `isActive` | boolean | 활성 여부 필터         |
| `page`     | number  | 페이지 (기본: 1)       |
| `limit`    | number  | 페이지 크기 (기본: 50) |

### GET `/integration/inventory/items/:id/transactions` — 쿼리 파라미터

| 파라미터   | 타입   | 설명                   |
| ---------- | ------ | ---------------------- |
| `type`     | string | 거래 유형 필터         |
| `dateFrom` | string | 시작 날짜              |
| `dateTo`   | string | 종료 날짜              |
| `page`     | number | 페이지 (기본: 1)       |
| `limit`    | number | 페이지 크기 (기본: 50) |

---

## 1.7 프로그램 상태 관리

| Method | Endpoint                          | 설명                      |
| ------ | --------------------------------- | ------------------------- |
| POST   | `/integration/programs/heartbeat` | 하트비트 전송             |
| GET    | `/integration/programs`           | 등록된 프로그램 목록/상태 |

### POST `/integration/programs/heartbeat`

```json
{
  "programType": "management", // 필수: 프로그램 유형
  "instanceName": "office-pc-01", // 필수: 인스턴스 이름
  "version": "1.2.0", // 선택
  "hostname": "DESKTOP-ABC", // 선택
  "metadata": {
    // 선택: 추가 정보
    "cpu_usage": 45,
    "memory_usage": 2048
  }
}
```

---

## 1.8 동기화 로그

| Method | Endpoint                                 | 설명             |
| ------ | ---------------------------------------- | ---------------- |
| POST   | `/integration/sync-logs`                 | 동기화 로그 생성 |
| GET    | `/integration/sync-logs`                 | 동기화 로그 목록 |
| GET    | `/integration/sync-logs/stats`           | 동기화 통계      |
| GET    | `/integration/sync-logs/check-duplicate` | 파일 중복 확인   |

### 동기화 상태 (SyncLogStatus)

- `synced` — 동기화 완료
- `company_not_found` — 업체 미발견
- `api_error` — API 오류
- `duplicate` — 중복
- `skipped` — 건너뜀

### POST `/integration/sync-logs`

```json
{
  "filename": "도면_20240315.dxf", // 필수
  "status": "synced", // 필수: SyncLogStatus
  "companyName": "테스트업체", // 선택
  "contactId": 123, // 선택
  "orderId": "uuid", // 선택
  "errorMessage": "에러 내용", // 선택
  "md5Hash": "abc123...", // 선택: 파일 해시 (중복 검사용)
  "metadata": {} // 선택
}
```

### GET `/integration/sync-logs/check-duplicate`

| 파라미터  | 타입   | 설명                    |
| --------- | ------ | ----------------------- |
| `md5Hash` | string | **필수**: 파일 MD5 해시 |

```json
// Response
{ "duplicate": true }
```

---

## 1.9 DXF 자동 매칭 업로드

| Method | Endpoint                        | 설명                                |
| ------ | ------------------------------- | ----------------------------------- |
| POST   | `/integration/dxf-match/upload` | DXF 파일명에서 workNumber 자동 매칭 |

### POST `/integration/dxf-match/upload`

관리프로그램이 DXF 파일명에서 workNumber를 파싱하여 해당 Contact에 DrawingRevision을 생성한다.

```json
// Request Body
{
  "fileName": "260413-F-001_도면.dxf",  // 필수: 파일명 (YYMMDD-F-NNN 패턴 자동 파싱)
  "fileUrl": "https://r2.example.com/...",  // 필수: 업로드된 파일 URL
  "actorName": "관리프로그램"           // 선택: 프로그램/사용자명 (기본: "관리프로그램")
}

// Response (200)
{
  "matched": true,
  "contactId": "uuid",
  "workNumber": "260413-F-001",
  "revisionVersion": 4
}
```

**에러 (400 BadRequestException):**

매칭 실패 시 `{ "matched": false, "workNumber": "...", "error": "..." }` 형식으로 에러 반환.

---

## 1.10 파일 전송 (미구현)

> 아래 엔드포인트는 예약되어 있으나 현재 501 Not Implemented를 반환합니다.

| Method | Endpoint                             | 설명              |
| ------ | ------------------------------------ | ----------------- |
| POST   | `/integration/file-transfer/queue`   | 파일 전송 큐 등록 |
| GET    | `/integration/file-transfer/status`  | 전송 상태 조회    |
| POST   | `/integration/file-transfer/confirm` | 전송 완료 확인    |

---

# 2. Core API (웹사이트/웹하드)

> **인증**: API Key (`X-API-Key`) 또는 Session Cookie. 일부 엔드포인트는 Public.

---

## 2.1 문의(Contact) 관리

**Prefix**: `/contacts`

### 주요 엔드포인트

| Method | Endpoint                | 인증       | 설명                        |
| ------ | ----------------------- | ---------- | --------------------------- |
| GET    | `/contacts`             | API Key    | 문의 목록 조회              |
| GET    | `/contacts/:id`         | API Key    | 문의 상세 조회              |
| POST   | `/contacts`             | **Public** | 문의 생성 (웹사이트 문의폼) |
| PATCH  | `/contacts/:id`         | API Key    | 문의 수정                   |
| DELETE | `/contacts/:id`         | API Key    | 문의 삭제 (soft/permanent)  |
| POST   | `/contacts/:id/restore` | API Key    | 삭제된 문의 복원            |

### 상태/공정 관리

| Method | Endpoint                      | 인증              | 설명           |
| ------ | ----------------------------- | ----------------- | -------------- |
| GET    | `/contacts/status-counts`     | API Key(job/read) | 상태별 카운트  |
| PATCH  | `/contacts/:id/status`        | Admin/Worker      | 상태 변경      |
| PATCH  | `/contacts/:id/process-stage` | Admin/Worker      | 공정 단계 변경 |
| PATCH  | `/contacts/:id/toggle-urgent` | Admin/Worker      | 긴급 토글      |
| PATCH  | `/contacts/:id/inquiry-type`  | Admin/Worker      | 문의 유형 변경 |

### 타임라인/노트

| Method | Endpoint                      | 인증              | 설명                        |
| ------ | ----------------------------- | ----------------- | --------------------------- |
| GET    | `/contacts/:id/timeline`      | API Key(job/read) | 타임라인 조회               |
| GET    | `/contacts/:id/notes`         | API Key(job/read) | 작업자 노트 목록            |
| POST   | `/contacts/:id/notes`         | Admin/Worker      | 작업자 노트 추가 (최대 3개) |
| DELETE | `/contacts/:id/notes/:noteId` | Admin/Worker      | 작업자 노트 삭제            |

### 도면 워크플로우

| Method | Endpoint                                     | 인증    | 설명                       |
| ------ | -------------------------------------------- | ------- | -------------------------- |
| GET    | `/contacts/:id/latest-drawing`               | API Key | 현재 단계 기준 최신 도면   |
| POST   | `/contacts/:id/company-drawing`              | Company | 거래처 도면 업로드         |
| POST   | `/contacts/:id/link-webhard-file`            | Company | 웹하드 파일 → 문의 연결    |
| POST   | `/contacts/:id/merge-drawing-from/:sourceId` | Admin   | 수동 문의 연결 (도면 이동) |

### 파일/웹하드 정보 (Admin)

| Method | Endpoint                         | 인증  | 설명                     |
| ------ | -------------------------------- | ----- | ------------------------ |
| GET    | `/contacts/:id/drawing-download` | Admin | 첨부파일 다운로드 URL    |
| GET    | `/contacts/:id/file-download`    | Admin | 파일 타입별 다운로드 URL |
| GET    | `/contacts/:id/webhard-info`     | Admin | 웹하드 연동 정보         |

### 배치/유틸리티

| Method | Endpoint                             | 인증              | 설명                       |
| ------ | ------------------------------------ | ----------------- | -------------------------- |
| GET    | `/contacts/count`                    | API Key(job/read) | 조건부 카운트              |
| GET    | `/contacts/recent-ids`               | API Key(job/read) | 최근 문의 ID 목록          |
| GET    | `/contacts/by-company`               | API Key(job/read) | 업체별 문의 목록           |
| GET    | `/contacts/distinct-companies`       | API Key(job/read) | 고유 업체명 목록           |
| GET    | `/contacts/analytics/stage-duration` | API Key(job/read) | 공정별 소요시간 분석       |
| POST   | `/contacts/find-duplicate`           | API Key(job/read) | 중복 체크                  |
| POST   | `/contacts/cleanup`                  | API Key           | 10일 지난 삭제 건 영구삭제 |
| POST   | `/contacts/:id/acknowledge-badge`    | API Key           | 뱃지 확인 처리             |
| POST   | `/contacts/batch-start-delivery`     | API Key           | 일괄 납품 시작             |
| POST   | `/contacts/batch-complete-delivery`  | API Key           | 일괄 납품 완료             |
| DELETE | `/contacts/batch-by-pattern`         | API Key           | 패턴 기반 배치 삭제        |

---

## 2.2 업체(Company) 관리

**Prefix**: `/companies`

| Method | Endpoint                                  | 인증    | 설명                             |
| ------ | ----------------------------------------- | ------- | -------------------------------- |
| GET    | `/companies`                              | API Key | 업체 목록 조회                   |
| GET    | `/companies/names`                        | API Key | 업체명 목록 (셀렉트 박스용)      |
| GET    | `/companies/count`                        | API Key | 업체 수 조회                     |
| GET    | `/companies/recent`                       | API Key | 최근 업체 목록                   |
| GET    | `/companies/:id`                          | API Key | 업체 상세 조회                   |
| GET    | `/companies/by-username/:username`        | API Key | 아이디로 업체 조회               |
| GET    | `/companies/by-name/:name`                | API Key | 업체명으로 조회                  |
| GET    | `/companies/auth/:username`               | API Key | 인증용 조회 (password_hash 포함) |
| POST   | `/companies`                              | API Key | 업체 생성                        |
| POST   | `/companies/check-username`               | API Key | 아이디 중복 체크                 |
| POST   | `/companies/check-business-number`        | API Key | 사업자번호 중복 체크             |
| POST   | `/companies/:id/approve`                  | API Key | 업체 승인                        |
| PATCH  | `/companies/:id`                          | API Key | 업체 수정                        |
| PATCH  | `/companies/:id/status`                   | API Key | 업체 상태 변경                   |
| PATCH  | `/companies/:id/webhard-access`           | API Key | 웹하드 접근 토글                 |
| PATCH  | `/companies/:id/laser-only`               | API Key | 레이저가공 전용 토글             |
| GET    | `/companies/laser-only-mappings`          | API Key | Laser-only mapping list          |
| POST   | `/companies/laser-only-mappings`          | API Key | Add laser-only mapping           |
| DELETE | `/companies/laser-only-mappings/:id`      | API Key | Delete laser-only mapping        |
| PATCH  | `/companies/laser-only-mappings/:id/link` | API Key | Link company to mapping          |

---

## 2.3 파일 관리

**Prefix**: `/files` | **인증**: API Key + Company Access Guard

| Method | Endpoint                    | 설명                           |
| ------ | --------------------------- | ------------------------------ |
| GET    | `/files`                    | 파일 목록 (페이지네이션)       |
| GET    | `/files/search`             | 파일 검색                      |
| GET    | `/files/badge-counts`       | 미다운로드 파일 뱃지 수        |
| GET    | `/files/new`                | 새 파일 (미다운로드) 목록      |
| GET    | `/files/:id/download`       | 다운로드 URL 조회              |
| POST   | `/files/presigned-url`      | 업로드용 presigned URL         |
| POST   | `/files/confirm`            | 업로드 확인 + 메타데이터 저장  |
| POST   | `/files/batch/upload`       | 배치 presigned URL             |
| POST   | `/files/batch/confirm`      | 배치 업로드 확인 (최대 500개)  |
| POST   | `/files/batch/move`         | 배치 파일 이동                 |
| POST   | `/files/batch/delete`       | 배치 파일 삭제                 |
| POST   | `/files/batch/download-zip` | ZIP 압축 다운로드 (최대 100개) |
| POST   | `/files/mark-downloaded`    | 다운로드 완료 표시             |
| PATCH  | `/files/:id/rename`         | 파일 이름 변경                 |
| PATCH  | `/files/:id/move`           | 파일 이동                      |
| DELETE | `/files/:id`                | 파일 삭제 (휴지통)             |

### 대용량 파일 멀티파트 업로드

| Method | Endpoint                    | 설명                 |
| ------ | --------------------------- | -------------------- |
| POST   | `/files/multipart/initiate` | 멀티파트 업로드 시작 |
| POST   | `/files/multipart/presign`  | 파트별 presigned URL |
| POST   | `/files/multipart/complete` | 멀티파트 업로드 완료 |
| POST   | `/files/multipart/abort`    | 멀티파트 업로드 취소 |

---

## 2.4 폴더 관리

**Prefix**: `/folders` | **인증**: API Key + Company Access Guard

| Method | Endpoint                           | 설명                       |
| ------ | ---------------------------------- | -------------------------- |
| GET    | `/folders`                         | 폴더 목록                  |
| GET    | `/folders/tree`                    | 폴더 트리                  |
| GET    | `/folders/children`                | 하위 폴더 (지연 로딩)      |
| GET    | `/folders/template`                | 폴더 템플릿                |
| GET    | `/folders/company-info/:companyId` | 업체 웹하드 접근 정보      |
| GET    | `/folders/:id`                     | 폴더 상세 + 내용물         |
| GET    | `/folders/:id/ancestors`           | 상위 경로 (breadcrumb)     |
| POST   | `/folders`                         | 폴더 생성                  |
| POST   | `/folders/initialize`              | 업체 기본 폴더 구조 초기화 |
| PATCH  | `/folders/:id/rename`              | 폴더 이름 변경             |
| PATCH  | `/folders/:id/move`                | 폴더 이동                  |
| PUT    | `/folders/template`                | 폴더 템플릿 수정           |
| DELETE | `/folders/:id`                     | 폴더 삭제 (soft delete)    |
| DELETE | `/folders/batch-delete`            | 배치 폴더 삭제             |

### 폴더 설정 (Admin)

| Method | Endpoint                           | 설명                    |
| ------ | ---------------------------------- | ----------------------- |
| GET    | `/folders/config/status-mapping`   | 폴더-문의상태 매핑 조회 |
| PUT    | `/folders/config/status-mapping`   | 폴더-문의상태 매핑 수정 |
| GET    | `/folders/config/excluded-folders` | 제외 폴더 목록          |
| PUT    | `/folders/config/excluded-folders` | 제외 폴더 수정          |

---

## 2.5 기타 Core 엔드포인트

### 검색 (`/search`)

| Method | Endpoint  | 인증              | 설명                    |
| ------ | --------- | ----------------- | ----------------------- |
| GET    | `/search` | API Key + Company | 통합 검색 (파일 + 폴더) |

### 휴지통 (`/trash`)

| Method | Endpoint             | 인증              | 설명             |
| ------ | -------------------- | ----------------- | ---------------- |
| GET    | `/trash`             | API Key + Company | 휴지통 파일 목록 |
| GET    | `/trash/count`       | API Key + Company | 휴지통 파일 수   |
| POST   | `/trash/:id/restore` | API Key + Company | 파일 복원        |
| DELETE | `/trash/:id`         | API Key + Company | 파일 영구 삭제   |
| DELETE | `/trash`             | API Key + Company | 휴지통 비우기    |

### 공유 링크 (`/share-links`)

| Method | Endpoint                | 인증              | 설명           |
| ------ | ----------------------- | ----------------- | -------------- |
| GET    | `/share-links`          | API Key + Company | 공유 링크 목록 |
| POST   | `/share-links`          | API Key + Company | 공유 링크 생성 |
| POST   | `/share-links/validate` | API Key + Company | 공유 링크 검증 |

### 알림 (`/notifications`)

| Method | Endpoint                      | 인증    | 설명           |
| ------ | ----------------------------- | ------- | -------------- |
| GET    | `/notifications`              | API Key | 알림 목록      |
| GET    | `/notifications/unread-count` | API Key | 미읽음 알림 수 |
| POST   | `/notifications/:id/read`     | API Key | 알림 읽음 처리 |
| POST   | `/notifications/read-all`     | API Key | 모든 알림 읽음 |

### 저장공간 (`/storage`)

| Method | Endpoint               | 인증              | 설명        |
| ------ | ---------------------- | ----------------- | ----------- |
| GET    | `/storage`             | API Key + Company | 사용량 조회 |
| GET    | `/storage/breakdown`   | API Key + Company | 상세 내역   |
| GET    | `/storage/performance` | Admin             | 성능 메트릭 |

### 활동 로그 (`/activity-logs`)

| Method | Endpoint         | 인증    | 설명           |
| ------ | ---------------- | ------- | -------------- |
| POST   | `/activity-logs` | API Key | 활동 로그 기록 |
| GET    | `/activity-logs` | API Key | 활동 로그 목록 |

### 예약 (`/bookings`)

| Method | Endpoint                          | 인증    | 설명           |
| ------ | --------------------------------- | ------- | -------------- |
| GET    | `/bookings`                       | API Key | 예약 목록      |
| GET    | `/bookings/available`             | API Key | 이용 가능 슬롯 |
| GET    | `/bookings/by-contact/:contactId` | API Key | 문의별 예약    |
| GET    | `/bookings/:id`                   | API Key | 예약 상세      |
| POST   | `/bookings`                       | API Key | 예약 생성      |
| PATCH  | `/bookings/:id`                   | API Key | 예약 수정      |
| DELETE | `/bookings/:id`                   | API Key | 예약 삭제      |

### 피드백 (`/feedback`)

| Method | Endpoint                  | 인증    | 설명             |
| ------ | ------------------------- | ------- | ---------------- |
| GET    | `/feedback`               | API Key | 피드백 목록      |
| GET    | `/feedback/status-counts` | API Key | 상태별 피드백 수 |
| GET    | `/feedback/:id`           | API Key | 피드백 상세      |
| POST   | `/feedback`               | API Key | 피드백 생성      |
| PATCH  | `/feedback/:id`           | API Key | 피드백 수정      |

### 납품업체 (`/delivery-companies`)

| Method | Endpoint                  | 인증    | 설명                           |
| ------ | ------------------------- | ------- | ------------------------------ |
| GET    | `/delivery-companies`     | API Key | 납품업체 목록 (companyId 필수) |
| POST   | `/delivery-companies`     | API Key | 납품업체 생성                  |
| PATCH  | `/delivery-companies/:id` | API Key | 납품업체 수정                  |
| DELETE | `/delivery-companies/:id` | API Key | 납품업체 삭제                  |

### 푸시 구독 (`/push-subscriptions`)

| Method | Endpoint              | 인증    | 설명             |
| ------ | --------------------- | ------- | ---------------- |
| GET    | `/push-subscriptions` | API Key | 워커별 구독 조회 |
| POST   | `/push-subscriptions` | API Key | 구독 등록/갱신   |
| DELETE | `/push-subscriptions` | API Key | 구독 삭제        |

### 동기화 상태 (`/sync`)

| Method | Endpoint      | 인증    | 설명               |
| ------ | ------------- | ------- | ------------------ |
| POST   | `/sync/state` | API Key | 동기화 상태 upsert |
| GET    | `/sync/state` | API Key | 동기화 상태 조회   |

### 세션 (`/sessions`) — Admin

| Method | Endpoint           | 인증  | 설명                   |
| ------ | ------------------ | ----- | ---------------------- |
| POST   | `/sessions/upsert` | Admin | 세션 upsert (하트비트) |
| DELETE | `/sessions`        | Admin | 세션 삭제 (로그아웃)   |
| GET    | `/sessions/count`  | Admin | 활성 세션 수           |
| GET    | `/sessions/list`   | Admin | 활성 세션 목록         |

### 설정 (`/settings`) — Session Auth

| Method | Endpoint    | 인증    | 설명             |
| ------ | ----------- | ------- | ---------------- |
| GET    | `/settings` | Session | 사용자 설정 조회 |
| POST   | `/settings` | Session | 사용자 설정 저장 |

### Public 데이터 (`/public-data`)

| Method | Endpoint                       | 인증       | 설명            |
| ------ | ------------------------------ | ---------- | --------------- |
| GET    | `/public-data/portfolio`       | **Public** | 포트폴리오 목록 |
| GET    | `/public-data/portfolio/count` | **Public** | 포트폴리오 수   |
| GET    | `/public-data/portfolio/:id`   | **Public** | 포트폴리오 상세 |
| POST   | `/public-data/portfolio`       | API Key    | 포트폴리오 생성 |
| PATCH  | `/public-data/portfolio/:id`   | API Key    | 포트폴리오 수정 |
| DELETE | `/public-data/portfolio/:id`   | API Key    | 포트폴리오 삭제 |
| GET    | `/public-data/posts`           | **Public** | 게시글 목록     |
| GET    | `/public-data/posts/count`     | **Public** | 게시글 수       |
| GET    | `/public-data/posts/:id`       | **Public** | 게시글 상세     |
| POST   | `/public-data/posts/:id/view`  | **Public** | 조회수 증가     |
| GET    | `/public-data/dashboard-stats` | **Public** | 대시보드 통계   |

### 백업 (`/backup`)

R2 파일을 NAS로 백업하는 시스템. 프론트엔드에서는 Next.js API route 프록시(`/api/admin/backup/[...path]`)를 경유하여 호출한다. 프록시가 Admin session을 검증한 뒤, NestJS backup API를 ApiKey 인증으로 호출하는 구조.

| Method | Endpoint                     | 인증    | 설명                |
| ------ | ---------------------------- | ------- | ------------------- |
| GET    | `/backup/settings`           | API Key | 백업 설정 조회      |
| PUT    | `/backup/settings`           | API Key | 백업 설정 수정      |
| GET    | `/backup/eligible`           | API Key | 백업 대상 파일 요약 |
| POST   | `/backup/execute`            | API Key | 백업 실행           |
| GET    | `/backup/status`             | API Key | 백업 진행 상태 조회 |
| GET    | `/backup/history`            | API Key | 백업 이력 조회      |
| GET    | `/backup/browse-directories` | API Key | NAS 디렉토리 탐색   |

> **호출 패턴 변경**: 기존에는 프론트엔드에서 NestJS backup API를 SessionAuth로 직접 호출했으나, Next.js API route 프록시(`/api/admin/backup/[...path]`) 경유로 변경. Admin session → ApiKey 이중 인증 구조.

### Health Check (`/health`)

| Method | Endpoint           | 인증       | 설명                        |
| ------ | ------------------ | ---------- | --------------------------- |
| GET    | `/health`          | **Public** | 기본 헬스체크               |
| GET    | `/health/detailed` | API Key    | 상세 헬스체크 (DB + 메모리) |

---

# 3. Worker API (현장 작업 관리)

> Worker 페이지(`/worker/*`)와 Admin 작업관리 페이지에서 사용하는 API입니다.
> 워커(현장 작업자)와 관리자의 접근 권한이 구분됩니다.

---

## 3.1 Worker 전용 (현장 작업자가 사용)

> PIN 로그인 후 Session Cookie로 인증. 모바일 UI(`/worker/*`)에서 호출.

| Method | Endpoint                 | 인증       | 설명                             |
| ------ | ------------------------ | ---------- | -------------------------------- |
| POST   | `/erp/workers/pin-login` | **Public** | PIN 로그인 + IP 검증             |
| GET    | `/erp/tasks/today`       | Session    | 오늘 할당된 작업 목록 (모바일용) |
| GET    | `/erp/tasks/:id`         | Session    | 작업 상세 조회                   |
| PATCH  | `/erp/tasks/:id/status`  | Session    | 작업 상태 변경 (시작/완료 등)    |
| GET    | `/erp/dashboard`         | Session    | 대시보드 통계                    |
| GET    | `/erp/machines`          | Session    | 기계 목록 조회 (activeOnly 필터) |
| GET    | `/erp/machines/:id`      | Session    | 기계 상세 조회                   |

---

## 3.2 Admin 전용 (관리자가 사용)

> Admin 세션으로 인증. 관리 대시보드(`/admin/*`)에서 호출.

### 작업(Task) 관리

| Method | Endpoint                   | 인증  | 설명                   |
| ------ | -------------------------- | ----- | ---------------------- |
| GET    | `/erp/tasks`               | Admin | 작업 목록 (전체, 필터) |
| GET    | `/erp/tasks/kanban`        | Admin | 칸반 보드 데이터       |
| POST   | `/erp/tasks`               | Admin | 작업 생성              |
| PATCH  | `/erp/tasks/:id`           | Admin | 작업 수정              |
| PATCH  | `/erp/tasks/batch/reorder` | Admin | 작업 순서 변경         |
| DELETE | `/erp/tasks/:id`           | Admin | 작업 삭제              |
| POST   | `/erp/tasks/batch/delete`  | Admin | 배치 작업 삭제         |

### 기계(Machine) 관리

| Method | Endpoint            | 인증  | 설명      |
| ------ | ------------------- | ----- | --------- |
| POST   | `/erp/machines`     | Admin | 기계 생성 |
| PATCH  | `/erp/machines/:id` | Admin | 기계 수정 |
| DELETE | `/erp/machines/:id` | Admin | 기계 삭제 |

### 작업자(Worker) 관리

| Method | Endpoint           | 인증  | 설명      |
| ------ | ------------------ | ----- | --------- |
| GET    | `/erp/workers`     | Admin | 워커 목록 |
| GET    | `/erp/workers/:id` | Admin | 워커 상세 |
| POST   | `/erp/workers`     | Admin | 워커 생성 |
| PATCH  | `/erp/workers/:id` | Admin | 워커 수정 |
| DELETE | `/erp/workers/:id` | Admin | 워커 삭제 |

### 접근 로그

| Method | Endpoint                 | 인증  | 설명           |
| ------ | ------------------------ | ----- | -------------- |
| GET    | `/erp/access-logs`       | Admin | 접근 로그 조회 |
| GET    | `/erp/access-logs/stats` | Admin | 접근 로그 통계 |

---

# 에러 처리

모든 API는 일관된 에러 응답 형식을 사용합니다:

```json
{
  "statusCode": 400,
  "message": "에러 메시지",
  "error": "Bad Request"
}
```

### Validation 에러 (400)

```json
{
  "statusCode": 400,
  "message": ["companyName must be a string", "title should not be empty"],
  "error": "Bad Request"
}
```

### 주요 HTTP 상태 코드

| 코드  | 의미                                |
| ----- | ----------------------------------- |
| `200` | 성공                                |
| `201` | 생성 성공                           |
| `400` | 잘못된 요청 (validation 실패)       |
| `401` | 인증 실패 (API Key 누락/잘못됨)     |
| `403` | 권한 없음                           |
| `404` | 리소스 없음                         |
| `409` | 상태 전환 불가 (유효하지 않은 전환) |
| `500` | 서버 오류                           |
| `501` | 미구현 (file-transfer 등)           |

---

# 빠른 시작 가이드 (외부 프로그램)

## 1. API Key 발급

관리자 대시보드에서 API Key를 발급받습니다.

## 2. 연결 테스트

```bash
curl -H "X-API-Key: YOUR_KEY" https://api.yjlaser.com/api/v1/health/detailed
```

## 3. 하트비트 전송

```bash
curl -X POST https://api.yjlaser.com/api/v1/integration/programs/heartbeat \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"programType":"management","instanceName":"office-pc"}'
```

## 4. 주문 조회

```bash
curl -H "X-API-Key: YOUR_KEY" \
  "https://api.yjlaser.com/api/v1/integration/orders?status=production&limit=10"
```

## 5. 주문 상태 변경

```bash
curl -X PATCH https://api.yjlaser.com/api/v1/integration/orders/ORDER_ID/status \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"cutting","actorName":"관리프로그램","message":"레이저 가공 시작"}'
```

---

> **최종 업데이트**: 2026-04-16 | 코드 기반 자동 생성
