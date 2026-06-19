# Prisma Tables — NestJS Backend

Source: `webhard-api/prisma/schema.prisma`
ORM boundary: These tables are accessed ONLY via NestJS (Prisma). Never query from Next.js.

## Webhard Domain

### companies

| Column                             | Type           | Notes                                                          |
| ---------------------------------- | -------------- | -------------------------------------------------------------- |
| id                                 | Int (PK, auto) |                                                                |
| company_name                       | String         |                                                                |
| manager_name                       | String         |                                                                |
| created_at                         | DateTime?      | Default `now()`                                                |
| updated_at                         | DateTime?      | Default `now()`                                                |
| username                           | String         | Unique. 로그인 ID                                              |
| password_hash                      | String         | bcrypt                                                         |
| business_registration_number       | String         |                                                                |
| representative_name                | String         |                                                                |
| business_type                      | String?        |                                                                |
| business_category                  | String?        |                                                                |
| business_address                   | String         |                                                                |
| business_registration_file_url     | String?        |                                                                |
| business_registration_file_name    | String?        |                                                                |
| manager_position                   | String         |                                                                |
| manager_phone                      | String         |                                                                |
| manager_email                      | String         |                                                                |
| accountant_name                    | String?        |                                                                |
| accountant_phone                   | String?        |                                                                |
| accountant_email                   | String?        |                                                                |
| accountant_fax                     | String?        |                                                                |
| quote_method_email                 | Boolean?       | Default false                                                  |
| quote_method_fax                   | Boolean?       | Default false                                                  |
| quote_method_sms                   | Boolean?       | Default false                                                  |
| status                             | String?        | Default "active"                                               |
| webhard_access                     | Boolean        | Default true                                                   |
| laser_only                         | Boolean        | Default false. 폴더명 매칭의 secondary (LaserOnlyMapping 우선) |
| is_approved                        | Boolean        | Default false. admin 승인 여부                                 |
| approved_at                        | DateTime?      |                                                                |
| approved_by                        | String?        |                                                                |
| drive_root_folder_id               | String?        | Google Drive 업체 루트 folder id                               |
| drive_provisioning_status          | Enum           | pending / ready / failed                                       |
| drive_provisioning_error           | String?        | Sanitized provisioning failure reason                          |
| drive_provisioning_last_attempt_at | DateTime?      |                                                                |
| drive_provisioned_at               | DateTime?      |                                                                |
| deleted_at                         | DateTime?      | 업체 삭제 대기 시작 시각. 30일 이내 복구 가능                  |
| deleted_by                         | String?        | 삭제 처리한 admin user id                                      |
| deleted_previous_status            | String?        | 복구 시 되돌릴 기존 상태                                       |
| deleted_previous_webhard_access    | Boolean?       | 복구 시 되돌릴 기존 웹하드 접근 권한                           |

Indexes: username, company_name, business_registration_number, status, deleted_at, (status + deleted_at), is_approved, created_at DESC

Relations: → webhard_files, webhard_folders, laser_only_mappings, company_folder_aliases, password_reset_tokens

### webhard_files

| Column           | Type       | Notes                               |
| ---------------- | ---------- | ----------------------------------- |
| id               | UUID (PK)  |                                     |
| name             | String     | Display name                        |
| original_name    | String     | Upload original                     |
| size             | BigInt     | Bytes                               |
| mime_type        | String     |                                     |
| path             | String     | R2 object key or Drive logical path |
| storage_provider | Enum       | r2 / google_drive                   |
| drive_file_id    | String?    | Google Drive file id                |
| drive_mime_type  | String?    | Google Drive MIME type              |
| folder_id        | UUID? (FK) | → webhard_folders                   |
| company_id       | Int? (FK)  | → companies                         |
| uploaded_by      | String     |                                     |
| inquiry_number   | String?    | Links to contact                    |
| is_downloaded    | Boolean    | Default false                       |
| created_at       | DateTime   |                                     |
| updated_at       | DateTime   |                                     |
| deleted_at       | DateTime?  | Soft delete                         |
| deleted_by       | String?    |                                     |

Indexes: folder_id, company_id, deleted_at, (company_id + deleted_at), (folder_id + deleted_at), (is_downloaded + deleted_at), (name + folder_id + deleted_at)

Constraints:

- `storage_provider != 'google_drive' OR drive_file_id IS NOT NULL`
- `R2` legacy rows may keep `drive_file_id=NULL`.

### webhard_folders

| Column           | Type        | Notes                                                                                                                                                                  |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | UUID (PK)   |                                                                                                                                                                        |
| name             | String      |                                                                                                                                                                        |
| parent_id        | UUID? (FK)  | Self-reference hierarchy                                                                                                                                               |
| company_id       | Int? (FK)   | → companies                                                                                                                                                            |
| path             | String?     | Full path string                                                                                                                                                       |
| storage_provider | Enum        | r2 / google_drive                                                                                                                                                      |
| drive_folder_id  | String?     | Google Drive folder id                                                                                                                                                 |
| inquiry_number   | String?     | `문의-{번호}` 폴더에 기록. `folderKind='inquiry'` 일 때만 채워짐                                                                                                       |
| work_number      | String?     | 위와 동일. O + F 공존 시 양쪽 모두 기록                                                                                                                                |
| contact_id       | UUID?       | `Contact` FK 느슨 연결. `ensureInquiryFolder` 에서 findFirst 키                                                                                                        |
| folder_kind      | VarChar(20) | `root` / `template` / `inquiry` / `generic` 중 하나. 기본값 `generic`. `template` 은 업체 구조 고정 폴더 (`칼선의뢰` / `목형의뢰` / `문의` (task 20) / `완료`) 를 포함 |
| created_at       | DateTime    |                                                                                                                                                                        |
| updated_at       | DateTime    |                                                                                                                                                                        |
| deleted_at       | DateTime?   | Soft delete                                                                                                                                                            |
| deleted_by       | String?     | 일반 삭제 주체 또는 업체 삭제 마커(`company:{id}`)                                                                                                                     |

Indexes: parent_id, company_id, path, deleted_at, deleted_by, (name + parent_id + company_id), (parent_id + deleted_at), contact_id, partial unique `(company_id)` where `company_id IS NOT NULL AND parent_id IS NULL AND deleted_at IS NULL`

Constraints:

- `storage_provider != 'google_drive' OR drive_folder_id IS NOT NULL`
- 업체 active root folder는 업체당 하나만 존재해야 한다.
- `R2` legacy rows may keep `drive_folder_id=NULL`.

### company_storage

| Column     | Type     | Notes     |
| ---------- | -------- | --------- |
| company_id | Int (PK) |           |
| used_bytes | BigInt   | Default 0 |
| file_count | Int      | Default 0 |
| updated_at | DateTime |           |

### laser_only_mappings

Maps webhard folder names to laser-only workflow. Primary source for laser-only classification (Company.laserOnly is secondary/backward-compat).

| Column      | Type           | Notes                                 |
| ----------- | -------------- | ------------------------------------- |
| id          | Int (PK, auto) |                                       |
| folder_name | String         | Unique. Webhard folder = company name |
| company_id  | Int? (FK)      | → companies (SetNull)                 |
| is_active   | Boolean        | Default true                          |
| created_at  | DateTime       |                                       |
| updated_at  | DateTime       |                                       |

Indexes: folder_name, company_id
Relations: → companies

### company_folder_aliases

외부웹하드 폴더명 ↔ 가입 업체 매핑 (task 24).

| Column      | Type                  | Notes                                               |
| ----------- | --------------------- | --------------------------------------------------- |
| id          | Int (PK, auto)        |                                                     |
| folder_name | String                | 외부웹하드 원본 폴더명                              |
| company_id  | Int (FK companies.id) | onDelete: Cascade                                   |
| status      | String                | `pending` / `approved` / `rejected`. 기본 `pending` |
| approved_by | String?               | admin 사용자명                                      |
| approved_at | DateTime?             |                                                     |
| created_at  | DateTime              |                                                     |
| updated_at  | DateTime              |                                                     |

Unique: `(folder_name, company_id)`. Index: `folder_name`, `status`.
Relations: → companies

### webhard_settings

| Column                | Type        | Notes           |
| --------------------- | ----------- | --------------- |
| user_id               | String (PK) |                 |
| font_size             | String      | "small" default |
| notifications_enabled | Boolean     | Default true    |
| download_folder_path  | String?     |                 |

### webhard_folder_favorites

| Column     | Type        | Notes        |
| ---------- | ----------- | ------------ |
| user_id    | String (PK) | Composite PK |
| folder_id  | String (PK) | Composite PK |
| created_at | DateTime    |              |

## ERP Domain

### machines

| Column      | Type         | Notes                                  |
| ----------- | ------------ | -------------------------------------- |
| id          | UUID (PK)    |                                        |
| name        | VarChar(100) |                                        |
| type        | VarChar(50)  | laser/osi_bending/knife_bending/sample |
| status      | VarChar(20)  | "active" default                       |
| description | String?      |                                        |

Relations: → tasks

### tasks

| Column             | Type          | Notes                                            |
| ------------------ | ------------- | ------------------------------------------------ |
| id                 | UUID (PK)     |                                                  |
| contact_id         | BigInt?       | → contacts (nullable)                            |
| title              | VarChar(255)  |                                                  |
| description        | String?       |                                                  |
| task_type          | VarChar(50)?  | drawing/sample/laser/cutting/inspection/delivery |
| status             | VarChar(20)   | pending/in_progress/completed/cancelled          |
| priority           | VarChar(10)   | urgent/normal/low                                |
| machine_id         | UUID? (FK)    | → machines                                       |
| assigned_to        | VarChar(100)? |                                                  |
| started_at         | DateTime?     |                                                  |
| completed_at       | DateTime?     |                                                  |
| estimated_duration | Int?          | Minutes                                          |
| actual_duration    | Int?          | Minutes                                          |
| sort_order         | Int           | Default 0                                        |
| order_id           | UUID? (FK)    | → orders                                         |
| memo               | String?       |                                                  |

### erp_workers

| Column        | Type         | Notes                           |
| ------------- | ------------ | ------------------------------- |
| id            | UUID (PK)    |                                 |
| name          | VarChar(100) |                                 |
| pin_hash      | VarChar(255) | bcrypt hash                     |
| role          | VarChar(20)  | field_worker/supervisor/manager |
| is_active     | Boolean      | Default true                    |
| last_login_at | DateTime?    |                                 |

## Integration Domain

### orders

| Column             | Type         | Notes                                                                                 |
| ------------------ | ------------ | ------------------------------------------------------------------------------------- |
| id                 | UUID (PK)    |                                                                                       |
| contact_id         | BigInt?      | → contacts (nullable)                                                                 |
| inquiry_number     | String?      |                                                                                       |
| company_name       | VarChar(200) |                                                                                       |
| title              | VarChar(500) |                                                                                       |
| order_type         | VarChar(30)  | "standard" default                                                                    |
| status             | VarChar(30)  | inquiry_received → drawing_review → confirmed → cutting → post_processing → delivered |
| priority           | VarChar(10)  | urgent/normal/low                                                                     |
| webhard_folder_id  | String?      | Links to webhard folder                                                               |
| delivery_method    | VarChar(50)? |                                                                                       |
| Various timestamps | DateTime?    | receivedAt, confirmedAt, cuttingStartedAt, etc.                                       |

Relations: → order_events, job_events, tasks, deliveries, nesting_tasks

### nesting_tasks

레이저네스팅프로그램 작업 큐. 외부 프로그램은 pending 작업을 조회하고, 상태와 결과 수치를 다시 보고한다.

| Column             | Type        | Notes                                |
| ------------------ | ----------- | ------------------------------------ |
| id                 | UUID (PK)   |                                      |
| order_id           | UUID (FK)   | → orders (cascade)                   |
| status             | VarChar(20) | pending/in_progress/completed/failed |
| priority           | Int         | 낮을수록 먼저 처리. Default 10       |
| dxf_file_urls      | Json        | DXF 다운로드 URL 배열. Default []    |
| sheet_width        | Float       | Default 1220                         |
| sheet_height       | Float       | Default 2440                         |
| options            | Json        | algorithm/mode/gap 등. Default {}    |
| total_sheets       | Int?        | 결과 보고 시 저장                    |
| total_usage_rate   | Float?      | 결과 보고 시 저장                    |
| unplaced_count     | Int?        | 결과 보고 시 저장                    |
| result_reported_at | DateTime?   | 결과 보고 시각                       |
| message            | String?     | 상태 보고 메시지                     |
| created_at         | DateTime    | Default now                          |
| updated_at         | DateTime    | @updatedAt                           |

Indexes: (status, priority, created_at), order_id

### order_events

| Column                  | Type         | Notes              |
| ----------------------- | ------------ | ------------------ |
| id                      | UUID (PK)    |                    |
| order_id                | UUID (FK)    | → orders (cascade) |
| event_type              | VarChar(50)  |                    |
| from_status / to_status | VarChar(30)? |                    |
| source                  | VarChar(30)  |                    |
| data                    | Json?        |                    |

### job_events

Worker 이벤트 수신 원장. `OrderEvent`를 중복 처리 source로 확장하지 않고, 외부
프로그램 event envelope는 `idempotency_key` 기준으로 이 테이블에 1회만 저장한다.

| Column             | Type          | Notes                                       |
| ------------------ | ------------- | ------------------------------------------- |
| id                 | UUID (PK)     |                                             |
| idempotency_key    | VarChar(255)  | Unique. Worker 재전송 stable key            |
| event_type         | VarChar(100)  | `drawing.classified` 같은 도메인 이벤트명   |
| event_version      | Int           | Payload schema version                      |
| source_worker      | VarChar(50)   | management/nesting/sync 등 source worker    |
| source_version     | VarChar(50)?  | Worker app version                          |
| order_id           | UUID? (FK)    | → orders (SetNull)                          |
| job_id             | String?       | 후속 `Job` 모델 reference placeholder       |
| integration_run_id | String?       | 후속 `IntegrationRun` reference placeholder |
| worker_local_id    | VarChar(255)? | Worker local outbox/record reference        |
| result             | VarChar(20)   | success/failed/partial                      |
| occurred_at        | DateTime      | Worker에서 사건이 발생한 시각               |
| received_at        | DateTime      | Default now                                 |
| duration_ms        | Int?          |                                             |
| processed_count    | Int?          |                                             |
| payload            | Json          | Sanitized event payload                     |
| state_apply_status | VarChar(20)   | Default `not_applicable`                    |
| failure_id         | String?       | 후속 `JobFailure` reference placeholder     |
| order_event_id     | String?       | 파생된 화면 timeline event reference        |
| created_at         | DateTime      | Default now                                 |

Constraints: `idempotency_key` unique. 조회 인덱스는 후속 schema ticket에서 추가한다.

### deliveries

| Column          | Type          | Notes                                           |
| --------------- | ------------- | ----------------------------------------------- |
| id              | UUID (PK)     |                                                 |
| order_id        | UUID (FK)     | → orders (cascade)                              |
| delivery_type   | VarChar(30)   | pickup/courier/direct_delivery                  |
| status          | VarChar(20)   | pending/preparing/in_transit/delivered/returned |
| tracking_number | VarChar(100)? |                                                 |
| courier_company | VarChar(50)?  |                                                 |

### inventory_items

| Column        | Type         | Notes                                            |
| ------------- | ------------ | ------------------------------------------------ |
| id            | UUID (PK)    |                                                  |
| name          | VarChar(200) |                                                  |
| category      | VarChar(50)  | plywood/steel_plate/blade/sponge/packaging/other |
| unit          | VarChar(20)  | 장/개/m/kg                                       |
| current_stock | Float        | Default 0                                        |
| min_stock     | Float        | Low stock threshold                              |

Relations: → inventory_transactions

### inventory_transactions

| Column                     | Type        | Notes                       |
| -------------------------- | ----------- | --------------------------- |
| id                         | UUID (PK)   |                             |
| item_id                    | UUID (FK)   | → inventory_items (cascade) |
| type                       | VarChar(20) | in/out/adjust               |
| quantity                   | Float       |                             |
| previous_stock / new_stock | Float       |                             |

### api_keys

| Column       | Type         | Notes        |
| ------------ | ------------ | ------------ |
| id           | UUID (PK)    |              |
| name         | VarChar(100) |              |
| key_hash     | VarChar(255) |              |
| program_type | VarChar(30)  |              |
| permissions  | String[]     |              |
| is_active    | Boolean      | Default true |

### program_heartbeats

| Column                                | Type         | Notes            |
| ------------------------------------- | ------------ | ---------------- |
| id                                    | UUID (PK)    |                  |
| program_type                          | VarChar(30)  |                  |
| instance_name                         | VarChar(100) |                  |
| status                                | VarChar(20)  | "online" default |
| Unique: (program_type, instance_name) |

### sync_logs

| Column       | Type           | Notes                                                |
| ------------ | -------------- | ---------------------------------------------------- |
| id           | Int (PK, auto) |                                                      |
| filename     | VarChar(500)   |                                                      |
| company_name | VarChar(200)?  |                                                      |
| status       | VarChar(30)    | synced/company_not_found/api_error/duplicate/skipped |
| md5_hash     | VarChar(64)?   | Dedup                                                |

### worker_access_logs

| Column     | Type        | Notes                                        |
| ---------- | ----------- | -------------------------------------------- |
| id         | UUID (PK)   |                                              |
| worker_id  | UUID? (FK)  | → erp_workers (SetNull)                      |
| ip_address | VarChar(45) |                                              |
| user_agent | String?     |                                              |
| action     | VarChar(30) | login_success/login_failed/ip_blocked/logout |
| success    | Boolean     | Default false                                |
| metadata   | Json        | Default {}                                   |
| created_at | DateTime    |                                              |

Indexes: worker_id, created_at DESC, ip_address

## CRM Domain

### contacts

| Column            | Type                     | Notes                                                 |
| ----------------- | ------------------------ | ----------------------------------------------------- |
| id                | UUID (PK)                |                                                       |
| name              | String                   |                                                       |
| email             | String                   |                                                       |
| phone             | String?                  |                                                       |
| company_name      | String?                  |                                                       |
| status            | String?                  | new/in_progress/completed/etc. Default "new"          |
| contact_type      | String?                  |                                                       |
| source            | VarChar(20)              | "website" default                                     |
| inquiry_type      | VarChar(20)?             |                                                       |
| inquiry_number    | String?                  |                                                       |
| work_number       | String?                  |                                                       |
| process_stage     | String?                  | drawing/sample/laser/cutting/inspection/delivery/etc. |
| order_type        | VarChar(30)              | "standard" default                                    |
| drawing_file_url  | String?                  | R2 file URL                                           |
| webhard_folder_id | String?                  | Links to webhard folder                               |
| worker_memo       | String?                  |                                                       |
| worker_issue      | Boolean?                 | Default false                                         |
| is_read           | Boolean?                 | Default false                                         |
| deleted_at        | DateTime?                | Soft delete                                           |
| created_at        | DateTime                 |                                                       |
| updated_at        | DateTime?                |                                                       |
| parent_contact_id | UUID? (FK → contacts.id) | 분할 원본 참조 (자기참조)                             |
| split_index       | Int?                     | 하위 순번 (1, 2, 3...)                                |
| split_count       | Int?                     | 원본: 총 분할 수                                      |
| stage_completed   | Boolean (default false)  | 현재 공정 단계 완료 체크                              |

Relations: → contact_status_history

### contact_status_history

| Column       | Type          | Notes                |
| ------------ | ------------- | -------------------- |
| id           | UUID (PK)     |                      |
| contact_id   | UUID (FK)     | → contacts (cascade) |
| change_type  | VarChar(30)   |                      |
| from_status  | VarChar(30)?  |                      |
| to_status    | VarChar(30)?  |                      |
| from_stage   | VarChar(30)?  |                      |
| to_stage     | VarChar(30)?  |                      |
| actor_type   | VarChar(20)   | admin/company/worker |
| actor_name   | VarChar(100)? |                      |
| company_name | VarChar(200)? |                      |
| source       | VarChar(30)   |                      |
| note         | String?       |                      |
| metadata     | Json?         | Default {}           |
| created_at   | DateTime      |                      |

Indexes: (contact_id, created_at), (contact_id, change_type)

### drawing_revisions

| Column        | Type          | Notes                                                                                        |
| ------------- | ------------- | -------------------------------------------------------------------------------------------- |
| id            | UUID (PK)     |                                                                                              |
| contact_id    | UUID (FK)     | → contacts (cascade)                                                                         |
| version       | Int           | contact 단위 자동 증가                                                                       |
| process_stage | VarChar(30)?  | 수정 시점의 공정 단계                                                                        |
| reason        | VarChar(30)   | domuson_fit/sample_revision/field_correction/laser_processing/initial/revision_request/other |
| reason_detail | Text?         | 자유 입력                                                                                    |
| files         | JSONB         | Array<{ url, name, size, mimeType }>                                                         |
| actor_type    | VarChar(20)   | admin/worker/system/external/company                                                         |
| actor_name    | VarChar(100)? |                                                                                              |
| source        | VarChar(30)   | stage_change/manual/auto_initial/integration                                                 |
| is_public     | Boolean       | Default false                                                                                |
| note          | Text?         |                                                                                              |
| created_at    | TimestampTZ   |                                                                                              |

Indexes: (contact_id, version), (contact_id, created_at DESC)

Relations: → contacts

### visit_bookings

| Column          | Type        | Notes                                                                                                                          |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| id              | BigInt (PK) |                                                                                                                                |
| visit_date      | Date        |                                                                                                                                |
| visit_time_slot | String      |                                                                                                                                |
| company_name    | String      |                                                                                                                                |
| contact_id      | UUID?       | → contacts                                                                                                                     |
| status          | String?     | "confirmed" default. DTO 레이어에서 `pending` / `confirmed` / `cancelled` 3 종으로 제한 (task 23, `UpdateBookingDto` `@IsIn`). |
| notes           | String?     |                                                                                                                                |
| created_by      | String?     |                                                                                                                                |
| delivery_method | String?     |                                                                                                                                |
| created_at      | DateTime?   |                                                                                                                                |
| updated_at      | DateTime?   |                                                                                                                                |

Unique: (visit_date, visit_time_slot, company_name, contact_id)

### delivery_companies

| Column     | Type        | Notes       |
| ---------- | ----------- | ----------- |
| id         | BigInt (PK) |             |
| company_id | BigInt      | → companies |
| name       | String      |             |
| phone      | String      |             |
| address    | String      |             |
| created_at | DateTime?   |             |
| updated_at | DateTime?   |             |

Indexes: company_id, created_at DESC

## Content Domain

### portfolio

| Column      | Type      | Notes      |
| ----------- | --------- | ---------- |
| id          | UUID (PK) |            |
| title       | String    |            |
| field       | String    |            |
| purpose     | String    |            |
| type        | String    |            |
| format      | String    |            |
| size        | String    |            |
| paper       | String    |            |
| printing    | String    |            |
| finishing   | String    |            |
| description | String    |            |
| images      | Json      | Default [] |
| created_at  | DateTime  |            |
| updated_at  | DateTime? |            |

### posts

| Column     | Type        | Notes     |
| ---------- | ----------- | --------- |
| id         | BigInt (PK) |           |
| title      | String?     |           |
| content    | String?     |           |
| view_count | Int?        | Default 0 |
| created_at | DateTime    |           |

## Company Portal Domain

### company_feedback

| Column         | Type        | Notes                               |
| -------------- | ----------- | ----------------------------------- |
| id             | BigInt (PK) |                                     |
| company_id     | Int         | → companies                         |
| company_name   | String      |                                     |
| content        | String      |                                     |
| status         | String      | pending/resolved. Default "pending" |
| category       | String?     |                                     |
| category_other | String?     |                                     |
| company_email  | String?     |                                     |
| admin_notes    | String?     |                                     |
| resolved_at    | DateTime?   |                                     |
| created_at     | DateTime    |                                     |
| updated_at     | DateTime    |                                     |

Indexes: company_id, status, created_at DESC

### notifications

| Column     | Type         | Notes                |
| ---------- | ------------ | -------------------- |
| id         | UUID (PK)    |                      |
| user_type  | VarChar(20)  | admin/company/worker |
| user_id    | BigInt?      |                      |
| type       | VarChar(50)  |                      |
| title      | VarChar(255) |                      |
| message    | String       |                      |
| metadata   | Json?        | Default {}           |
| is_read    | Boolean      | Default false        |
| read_at    | DateTime?    |                      |
| created_at | DateTime     |                      |

Indexes: (user_type, user_id, created_at DESC), (user_type, user_id, is_read)

### push_subscriptions

| Column     | Type      | Notes         |
| ---------- | --------- | ------------- |
| id         | UUID (PK) |               |
| worker_id  | String    | → erp_workers |
| endpoint   | String    |               |
| p256dh     | String    |               |
| auth       | String    |               |
| created_at | DateTime? |               |
| updated_at | DateTime? |               |

Unique: (worker_id, endpoint)

## Session & Auth Domain

### password_reset_tokens

거래처 비밀번호 재설정 링크용 1회성 토큰 저장소. raw token 은 저장하지 않고 SHA-256 hash 만 저장한다.

| Column     | Type      | Notes                                     |
| ---------- | --------- | ----------------------------------------- |
| id         | UUID (PK) | Prisma `uuid()` default                   |
| company_id | Int       | → companies (cascade)                     |
| token_hash | String    | Unique. SHA-256(raw token)                |
| expires_at | DateTime  | 기본 발급 TTL 30분                        |
| used_at    | DateTime? | null 이면 미사용, 값이 있으면 사용/무효화 |
| created_at | DateTime  | Default `now()`                           |

Indexes: token_hash unique, (company_id + used_at), expires_at

### active_sessions

| Column        | Type          | Notes             |
| ------------- | ------------- | ----------------- |
| id            | Int (PK)      |                   |
| user_type     | VarChar(20)   | "company" default |
| user_id       | Int           |                   |
| username      | VarChar(100)  |                   |
| company_name  | VarChar(200)? |                   |
| last_activity | DateTime      |                   |
| created_at    | DateTime      |                   |

Unique: (user_type, user_id)

### share_links

| Column         | Type        | Notes         |
| -------------- | ----------- | ------------- |
| id             | UUID (PK)   |               |
| token          | VarChar(64) | Unique        |
| file_path      | String      | R2 object key |
| file_name      | String      |               |
| company_id     | Int?        | → companies   |
| created_by     | Int         |               |
| expires_at     | DateTime    |               |
| max_downloads  | Int?        |               |
| download_count | Int?        | Default 0     |
| is_active      | Boolean?    | Default true  |
| created_at     | DateTime?   |               |
| updated_at     | DateTime?   |               |

Indexes: token, company_id, expires_at, is_active

## System Domain

### activity_logs

| Column        | Type      | Notes                |
| ------------- | --------- | -------------------- |
| id            | UUID (PK) |                      |
| actor_type    | String    | admin/company/worker |
| actor_id      | String    |                      |
| actor_name    | String?   |                      |
| action        | String    |                      |
| resource_type | String?   |                      |
| resource_id   | String?   |                      |
| details       | Json?     | Default {}           |
| ip_address    | String?   |                      |
| user_agent    | String?   |                      |
| created_at    | DateTime  |                      |

Indexes: action, actor_id, created_at DESC

### webhard_logs

| Column        | Type        | Notes                       |
| ------------- | ----------- | --------------------------- |
| id            | BigInt (PK) |                             |
| action        | String      | upload/download/delete/etc. |
| file_name     | String      |                             |
| file_size     | BigInt?     |                             |
| company_id    | BigInt?     |                             |
| user_id       | BigInt?     |                             |
| folder_path   | String?     |                             |
| status        | String      | "success" default           |
| error_message | String?     |                             |
| created_at    | DateTime    |                             |

Indexes: action, company_id, status, created_at DESC

### webhard_sync_history

| Column            | Type      | Notes                        |
| ----------------- | --------- | ---------------------------- |
| id                | UUID (PK) |                              |
| company_id        | Int       |                              |
| sync_type         | String    |                              |
| files_added       | Int?      | Default 0                    |
| files_updated     | Int?      | Default 0                    |
| files_deleted     | Int?      | Default 0                    |
| folders_added     | Int?      | Default 0                    |
| folders_deleted   | Int?      | Default 0                    |
| total_size_bytes  | BigInt?   | Default 0                    |
| sync_status       | String?   | in_progress/completed/failed |
| error_message     | String?   |                              |
| sync_started_at   | DateTime? |                              |
| sync_completed_at | DateTime? |                              |
| created_at        | DateTime? |                              |

Indexes: (company_id, sync_started_at DESC)

### webhard_sync_state

| Column         | Type      | Notes               |
| -------------- | --------- | ------------------- |
| id             | UUID (PK) |                     |
| company_id     | Int       | Unique              |
| last_sync_at   | DateTime? |                     |
| last_sync_hash | String?   |                     |
| files_synced   | Int?      | Default 0           |
| folders_synced | Int?      | Default 0           |
| sync_type      | String?   | "full" default      |
| sync_status    | String?   | "completed" default |
| error_message  | String?   |                     |
| created_at     | DateTime? |                     |
| updated_at     | DateTime? |                     |

### webhard_user_settings

| Column        | Type      | Notes                                   |
| ------------- | --------- | --------------------------------------- |
| id            | UUID (PK) |                                         |
| user_id       | String    | Unique                                  |
| settings_json | Json      | notifyOnError, downloadFolderPath, etc. |
| created_at    | DateTime  |                                         |
| updated_at    | DateTime  |                                         |

Indexes: user_id, updated_at

### system_settings

| Column     | Type     | Notes |
| ---------- | -------- | ----- |
| key        | String   | PK    |
| value      | Json     |       |
| updated_at | DateTime |       |

### number_counters

| Column   | Type        | Notes                            |
| -------- | ----------- | -------------------------------- |
| date_key | Date        | Composite PK                     |
| type     | VarChar(20) | Composite PK (inquiry/work/etc.) |
| last_seq | Int         | Default 0                        |

## Backup Domain

### backup_logs

R2 → NAS 백업 실행 이력. 파일 단위로 성공/실패를 기록한다.

| Column        | Type      | Notes                                     |
| ------------- | --------- | ----------------------------------------- |
| id            | UUID (PK) |                                           |
| file_id       | String    | 백업된 webhard_files.id                   |
| file_name     | String    | 표시 파일명                               |
| original_name | String    | 원본 파일명                               |
| file_size     | BigInt    | 파일 크기 (bytes)                         |
| r2_key        | String    | R2 오브젝트 키                            |
| backup_path   | String    | NAS 저장 경로                             |
| company_id    | Int?      | 업체 ID                                   |
| status        | String    | "pending" default. pending/success/failed |
| error         | String?   | 실패 시 에러 메시지                       |
| created_at    | DateTime  |                                           |

Indexes: created_at, status, file_id
