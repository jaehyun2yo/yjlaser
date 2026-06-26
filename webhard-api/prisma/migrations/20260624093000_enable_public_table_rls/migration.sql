-- Supabase Security Advisor remediation candidate.
--
-- Purpose:
-- - Enable RLS on all known public tables in Supabase project ibsbcuumkdhwesrpaqeb.
-- - Remove direct public-schema access from anon/authenticated.
-- - Re-grant only the mobile price-management surface to authenticated.
-- - Preserve service_role for server, Edge Function, and desktop-worker paths.
--
-- Production use requires the explicit approval phrase documented in:
-- docs/security/supabase-security-remediation-runbook-2026-06-24.md

BEGIN;

DO $$
DECLARE
    table_name text;
    table_names text[] := ARRAY[
        '_prisma_migrations',
        'activity_logs',
        'active_sessions',
        'api_keys',
        'backup_logs',
        'companies',
        'company_feedback',
        'company_folder_aliases',
        'company_storage',
        'contacts',
        'contact_status_history',
        'deliveries',
        'delivery_companies',
        'drawing_revisions',
        'erp_workers',
        'im_app_shared_settings',
        'im_company_billing_routes',
        'im_company_invoice_split_links',
        'im_company_manual_invoice_items',
        'im_company_master',
        'im_company_name_aliases',
        'im_desktop_worker_heartbeat',
        'im_dxf_classification_failures',
        'im_dxf_classification_log',
        'im_dxf_exclude_patterns',
        'im_dxf_files',
        'im_dxf_invoice_mapping',
        'im_dxf_operation_locks',
        'im_dxf_previews',
        'im_dxf_price_edit_locks',
        'im_failed_queue',
        'im_invoice_deferred_items',
        'im_invoice_details',
        'im_invoice_merge_locks',
        'im_invoice_summary',
        'im_invoice_work_status',
        'im_mobile_price_update_requests',
        'im_mobile_worker_heartbeat',
        'im_monthly_company_stats',
        'im_paper_size_pricing',
        'im_payment_history',
        'im_supplier_info',
        'im_tax_invoice',
        'im_tax_invoice_audit_log',
        'im_tax_invoice_items',
        'im_transmission_history',
        'im_web_operation_events',
        'im_web_operation_file_events',
        'im_web_operation_requests',
        'integration_runs',
        'inventory_items',
        'inventory_transactions',
        'job_events',
        'job_failures',
        'laser_only_mappings',
        'machines',
        'nesting_tasks',
        'notifications',
        'number_counters',
        'order_events',
        'orders',
        'password_reset_tokens',
        'portfolio',
        'posts',
        'program_heartbeats',
        'push_subscriptions',
        'share_links',
        'sync_logs',
        'system_settings',
        'tasks',
        'visit_bookings',
        'webhard_files',
        'webhard_folder_favorites',
        'webhard_folders',
        'webhard_logs',
        'webhard_settings',
        'webhard_sync_history',
        'webhard_sync_state',
        'webhard_user_settings',
        'worker_access_logs',
        'worker_notes'
    ];
BEGIN
    FOREACH table_name IN ARRAY table_names LOOP
        IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        END IF;
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
        REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
        REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
    END IF;

    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
END $$;

DO $$
DECLARE
    function_signature text;
BEGIN
    FOR function_signature IN
        SELECT p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC', function_signature);

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM anon', function_signature);
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM authenticated', function_signature);
        END IF;
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.im_is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF COALESCE(auth.role(), '') = 'service_role' THEN
        RETURN TRUE;
    END IF;

    IF to_regprocedure('public.im_get_user_role()') IS NOT NULL THEN
        RETURN public.im_get_user_role() = 'admin';
    END IF;

    RETURN FALSE;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.im_mobile_price_update_requests') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "request_select_own" ON public.im_mobile_price_update_requests';
        EXECUTE 'DROP POLICY IF EXISTS "request_admin_all" ON public.im_mobile_price_update_requests';
        EXECUTE 'CREATE POLICY "request_select_own" ON public.im_mobile_price_update_requests FOR SELECT TO authenticated USING (requested_by = auth.uid())';
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.mobile_unpriced_dxf_view') IS NOT NULL THEN
        GRANT SELECT ON TABLE public.mobile_unpriced_dxf_view TO authenticated;
    END IF;

    IF to_regclass('public.mobile_worker_status_view') IS NOT NULL THEN
        GRANT SELECT ON TABLE public.mobile_worker_status_view TO authenticated;
    END IF;

    IF to_regclass('public.im_mobile_price_update_requests') IS NOT NULL THEN
        GRANT SELECT ON TABLE public.im_mobile_price_update_requests TO authenticated;
    END IF;

    IF to_regprocedure('public.im_create_mobile_price_request(bigint,integer,text,text)') IS NOT NULL THEN
        GRANT EXECUTE ON FUNCTION public.im_create_mobile_price_request(BIGINT, INTEGER, TEXT, TEXT) TO authenticated;
    END IF;
END $$;

COMMIT;
