-- Fix: Add company_id filtering to webhard RPC functions
-- Created: 2025-12-17
-- Purpose: Ensure company users can only see their own files in badge counts

-- 1. Update count_new_files_recursive_batch to support company filtering
drop function if exists count_new_files_recursive_batch(uuid[]);

create or replace function count_new_files_recursive_batch(
  p_folder_ids uuid[],
  p_company_id bigint default null
)
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
      and (p_company_id is null or wf.company_id = p_company_id)
    group by aft.root_id
  )
  select
    fc.root_id as folder_id,
    fc.file_count as count
  from file_counts fc;
$$ language sql stable;

-- 2. Update count_new_files_recursive to support company filtering
drop function if exists count_new_files_recursive(uuid);

create or replace function count_new_files_recursive(
  p_folder_id uuid,
  p_company_id bigint default null
)
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
    and deleted_at is null
    and (p_company_id is null or company_id = p_company_id);
$$ language sql stable;

-- 3. Update count_all_badge_data to ensure company filtering works correctly
drop function if exists count_all_badge_data(bigint);

create or replace function count_all_badge_data(p_company_id bigint default null)
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'total_count', (
      select count(*) from webhard_files
      where deleted_at is null
        and is_downloaded = false
        and created_at >= NOW() - INTERVAL '24 hours'
        and (p_company_id is null or company_id = p_company_id)
    ),
    'folder_counts', (
      select coalesce(json_agg(
        json_build_object(
          'folder_id', fc.folder_id,
          'count', fc.count
        )
      ), '[]'::json)
      from (
        select
          f.id as folder_id,
          count(wf.id) as count
        from webhard_folders f
        left join (
          select id, folder_id
          from webhard_files
          where deleted_at is null
            and is_downloaded = false
            and created_at >= NOW() - INTERVAL '24 hours'
            and (p_company_id is null or company_id = p_company_id)
        ) wf on wf.folder_id = f.id
        where f.deleted_at is null
          and (p_company_id is null or f.company_id = p_company_id)
        group by f.id
      ) fc
    )
  ) into result;

  return result;
end;
$$ language plpgsql stable;

-- 4. Update count_all_undownloaded_files to ensure company filtering
drop function if exists count_all_undownloaded_files(bigint);

create or replace function count_all_undownloaded_files(p_company_id bigint default null)
returns bigint as $$
  select count(*)::bigint from webhard_files
  where deleted_at is null
    and is_downloaded = false
    and created_at >= NOW() - INTERVAL '24 hours'
    and (p_company_id is null or company_id = p_company_id);
$$ language sql stable;

-- Comments
comment on function count_new_files_recursive_batch(uuid[], bigint) is 'Batch counts for multiple folders with optional company filter. Company users should pass their company_id.';
comment on function count_new_files_recursive(uuid, bigint) is 'Single folder recursive count with optional company filter.';
comment on function count_all_badge_data(bigint) is 'Returns all badge data (total + folder counts) in one call. Filters by company_id if provided.';
comment on function count_all_undownloaded_files(bigint) is 'Total undownloaded new files count with optional company filter.';
