-- Add is_downloaded column to track file download status
alter table public.webhard_files
add column is_downloaded boolean default false not null;

-- Create index for better query performance when checking undownloaded files
create index webhard_files_is_downloaded_folder_idx on public.webhard_files(folder_id, is_downloaded);
