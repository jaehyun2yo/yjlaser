ALTER TABLE "companies"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "deleted_previous_status" TEXT,
  ADD COLUMN "deleted_previous_webhard_access" BOOLEAN;

ALTER TABLE "webhard_folders"
  ADD COLUMN "deleted_by" TEXT;

CREATE INDEX "companies_deleted_at_idx" ON "companies"("deleted_at");
CREATE INDEX "companies_status_deleted_at_idx" ON "companies"("status", "deleted_at");
CREATE INDEX "webhard_folders_deleted_by_idx" ON "webhard_folders"("deleted_by");
