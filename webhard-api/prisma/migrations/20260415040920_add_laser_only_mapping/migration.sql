-- CreateTable
CREATE TABLE "laser_only_mappings" (
    "id" SERIAL NOT NULL,
    "folder_name" TEXT NOT NULL,
    "company_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laser_only_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "laser_only_mappings_folder_name_key" ON "laser_only_mappings"("folder_name");

-- CreateIndex
CREATE INDEX "laser_only_mappings_folder_name_idx" ON "laser_only_mappings"("folder_name");

-- CreateIndex
CREATE INDEX "laser_only_mappings_company_id_idx" ON "laser_only_mappings"("company_id");

-- AddForeignKey
ALTER TABLE "laser_only_mappings" ADD CONSTRAINT "laser_only_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
