-- Create RPC function to count new files (uploaded within 24 hours) recursively (including subfolders)
create or replace function count_new_files_recursive(p_folder_id uuid)
returns bigint as $$
  with recursive folder_tree as (
    -- Base case: the specified folder
    select id from webhard_folders where id = p_folder_id
    union all
    -- Recursive case: all child folders
    select wf.id from webhard_folders wf
    inner join folder_tree ft on wf.parent_id = ft.id
  )
  select count(*)::bigint from webhard_files
  where folder_id in (select id from folder_tree) and created_at >= NOW() - INTERVAL '24 hours';
$$ language sql stable;
