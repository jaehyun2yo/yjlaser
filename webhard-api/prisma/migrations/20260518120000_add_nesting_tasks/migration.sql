CREATE TABLE "nesting_tasks" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "priority" INTEGER NOT NULL DEFAULT 10,
  "dxf_file_urls" JSONB NOT NULL DEFAULT '[]',
  "sheet_width" DOUBLE PRECISION NOT NULL DEFAULT 1220,
  "sheet_height" DOUBLE PRECISION NOT NULL DEFAULT 2440,
  "options" JSONB NOT NULL DEFAULT '{}',
  "total_sheets" INTEGER,
  "total_usage_rate" DOUBLE PRECISION,
  "unplaced_count" INTEGER,
  "result_reported_at" TIMESTAMP(3),
  "message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nesting_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nesting_tasks_status_priority_created_at_idx"
  ON "nesting_tasks"("status", "priority", "created_at");
CREATE INDEX "nesting_tasks_order_id_idx" ON "nesting_tasks"("order_id");

ALTER TABLE "nesting_tasks"
  ADD CONSTRAINT "nesting_tasks_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
