-- Create activity_logs table
create table if not exists public.activity_logs (
  id uuid not null default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin', 'company')),
  actor_id text not null,
  actor_name text,
  action text not null,
  resource_type text,
  resource_id text,
  details jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  constraint activity_logs_pkey primary key (id)
);

-- Enable RLS
alter table public.activity_logs enable row level security;

-- Create indexes
create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_id_idx on public.activity_logs (actor_id);
create index if not exists activity_logs_action_idx on public.activity_logs (action);

-- Note: No policies are created. This means ONLY the service_role key can access this table.
-- This is intentional for security purposes, as the application manages authentication
-- independently and will use the service role client for logging.
