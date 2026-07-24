-- This migration is deliberately additive. Existing rotation rows keep the
-- legacy NULL/NULL base pair and remain readable by the compatibility build.
-- The expired/revoked enum values were committed by the preceding migration.

ALTER TABLE "device_credential_rotations"
    ADD COLUMN "base_credential_version" INTEGER,
    ADD COLUMN "predecessor_credential_id" TEXT,
    ADD COLUMN "expired_at" TIMESTAMP(3),
    ADD COLUMN "revoked_at" TIMESTAMP(3);

ALTER TABLE "device_credential_rotations"
    ADD CONSTRAINT "device_credential_rotations_base_credential_version_check" CHECK (
        (
            "base_credential_version" IS NULL
            AND "predecessor_credential_id" IS NULL
        )
        OR (
            "base_credential_version" IS NOT NULL
            AND "base_credential_version" >= 1
            AND "predecessor_credential_id" IS NOT NULL
        )
    ),
    ADD CONSTRAINT "device_credential_rotations_expired_at_check" CHECK ("status" <> 'expired' OR "expired_at" IS NOT NULL),
    ADD CONSTRAINT "device_credential_rotations_revoked_at_check" CHECK ("status" <> 'revoked' OR "revoked_at" IS NOT NULL);

ALTER TABLE "device_credential_rotations"
    ADD CONSTRAINT "device_credential_rotations_predecessor_credential_device_fkey"
    FOREIGN KEY ("predecessor_credential_id", "device_id")
    REFERENCES "device_refresh_credentials"("id", "device_id")
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;

CREATE INDEX "device_credential_rotations_predecessor_status_idx"
    ON "device_credential_rotations"("predecessor_credential_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "device_credential_rotations_one_live_per_device"
    ON "device_credential_rotations"("device_id")
    WHERE "status" IN ('requested', 'prepared');
