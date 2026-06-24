# Supabase 운영 Read-only 점검 결과

점검일: 2026-06-24
재점검 시각: 2026-06-24 14:21 KST
대상: Supabase project `ibsbcuumkdhwesrpaqeb`
범위: metadata-only, public schema, table row 조회 없음
실행 방식: `doppler --project yjlaser --config prd` 환경에서 read-only transaction 실행
관련 Advisor: `rls_disabled_in_public`, `sensitive_columns_exposed`

## 결론

Supabase Advisor의 Critical 경고는 운영 메타데이터에서 재확인됐다.

2026-06-24 재점검 기준 public table-like relation은 77개이며, 이 중 35개가 RLS disabled 상태다. 또한 `anon`/`authenticated` 역할에 table/view, sequence, function 권한이 광범위하게 남아 있다. 기존 로컬 준비 migration은 회사사이트 Prisma table 중심 47개 목록만 기준으로 작성되어 현재 운영 schema를 충분히 커버하지 못한다.

따라서 기존 `20260624093000_enable_public_table_rls` migration을 그대로 운영 적용하면 안 된다. 관리프로그램 `im_*` table, 모바일 가격관리용 view/RPC/Edge Function 예외, public view grant까지 포함한 새 적용 범위와 rollback 계획을 먼저 확정해야 한다.

## 실행 안전장치

- SQL 파일에서 mutation/DDL/grant/revoke 키워드와 `SELECT *`를 사전 차단했다.
- 트랜잭션 시작 직후 `SET TRANSACTION READ ONLY`를 실행했다.
- 실행한 SQL은 public schema metadata 조회 6개와 `_prisma_migrations` role metadata 확인뿐이다.
- 고객 데이터 row, 파일명 원문, secret/token 값은 조회하거나 기록하지 않았다.

## 집계

| 항목                                                    | 결과 |
| ------------------------------------------------------- | ---: |
| public table 수                                         |   77 |
| public view 수                                          |    7 |
| RLS disabled public table 수                            |   35 |
| `anon`/`authenticated` table/view grants                | 1106 |
| `anon`/`authenticated` sequence grants                  |   72 |
| `anon`/`authenticated` function grants                  |  260 |
| sensitive-looking column 수                             |  152 |
| sensitive-looking column 포함 relation 수               |   56 |
| 기존 준비 migration 대상 table 수                       |   47 |
| 운영에 존재하는 기존 준비 migration 대상                |   43 |
| 운영에 없는 기존 준비 migration 대상                    |    4 |
| 운영 table 중 기존 준비 migration 누락                  |   34 |
| RLS disabled이면서 기존 준비 migration 누락             |    1 |
| grant가 있으면서 기존 준비 migration 누락 relation/view |   36 |

## RLS disabled public tables

`_prisma_migrations`, `api_keys`, `backup_logs`, `company_folder_aliases`, `company_storage`, `contact_status_history`, `contacts`, `deliveries`, `drawing_revisions`, `erp_workers`, `im_tax_invoice_audit_log`, `inventory_items`, `inventory_transactions`, `laser_only_mappings`, `machines`, `notifications`, `number_counters`, `order_events`, `orders`, `password_reset_tokens`, `posts`, `program_heartbeats`, `push_subscriptions`, `share_links`, `sync_logs`, `system_settings`, `tasks`, `visit_bookings`, `webhard_folder_favorites`, `webhard_settings`, `webhard_sync_history`, `webhard_sync_state`, `webhard_user_settings`, `worker_access_logs`, `worker_notes`

## Sensitive-looking columns 포함 relation/view

`activity_logs`, `api_keys`, `backup_logs`, `companies`, `company_feedback`, `company_storage`, `contact_status_history`, `contacts`, `deliveries`, `delivery_companies`, `drawing_revisions`, `im_company_master`, `im_dxf_classification_failures`, `im_dxf_classification_log`, `im_dxf_files`, `im_dxf_invoice_mapping`, `im_dxf_operation_locks`, `im_dxf_previews`, `im_dxf_price_edit_locks`, `im_failed_queue`, `im_invoice_deferred_items`, `im_invoice_merge_locks`, `im_invoice_summary`, `im_invoice_work_status`, `im_mobile_preview_capture_candidates`, `im_mobile_price_update_requests`, `im_monthly_company_stats`, `im_supplier_info`, `im_tax_invoice`, `im_tax_invoice_audit_log`, `im_transmission_history`, `im_web_operation_file_events`, `im_web_operation_requests`, `inventory_items`, `mobile_unpriced_dxf_view`, `notifications`, `number_counters`, `order_events`, `orders`, `password_reset_tokens`, `program_heartbeats`, `push_subscriptions`, `share_links`, `sync_logs`, `system_settings`, `tasks`, `visit_bookings`, `web_dxf_management_view`, `web_operation_status_view`, `webhard_files`, `webhard_folders`, `webhard_logs`, `webhard_settings`, `webhard_sync_history`, `webhard_sync_state`, `worker_access_logs`

## 기존 준비 migration 누락

운영에 존재하지만 기존 준비 migration 목록에 없는 table:

- `im_app_shared_settings`
- `im_company_billing_routes`
- `im_company_invoice_split_links`
- `im_company_manual_invoice_items`
- `im_company_master`
- `im_company_name_aliases`
- `im_desktop_worker_heartbeat`
- `im_dxf_classification_failures`
- `im_dxf_classification_log`
- `im_dxf_exclude_patterns`
- `im_dxf_files`
- `im_dxf_invoice_mapping`
- `im_dxf_operation_locks`
- `im_dxf_previews`
- `im_dxf_price_edit_locks`
- `im_failed_queue`
- `im_invoice_deferred_items`
- `im_invoice_details`
- `im_invoice_merge_locks`
- `im_invoice_summary`
- `im_invoice_work_status`
- `im_mobile_price_update_requests`
- `im_mobile_worker_heartbeat`
- `im_monthly_company_stats`
- `im_paper_size_pricing`
- `im_payment_history`
- `im_supplier_info`
- `im_tax_invoice`
- `im_tax_invoice_audit_log`
- `im_tax_invoice_items`
- `im_transmission_history`
- `im_web_operation_events`
- `im_web_operation_file_events`
- `im_web_operation_requests`

기존 준비 migration 목록에 있지만 운영에 없는 table:

- `integration_runs`
- `job_events`
- `job_failures`
- `nesting_tasks`

## Public API role grant

`anon`과 `authenticated` 모두 public relation 79개에 대해 `DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`, `UPDATE` 권한을 가진 것으로 확인됐다.

추가로 sequence `USAGE` grant는 각 role 36건, function `EXECUTE` grant는 `anon` 132건과 `authenticated` 128건이다.

grant가 있으면서 기존 준비 migration 목록에 없는 relation/view:

`im_app_shared_settings`, `im_company_billing_routes`, `im_company_invoice_split_links`, `im_company_manual_invoice_items`, `im_company_master`, `im_company_name_aliases`, `im_dxf_classification_failures`, `im_dxf_classification_log`, `im_dxf_exclude_patterns`, `im_dxf_files`, `im_dxf_invoice_mapping`, `im_dxf_previews`, `im_dxf_price_edit_locks`, `im_failed_queue`, `im_invoice_deferred_items`, `im_invoice_details`, `im_invoice_merge_locks`, `im_invoice_summary`, `im_invoice_work_status`, `im_mobile_preview_capture_candidates`, `im_mobile_price_update_requests`, `im_mobile_worker_heartbeat`, `im_monthly_company_stats`, `im_paper_size_pricing`, `im_payment_history`, `im_supplier_info`, `im_tax_invoice`, `im_tax_invoice_audit_log`, `im_tax_invoice_items`, `im_transmission_history`, `mobile_unpriced_dxf_view`, `mobile_worker_status_view`, `web_dxf_management_view`, `web_operation_events_view`, `web_operation_status_view`, `web_worker_status_view`

## `_prisma_migrations` 확인

`_prisma_migrations`도 public schema table이며 RLS disabled 상태다. 운영 read-only metadata 기준 현재 연결 role은 `postgres`, table owner도 `postgres`, role의 `BYPASSRLS`는 `true`다.

Advisor closure를 위해 `_prisma_migrations`를 RLS enable 대상에 포함할 수는 있지만, 적용 후 `prisma migrate status` 또는 동등한 migration 상태 확인이 필요하다.

## 다음 승인 필요

아래 작업은 아직 실행하지 않았다.

- Supabase RLS/grant migration 범위 재설계
- 재설계된 Supabase RLS/grant migration 적용
- Supabase Advisor 재실행
- 운영 smoke test

기존 migration은 현재 보류 상태다. 다음 단계는 운영 적용 승인이 아니라, 먼저 “Supabase RLS/grant 마이그레이션 범위 재설계 승인”이다.
