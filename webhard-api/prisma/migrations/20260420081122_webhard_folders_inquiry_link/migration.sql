-- AlterTable
ALTER TABLE "webhard_folders" ADD COLUMN     "contact_id" UUID,
ADD COLUMN     "folder_kind" VARCHAR(20) NOT NULL DEFAULT 'generic',
ADD COLUMN     "inquiry_number" TEXT,
ADD COLUMN     "work_number" TEXT;

-- CreateIndex
CREATE INDEX "webhard_folders_contact_id_idx" ON "webhard_folders"("contact_id");
