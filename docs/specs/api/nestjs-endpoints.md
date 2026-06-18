# NestJS API Endpoints

Base: `webhard-api/src/`
Prefix: `/api/v1`

## 프로젝트 참조 경로

다른 프로젝트에서 이 API를 연동할 때 아래 경로를 참조하세요.

### API 문서 경로

```
yjlaser_website/docs/specs/api/nestjs-endpoints.md          ← 이 파일 (인덱스)
yjlaser_website/docs/specs/api/endpoints/integration.md      ← Integration API 상세 (46 endpoints)
yjlaser_website/docs/specs/api/endpoints/webhard.md           ← Webhard API 상세 (50 endpoints)
```

### API 서버 접속 정보

```
개발: http://localhost:4000/api/v1
운영: NESTJS_API_URL 환경변수 참조 (e.g. https://api.yjlaser.com/api/v1)
인증: X-API-Key 헤더 (API 키는 관리자 페이지에서 발급)
```

### 외부 프로그램별 참조 파일

| 프로그램                    | 위치                                                      | 참조할 API 문서                                     |
| --------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| yjlaser_api_client          | `yjlaser_api_client/client.py`                            | `endpoints/integration.md`                          |
| 외부웹하드동기화프로그램    | `외부웹하드동기화프로그램/src/self-webhard/api-client.ts` | `endpoints/integration.md` + `endpoints/webhard.md` |
| 유진레이저목형 관리프로그램 | `유진레이저목형 관리프로그램/invoice_manager/`            | `endpoints/integration.md` (via api_client)         |
| 레이저네스팅프로그램        | `레이저네스팅프로그램/`                                   | `endpoints/integration.md` (via api_client)         |

### 소스 코드 경로 (컨트롤러)

```
yjlaser_website/webhard-api/src/
  ├── auth/
  │   ├── find-id.controller.ts                # 거래처 아이디 안내 메일 (1 endpoint)
  │   └── password-reset.controller.ts         # 거래처 비밀번호 reset-link (2 endpoints)
  ├── integration/
  │   ├── programs/programs.controller.ts      # 프로그램 하트비트 (2 endpoints)
  │   ├── events/events.controller.ts          # 이벤트 기록 (3 endpoints)
  │   ├── orders/orders.controller.ts          # 주문 관리 (10 endpoints)
  │   ├── orders/auto-contact.controller.ts    # 자동 문의 생성 (1 endpoint)
  │   ├── delivery/delivery.controller.ts      # 납품 관리 (6 endpoints)
  │   ├── inventory/inventory.controller.ts    # 재고 관리 (9 endpoints)
  │   ├── sync-log/sync-log.controller.ts      # 동기화 로그 (4 endpoints)
  │   ├── auth/api-key.controller.ts           # API 키 관리 (3 endpoints)
  │   ├── drawing-revisions/drawing-revisions.controller.ts  # 외부 프로그램 도면 수정 등록 (1 endpoint)
  │   ├── dxf-match/dxf-match.controller.ts                 # DXF 파일명 자동 매칭 (1 endpoint)
  │   ├── nesting-tasks/nesting-tasks.controller.ts          # 네스팅 작업 큐 (3 endpoints)
  │   └── file-transfer/file-transfer.controller.ts  # 파일 전송 (3, 미구현)
  ├── files/files.controller.ts                # 파일 CRUD (20 endpoints)
  ├── folders/folders.controller.ts            # 폴더 CRUD (19 endpoints)
  ├── trash/trash.controller.ts                # 휴지통 (5 endpoints)
  ├── search/search.controller.ts              # 검색 (1 endpoint)
  ├── storage/storage.controller.ts            # 저장공간/진단 (4 endpoints)
  ├── storage/storage-drive-webhook.controller.ts # Google Drive change webhook (1 endpoint)
  └── sync/sync.controller.ts                  # 동기화 상태 (2 endpoints)
```

## Authentication

| Guard              | Method                                   | Used By                                         |
| ------------------ | ---------------------------------------- | ----------------------------------------------- |
| ApiKeyGuard        | `X-API-Key` header or allowed session    | 외부 프로그램, 동기화앱, 내부 worker 허용 route |
| CompanyAccessGuard | `X-Company-Id` header (with ApiKeyGuard) | 웹하드 파일/폴더 접근                           |
| SessionAuthGuard   | Session cookie                           | 관리자/작업자 웹 UI                             |
| AdminGuard         | Session + admin role                     | 관리자 전용 기능                                |
| @Public()          | None                                     | 공개 엔드포인트 (문의 등록 등)                  |

### Principal Separation

`X-API-Key` requests are integration principals, not admin sessions. `ApiKeyGuard` may attach integration metadata for explicitly integration-scoped controllers, but `AdminGuard` must accept only verified admin session principals. Webhard files/folders routes behind `CompanyAccessGuard` allow integration principals only on handlers marked as explicit integration endpoints; generic company-scoped listing/tree/detail routes stay session-scoped and service-filtered. Worker session access to contacts, files, folders, and realtime rooms is scoped through the worker-visible contact/file policy and must not inherit stale admin/company cookies from the same browser.

## Common Patterns

### Pagination

```
Request: ?page=1&limit=50
Response: { data: [...], total: number, page: number, totalPages: number }
```

### Error Response

```json
{ "statusCode": 400, "message": "...", "error": "Bad Request" }
```

### Date Format

ISO 8601: `2026-03-24T09:30:00.000Z`

## External Program API Map

| Program                               | Endpoints                                                                 | Auth      |
| ------------------------------------- | ------------------------------------------------------------------------- | --------- |
| yjlaser_api_client (Python)           | integration/programs, events, orders, sync-logs, contacts/auto, inventory | X-API-Key |
| 외부웹하드동기화프로그램 (TypeScript) | files/_, folders/_, integration/orders, events                            | X-API-Key |
| 유진레이저목형 관리프로그램 (Python)  | integration/programs, events, orders (via api_client)                     | X-API-Key |
| 레이저네스팅프로그램                  | integration/nesting-tasks, laser-completions, programs, events, inventory | X-API-Key |

## Detailed API Documentation

### External Integration APIs (for external programs)

- **[Integration API](endpoints/integration.md)** — 외부 프로그램 연동 (46 endpoints)
  - Programs, Events, Orders, Deliveries, Inventory, Sync Logs, API Keys, Auto Contact, Drawing Revisions, DXF Match (`dxf-match/upload`), Nesting Tasks, File Transfer
- **[Webhard API](endpoints/webhard.md)** — 파일/폴더 관리 (50 endpoints)
  - Files, Folders, Trash, Search, Storage, Sync

### Internal APIs (browser frontend only, not documented in detail)

Below is a summary of internal APIs used only by the web frontend (Next.js).
These are NOT called by external programs.

#### Settings (`settings.controller.ts`)

| Method | Path             | Auth    | Description          |
| ------ | ---------------- | ------- | -------------------- |
| GET    | /api/v1/settings | Session | Get user settings    |
| POST   | /api/v1/settings | Session | Update user settings |

#### Health (`health.controller.ts`)

| Method | Path           | Auth | Description  |
| ------ | -------------- | ---- | ------------ |
| GET    | /api/v1/health | None | Health check |

#### Auth (`auth/find-id.controller.ts`, `auth/password-reset.controller.ts`)

| Method | Path                                | Auth                             | Description                       |
| ------ | ----------------------------------- | -------------------------------- | --------------------------------- |
| POST   | /api/v1/auth/find-id/request        | Account recovery key via Next.js | Request company username reminder |
| POST   | /api/v1/auth/password-reset/request | Account recovery key via Next.js | Request company reset link        |
| POST   | /api/v1/auth/password-reset/confirm | Account recovery key via Next.js | Confirm reset token + password    |

세 endpoint는 `X-Account-Recovery-Key` header를 `ACCOUNT_RECOVERY_API_KEY`와 constant-time 비교하는 `RecoveryApiKeyGuard` 뒤에 둔다. development localhost/loopback 요청에서는 env가 없어도 dev-only 기본 recovery key를 허용하지만, staging/test/production 또는 non-loopback 요청에서는 공개 dev key를 거부한다. production에서는 `ACCOUNT_RECOVERY_API_KEY`가 없으면 요청을 거부한다. 기존 외부 프로그램용 `X-API-Key`와 `MIGRATION_API_KEY`는 계정 복구 endpoint 인증에 사용하지 않는다.

`find-id/request` 는 `companyName`/`email`/`phone` 이 active + approved 업체 정보와 모두 일치할 때만 등록 이메일로 아이디 안내 메일 발송을 예약한다. 응답에는 전체/마스킹 아이디를 포함하지 않고, 일치/불일치/메일 실패/발송 제한 초과 모두 generic success 계약을 유지한다.

`password-reset/request` 는 username/email 이 active + approved 업체 정보와 일치할 때만 `password_reset_tokens` 에 SHA-256 token hash 를 저장하고 reset link 메일 발송을 예약한다. reset link는 `/reset-password#token=...` fragment 형식으로 발급해 서버 request URL에 raw token이 포함되지 않게 한다. development localhost/loopback 요청은 `X-Account-Recovery-Origin`을 reset link base URL로 사용할 수 있고, production은 request origin을 무시하고 `NEXT_PUBLIC_SITE_URL`/`FRONTEND_URL` 설정 URL을 사용한다. 불일치 계정은 동일한 성공 메시지만 반환하며 토큰/메일을 만들지 않는다. post-lookup 발송 제한 초과 또는 reset token 저장소 장애는 token 생성과 메일 발송을 억제하되 generic success 응답을 유지한다. 기존 비밀번호는 `confirm` 성공 전까지 변경하지 않는다.

`confirm` 은 raw token 을 저장된 hash 와 비교하고, 미사용·미만료 토큰을 transaction 안에서 1회 사용 처리한 뒤 `companies.password_hash` 를 bcrypt hash 로 갱신한다.

계정 복구 request 경로는 `AccountRecoveryRateLimitService`로 pre-lookup IP/fingerprint 제한을 적용한다. production에서 Upstash 설정이 없거나 Redis check가 실패하면 fail closed로 `503`을 반환한다. `AccountRecoveryTiming`은 입력 검증/rate limit 이후 generic success 응답이 같은 minimum response floor를 거치게 한다.

#### ERP Module (SessionAuthGuard)

##### Dashboard

| Method | Path                  | Auth    | Description     |
| ------ | --------------------- | ------- | --------------- |
| GET    | /api/v1/erp/dashboard | Session | Dashboard stats |

##### Machines

| Method | Path                     | Auth          | Description    |
| ------ | ------------------------ | ------------- | -------------- |
| GET    | /api/v1/erp/machines     | Session       | List machines  |
| GET    | /api/v1/erp/machines/:id | Session       | Machine detail |
| POST   | /api/v1/erp/machines     | Session+Admin | Create machine |
| PATCH  | /api/v1/erp/machines/:id | Session+Admin | Update machine |
| DELETE | /api/v1/erp/machines/:id | Session+Admin | Delete machine |

##### Tasks

| Method | Path                            | Auth          | Description   |
| ------ | ------------------------------- | ------------- | ------------- |
| GET    | /api/v1/erp/tasks               | Session       | List tasks    |
| GET    | /api/v1/erp/tasks/today         | Session       | Today's tasks |
| GET    | /api/v1/erp/tasks/kanban        | Session       | Kanban board  |
| GET    | /api/v1/erp/tasks/:id           | Session       | Task detail   |
| POST   | /api/v1/erp/tasks               | Session+Admin | Create task   |
| PATCH  | /api/v1/erp/tasks/:id           | Session+Admin | Update task   |
| PATCH  | /api/v1/erp/tasks/:id/status    | Session       | Change status |
| PATCH  | /api/v1/erp/tasks/batch/reorder | Session+Admin | Reorder tasks |
| DELETE | /api/v1/erp/tasks/:id           | Session+Admin | Delete task   |
| POST   | /api/v1/erp/tasks/batch/delete  | Session+Admin | Batch delete  |

##### Workers

| Method | Path                          | Auth          | Description   |
| ------ | ----------------------------- | ------------- | ------------- |
| POST   | /api/v1/erp/workers/pin-login | None          | PIN login     |
| GET    | /api/v1/erp/workers           | Session+Admin | List workers  |
| GET    | /api/v1/erp/workers/:id       | Session+Admin | Worker detail |
| POST   | /api/v1/erp/workers           | Session+Admin | Create worker |
| PATCH  | /api/v1/erp/workers/:id       | Session+Admin | Update worker |
| DELETE | /api/v1/erp/workers/:id       | Session+Admin | Delete worker |

`POST /api/v1/erp/workers/pin-login` 실패 응답은 `reason`을 포함한다.

```typescript
type PinLoginFailureReason = 'rate_limited' | 'invalid_credentials' | 'ip_blocked';

interface PinLoginFailureResponse {
  success: false;
  worker: null;
  message: string;
  reason: PinLoginFailureReason;
  retry_after_seconds?: number;
}
```

- `rate_limited`: 동일 IP 최근 5분 `login_failed` 5회 이상. `retry_after_seconds` 포함.
- `invalid_credentials`: 이름 또는 PIN 불일치. PIN 원문은 log metadata에 저장하지 않는다.
- `ip_blocked`: worker별 IP whitelist 정책에 의해 차단.

##### Access Logs

| Method | Path                          | Auth          | Description      |
| ------ | ----------------------------- | ------------- | ---------------- |
| GET    | /api/v1/erp/access-logs       | Session+Admin | List access logs |
| GET    | /api/v1/erp/access-logs/stats | Session+Admin | Access log stats |

#### CRM Module

##### Contacts (ApiKeyGuard, POST /contacts is @Public)

Contacts worker mutation route 중 `@AllowWorkerSession()`이 붙은 endpoint는 `erp-session` cookie를 직접 검증할 수 있다. 이 허용은 route 단위로만 적용되며, 일반 API key 요청이 body에 `actorType='worker'`를 넣어 worker actor를 위조하면 `403`으로 거부한다. 검증된 worker session 요청은 body의 `actorName`을 신뢰하지 않고 session의 `workerName`으로 actor를 확정한다. Next.js worker/admin actor mutation client는 이 경로를 위해 `X-API-Key` 대신 session cookie + CSRF token을 전달한다. Company session의 drawing revision 생성/upload URL 요청은 문의 소유권을 검증한 뒤 `company` actor로만 허용한다.

| Method | Path                                                      | Auth                      | Description                                                        |
| ------ | --------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| GET    | /api/v1/contacts                                          | API Key                   | 문의 목록 조회                                                     |
| GET    | /api/v1/contacts/status-counts                            | API Key                   | 상태별 카운트                                                      |
| GET    | /api/v1/contacts/analytics/stage-duration                 | API Key                   | 공정별 소요시간 분석                                               |
| GET    | /api/v1/contacts/count                                    | API Key                   | 조건부 카운트                                                      |
| GET    | /api/v1/contacts/recent-ids                               | API Key                   | 최근 문의 ID 목록                                                  |
| GET    | /api/v1/contacts/by-company                               | API Key                   | 업체별 문의 목록                                                   |
| GET    | /api/v1/contacts/distinct-companies                       | API Key                   | 고유 업체명 목록                                                   |
| GET    | /api/v1/contacts/:id                                      | API Key                   | 문의 단건 조회                                                     |
| GET    | /api/v1/contacts/:id/drawing-download                     | API Key                   | 첨부파일 presigned URL                                             |
| GET    | /api/v1/contacts/:id/file-download                        | API Key                   | 파일 타입별 presigned URL                                          |
| GET    | /api/v1/contacts/:id/webhard-info                         | API Key                   | 웹하드 연동 정보                                                   |
| GET    | /api/v1/contacts/:id/timeline                             | API Key                   | 타임라인 조회                                                      |
| POST   | /api/v1/contacts                                          | None                      | 문의 생성 (공개 폼)                                                |
| POST   | /api/v1/contacts/cleanup                                  | API Key                   | 10일 지난 삭제 건 영구삭제                                         |
| POST   | /api/v1/contacts/find-duplicate                           | API Key                   | 중복 체크                                                          |
| POST   | /api/v1/contacts/backfill-timeline                        | API Key                   | 타임라인 백필 (일회성)                                             |
| POST   | /api/v1/contacts/:id/acknowledge-badge                    | API Key                   | 뱃지 확인                                                          |
| POST   | /api/v1/contacts/:id/restore                              | API Key                   | 삭제 복원                                                          |
| POST   | /api/v1/contacts/:id/complete-laser                       | API Key \| Worker Session | 레이저 전용 문의 즉시 완료                                         |
| PATCH  | /api/v1/contacts/:id                                      | API Key                   | 문의 수정                                                          |
| PATCH  | /api/v1/contacts/:id/status                               | API Key \| Worker Session | 상태 변경                                                          |
| PATCH  | /api/v1/contacts/:id/process-stage                        | API Key \| Worker Session | 공정 단계 변경                                                     |
| PATCH  | /api/v1/contacts/:id/inquiry-type                         | API Key \| Worker Session | 문의 유형 변경                                                     |
| DELETE | /api/v1/contacts/:id                                      | API Key                   | 삭제 (soft/permanent)                                              |
| DELETE | /api/v1/contacts/batch-by-pattern                         | API Key                   | 배치 삭제 (company_name 패턴)                                      |
| DELETE | /api/v1/contacts/delete-all                               | API Key                   | 전체 삭제 (개발 서버 전용)                                         |
| POST   | /api/v1/contacts/:id/split                                | API Key \| Worker Session | 문의 분할 (N개 하위 문의 생성)                                     |
| GET    | /api/v1/contacts/:id/children                             | API Key                   | 하위 문의 목록 조회                                                |
| PATCH  | /api/v1/contacts/:id/stage-completed                      | API Key \| Worker Session | 단계 완료 체크 토글                                                |
| POST   | /api/v1/contacts/:id/children/advance-stage               | API Key \| Worker Session | 그룹 일괄 다음 단계 이동                                           |
| GET    | /api/v1/contacts/:id/drawing-revisions                    | API Key \| Worker Session | 도면 수정 이력 조회                                                |
| POST   | /api/v1/contacts/:id/drawing-revisions                    | API Key \| Worker Session | 도면 수정 등록 — 응답에 옵셔널 `webhardWarning?` 필드(§ 아래 참조) |
| POST   | /api/v1/contacts/:id/drawing-revisions/upload-urls        | API Key \| Worker Session | 도면 업로드 presigned URL                                          |
| GET    | /api/v1/contacts/drawing-revisions/:revisionId            | API Key                   | 접근 제어용 revision 메타데이터                                    |
| GET    | /api/v1/contacts/drawing-revisions/:revisionId/download   | API Key                   | 도면 파일 다운로드 URL                                             |
| PATCH  | /api/v1/contacts/drawing-revisions/:revisionId/visibility | API Key                   | 공개 여부 변경                                                     |
| GET    | /api/v1/contacts/:id/latest-drawing                       | API Key                   | 현재 단계 기준 최신 도면                                           |
| POST   | /api/v1/contacts/:id/company-drawing                      | Company                   | 거래처 도면 업로드                                                 |
| POST   | /api/v1/contacts/:id/link-webhard-file                    | Company                   | 웹하드 파일 → 문의 연결                                            |
| POST   | /api/v1/contacts/:id/merge-drawing-from/:sourceId         | Admin                     | 수동 문의 연결 (도면 이동)                                         |

##### Files Worker Read Boundary

`GET /api/v1/files`와 `GET /api/v1/files/:id/download`는 worker UI read-only 경로를 위해 `@AllowWorkerSession()`을 허용한다. Worker session은 이 두 endpoint에서만 `erp-session`으로 인증되며, 파일 생성/수정/삭제/이동/upload-confirm 계열 endpoint는 worker session을 허용하지 않는다.

##### Contacts WebSocket Events

| Event                          | Payload                              | 설명                                |
| ------------------------------ | ------------------------------------ | ----------------------------------- |
| `contact:updated`              | Contact (with children)              | 문의 업데이트 (분할 하위 완료 포함) |
| `contact:group-stage-advanced` | `{ parentId, childIds, nextStage }`  | 그룹 일괄 단계 이동                 |
| `contact:split`                | `{ parentId, splitCount, children }` | 문의 분할                           |

##### GET /api/v1/contacts/:id/timeline — 통합 타임라인 응답 shape

`ContactStatusHistory`와 `DrawingRevision`을 서버에서 인터리브하여 단일 시간순 배열로 반환한다. 각 항목은 `kind` 필드로 구분되며, camelCase로 직렬화된다.

```typescript
interface TimelineResponse {
  timeline: Array<{
    id: string;
    kind: 'status_change' | 'drawing_revision';
    createdAt: string; // ISO 8601 — camelCase
    actorType: 'admin' | 'worker' | 'system' | 'external' | 'company';
    actorName: string | null;
    color?: string;
    payload: StatusChangePayload | DrawingRevisionPayload;
  }>;
}

interface StatusChangePayload {
  changeType: string; // 'status' | 'process_stage' | 'type' 등 (DB changeType 매핑)
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown>;
}

interface DrawingRevisionPayload {
  revisionId: string;
  version: number;
  processStage: string | null;
  reason: string;
  reasonDetail: string | null;
  files: Array<{ url: string; name: string; size: number; mimeType: string }>;
  isPublic: boolean;
  note: string | null; // 거래처 응답에서는 항상 null로 마스킹
}
```

DB `changeType` → 응답 `payload.changeType` 매핑:

- `status_change` → `status`
- `process_stage_change` → `process_stage`
- `inquiry_type_change` → `type`
- 그 외는 원본 유지

**거래처 응답 필터 정책 (서버 강제):**

- `kind === 'drawing_revision'` 항목은 `payload.isPublic === true`인 것만 포함
- 모든 항목의 `actorName`/`actorType`은 "YJLaser"로 마스킹
- `kind === 'drawing_revision'` 항목의 `payload.note`는 응답에서 제거

상세 동작은 `docs/specs/features/drawing-workflow.md` 섹션 B 참고.

**Fallback 동작**: 실제 `contact_status_history` / `drawing_revisions` 테이블이 모두
비어있을 때, 서버는 `contacts` 테이블 자체에서 최소 이벤트 2개(`created`,
필요 시 `drawing_revision initial`)를 파생하여 응답한다. 이는 과거 fire-and-forget
실패분에 대한 안전망이며, 실데이터가 한 건이라도 존재하면 비활성화된다.

##### Companies (ApiKeyGuard)

| Method | Path                                           | Auth          | Description                                                                                                  |
| ------ | ---------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | /api/v1/companies                              | API Key       | 업체 목록 조회                                                                                               |
| GET    | /api/v1/companies/names                        | API Key       | 업체명 목록 (셀렉트용)                                                                                       |
| GET    | /api/v1/companies/count                        | API Key       | 업체 수 조회                                                                                                 |
| GET    | /api/v1/companies/recent                       | API Key       | 최근 업체 목록                                                                                               |
| GET    | /api/v1/companies/by-username/:username        | API Key       | username으로 조회                                                                                            |
| GET    | /api/v1/companies/by-name/:name                | API Key       | 업체명으로 조회                                                                                              |
| GET    | /api/v1/companies/auth/:username               | API Key       | 인증용 조회 (hash 포함)                                                                                      |
| GET    | /api/v1/companies/:id                          | API Key       | 업체 상세 조회                                                                                               |
| POST   | /api/v1/companies                              | API Key       | 업체 생성                                                                                                    |
| POST   | /api/v1/companies/check-username               | API Key       | username 중복 체크                                                                                           |
| POST   | /api/v1/companies/check-business-number        | API Key       | 사업자번호 중복 체크                                                                                         |
| POST   | /api/v1/companies/:id/approve                  | API Key       | 업체 승인                                                                                                    |
| POST   | /api/v1/companies/:id/drive-provisioning/retry | API Key       | Google Drive 업체 폴더 provisioning 재시도                                                                   |
| DELETE | /api/v1/companies/:id                          | Admin session | 업체 삭제 대기 + 매칭 웹하드 루트 폴더 휴지통 이동. Drive id 누락/Drive 404는 repair 로그 후 DB 삭제 계속    |
| POST   | /api/v1/companies/:id/restore                  | Admin session | 30일 이내 업체 복구 + 업체 삭제 마커 웹하드 항목 복구. Drive id 누락/Drive 404는 repair 로그 후 DB 복구 계속 |
| PATCH  | /api/v1/companies/:id                          | API Key       | 업체 수정                                                                                                    |
| PATCH  | /api/v1/companies/:id/status                   | API Key       | 상태 변경                                                                                                    |
| PATCH  | /api/v1/companies/:id/webhard-access           | API Key       | 웹하드 접근 토글                                                                                             |
| GET    | /api/v1/companies/laser-only-mappings          | API Key       | Laser-only mapping list                                                                                      |
| POST   | /api/v1/companies/laser-only-mappings          | API Key       | Add laser-only mapping                                                                                       |
| DELETE | /api/v1/companies/laser-only-mappings/:id      | API Key       | Delete laser-only mapping                                                                                    |
| PATCH  | /api/v1/companies/laser-only-mappings/:id/link | API Key       | Link company to mapping + contact companyName sync                                                           |
| GET    | /api/v1/companies/folder-aliases               | Admin         | Folder alias 목록 (status 필터, 페이지네이션)                                                                |
| POST   | /api/v1/companies/folder-aliases               | Admin         | Admin 매뉴얼 매핑 + 즉시 approved (task 25)                                                                  |
| POST   | /api/v1/companies/folder-aliases/:id/approve   | Admin         | Alias 승인 + 동일 folderName 다른 pending → reject                                                           |
| PATCH  | /api/v1/companies/folder-aliases/:id/reject    | Admin         | Alias 거절 (status=rejected)                                                                                 |
| DELETE | /api/v1/companies/folder-aliases/:id           | Admin         | Alias hard delete                                                                                            |

##### Bookings (ApiKeyGuard)

| Method | Path                                   | Auth    | Description      |
| ------ | -------------------------------------- | ------- | ---------------- |
| GET    | /api/v1/bookings                       | API Key | 예약 목록 조회   |
| GET    | /api/v1/bookings/available             | API Key | 가용 슬롯 조회   |
| GET    | /api/v1/bookings/by-contact/:contactId | API Key | 문의별 예약 조회 |
| GET    | /api/v1/bookings/:id                   | API Key | 예약 단건 조회   |
| POST   | /api/v1/bookings                       | API Key | 예약 생성        |
| PATCH  | /api/v1/bookings/:id                   | API Key | 예약 수정        |
| DELETE | /api/v1/bookings/:id                   | API Key | 예약 삭제        |

#### Other Modules

##### Notifications (ApiKeyGuard)

| Method | Path                                 | Auth    | Description                            |
| ------ | ------------------------------------ | ------- | -------------------------------------- |
| GET    | /api/v1/notifications                | API Key | 알림 목록 조회, optional `category`    |
| GET    | /api/v1/notifications/unread-count   | API Key | 읽지 않은 알림 수, optional `category` |
| GET    | /api/v1/notifications/unread-summary | API Key | 카테고리별 읽지 않은 알림 수           |
| POST   | /api/v1/notifications/:id/read       | API Key | 알림 읽음 처리                         |
| POST   | /api/v1/notifications/read-all       | API Key | 모든 알림 읽음 처리                    |

##### Feedback (ApiKeyGuard)

| Method | Path                           | Auth    | Description               |
| ------ | ------------------------------ | ------- | ------------------------- |
| GET    | /api/v1/feedback               | API Key | 피드백 목록 조회          |
| GET    | /api/v1/feedback/status-counts | API Key | 상태별 카운트             |
| GET    | /api/v1/feedback/:id           | API Key | 피드백 단건 조회          |
| POST   | /api/v1/feedback               | API Key | 피드백 생성               |
| PATCH  | /api/v1/feedback/:id           | API Key | 피드백 수정 (관리자 답변) |

##### Sessions (ApiKeyGuard, scoped session principals)

| Method | Path                    | Auth                  | Description                 |
| ------ | ----------------------- | --------------------- | --------------------------- |
| GET    | /api/v1/sessions/count  | Admin session         | 활성 세션 수 조회           |
| GET    | /api/v1/sessions/list   | Admin session         | 활성 세션 목록 조회         |
| POST   | /api/v1/sessions/upsert | Admin/company session | 자기 세션 upsert (하트비트) |
| DELETE | /api/v1/sessions        | Admin/company session | 자기 세션 삭제 (로그아웃)   |

##### Share-links (ApiKeyGuard + CompanyAccessGuard)

| Method | Path                                | Auth                  | Description                 |
| ------ | ----------------------------------- | --------------------- | --------------------------- |
| GET    | /api/v1/share-links                 | Admin/company session | 공유 링크 목록 조회         |
| POST   | /api/v1/share-links                 | Admin/company session | 공유 링크 생성              |
| POST   | /api/v1/share-links/validate        | API Key               | 링크 검증 + 다운로드 카운트 |
| POST   | /api/v1/share-links/download/stream | API Key               | 공유 토큰 기반 파일 stream  |

##### Push-subscriptions (ApiKeyGuard)

| Method | Path                       | Auth    | Description    |
| ------ | -------------------------- | ------- | -------------- |
| GET    | /api/v1/push-subscriptions | API Key | 구독 목록 조회 |
| POST   | /api/v1/push-subscriptions | API Key | 구독 upsert    |
| DELETE | /api/v1/push-subscriptions | API Key | 구독 삭제      |

##### Delivery-companies (ApiKeyGuard)

| Method | Path                           | Auth    | Description      |
| ------ | ------------------------------ | ------- | ---------------- |
| GET    | /api/v1/delivery-companies     | API Key | 배송처 목록 조회 |
| POST   | /api/v1/delivery-companies     | API Key | 배송처 생성      |
| PATCH  | /api/v1/delivery-companies/:id | API Key | 배송처 수정      |
| DELETE | /api/v1/delivery-companies/:id | API Key | 배송처 삭제      |

##### Activity-logs (ApiKeyGuard)

| Method | Path                  | Auth    | Description         |
| ------ | --------------------- | ------- | ------------------- |
| GET    | /api/v1/activity-logs | API Key | 활동 로그 목록 조회 |
| POST   | /api/v1/activity-logs | API Key | 활동 로그 기록      |

#### Backup (`backup.controller.ts`)

R2 파일을 NAS로 백업하는 시스템. 로컬 NestJS 환경에서만 동작하며, Railway 배포 환경에서는 NAS 경로 접근 불가로 스킵된다.

| Method | Path                              | Auth   | Description                     |
| ------ | --------------------------------- | ------ | ------------------------------- |
| GET    | /api/v1/backup/settings           | ApiKey | 백업 설정 조회                  |
| PUT    | /api/v1/backup/settings           | ApiKey | 백업 설정 수정                  |
| GET    | /api/v1/backup/eligible           | ApiKey | 백업 대상 파일 요약             |
| POST   | /api/v1/backup/execute            | ApiKey | 백업 실행 (비동기 전환 예정)    |
| GET    | /api/v1/backup/status             | ApiKey | 백업 진행 상태 조회 (추가 예정) |
| GET    | /api/v1/backup/history            | ApiKey | 백업 이력 조회 (페이징)         |
| GET    | /api/v1/backup/browse-directories | ApiKey | NAS 디렉토리 탐색               |

##### Public-data (ApiKeyGuard, Portfolio/Posts/Dashboard는 @Public)

| Method | Path                                | Auth    | Description     |
| ------ | ----------------------------------- | ------- | --------------- |
| GET    | /api/v1/public-data/portfolio       | None    | 포트폴리오 목록 |
| GET    | /api/v1/public-data/portfolio/count | None    | 포트폴리오 수   |
| GET    | /api/v1/public-data/portfolio/:id   | None    | 포트폴리오 단건 |
| POST   | /api/v1/public-data/portfolio       | API Key | 포트폴리오 생성 |
| PATCH  | /api/v1/public-data/portfolio/:id   | API Key | 포트폴리오 수정 |
| DELETE | /api/v1/public-data/portfolio/:id   | API Key | 포트폴리오 삭제 |
| GET    | /api/v1/public-data/posts           | None    | 게시글 목록     |
| GET    | /api/v1/public-data/posts/count     | None    | 게시글 수       |
| GET    | /api/v1/public-data/posts/:id       | None    | 게시글 단건     |
| POST   | /api/v1/public-data/posts/:id/view  | None    | 조회수 증가     |
| GET    | /api/v1/public-data/dashboard-stats | None    | 대시보드 통계   |
