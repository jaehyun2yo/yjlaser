-- Supabase RLS/grant remediation post-apply read-only checks.
-- Purpose: verify Advisor-critical conditions without reading application table rows.
-- Scope: metadata only. Run only after the separately approved production migration is applied.

-- 1. Failure rows: target public tables that still have RLS disabled.
with expected_target_tables(table_name) as (
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
),
existing_targets as (
  select
    e.table_name,
    c.relrowsecurity
  from expected_target_tables e
  join pg_class c
    on c.relname = e.table_name
    and c.relnamespace = 'public'::regnamespace
  where c.relkind in ('r', 'p')
)
select
  'failure_rls_disabled_target_tables' as check_name,
  table_name,
  'RLS remains disabled on an expected public table' as detail
from existing_targets
where relrowsecurity is false
order by table_name;

-- 2. Failure rows: anon/authenticated relation privileges outside the explicit allowlist.
with relation_privileges as (
  select
    c.relkind,
    c.relname as relation_name,
    case when a.grantee = 0 then 'PUBLIC' else r.rolname end as grantee_name,
    a.privilege_type
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  cross join lateral aclexplode(
    coalesce(
      c.relacl,
      acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner)
    )
  ) a
  left join pg_roles r
    on r.oid = a.grantee
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
),
allowed_authenticated_relations(relation_name, privilege_type) as (
  values
    ('mobile_unpriced_dxf_view', 'SELECT'),
    ('mobile_worker_status_view', 'SELECT')
)
select
  'failure_disallowed_relation_privileges' as check_name,
  relation_name,
  grantee_name,
  privilege_type,
  'Remove direct relation privilege or document a narrower exception' as detail
from relation_privileges rp
where grantee_name in ('PUBLIC', 'anon', 'authenticated')
  and (
    grantee_name in ('PUBLIC', 'anon')
    or relkind = 'S'
    or not exists (
      select 1
      from allowed_authenticated_relations ar
      where ar.relation_name = rp.relation_name
        and ar.privilege_type = rp.privilege_type
    )
  )
order by relation_name, grantee_name, privilege_type;

-- 3. Failure rows: public-schema function execute privileges outside the explicit allowlist.
with function_privileges as (
  select
    p.proname as function_name,
    oidvectortypes(p.proargtypes) as argument_types,
    case when a.grantee = 0 then 'PUBLIC' else r.rolname end as grantee_name,
    a.privilege_type,
    e.extname as extension_name
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r
    on r.oid = a.grantee
  left join pg_depend d
    on d.objid = p.oid
    and d.deptype = 'e'
  left join pg_extension e
    on e.oid = d.refobjid
  where n.nspname = 'public'
)
select
  'failure_disallowed_function_execute_privileges' as check_name,
  function_name,
  argument_types,
  grantee_name,
  privilege_type,
  'Remove public API role function execute privilege or document a narrower exception' as detail
from function_privileges fp
where grantee_name in ('PUBLIC', 'anon', 'authenticated')
  and extension_name is null
  and (
    grantee_name <> 'authenticated'
    or privilege_type <> 'EXECUTE'
    or function_name <> 'im_create_mobile_price_request'
    or argument_types <> 'bigint, integer, text, text'
  )
order by function_name, argument_types, grantee_name, privilege_type;

-- 4. Failure rows: sensitive-looking columns exposed through disallowed relation privileges.
with relation_privileges as (
  select
    c.oid as relation_oid,
    c.relkind,
    c.relname as relation_name,
    case when acl.grantee = 0 then 'PUBLIC' else r.rolname end as grantee_name,
    acl.privilege_type
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  cross join lateral aclexplode(
    coalesce(
      c.relacl,
      acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner)
    )
  ) acl
  left join pg_roles r
    on r.oid = acl.grantee
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
allowed_authenticated_relations(relation_name, privilege_type) as (
  values
    ('mobile_unpriced_dxf_view', 'SELECT'),
    ('mobile_worker_status_view', 'SELECT')
),
sensitive_columns as (
  select
    c.oid as relation_oid,
    c.relname as relation_name,
    a.attname as column_name
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  join pg_attribute a
    on a.attrelid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and a.attnum > 0
    and not a.attisdropped
    and a.attname ~* '(password|passwd|secret|token|key|email|phone|tel|mobile|address|birth|ssn|resident|business_number|registration|account|bank|credential|auth|session|api_key|storage_path|classified_path|file_path|path|url|payload|metadata)'
)
select
  'failure_sensitive_columns_exposed_by_disallowed_privileges' as check_name,
  sc.relation_name,
  sc.column_name,
  rp.grantee_name,
  rp.privilege_type,
  'Sensitive-looking column is reachable through a non-allowlisted API role privilege' as detail
from sensitive_columns sc
join relation_privileges rp
  on rp.relation_oid = sc.relation_oid
where rp.grantee_name in ('PUBLIC', 'anon', 'authenticated')
  and rp.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES')
  and (
    rp.grantee_name in ('PUBLIC', 'anon')
    or not exists (
      select 1
      from allowed_authenticated_relations ar
      where ar.relation_name = rp.relation_name
        and ar.privilege_type = rp.privilege_type
    )
  )
order by sc.relation_name, sc.column_name, rp.grantee_name, rp.privilege_type;

-- 5. Review rows: sensitive-looking columns on intentional authenticated allowlist surfaces.
with relation_privileges as (
  select
    c.oid as relation_oid,
    c.relname as relation_name,
    case when acl.grantee = 0 then 'PUBLIC' else r.rolname end as grantee_name,
    acl.privilege_type
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  left join pg_roles r
    on r.oid = acl.grantee
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
allowed_authenticated_relations(relation_name, privilege_type) as (
  values
    ('mobile_unpriced_dxf_view', 'SELECT'),
    ('mobile_worker_status_view', 'SELECT')
),
sensitive_columns as (
  select
    c.oid as relation_oid,
    c.relname as relation_name,
    a.attname as column_name
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  join pg_attribute a
    on a.attrelid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and a.attnum > 0
    and not a.attisdropped
    and a.attname ~* '(password|passwd|secret|token|key|email|phone|tel|mobile|address|birth|ssn|resident|business_number|registration|account|bank|credential|auth|session|api_key|storage_path|classified_path|file_path|path|url|payload|metadata)'
)
select
  'review_sensitive_columns_on_allowlisted_authenticated_surfaces' as check_name,
  sc.relation_name,
  sc.column_name,
  rp.grantee_name,
  rp.privilege_type,
  'Allowed authenticated surface still contains a sensitive-looking column name, confirm this is intentional' as detail
from sensitive_columns sc
join relation_privileges rp
  on rp.relation_oid = sc.relation_oid
join allowed_authenticated_relations ar
  on ar.relation_name = rp.relation_name
  and ar.privilege_type = rp.privilege_type
where rp.grantee_name = 'authenticated'
order by sc.relation_name, sc.column_name, rp.privilege_type;

-- 6. Failure row: im_is_admin guard is missing the service_role/admin checks or fixed search_path.
with target_function as (
  select
    p.oid,
    p.oid::regprocedure::text as function_signature,
    pg_get_functiondef(p.oid) as function_definition,
    coalesce(array_to_string(p.proconfig, ','), '') as function_config
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'im_is_admin'
    and oidvectortypes(p.proargtypes) = ''
),
evaluation as (
  select
    oid,
    function_signature,
    function_definition,
    function_config
  from target_function
  union all
  select
    null::oid,
    'public.im_is_admin()',
    '',
    ''
  where not exists (select 1 from target_function)
)
select
  'failure_im_is_admin_guard' as check_name,
  function_signature,
  function_config,
  'Function must use search_path=public and allow service_role or admin user role' as detail
from evaluation
where oid is null
  or function_config not ilike '%search_path=public%'
  or function_definition !~* 'service_role'
  or function_definition not ilike '%im_get_user_role%'
  or function_definition not ilike '%admin%';

-- 7. Failure rows: mobile API views must not run as security definer.
with target_views(relation_name) as (
  values
    ('mobile_unpriced_dxf_view'),
    ('mobile_worker_status_view')
),
view_options as (
  select
    tv.relation_name,
    c.reloptions
  from target_views tv
  left join pg_class c
    on c.relname = tv.relation_name
    and c.relnamespace = 'public'::regnamespace
    and c.relkind = 'v'
)
select
  'failure_security_definer_mobile_views' as check_name,
  relation_name,
  coalesce(array_to_string(reloptions, ','), '') as reloptions,
  'Mobile REST views must use security_invoker=true so RLS and grants run as the caller' as detail
from view_options
where reloptions is null
  or not ('security_invoker=true' = any(reloptions))
order by relation_name;

-- 8. Failure rows: explicit column grants to API roles outside the allowlist.
with column_privileges as (
  select
    c.relname as relation_name,
    a.attname as column_name,
    case when acl.grantee = 0 then 'PUBLIC' else r.rolname end as grantee_name,
    acl.privilege_type
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  join pg_attribute a
    on a.attrelid = c.oid
  cross join lateral aclexplode(a.attacl) acl
  left join pg_roles r
    on r.oid = acl.grantee
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
),
allowed_authenticated_columns(relation_name, column_name, privilege_type) as (
  values
    ('im_mobile_price_update_requests', 'id', 'SELECT'),
    ('im_mobile_price_update_requests', 'dxf_file_id', 'SELECT'),
    ('im_mobile_price_update_requests', 'requested_price', 'SELECT'),
    ('im_mobile_price_update_requests', 'status', 'SELECT'),
    ('im_mobile_price_update_requests', 'error_code', 'SELECT'),
    ('im_mobile_price_update_requests', 'error_message', 'SELECT'),
    ('im_mobile_price_update_requests', 'result_filename', 'SELECT'),
    ('im_mobile_price_update_requests', 'created_at', 'SELECT'),
    ('im_mobile_price_update_requests', 'updated_at', 'SELECT'),
    ('im_dxf_files', 'id', 'SELECT'),
    ('im_dxf_files', 'original_filename', 'SELECT'),
    ('im_dxf_files', 'company_name', 'SELECT'),
    ('im_dxf_files', 'file_date', 'SELECT'),
    ('im_dxf_files', 'file_number', 'SELECT'),
    ('im_dxf_files', 'year_month', 'SELECT'),
    ('im_dxf_files', 'price', 'SELECT'),
    ('im_dxf_files', 'price_source', 'SELECT'),
    ('im_dxf_files', 'md5_hash', 'SELECT'),
    ('im_dxf_files', 'updated_at', 'SELECT'),
    ('im_dxf_files', 'status', 'SELECT'),
    ('im_dxf_previews', 'dxf_file_id', 'SELECT'),
    ('im_dxf_previews', 'preview_kind', 'SELECT'),
    ('im_dxf_previews', 'status', 'SELECT'),
    ('im_dxf_previews', 'source_md5_hash', 'SELECT'),
    ('im_dxf_previews', 'updated_at', 'SELECT'),
    ('im_mobile_worker_heartbeat', 'online', 'SELECT'),
    ('im_mobile_worker_heartbeat', 'last_seen_at', 'SELECT'),
    ('im_mobile_worker_heartbeat', 'queue_depth', 'SELECT'),
    ('im_mobile_worker_heartbeat', 'oldest_queued_at', 'SELECT')
)
select
  'failure_disallowed_column_privileges' as check_name,
  relation_name,
  column_name,
  grantee_name,
  privilege_type,
  'Remove API role column privilege or add a documented narrow allowlist entry' as detail
from column_privileges cp
where grantee_name in ('PUBLIC', 'anon', 'authenticated')
  and (
    grantee_name in ('PUBLIC', 'anon')
    or not exists (
      select 1
      from allowed_authenticated_columns ac
      where ac.relation_name = cp.relation_name
        and ac.column_name = cp.column_name
        and ac.privilege_type = cp.privilege_type
    )
  )
order by relation_name, column_name, grantee_name, privilege_type;
