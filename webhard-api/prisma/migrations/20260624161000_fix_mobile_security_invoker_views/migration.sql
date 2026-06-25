BEGIN;

DO $$
BEGIN
    IF to_regclass('public.im_mobile_price_update_requests') IS NULL
        OR to_regclass('public.im_dxf_files') IS NULL
        OR to_regclass('public.im_dxf_previews') IS NULL
        OR to_regclass('public.im_mobile_worker_heartbeat') IS NULL THEN
        RAISE NOTICE 'Skipping mobile security invoker view migration because mobile tables are absent';
        RETURN;
    END IF;

    IF to_regprocedure('public.digest(text,text)') IS NULL THEN
        RAISE NOTICE 'Skipping mobile security invoker view migration because public.digest(text,text) is absent';
        RETURN;
    END IF;

    EXECUTE 'REVOKE SELECT ON TABLE public.im_mobile_price_update_requests FROM authenticated';
    EXECUTE 'REVOKE SELECT ON TABLE public.im_dxf_files FROM authenticated';
    EXECUTE 'REVOKE SELECT ON TABLE public.im_dxf_previews FROM authenticated';
    EXECUTE 'REVOKE SELECT ON TABLE public.im_mobile_worker_heartbeat FROM authenticated';

    EXECUTE $sql$
        GRANT SELECT (
            id,
            dxf_file_id,
            requested_price,
            status,
            error_code,
            error_message,
            result_filename,
            created_at,
            updated_at
        ) ON TABLE public.im_mobile_price_update_requests TO authenticated
    $sql$;

    EXECUTE $sql$
        GRANT SELECT (
            id,
            original_filename,
            company_name,
            file_date,
            file_number,
            year_month,
            price,
            price_source,
            md5_hash,
            updated_at,
            status
        ) ON TABLE public.im_dxf_files TO authenticated
    $sql$;

    EXECUTE $sql$
        GRANT SELECT (
            dxf_file_id,
            preview_kind,
            status,
            source_md5_hash,
            updated_at
        ) ON TABLE public.im_dxf_previews TO authenticated
    $sql$;

    EXECUTE $sql$
        GRANT SELECT (
            online,
            last_seen_at,
            queue_depth,
            oldest_queued_at
        ) ON TABLE public.im_mobile_worker_heartbeat TO authenticated
    $sql$;

    EXECUTE 'DROP POLICY IF EXISTS "mobile_unpriced_read" ON public.im_dxf_files';
    EXECUTE $policy$
        CREATE POLICY "mobile_unpriced_read" ON public.im_dxf_files
            FOR SELECT TO authenticated
            USING (COALESCE(price, 0) = 0 AND status = 'classified')
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS "mobile_preview_unpriced_read" ON public.im_dxf_previews';
    EXECUTE $policy$
        CREATE POLICY "mobile_preview_unpriced_read" ON public.im_dxf_previews
            FOR SELECT TO authenticated
            USING (
                preview_kind = 'classification'
                AND EXISTS (
                    SELECT 1
                    FROM public.im_dxf_files d
                    WHERE d.id = im_dxf_previews.dxf_file_id
                      AND COALESCE(d.price, 0) = 0
                      AND d.status = 'classified'
                )
            )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS "heartbeat_status_select" ON public.im_mobile_worker_heartbeat';
    EXECUTE $policy$
        CREATE POLICY "heartbeat_status_select" ON public.im_mobile_worker_heartbeat
            FOR SELECT TO authenticated
            USING (TRUE)
    $policy$;

    EXECUTE $view$
        CREATE OR REPLACE VIEW public.mobile_unpriced_dxf_view
        WITH (security_invoker = true) AS
        WITH latest_worker AS (
            SELECT MAX(last_seen_at) AS last_seen_at
            FROM public.im_mobile_worker_heartbeat
            WHERE online = TRUE
        )
        SELECT
            d.id AS dxf_file_id,
            d.original_filename,
            d.company_name,
            d.file_date,
            d.file_number,
            d.year_month,
            COALESCE(d.price, 0) AS current_price,
            d.price_source,
            d.md5_hash,
            d.updated_at,
            p.status AS preview_status,
            p.source_md5_hash AS preview_md5_hash,
            p.updated_at AS preview_updated_at,
            encode(
                digest(
                    concat_ws(
                        '|',
                        d.id::TEXT,
                        COALESCE(d.original_filename, ''),
                        COALESCE(d.company_name, ''),
                        COALESCE(d.price::TEXT, '0'),
                        COALESCE(d.price_source, ''),
                        COALESCE(d.md5_hash, ''),
                        COALESCE(d.updated_at::TEXT, ''),
                        COALESCE(p.source_md5_hash, ''),
                        COALESCE(p.updated_at::TEXT, '')
                    ),
                    'sha256'
                ),
                'hex'
            ) AS state_token,
            (latest_worker.last_seen_at >= NOW() - INTERVAL '90 seconds') AS worker_online,
            latest_worker.last_seen_at AS worker_last_seen_at
        FROM public.im_dxf_files d
        LEFT JOIN public.im_dxf_previews p
            ON p.dxf_file_id = d.id
            AND p.preview_kind = 'classification'
        CROSS JOIN latest_worker
        WHERE COALESCE(d.price, 0) = 0
          AND d.status = 'classified'
    $view$;

    EXECUTE $view$
        CREATE OR REPLACE VIEW public.mobile_worker_status_view
        WITH (security_invoker = true) AS
        WITH latest_worker AS (
            SELECT
                last_seen_at,
                queue_depth,
                oldest_queued_at
            FROM public.im_mobile_worker_heartbeat
            WHERE online = TRUE
            ORDER BY last_seen_at DESC
            LIMIT 1
        )
        SELECT
            COALESCE(latest_worker.queue_depth, 0)::BIGINT AS queued_count,
            latest_worker.oldest_queued_at,
            NULL::TIMESTAMPTZ AS newest_queued_at,
            CASE
                WHEN latest_worker.oldest_queued_at IS NULL THEN NULL::INTEGER
                ELSE EXTRACT(EPOCH FROM (NOW() - latest_worker.oldest_queued_at))::INTEGER
            END AS oldest_queue_age_seconds,
            latest_worker.last_seen_at AS worker_last_seen_at,
            COALESCE(latest_worker.last_seen_at >= NOW() - INTERVAL '90 seconds', FALSE) AS worker_online
        FROM (SELECT 1) seed
        LEFT JOIN latest_worker ON TRUE
    $view$;

    EXECUTE 'GRANT SELECT ON TABLE public.mobile_unpriced_dxf_view TO authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.mobile_worker_status_view TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.digest(TEXT, TEXT) TO authenticated';
END $$;

COMMIT;
