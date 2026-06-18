-- Create webhard_user_settings table for storing user-specific settings
create table public.webhard_user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  settings_json jsonb not null default '{
    "downloadFolderPath": "Downloads",
    "notifyOnDownloadComplete": true,
    "notifyOnUploadComplete": true,
    "notifyOnError": true
  }'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint webhard_user_settings_user_id_key unique (user_id)
);

-- Note: RLS is disabled because we use custom session management
-- The API layer (route.ts) handles authorization by verifying the session user
-- alter table public.webhard_user_settings enable row level security;

-- Create indexes for better query performance
create index webhard_user_settings_user_id_idx on public.webhard_user_settings(user_id);
create index webhard_user_settings_updated_at_idx on public.webhard_user_settings(updated_at);
