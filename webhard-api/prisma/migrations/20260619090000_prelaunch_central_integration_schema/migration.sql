-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billing_status" VARCHAR(30),
ADD COLUMN     "classification_status" VARCHAR(30),
ADD COLUMN     "confirmation_status" VARCHAR(30),
ADD COLUMN     "nesting_status" VARCHAR(30),
ADD COLUMN     "production_status" VARCHAR(30);

-- CreateTable
CREATE TABLE "job_events" (
    "id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "event_version" INTEGER NOT NULL,
    "source_worker" VARCHAR(50) NOT NULL,
    "source_version" VARCHAR(50),
    "order_id" TEXT,
    "job_id" TEXT,
    "integration_run_id" TEXT,
    "worker_local_id" VARCHAR(255),
    "result" VARCHAR(20) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER,
    "processed_count" INTEGER,
    "payload" JSONB NOT NULL,
    "state_apply_status" VARCHAR(20) NOT NULL DEFAULT 'not_applicable',
    "failure_id" TEXT,
    "order_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_failures" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "order_id" TEXT,
    "source_worker" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100),
    "error_code" VARCHAR(100) NOT NULL,
    "message" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" VARCHAR(100),
    "resolution_note" TEXT,
    "last_event_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_failures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_runs" (
    "id" TEXT NOT NULL,
    "worker_type" VARCHAR(50) NOT NULL,
    "source_version" VARCHAR(50),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "result" VARCHAR(20) NOT NULL DEFAULT 'running',
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_events_idempotency_key_key" ON "job_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "job_events_order_id_occurred_at_idx" ON "job_events"("order_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "job_events_job_id_occurred_at_idx" ON "job_events"("job_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "job_events_integration_run_id_occurred_at_idx" ON "job_events"("integration_run_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "job_events_source_worker_occurred_at_idx" ON "job_events"("source_worker", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "job_events_failure_id_idx" ON "job_events"("failure_id");

-- CreateIndex
CREATE INDEX "job_events_occurred_at_idx" ON "job_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "job_failures_job_id_created_at_idx" ON "job_failures"("job_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "job_failures_order_id_created_at_idx" ON "job_failures"("order_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "job_failures_source_worker_resolved_at_created_at_idx" ON "job_failures"("source_worker", "resolved_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "job_failures_retryable_resolved_at_created_at_idx" ON "job_failures"("retryable", "resolved_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "job_failures_last_event_id_idx" ON "job_failures"("last_event_id");

-- CreateIndex
CREATE INDEX "integration_runs_worker_type_started_at_idx" ON "integration_runs"("worker_type", "started_at" DESC);

-- CreateIndex
CREATE INDEX "integration_runs_result_started_at_idx" ON "integration_runs"("result", "started_at" DESC);

-- CreateIndex
CREATE INDEX "integration_runs_finished_at_idx" ON "integration_runs"("finished_at");

-- CreateIndex
CREATE INDEX "orders_production_status_idx" ON "orders"("production_status");

-- CreateIndex
CREATE INDEX "orders_confirmation_status_idx" ON "orders"("confirmation_status");

-- CreateIndex
CREATE INDEX "orders_classification_status_idx" ON "orders"("classification_status");

-- CreateIndex
CREATE INDEX "orders_nesting_status_idx" ON "orders"("nesting_status");

-- CreateIndex
CREATE INDEX "orders_billing_status_idx" ON "orders"("billing_status");

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_integration_run_id_fkey" FOREIGN KEY ("integration_run_id") REFERENCES "integration_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_failure_id_fkey" FOREIGN KEY ("failure_id") REFERENCES "job_failures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_failures" ADD CONSTRAINT "job_failures_last_event_id_fkey" FOREIGN KEY ("last_event_id") REFERENCES "job_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
