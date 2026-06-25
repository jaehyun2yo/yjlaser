-- Add Contact-centered operational identity fields to JobEvent/JobFailure.
-- Additive nullable migration. Production execution still requires the normal
-- backup and explicit migration approval gate.

ALTER TABLE "job_events"
  ADD COLUMN "contact_id" UUID,
  ADD COLUMN "inquiry_number" VARCHAR(100),
  ADD COLUMN "work_number" VARCHAR(100);

CREATE INDEX "job_events_contact_id_occurred_at_idx"
  ON "job_events"("contact_id", "occurred_at" DESC);

CREATE INDEX "job_events_inquiry_number_occurred_at_idx"
  ON "job_events"("inquiry_number", "occurred_at" DESC);

CREATE INDEX "job_events_work_number_occurred_at_idx"
  ON "job_events"("work_number", "occurred_at" DESC);

ALTER TABLE "job_failures"
  ADD COLUMN "contact_id" UUID,
  ADD COLUMN "inquiry_number" VARCHAR(100),
  ADD COLUMN "work_number" VARCHAR(100);

CREATE INDEX "job_failures_contact_id_created_at_idx"
  ON "job_failures"("contact_id", "created_at" DESC);

CREATE INDEX "job_failures_inquiry_number_created_at_idx"
  ON "job_failures"("inquiry_number", "created_at" DESC);

CREATE INDEX "job_failures_work_number_created_at_idx"
  ON "job_failures"("work_number", "created_at" DESC);
