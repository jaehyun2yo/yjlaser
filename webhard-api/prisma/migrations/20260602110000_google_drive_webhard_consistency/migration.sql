-- Enforce that Google Drive-backed webhard metadata always points to a
-- concrete Google Drive object. Development fixture rows created before this
-- migration are removed because they have no backing storage object.

DELETE FROM webhard_files
WHERE storage_provider = 'google_drive'
  AND drive_file_id IS NULL;

UPDATE webhard_files
SET folder_id = NULL
WHERE folder_id IN (
  SELECT id
  FROM webhard_folders
  WHERE storage_provider = 'google_drive'
    AND drive_folder_id IS NULL
);

DELETE FROM webhard_folders
WHERE storage_provider = 'google_drive'
  AND drive_folder_id IS NULL;

CREATE UNIQUE INDEX webhard_folders_one_active_company_root_idx
ON webhard_folders (company_id)
WHERE company_id IS NOT NULL
  AND parent_id IS NULL
  AND deleted_at IS NULL;

ALTER TABLE webhard_files
  ADD CONSTRAINT webhard_files_google_drive_file_id_required
  CHECK (storage_provider <> 'google_drive' OR drive_file_id IS NOT NULL);

ALTER TABLE webhard_folders
  ADD CONSTRAINT webhard_folders_google_drive_folder_id_required
  CHECK (storage_provider <> 'google_drive' OR drive_folder_id IS NOT NULL);
