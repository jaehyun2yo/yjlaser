CREATE TYPE "StorageProvider" AS ENUM ('r2', 'google_drive');
CREATE TYPE "DriveProvisioningStatus" AS ENUM ('pending', 'ready', 'failed');

ALTER TABLE "companies"
  ADD COLUMN "drive_root_folder_id" TEXT,
  ADD COLUMN "drive_provisioning_status" "DriveProvisioningStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "drive_provisioning_error" TEXT,
  ADD COLUMN "drive_provisioning_last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "drive_provisioned_at" TIMESTAMP(3);

ALTER TABLE "webhard_files"
  ADD COLUMN "storage_provider" "StorageProvider" NOT NULL DEFAULT 'r2',
  ADD COLUMN "drive_file_id" TEXT,
  ADD COLUMN "drive_mime_type" TEXT;

ALTER TABLE "webhard_folders"
  ADD COLUMN "storage_provider" "StorageProvider" NOT NULL DEFAULT 'r2',
  ADD COLUMN "drive_folder_id" TEXT;

ALTER TABLE "webhard_files"
  ALTER COLUMN "storage_provider" SET DEFAULT 'google_drive';

ALTER TABLE "webhard_folders"
  ALTER COLUMN "storage_provider" SET DEFAULT 'google_drive';

ALTER TABLE "share_links"
  ADD COLUMN "webhard_file_id" TEXT;

CREATE INDEX "companies_drive_provisioning_status_idx"
  ON "companies"("drive_provisioning_status");
CREATE INDEX "webhard_files_drive_file_id_idx"
  ON "webhard_files"("drive_file_id");
CREATE INDEX "webhard_files_storage_provider_idx"
  ON "webhard_files"("storage_provider");
CREATE INDEX "webhard_folders_drive_folder_id_idx"
  ON "webhard_folders"("drive_folder_id");
CREATE INDEX "webhard_folders_storage_provider_idx"
  ON "webhard_folders"("storage_provider");
CREATE INDEX "share_links_webhard_file_id_idx"
  ON "share_links"("webhard_file_id");
