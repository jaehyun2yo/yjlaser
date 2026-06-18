-- 웹하드 로그 테이블 생성
-- 파일 업로드, 다운로드, 삭제, 이동, 이름변경 등의 작업을 추적

create table if not exists public.webhard_logs (
  id bigserial primary key,
  action text not null check (action in ('upload', 'download', 'delete', 'move', 'rename')),
  file_name text not null,
  file_size bigint,
  company_id bigint references public.companies(id) on delete set null,
  user_id bigint, -- companies.id 또는 admin user id
  folder_path text,
  status text not null check (status in ('success', 'failed')) default 'success',
  error_message text,
  created_at timestamp with time zone default now() not null
);

-- 인덱스 생성 (쿼리 성능 최적화)
create index if not exists idx_webhard_logs_action on public.webhard_logs(action);
create index if not exists idx_webhard_logs_company_id on public.webhard_logs(company_id);
create index if not exists idx_webhard_logs_created_at on public.webhard_logs(created_at desc);
create index if not exists idx_webhard_logs_status on public.webhard_logs(status);

-- RLS (Row Level Security) 활성화
alter table public.webhard_logs enable row level security;

-- 개발 환경용 정책 (프로덕션에서는 더 엄격한 정책 필요)
-- 모든 사용자가 읽기/쓰기 가능
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'webhard_logs'
    and policyname = 'dev_anon_all'
  ) then
    create policy dev_anon_all on public.webhard_logs
      for all using (true) with check (true);
  end if;
end $$;

-- Realtime 활성화
alter publication supabase_realtime add table public.webhard_logs;
