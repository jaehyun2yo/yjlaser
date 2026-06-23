-- CreateTable
CREATE TABLE "log_events" (
    "id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "event_id" VARCHAR(100) NOT NULL,
    "correlation_id" VARCHAR(100) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" VARCHAR(20) NOT NULL,
    "project" VARCHAR(40) NOT NULL,
    "component" VARCHAR(80) NOT NULL,
    "feature" VARCHAR(80) NOT NULL,
    "event" VARCHAR(120) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "duration_ms" INTEGER,
    "count" INTEGER,
    "actor_type" VARCHAR(40),
    "actor_id_hash" VARCHAR(128),
    "target_type" VARCHAR(40),
    "target_id_hash" VARCHAR(128),
    "error_type" VARCHAR(80),
    "error_code" VARCHAR(80),
    "error_message" VARCHAR(240),
    "hash_key_version" VARCHAR(40),
    "span_id" VARCHAR(40),
    "metadata" JSONB,
    "client_id_hash" VARCHAR(64) NOT NULL,
    "key_id_hash" VARCHAR(64),
    "payload_hash" VARCHAR(64) NOT NULL,
    "retention_expires_at" TIMESTAMP(3) NOT NULL,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_log_events_client_event" ON "log_events"("client_id_hash", "event_id");

-- CreateIndex
CREATE INDEX "idx_log_events_occurred_at" ON "log_events"("occurred_at");

-- CreateIndex
CREATE INDEX "idx_log_events_received_at" ON "log_events"("received_at");

-- CreateIndex
CREATE INDEX "idx_log_events_project_channel_level_time" ON "log_events"("project", "channel", "level", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_log_events_correlation_id" ON "log_events"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_log_events_event_id" ON "log_events"("event_id");

-- CreateIndex
CREATE INDEX "idx_log_events_retention" ON "log_events"("retention_expires_at", "legal_hold");
