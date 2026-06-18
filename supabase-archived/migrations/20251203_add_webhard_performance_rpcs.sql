-- Webhard Performance Optimization RPCs
-- Created: 2025-12-03
-- Purpose: Improve Vercel deployment performance by using DB-level aggregations

-- 1. Storage SUM function (avoids loading all files to JS for sum calculation)
create or replace function sum_webhard_file_sizes(p_company_id bigint default null)
returns bigint as $$
  select coalesce(sum(size), 0)::bigint
  from webhard_files
  where deleted_at is null
    and (p_company_id is null or company_id = p_company_id);
$$ language sql stable;

-- 2. Batch undownloaded count for multiple folders (avoids N+1 queries)
-- Returns folder_id and count pairs for all requested folders
create or replace function count_new_files_recursive_batch(p_folder_ids uuid[])
returns table(folder_id uuid, count bigint) as $$
  with recursive all_folder_trees as (
    -- Base case: all specified folders
    select id as root_id, id from webhard_folders where id = any(p_folder_ids)
    union all
    -- Recursive case: all child folders
    select aft.root_id, wf.id
    from webhard_folders wf
    inner join all_folder_trees aft on wf.parent_id = aft.id
    where wf.deleted_at is null
  ),
  file_counts as (
    select
      aft.root_id,
      count(wf.id) as file_count
    from all_folder_trees aft
    left join webhard_files wf on wf.folder_id = aft.id
      and wf.is_downloaded = false
      and wf.created_at >= NOW() - INTERVAL '24 hours'
      and wf.deleted_at is null
    group by aft.root_id
  )
  select
    fc.root_id as folder_id,
    fc.file_count as count
  from file_counts fc;
$$ language sql stable;

-- 3. Update existing count_new_files_recursive to include is_downloaded check
create or replace function count_new_files_recursive(p_folder_id uuid)
returns bigint as $$
  with recursive folder_tree as (
    -- Base case: the specified folder
    select id from webhard_folders where id = p_folder_id and deleted_at is null
    union all
    -- Recursive case: all child folders
    select wf.id from webhard_folders wf
    inner join folder_tree ft on wf.parent_id = ft.id
    where wf.deleted_at is null
  )
  select count(*)::bigint from webhard_files
  where folder_id in (select id from folder_tree)
    and is_downloaded = false
    and created_at >= NOW() - INTERVAL '24 hours'
    and deleted_at is null;
$$ language sql stable;

-- 4. Add performance indexes for common webhard queries
create index if not exists idx_webhard_files_new_undownloaded
  on webhard_files(folder_id, is_downloaded, created_at)
  where deleted_at is null and is_downloaded = false;

create index if not exists idx_webhard_files_company_size
  on webhard_files(company_id, size)
  where deleted_at is null;

create index if not exists idx_webhard_folders_parent
  on webhard_folders(parent_id)
  where deleted_at is null;

-- 5. Search optimization indexes (for ilike queries)
create index if not exists idx_webhard_files_name_trgm
  on webhard_files using gin (name gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_webhard_files_original_name_trgm
  on webhard_files using gin (original_name gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_webhard_folders_name_trgm
  on webhard_folders using gin (name gin_trgm_ops)
  where deleted_at is null;

-- 6. Folder listing indexes
create index if not exists idx_webhard_files_folder_created
  on webhard_files(folder_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_webhard_files_company_folder
  on webhard_files(company_id, folder_id)
  where deleted_at is null;

-- Comments for documentation
comment on function sum_webhard_file_sizes is 'Calculates total file size for a company or all companies. Used for storage quota display.';
comment on function count_new_files_recursive_batch is 'Batch version of count_new_files_recursive. Returns counts for multiple folders in one query to avoid N+1.';
comment on function count_new_files_recursive is 'Counts undownloaded files created within 24 hours in a folder and all subfolders.';
