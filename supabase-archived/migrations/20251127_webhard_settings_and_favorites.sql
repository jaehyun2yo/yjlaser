-- Create webhard_settings table
CREATE TABLE IF NOT EXISTS webhard_settings (
    user_id TEXT PRIMARY KEY,
    font_size TEXT DEFAULT 'small',
    notifications_enabled BOOLEAN DEFAULT true,
    download_folder_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create webhard_folder_favorites table
CREATE TABLE IF NOT EXISTS webhard_folder_favorites (
    user_id TEXT NOT NULL,
    folder_id UUID NOT NULL REFERENCES webhard_folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, folder_id)
);

-- Migrate existing favorites (assign to the folder creator) and drop column safely
DO $$
BEGIN
    -- Check if is_favorite column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhard_folders' AND column_name = 'is_favorite') THEN
        -- Migrate data
        EXECUTE 'INSERT INTO webhard_folder_favorites (user_id, folder_id) SELECT created_by::text, id FROM webhard_folders WHERE is_favorite = true ON CONFLICT DO NOTHING';

        -- Drop column
        EXECUTE 'ALTER TABLE webhard_folders DROP COLUMN is_favorite';
    END IF;
END $$;

-- RLS is not enabled for these tables as authentication is handled by the application layer (Next.js API routes)
-- and the Supabase client uses the Anon key without Supabase Auth context.
-- Security is enforced by verifySession() in the API endpoints.
