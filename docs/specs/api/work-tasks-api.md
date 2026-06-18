# Work Tasks API Spec (외부 프로그램 연동용)

This document describes the API contracts for external programs to interact with the work tasks system.

## Authentication

All endpoints require `X-API-Key` header or Admin session authentication.

## Work Categories

| Category | Process Stages                                          | Description                               |
| -------- | ------------------------------------------------------- | ----------------------------------------- |
| office   | null, drawing, sample                                   | 사무실 작업: 문의 접수 ~ 샘플제작 및 확인 |
| field    | drawing_confirmed, laser, cutting, inspection, delivery | 현장 작업: 도면 확정 ~ 납품               |

## Endpoints

### GET /api/admin/contacts?workCategory={office|field}

List contacts filtered by work category.

**Query Parameters:**

| Param         | Type   | Required | Description                                                                                                             |
| ------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| workCategory  | string | No       | `office` or `field`                                                                                                     |
| status        | string | No       | Contact status filter (all, received, drawing, confirmed, production, cutting, finishing, delivered, on_hold, deleting) |
| search        | string | No       | Search by inquiry_number, company_name, inquiry_title                                                                   |
| page          | number | No       | Page number (default: 1)                                                                                                |
| processStages | string | No       | Comma-separated process stage filter                                                                                    |

**Response:**

```json
{
  "contacts": [
    {
      "id": 1,
      "inquiry_number": "260313-1",
      "inquiry_title": "패키지 제작",
      "company_name": "원컴퍼니",
      "status": "drawing",
      "process_stage": "drawing",
      "created_at": "2026-03-13T09:00:00Z",
      "updated_at": "2026-03-13T10:30:00Z"
    }
  ],
  "totalCount": 25,
  "hasMore": true,
  "statusCounts": { ... }
}
```

### PUT /api/contacts/[id] (status/process_stage update)

Update a contact's status or process stage.

**Request Body:**

```json
{
  "status": "drawing",
  "process_stage": "drawing"
}
```

**Valid process_stage values:**

| Value             | Label                 | Category |
| ----------------- | --------------------- | -------- |
| null              | 공정 시작 전          | office   |
| drawing           | 도면작업              | office   |
| sample            | 샘플제작 및 확인      | office   |
| drawing_confirmed | 도면 확정 및 목형의뢰 | field    |
| laser             | 레이저 가공           | field    |
| cutting           | 칼 / 오시 작업        | field    |
| inspection        | 검수                  | field    |
| delivery          | 납품                  | field    |

## Future Endpoints (planned, not yet implemented)

### POST /api/integration/auto-contact

Auto-create a contact when files are detected in external webhard.

**Request Body:**

```json
{
  "source": "external_webhard",
  "folder": "올리기전용/업체명",
  "company_name": "업체명",
  "files": ["도면.dxf", "참고.pdf"],
  "initial_stage": "drawing"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 42,
    "inquiry_number": "260313-5"
  }
}
```

### POST /api/worker/office/status-request

Office worker requests status update for a contact.

**Request Body:**

```json
{
  "contact_id": 42,
  "requested_stage": "sample",
  "note": "샘플 제작 완료"
}
```

### POST /api/worker/field/status-request

Field worker requests status update for a contact.

**Request Body:**

```json
{
  "contact_id": 42,
  "requested_stage": "laser",
  "note": "레이저 가공 시작"
}
```
