BEGIN;

DO $$
DECLARE
    expected_tables TEXT[] := ARRAY[
        'public.im_mobile_price_update_requests',
        'public.im_dxf_files',
        'public.im_dxf_previews',
        'public.im_mobile_worker_heartbeat'
    ];
    present_count INTEGER;
    missing_tables TEXT[];
    view_options TEXT[];
    grant_count INTEGER;
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO present_count
    FROM unnest(expected_tables) AS expected(name)
    WHERE to_regclass(expected.name) IS NOT NULL;

    IF present_count = 0 THEN
        RAISE NOTICE 'Skipping mobile security assertion because mobile tables are absent';
        RETURN;
    END IF;

    IF present_count <> array_length(expected_tables, 1) THEN
        SELECT array_agg(expected.name)
        INTO missing_tables
        FROM unnest(expected_tables) AS expected(name)
        WHERE to_regclass(expected.name) IS NULL;

        RAISE EXCEPTION 'Mobile security schema is partial; missing tables: %', missing_tables;
    END IF;

    IF to_regprocedure('public.digest(text,text)') IS NULL THEN
        RAISE EXCEPTION 'Mobile security view assertion requires public.digest(text,text)';
    END IF;

    IF to_regclass('public.mobile_unpriced_dxf_view') IS NULL THEN
        RAISE EXCEPTION 'Missing public.mobile_unpriced_dxf_view';
    END IF;

    SELECT c.reloptions
    INTO view_options
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'mobile_unpriced_dxf_view';

    IF NOT (COALESCE(view_options, ARRAY[]::TEXT[]) @> ARRAY['security_invoker=true']::TEXT[]) THEN
        RAISE EXCEPTION 'public.mobile_unpriced_dxf_view must use security_invoker=true';
    END IF;

    IF to_regclass('public.mobile_worker_status_view') IS NULL THEN
        RAISE EXCEPTION 'Missing public.mobile_worker_status_view';
    END IF;

    SELECT c.reloptions
    INTO view_options
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'mobile_worker_status_view';

    IF NOT (COALESCE(view_options, ARRAY[]::TEXT[]) @> ARRAY['security_invoker=true']::TEXT[]) THEN
        RAISE EXCEPTION 'public.mobile_worker_status_view must use security_invoker=true';
    END IF;

    SELECT COUNT(*)
    INTO grant_count
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('mobile_unpriced_dxf_view', 'mobile_worker_status_view')
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT';

    IF grant_count <> 2 THEN
        RAISE EXCEPTION 'Mobile security views must grant SELECT to authenticated; found % grants', grant_count;
    END IF;

    SELECT COUNT(*)
    INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'im_dxf_files' AND policyname = 'mobile_unpriced_read')
        OR (tablename = 'im_dxf_previews' AND policyname = 'mobile_preview_unpriced_read')
        OR (tablename = 'im_mobile_worker_heartbeat' AND policyname = 'heartbeat_status_select')
      );

    IF policy_count <> 3 THEN
        RAISE EXCEPTION 'Mobile security policies are incomplete; found % policies', policy_count;
    END IF;
END $$;

COMMIT;
