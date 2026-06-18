-- CreateTable
CREATE TABLE "company_folder_aliases" (
    "id" SERIAL NOT NULL,
    "folder_name" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_folder_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_folder_aliases_folder_name_idx" ON "company_folder_aliases"("folder_name");

-- CreateIndex
CREATE INDEX "company_folder_aliases_status_idx" ON "company_folder_aliases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "company_folder_aliases_folder_name_company_id_key" ON "company_folder_aliases"("folder_name", "company_id");

-- AddForeignKey
ALTER TABLE "company_folder_aliases" ADD CONSTRAINT "company_folder_aliases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
