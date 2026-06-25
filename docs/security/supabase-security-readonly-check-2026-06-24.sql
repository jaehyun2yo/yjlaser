-- Supabase Security Advisor follow-up read-only checks.
-- Purpose: verify rls_disabled_in_public and sensitive_columns_exposed without reading table rows.
-- Scope: metadata only. Do not add SELECT * or sample row queries to this file.

-- 1. Public table RLS and policy inventory.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_enabled,
  coalesce(
    array_agg(distinct p.polname) filter (where p.polname is not null),
    array[]::name[]
  ) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
group by n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
order by n.nspname, c.relname;

-- 2. Public table grants for Supabase API roles.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 3. Public sequence grants for Supabase API roles.
select
  object_schema as sequence_schema,
  object_name as sequence_name,
  grantee,
  privilege_type
from information_schema.role_usage_grants
where object_schema = 'public'
  and object_type = 'SEQUENCE'
  and grantee in ('anon', 'authenticated')
order by object_name, grantee, privilege_type;

-- 4. Function execute grants for Supabase API roles.
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by routine_name, grantee, privilege_type;

-- 5. Sensitive-looking public columns.
select
  table_schema,
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and column_name ~* '(password|token|secret|key|email|phone|address|business|registration|session|auth|endpoint|p256dh|file|path|memo|message|payload|metadata)'
order by table_name, column_name;

-- 6. Target table coverage for the deny-by-default migration candidate.
-- Keep this list in sync with production public table-like relations discovered by read-only metadata checks.
with expected(table_name) as (
  values
    ('_prisma_migrations'),
    ('activity_logs'),
    ('active_sessions'),
    ('api_keys'),
    ('backup_logs'),
    ('companies'),
    ('company_feedback'),
    ('company_folder_aliases'),
    ('company_storage'),
    ('contacts'),
    ('contact_status_history'),
    ('deliveries'),
    ('delivery_companies'),
    ('drawing_revisions'),
    ('erp_workers'),
    ('im_app_shared_settings'),
    ('im_company_billing_routes'),
    ('im_company_invoice_split_links'),
    ('im_company_manual_invoice_items'),
    ('im_company_master'),
    ('im_company_name_aliases'),
    ('im_desktop_worker_heartbeat'),
    ('im_dxf_classification_failures'),
    ('im_dxf_classification_log'),
    ('im_dxf_exclude_patterns'),
    ('im_dxf_files'),
    ('im_dxf_invoice_mapping'),
    ('im_dxf_operation_locks'),
    ('im_dxf_previews'),
    ('im_dxf_price_edit_locks'),
    ('im_failed_queue'),
    ('im_invoice_deferred_items'),
    ('im_invoice_details'),
    ('im_invoice_merge_locks'),
    ('im_invoice_summary'),
    ('im_invoice_work_status'),
    ('im_mobile_price_update_requests'),
    ('im_mobile_worker_heartbeat'),
    ('im_monthly_company_stats'),
    ('im_paper_size_pricing'),
    ('im_payment_history'),
    ('im_supplier_info'),
    ('im_tax_invoice'),
    ('im_tax_invoice_audit_log'),
    ('im_tax_invoice_items'),
    ('im_transmission_history'),
    ('im_web_operation_events'),
    ('im_web_operation_file_events'),
    ('im_web_operation_requests'),
    ('integration_runs'),
    ('inventory_items'),
    ('inventory_transactions'),
    ('job_events'),
    ('job_failures'),
    ('laser_only_mappings'),
    ('machines'),
    ('nesting_tasks'),
    ('notifications'),
    ('number_counters'),
    ('order_events'),
    ('orders'),
    ('password_reset_tokens'),
    ('portfolio'),
    ('posts'),
    ('program_heartbeats'),
    ('push_subscriptions'),
    ('share_links'),
    ('sync_logs'),
    ('system_settings'),
    ('tasks'),
    ('visit_bookings'),
    ('webhard_files'),
    ('webhard_folder_favorites'),
    ('webhard_folders'),
    ('webhard_logs'),
    ('webhard_settings'),
    ('webhard_sync_history'),
    ('webhard_sync_state'),
    ('webhard_user_settings'),
    ('worker_access_logs'),
    ('worker_notes')
)
select
  e.table_name,
  c.relname is not null as exists_in_public_schema,
  coalesce(c.relrowsecurity, false) as rls_enabled
from expected e
left join pg_class c
  on c.relname = e.table_name
  and c.relnamespace = 'public'::regnamespace
left join pg_namespace n
  on n.oid = c.relnamespace
  and n.nspname = 'public'
order by e.table_name;
