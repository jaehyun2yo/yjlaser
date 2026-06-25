-- SyncLog is an audit trail, not a Contact relation. Store modern UUID contact
-- identifiers while preserving any legacy numeric ids as text.
ALTER TABLE "sync_logs"
  ALTER COLUMN "contact_id" TYPE VARCHAR(64)
  USING "contact_id"::text;
