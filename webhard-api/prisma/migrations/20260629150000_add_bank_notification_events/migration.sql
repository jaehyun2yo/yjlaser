CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "bank_notification_backup_batches" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "year" INTEGER NOT NULL,
  "file_name" VARCHAR(180) NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "event_count" INTEGER NOT NULL,
  "posted_from" TIMESTAMPTZ NOT NULL,
  "posted_to" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "bank_notification_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" VARCHAR(120) NOT NULL UNIQUE,
  "device_id_hash" VARCHAR(128) NOT NULL,
  "source_package" VARCHAR(120) NOT NULL,
  "notification_key_hash" VARCHAR(128) NOT NULL,
  "posted_at" TIMESTAMPTZ NOT NULL,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "raw_title" TEXT NOT NULL,
  "raw_text" TEXT NOT NULL,
  "raw_big_text" TEXT,
  "raw_payload" JSONB NOT NULL,
  "payload_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'new',
  "fetched_at" TIMESTAMPTZ,
  "processed_at" TIMESTAMPTZ,
  "backup_batch_id" UUID REFERENCES "bank_notification_backup_batches"("id"),
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_bank_notification_events_status_posted"
  ON "bank_notification_events"("status", "posted_at");
CREATE INDEX "idx_bank_notification_events_posted_at"
  ON "bank_notification_events"("posted_at");
CREATE INDEX "idx_bank_notification_events_backup_batch"
  ON "bank_notification_events"("backup_batch_id");
CREATE UNIQUE INDEX "uq_bank_notification_backup_year_file"
  ON "bank_notification_backup_batches"("year", "file_name");
CREATE INDEX "idx_bank_notification_backup_created_at"
  ON "bank_notification_backup_batches"("created_at");
