# Next.js API Routes

Base: `src/app/api/`
All routes use Next.js App Router convention (`route.ts` with exported HTTP method handlers).

## Route Authorization Contract

Mutation routes must authenticate the actor before reading request bodies or calling upstream side effects. Admin-only routes use the shared route authorization helpers; worker self-service routes must verify the worker session and the requested worker id before calling NestJS, R2, push, or sync APIs. Rejected requests must return before `formData()`, `fetch`, `nestjsFetch`, R2 upload helpers, push subscription writes, or sync control calls.

Current protected mutation examples:

- `/api/push/send`: admin only.
- `/api/push/subscribe`: verified worker self-subscription unless an explicit admin maintenance path is modeled.
- `/api/sync/control`: admin only.
- `/api/portfolio/upload`: admin only before parsing form data or creating image variants.

## Health

| Method | Path        | Auth | Description  |
| ------ | ----------- | ---- | ------------ |
| GET    | /api/health | None | Health check |

## Auth

| Method | Path                     | Auth | Description          |
| ------ | ------------------------ | ---- | -------------------- |
| POST   | /api/auth/find-id        | None | Find account by info |
| POST   | /api/auth/find-password  | None | Request reset link   |
| POST   | /api/auth/reset-password | None | Confirm reset token  |

### Login page/server action

`/login` 은 `loginAction` 서버 액션으로 관리자/거래처 로그인을 처리한다.

- 관리자 계정은 환경 변수 기반 credential 검증 후 `/admin` 으로 이동한다.
- 거래처 계정은 NestJS `GET /api/v1/companies/auth/:username` 조회 결과의 `password_hash` 로 비밀번호를 검증한다.
- `is_approved=false` 업체는 `status` 값보다 먼저 승인 대기 분기로 처리하며 `/login?error=pending_approval` 로 이동한다. 화면 문구는 "관리자 승인 대기 중입니다. 관리자에게 문의해주세요."이다.
- 승인 완료 업체만 `status === 'active'` 와 비밀번호 검증을 통과한 뒤 `/company/dashboard` 로 이동한다.
- 로그인 폼의 `아이디 저장`은 브라우저 `localStorage`에 아이디 문자열만 저장한다. 비밀번호, 세션 토큰, reset token은 저장하지 않는다.
- 로그인 폼의 `자동로그인`은 서버 액션 FormData의 `autoLogin=on`으로 전달되며, 성공한 관리자/거래처 세션 쿠키 `maxAge`를 30일로 설정한다. 선택하지 않으면 기존 4시간 세션 만료 정책을 유지한다.

### POST /api/auth/find-id

거래처 로그인 모달의 "아이디 찾기" 요청을 NestJS 아이디 안내 메일 발송 흐름으로 프록시한다.

- 요청: `{ companyName: string, email: string, phone: string }`
- 서버 처리:
  - `companyName` trim, `email` lowercase, `phone` 숫자만 추출 canonicalization 후 검증한다.
  - 계정 복구 전용 IP/fingerprint rate limit을 적용한다. production에서 Upstash 또는 `ACCOUNT_RECOVERY_RATE_LIMIT_SECRET`이 없으면 fail closed 한다.
  - NestJS `POST /api/v1/auth/find-id/request` 로 위임한다 (`useRecoveryApiKey: true`, `X-Account-Recovery-Key`).
- 응답: 계정 존재 여부를 노출하지 않기 위해 일치/불일치 모두 성공 시 동일한 안내 메시지.
- 보안: 응답 body에 `username`, `maskedUsername`, reset token, reset link를 포함하지 않는다.
- 실패: 필수 필드 누락/형식 오류는 `400`; pre-lookup rate limit 초과는 `429`; 계정 조회 후 메일 실패/발송 제한은 브라우저 응답에 반영하지 않는다.
- 설정 오류: development localhost/loopback에서는 env가 없어도 dev-only 기본 recovery key를 사용한다. staging/test/production 또는 non-loopback 호출에서는 dev-only key를 사용하지 않는다. production에서 Next.js 서버에 `ACCOUNT_RECOVERY_API_KEY`가 없으면 NestJS로 무키 요청을 보내지 않고 `503`을 반환한다.

### POST /api/auth/find-password

거래처 로그인 모달의 "비밀번호 찾기" 요청을 NestJS reset-link 발급 흐름으로 프록시한다.

- 요청: `{ username: string, email: string }`
- 서버 처리:
  - `username` trim, `email` lowercase 후 검증한다.
  - 계정 복구 전용 IP/fingerprint rate limit을 적용한다. production에서 Upstash 또는 `ACCOUNT_RECOVERY_RATE_LIMIT_SECRET`이 없으면 fail closed 한다.
  - NestJS `POST /api/v1/auth/password-reset/request` 로 위임 (`useRecoveryApiKey: true`, `X-Account-Recovery-Key`).
  - 현재 request origin을 `X-Account-Recovery-Origin`으로 전달한다. NestJS는 development localhost/loopback에서만 이를 reset link base URL로 사용한다.
- 응답: 계정 존재 여부를 노출하지 않기 위해 일치/불일치 모두 성공 시 동일한 안내 메시지.
- 보안: Next.js route 는 임시 비밀번호, reset token, reset link 를 생성하거나 응답하지 않는다.
- 실패: 필수 필드 누락/형식 오류는 `400`; pre-lookup rate limit 초과는 `429`; 계정 조회 후 메일 실패/발송 제한은 브라우저 응답에 반영하지 않는다.
- 설정 오류: development localhost/loopback에서는 env가 없어도 dev-only 기본 recovery key를 사용한다. staging/test/production 또는 non-loopback 호출에서는 dev-only key를 사용하지 않는다. production에서 Next.js 서버에 `ACCOUNT_RECOVERY_API_KEY`가 없으면 NestJS로 무키 요청을 보내지 않고 `503`을 반환한다.

### POST /api/auth/reset-password

이메일 reset link 의 `/reset-password#token=...` 폼 제출을 NestJS 토큰 확정 흐름으로 프록시한다. legacy `/reset-password?token=...` 링크도 클라이언트에서 즉시 주소창 query를 제거해 처리한다.

- 요청: `{ token: string, password: string, passwordConfirm: string }`
- 서버 처리: `password === passwordConfirm` 확인 후 NestJS `POST /api/v1/auth/password-reset/confirm` 으로 위임 (`useRecoveryApiKey: true`, `X-Account-Recovery-Key`).
- 응답: 성공 시 `{ success: true, message: "비밀번호가 재설정되었습니다." }`
- 실패: 필수 필드 누락/비밀번호 확인 불일치는 `400`; 토큰 만료·사용됨·정책 위반은 NestJS 응답을 중계.
- 설정 오류: development localhost/loopback에서는 env가 없어도 dev-only 기본 recovery key를 사용한다. staging/test/production 또는 non-loopback 호출에서는 dev-only key를 사용하지 않는다. production에서 Next.js 서버에 `ACCOUNT_RECOVERY_API_KEY`가 없으면 NestJS로 무키 요청을 보내지 않고 `503`을 반환한다.
- `/reset-password` 화면은 client mount 직후 fragment 또는 legacy query token을 memory state에 보관하고 `history.replaceState`로 주소창 token을 제거한다. page metadata는 `Referrer-Policy: no-referrer`에 해당하는 referrer 설정을 사용한다.

## Contacts (Orders/Inquiries)

| Method | Path                                            | Auth                     | Description                                |
| ------ | ----------------------------------------------- | ------------------------ | ------------------------------------------ |
| GET    | /api/contacts/[id]                              | Admin \| owning Company  | Contact detail                             |
| DELETE | /api/contacts/[id]                              | Admin                    | Delete contact                             |
| PATCH  | /api/contacts/[id]/inquiry-type                 | Admin or Worker          | 문의 유형 분류/재분류 (프록시)             |
| GET    | /api/contacts/[id]/timeline                     | Admin \| owning Company  | Contact timeline                           |
| GET    | /api/contacts/[id]/latest-drawing/download      | Admin \| Company \| ERP  | 현재 공정 단계 기준 최신 도면 다운로드 URL |
| POST   | /api/contacts/[id]/booking-change-acknowledged  | Admin                    | Ack booking change                         |
| POST   | /api/contacts/[id]/delivery-method-acknowledged | Admin                    | Ack delivery method                        |
| POST   | /api/contacts/[id]/revision-request             | Admin \| owning Company  | Request revision                           |
| POST   | /api/contacts/cleanup                           | Admin \| CLEANUP_API_KEY | Cleanup old contacts                       |

- Company session의 `/api/contacts/[id]/timeline`은 NestJS에 browser session cookie로 전달해 private drawing revision 제외와 internal note 마스킹을 backend company filter에 맡긴다.
- `/api/contacts/[id]/revision-request`는 문의 소유권 검증 이후에만 multipart body/R2 업로드를 처리한다.

### PATCH /api/contacts/[id]/inquiry-type

- 허용 값: `cutting_request` | `mold_request` (스펙 `VALID_INQUIRY_TYPES`). `laser_cutting` 은 수동 분류 대상 아님.
- 서버 처리: NestJS `ContactsService.updateInquiryType` 로 위임. 재분류 시 `status`/`process_stage` 자동 동기화 (`cutting_request → drawing`, `mold_request → confirmed`) 및 `ContactStatusHistory` 기록.
- 인증: Admin 세션(`requireAdmin`) 또는 Worker PIN 세션(`getErpWorkerSession`) 모두 허용.
- UX 주의: **Phase 5 (inquiry-classification-ux)** 부터 클라이언트(Admin `ContactCard.handleReclassify`, Worker `dashboard/page.tsx.handleReclassify`)에서 `contact.status !== 'received'` 이면 `window.confirm` 경고를 선행한다 (공정 상태가 함께 변경됨을 고지). 미분류 → 첫 분류(`InquiryTypeBadge` 인라인 버튼)는 경고 없이 optimistic update 로 즉시 진행. 서버 스키마/응답은 변경 없음.
- UI 훅: **task 16 (classify-cta)** 이후 미분류 카드의 첫 분류 호출은 공용 `useClassifyInquiryType` 훅(`src/lib/hooks/useClassifyInquiryType.ts`)이 이 엔드포인트를 사용한다. Admin/Worker 양쪽 `InquiryClassifyButtons` 공용 컴포넌트의 단일 진입점이며, 요청/응답 계약은 변경 없음.

### GET /api/contacts/[id]/latest-drawing/download

마지막으로 업로드된 최신 도면의 R2 presigned 다운로드 URL 을 반환한다.

- 인증: admin-session | company-session | erp-session 중 하나 허용. worker 포털 다운로드 아이콘이 erp 세션으로 호출할 수 있어야 한다는 피드백 대응.
- 서버 처리: NestJS `GET /api/v1/contacts/:id/latest-drawing-url` 로 프록시 → `DrawingRevisionService.getLatestUploaded(contactId)` 재사용. 현재 공정 단계 필터 없이 `createdAt DESC` 첫 리비전을 사용한다.
- 파일명: `workNumber`가 있으면 `[현장작업번호]`, 없으면 `[사무실작업번호]`를 붙이며 기존 O/F prefix는 제거 후 하나만 붙인다.
- 응답 (200):
  ```json
  { "url": "https://r2.example.com/presigned...", "fileName": "도면_v3.dxf" }
  ```
- 최신 리비전이 없을 때: `contact.drawingFileUrl`(과거 단일 업로드 경로)로 조용히 fallback. fallback 파일명에도 동일 prefix 규칙을 적용하며, 그마저 없으면 `404`.
- 자세한 계약은 `docs/specs/features/drawing-revision-history.md` "최신 도면 다운로드 API" 서브섹션 참고.

## Drawing Revisions

| Method | Path                                           | Auth                                   | Description                |
| ------ | ---------------------------------------------- | -------------------------------------- | -------------------------- |
| GET    | /api/drawing-revisions/[revisionId]/download   | Admin \| owning Company(public) \| ERP | Revision 파일 다운로드 URL |
| PATCH  | /api/drawing-revisions/[revisionId]/visibility | Admin                                  | 거래처 공개 여부 토글      |

### GET /api/drawing-revisions/[revisionId]/download

- 인증: **admin | owning company(public revision only) | erp** 세션 중 하나 허용. Company 세션은 `revisionId`의 `contact.companyName`을 NestJS 메타데이터 조회로 확인한 뒤 signed session의 업체명과 일치하고 `isPublic === true`일 때만 presigned URL을 발급한다. ERP worker 세션은 작업자 타임라인 다운로드를 위해 별도 허용한다.
- 쿼리: `?fileIndex=<n>` (기본 0) — `drawing_revisions.files[n]` 의 presigned URL 발급.
- 응답: `{ url: string, fileName: string }` (NestJS 응답을 그대로 중계).

## Bookings

| Method         | Path                    | Auth             | Description             |
| -------------- | ----------------------- | ---------------- | ----------------------- |
| GET/POST       | /api/bookings           | Admin \| Company | List/create bookings    |
| GET/PUT/DELETE | /api/bookings/[id]      | Admin \| Company | Booking CRUD            |
| GET            | /api/bookings/available | None             | Available booking slots |

- Company session의 `/api/bookings` 조회/생성은 query/body `companyName`을 신뢰하지 않고 signed session에서 해석한 업체명으로 scope를 고정한다.
- `contactId`가 포함된 예약 생성/수정/취소는 예약 `company_name`과 연결 문의 `company_name`/`companyName`이 모두 세션 업체와 일치해야 한다.

## Admin

| Method         | Path                                | Auth          | Description                                                                                                       |
| -------------- | ----------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET            | /api/admin/bookings                 | Admin session | Admin booking list                                                                                                |
| GET/PUT/DELETE | /api/admin/bookings/[id]            | Admin session | Admin booking CRUD                                                                                                |
| GET/PUT/DELETE | /api/admin/feedback/[id]            | Admin session | Feedback management                                                                                               |
| GET            | /api/admin/storage                  | Admin session | Storage overview                                                                                                  |
| GET            | /api/admin/webhard/activity         | Admin session | Webhard activity logs                                                                                             |
| GET            | /api/admin/activity-logs            | Admin session | Activity log list                                                                                                 |
| DELETE         | /api/admin/test-contacts/delete-all | Admin session | Dev: cleanup test data                                                                                            |
| GET/POST/PUT   | /api/admin/backup/[...path]         | Admin session | NestJS backup API 프록시. 허용 경로: `settings`, `eligible`, `status`, `execute`, `history`, `browse-directories` |

### Admin Contacts Query Parameters

| Param         | Type   | Description                                                                                           |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| status        | string | Contact status filter                                                                                 |
| page          | number | Page number (default: 1)                                                                              |
| search        | string | Search by inquiry_number, company_name, inquiry_title                                                 |
| processStages | string | Comma-separated process stage filter                                                                  |
| workCategory  | string | `office` (null, drawing, sample) or `field` (drawing_confirmed, laser, cutting, inspection, delivery) |

## Notifications

| Method   | Path                         | Auth    | Description                                                                  |
| -------- | ---------------------------- | ------- | ---------------------------------------------------------------------------- |
| GET/POST | /api/notifications           | Session | List/create notifications (`category=webhard\|integration\|work-management`) |
| GET      | /api/notifications/count     | Session | Unread count, optional `category`                                            |
| GET      | /api/notifications/summary   | Session | Unread counts by category                                                    |
| POST     | /api/notifications/read-all  | Session | Mark all as read                                                             |
| POST     | /api/notifications/[id]/read | Session | Mark one as read                                                             |

## Company Portal

| Method         | Path                                 | Auth          | Description           |
| -------------- | ------------------------------------ | ------------- | --------------------- |
| GET            | /api/companies                       | Admin/API key | Company list          |
| GET/PUT        | /api/company/profile                 | Company auth  | Own profile           |
| GET/PUT        | /api/company/address                 | Company auth  | Company address       |
| GET/POST       | /api/company/delivery-companies      | Company auth  | Delivery company list |
| GET/PUT/DELETE | /api/company/delivery-companies/[id] | Company auth  | Delivery company CRUD |

## Billing

| Method   | Path                       | Auth          | Description         |
| -------- | -------------------------- | ------------- | ------------------- |
| GET/POST | /api/billing/invoices      | Admin/Company | Invoice list/create |
| GET/PUT  | /api/billing/invoices/[id] | Admin/Company | Invoice detail      |
| POST     | /api/billing/generate      | Admin         | Generate invoice    |

## Webhard (Next.js proxy to NestJS or direct Supabase)

| Method   | Path                                     | Auth    | Description                      |
| -------- | ---------------------------------------- | ------- | -------------------------------- |
| GET      | /api/webhard/files                       | Session | File list by folder              |
| POST     | /api/webhard/files/new                   | Session | Create file metadata             |
| POST     | /api/webhard/files/presigned-url         | Session | Get R2 upload URL                |
| POST     | /api/webhard/files/confirm               | Session | Confirm upload complete          |
| POST     | /api/webhard/files/mark-downloaded       | Session | Mark file downloaded             |
| POST     | /api/webhard/files/mark-all-downloaded   | Session | Mark all downloaded              |
| GET      | /api/webhard/files/badge-counts          | Session | Unread badge counts              |
| POST     | /api/webhard/files/[id]/delete           | Session | Soft delete file                 |
| POST     | /api/webhard/files/[id]/move             | Session | Move file                        |
| POST     | /api/webhard/files/[id]/rename           | Session | Rename file                      |
| GET      | /api/webhard/files/[id]/download         | Session | Download file                    |
| POST     | /api/webhard/files/batch/delete          | Session | Batch delete                     |
| POST     | /api/webhard/files/batch/move            | Session | Batch move                       |
| POST     | /api/webhard/files/batch/upload          | Session | Batch upload                     |
| GET/POST | /api/webhard/folders                     | Session | Folder list/create               |
| GET      | /api/webhard/folders/[id]                | Session | Folder detail                    |
| GET      | /api/webhard/folders/[id]/ancestors      | Session | Breadcrumb path                  |
| POST     | /api/webhard/folders/[id]/delete         | Session | Delete folder                    |
| POST     | /api/webhard/folders/[id]/move           | Session | Move folder                      |
| POST     | /api/webhard/folders/[id]/rename         | Session | Rename folder                    |
| GET      | /api/webhard/trash                       | Session | Trash list                       |
| POST     | /api/webhard/trash/[id]/restore          | Session | Restore from trash               |
| DELETE   | /api/webhard/trash/[id]/permanent-delete | Session | 승인 body 필요. Permanent delete |
| POST     | /api/webhard/batch-delete                | Session | Batch permanent delete           |
| GET      | /api/webhard/search                      | Session | Full-text search                 |
| GET      | /api/webhard/storage                     | Session | Storage usage                    |
| GET      | /api/webhard/storage/breakdown           | Session | Storage by company               |
| GET/PUT  | /api/webhard/settings                    | Session | User webhard settings            |
| GET      | /api/webhard/badge-counts                | Session | Badge counts                     |
| POST/GET | /api/webhard/share                       | Session | Create/list shares               |
| GET      | /api/webhard/share/[token]               | None    | Public share access              |
| POST     | /api/webhard/upload                      | Session | Upload flow                      |
| POST     | /api/webhard/upload/batch                | Session | Batch upload flow                |
| POST     | /api/webhard/upload/batch-complete       | Session | Batch upload confirm             |
| GET      | /api/webhard/download                    | Session | Download file                    |
| GET      | /api/webhard/activity                    | Admin   | Webhard activity                 |

## Sync (External Webhard Integration)

| Method | Path              | Auth    | Description     |
| ------ | ----------------- | ------- | --------------- |
| GET    | /api/sync/status  | API key | Sync status     |
| GET    | /api/sync/stats   | API key | Sync statistics |
| GET    | /api/sync/events  | API key | Sync event log  |
| POST   | /api/sync/control | API key | Start/stop sync |

## ERP

| Method | Path             | Auth | Description                       |
| ------ | ---------------- | ---- | --------------------------------- |
| POST   | /api/erp/session | None | Worker PIN login + signed session |

### POST /api/erp/session

Worker login endpoint. This route is the only browser path that creates the `erp-session` cookie.

- 요청: `{ name: string, pin: string }`
- 서버 처리: Next.js가 NestJS `POST /api/v1/erp/workers/pin-login`으로 이름/PIN, IP, User-Agent를 전달한다.
- 성공: NestJS가 `success=true`와 worker를 반환한 경우에만 signed httpOnly `erp-session`을 설정하고 worker payload를 반환한다.
- 실패: PIN 불일치, rate limit, IP 차단, 누락된 proof는 cookie를 만들지 않고 실패 응답을 반환한다.
- 보안: `workerId`/`workerName`만 있는 요청은 인증 proof가 아니므로 거부한다.

### POST /api/socket-auth

- Admin/company socket token은 기존 signed session 검증 후 발급한다.
- Worker socket token은 `getErpWorkerSession()`이 성공한 경우에만 발급한다. `erp-session` 쿠키 존재만으로는 token을 만들 수 없다.

## Worker Proxies

| Method | Path                                      | Auth   | Description                    |
| ------ | ----------------------------------------- | ------ | ------------------------------ |
| GET    | /api/worker/files                         | Worker | Worker folder file list        |
| GET    | /api/worker/files/[id]/download           | Worker | Worker file download URL       |
| GET    | /api/worker/drawing-revisions             | Worker | Contact drawing revisions      |
| POST   | /api/worker/drawing-revisions             | Worker | Create worker drawing revision |
| POST   | /api/worker/drawing-revisions/upload-urls | Worker | Drawing upload presigned URLs  |

All worker proxy routes must call `getErpWorkerSession()` before backend access. File read proxies and drawing revision proxies forward the verified `erp-session` cookie to NestJS worker-enabled endpoints instead of using `X-API-Key`; drawing revision mutation/upload URL proxies also forward the CSRF token.

## Other

| Method | Path                   | Auth    | Description                 |
| ------ | ---------------------- | ------- | --------------------------- |
| POST   | /api/inngest           | Inngest | Inngest webhook             |
| POST   | /api/push/subscribe    | Session | Push notification subscribe |
| POST   | /api/portfolio/upload  | Admin   | Portfolio image upload      |
| GET    | /api/session/heartbeat | Session | Keep session alive          |

## Migration Routes (temporary)

Located at `/api/webhard/migration/*` — used for data migration from old webhard.
Should be removed after migration is complete.
