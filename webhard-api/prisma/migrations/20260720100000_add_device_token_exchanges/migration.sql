CREATE TYPE "DeviceTokenExchangeStatus" AS ENUM ('completed', 'revoked', 'expired');

CREATE TABLE "device_token_exchanges" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "previous_credential_id" TEXT NOT NULL,
    "successor_credential_id" TEXT NOT NULL,
    "request_id_digest" VARCHAR(128) NOT NULL,
    "credential_version" INTEGER NOT NULL,
    "status" "DeviceTokenExchangeStatus" NOT NULL DEFAULT 'completed',
    "completed_at" TIMESTAMP(3) NOT NULL,
    "recoverable_until" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_token_exchanges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_token_exchanges_successor_credential_id_key" UNIQUE ("successor_credential_id"),
    CONSTRAINT "device_token_exchanges_successor_credential_id_device_id_key" UNIQUE ("successor_credential_id", "device_id"),
    CONSTRAINT "device_token_exchanges_device_id_request_id_digest_key" UNIQUE ("device_id", "request_id_digest"),
    CONSTRAINT "device_token_exchanges_request_id_digest_check" CHECK (char_length("request_id_digest") > 0),
    CONSTRAINT "device_token_exchanges_credential_version_check" CHECK ("credential_version" >= 1),
    CONSTRAINT "device_token_exchanges_completion_window_check" CHECK ("completed_at" <= "recoverable_until"),
    CONSTRAINT "device_token_exchanges_terminal_state_check" CHECK (
        ("status" = 'completed' AND "revoked_at" IS NULL)
        OR ("status" = 'revoked' AND "revoked_at" IS NOT NULL)
        OR ("status" = 'expired' AND "revoked_at" IS NULL)
    )
);

ALTER TABLE "device_token_exchanges"
    ADD CONSTRAINT "device_token_exchanges_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "integration_devices"("id") ON DELETE CASCADE;

ALTER TABLE "device_token_exchanges"
    ADD CONSTRAINT "device_token_exchanges_previous_credential_device_fkey"
    FOREIGN KEY ("previous_credential_id", "device_id")
    REFERENCES "device_refresh_credentials"("id", "device_id") ON DELETE CASCADE;

ALTER TABLE "device_token_exchanges"
    ADD CONSTRAINT "device_token_exchanges_successor_credential_device_fkey"
    FOREIGN KEY ("successor_credential_id", "device_id")
    REFERENCES "device_refresh_credentials"("id", "device_id") ON DELETE CASCADE;

CREATE INDEX "device_token_exchanges_previous_credential_id_status_idx"
    ON "device_token_exchanges"("previous_credential_id", "status");

CREATE INDEX "device_token_exchanges_recoverable_until_idx"
    ON "device_token_exchanges"("recoverable_until");

ALTER TABLE "device_token_exchanges" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "device_token_exchanges" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE "device_token_exchanges" FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE "device_token_exchanges" FROM authenticated';
    END IF;
END $$;
