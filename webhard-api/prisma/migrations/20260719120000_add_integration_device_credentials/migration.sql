-- Device program types remain free strings in persistence. The service layer
-- owns the allowlist so new program releases do not require a schema migration.

CREATE TYPE "IntegrationDeviceStatus" AS ENUM ('pending_approval', 'active', 'revoked');

CREATE TYPE "DeviceRefreshCredentialStatus" AS ENUM ('prepared', 'active', 'revoked');

CREATE TYPE "DeviceCredentialRotationStatus" AS ENUM (
    'requested',
    'prepared',
    'acknowledged',
    'timed_out',
    'cancelled'
);

CREATE TABLE "integration_devices" (
    "id" TEXT NOT NULL,
    "environment" VARCHAR(3) NOT NULL,
    "program_type" VARCHAR(50) NOT NULL,
    "capability_profile" VARCHAR(20) NOT NULL DEFAULT 'standard',
    "display_name" VARCHAR(100) NOT NULL,
    "app_version" VARCHAR(50),
    "status" "IntegrationDeviceStatus" NOT NULL DEFAULT 'pending_approval',
    "credential_version" INTEGER NOT NULL DEFAULT 1,
    "approved_at" TIMESTAMP(3),
    "approved_by_actor_hash" VARCHAR(128),
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integration_devices_environment_check" CHECK ("environment" IN ('dev', 'stg', 'prd')),
    CONSTRAINT "integration_devices_capability_profile_check" CHECK ("capability_profile" IN ('standard', 'safe_canary')),
    CONSTRAINT "integration_devices_prd_approval_check" CHECK (
        "status" <> 'active'
        OR "environment" IN ('dev', 'stg')
        OR ("approved_at" IS NOT NULL AND "approved_by_actor_hash" IS NOT NULL)
    )
);

CREATE TABLE "device_enrollments" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "environment" VARCHAR(3) NOT NULL,
    "program_type" VARCHAR(50) NOT NULL,
    "capability_profile" VARCHAR(20) NOT NULL DEFAULT 'standard',
    "enrollment_code_hash" VARCHAR(128) NOT NULL,
    "hash_key_version" INTEGER NOT NULL DEFAULT 1,
    "candidate_credential_hash" VARCHAR(128),
    "expected_display_name_hash" VARCHAR(128),
    "replacement_device_id" TEXT,
    "approval_policy" VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
    "actor_hash" VARCHAR(128),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "invalidated_at" TIMESTAMP(3),
    "consumed_attempt_hash" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_enrollments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_enrollments_enrollment_code_hash_key" UNIQUE ("enrollment_code_hash"),
    CONSTRAINT "device_enrollments_environment_check" CHECK ("environment" IN ('dev', 'stg', 'prd')),
    CONSTRAINT "device_enrollments_capability_profile_check" CHECK ("capability_profile" IN ('standard', 'safe_canary')),
    CONSTRAINT "device_enrollments_hash_key_version_check" CHECK ("hash_key_version" >= 1),
    CONSTRAINT "device_enrollments_approval_policy_check" CHECK (
        "approval_policy" = 'pending_approval'
        OR ("approval_policy" = 'environment_auto' AND "environment" IN ('dev', 'stg'))
    ),
    CONSTRAINT "device_enrollments_terminal_state_check" CHECK (
        (
            "consumed_at" IS NULL
            AND "invalidated_at" IS NULL
            AND "candidate_credential_hash" IS NULL
            AND "consumed_attempt_hash" IS NULL
        )
        OR (
            "consumed_at" IS NOT NULL
            AND "invalidated_at" IS NULL
            AND "candidate_credential_hash" IS NOT NULL
            AND "consumed_attempt_hash" IS NOT NULL
        )
        OR (
            "consumed_at" IS NULL
            AND "invalidated_at" IS NOT NULL
            AND "candidate_credential_hash" IS NULL
            AND "consumed_attempt_hash" IS NULL
        )
    )
);

CREATE TABLE "device_refresh_credentials" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "credential_hash" VARCHAR(128) NOT NULL,
    "hash_key_version" INTEGER NOT NULL DEFAULT 1,
    "status" "DeviceRefreshCredentialStatus" NOT NULL DEFAULT 'prepared',
    "credential_version" INTEGER NOT NULL,
    "actor_hash" VARCHAR(128),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "token_request_id_hash" VARCHAR(128),
    "token_request_at" TIMESTAMP(3),
    "token_response_reference_hash" VARCHAR(128),
    "token_response_issued_at" TIMESTAMP(3),
    "token_response_replay_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_refresh_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_refresh_credentials_credential_hash_key" UNIQUE ("credential_hash"),
    CONSTRAINT "device_refresh_credentials_id_device_id_key" UNIQUE ("id", "device_id"),
    CONSTRAINT "device_refresh_credentials_hash_key_version_check" CHECK ("hash_key_version" >= 1),
    CONSTRAINT "device_refresh_credentials_active_state_check" CHECK (
        "status" <> 'active' OR "revoked_at" IS NULL
    ),
    CONSTRAINT "device_refresh_credentials_idempotency_check" CHECK (
        "token_request_id_hash" IS NULL
        OR (
            "token_request_at" IS NOT NULL
            AND "token_response_reference_hash" IS NOT NULL
            AND "token_response_issued_at" IS NOT NULL
            AND "token_response_replay_until" IS NOT NULL
        )
    )
);

CREATE TABLE "device_credential_rotations" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "candidate_credential_id" TEXT,
    "status" "DeviceCredentialRotationStatus" NOT NULL DEFAULT 'requested',
    "actor_hash" VARCHAR(128),
    "request_reason" VARCHAR(200),
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "prepared_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "timed_out_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_credential_rotations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_credential_rotations_candidate_credential_id_key" UNIQUE ("candidate_credential_id"),
    CONSTRAINT "device_credential_rotations_candidate_credential_device_id_key" UNIQUE ("candidate_credential_id", "device_id"),
    CONSTRAINT "device_credential_rotations_prepared_candidate_check" CHECK (
        "status" NOT IN ('prepared', 'acknowledged')
        OR ("candidate_credential_id" IS NOT NULL AND "prepared_at" IS NOT NULL)
    ),
    CONSTRAINT "device_credential_rotations_acknowledged_at_check" CHECK (
        "status" <> 'acknowledged' OR "acknowledged_at" IS NOT NULL
    ),
    CONSTRAINT "device_credential_rotations_timed_out_at_check" CHECK (
        "status" <> 'timed_out' OR "timed_out_at" IS NOT NULL
    ),
    CONSTRAINT "device_credential_rotations_cancelled_at_check" CHECK (
        "status" <> 'cancelled' OR "cancelled_at" IS NOT NULL
    )
);

CREATE TABLE "device_credential_audit_logs" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "refresh_credential_id" TEXT,
    "rotation_id" TEXT,
    "action" VARCHAR(80) NOT NULL,
    "actor_hash" VARCHAR(128),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_credential_audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "program_heartbeats" ADD COLUMN "device_id" TEXT;

ALTER TABLE "device_enrollments"
    ADD CONSTRAINT "device_enrollments_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "integration_devices"("id") ON DELETE SET NULL;

ALTER TABLE "device_enrollments"
    ADD CONSTRAINT "device_enrollments_replacement_device_id_fkey"
    FOREIGN KEY ("replacement_device_id") REFERENCES "integration_devices"("id") ON DELETE SET NULL;

ALTER TABLE "device_refresh_credentials"
    ADD CONSTRAINT "device_refresh_credentials_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "integration_devices"("id") ON DELETE CASCADE;

ALTER TABLE "device_credential_rotations"
    ADD CONSTRAINT "device_credential_rotations_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "integration_devices"("id") ON DELETE CASCADE;

ALTER TABLE "device_credential_rotations"
    ADD CONSTRAINT "device_credential_rotations_candidate_credential_device_fkey"
    FOREIGN KEY ("candidate_credential_id", "device_id")
    REFERENCES "device_refresh_credentials"("id", "device_id");

ALTER TABLE "device_credential_audit_logs"
    ADD CONSTRAINT "device_credential_audit_logs_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "integration_devices"("id") ON DELETE CASCADE;

ALTER TABLE "device_credential_audit_logs"
    ADD CONSTRAINT "device_credential_audit_logs_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "device_enrollments"("id") ON DELETE SET NULL;

ALTER TABLE "device_credential_audit_logs"
    ADD CONSTRAINT "device_credential_audit_logs_refresh_credential_id_fkey"
    FOREIGN KEY ("refresh_credential_id") REFERENCES "device_refresh_credentials"("id") ON DELETE SET NULL;

ALTER TABLE "device_credential_audit_logs"
    ADD CONSTRAINT "device_credential_audit_logs_rotation_id_fkey"
    FOREIGN KEY ("rotation_id") REFERENCES "device_credential_rotations"("id") ON DELETE SET NULL;

ALTER TABLE "program_heartbeats"
    ADD CONSTRAINT "program_heartbeats_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "integration_devices"("id") ON DELETE SET NULL;

CREATE INDEX "integration_devices_environment_program_type_status_idx"
    ON "integration_devices"("environment", "program_type", "status");

CREATE INDEX "integration_devices_program_type_status_idx"
    ON "integration_devices"("program_type", "status");

CREATE INDEX "device_enrollments_device_id_idx" ON "device_enrollments"("device_id");

CREATE INDEX "device_enrollments_replacement_device_id_idx"
    ON "device_enrollments"("replacement_device_id");

CREATE INDEX "device_enrollments_expires_at_idx" ON "device_enrollments"("expires_at");

CREATE INDEX "device_refresh_credentials_device_id_status_idx"
    ON "device_refresh_credentials"("device_id", "status");

CREATE INDEX "device_refresh_credentials_expires_at_idx"
    ON "device_refresh_credentials"("expires_at");

CREATE UNIQUE INDEX "device_refresh_credentials_one_active_per_device"
    ON "device_refresh_credentials"("device_id")
    WHERE "status" = 'active' AND "revoked_at" IS NULL;

CREATE UNIQUE INDEX "device_refresh_credentials_token_request_id_hash_key"
    ON "device_refresh_credentials"("device_id", "token_request_id_hash")
    WHERE "token_request_id_hash" IS NOT NULL;

CREATE INDEX "device_credential_rotations_device_id_status_idx"
    ON "device_credential_rotations"("device_id", "status");

CREATE INDEX "device_credential_rotations_deadline_at_idx"
    ON "device_credential_rotations"("deadline_at");

CREATE UNIQUE INDEX "device_credential_rotations_one_live_per_device"
    ON "device_credential_rotations"("device_id")
    WHERE "status" IN ('requested', 'prepared');

CREATE INDEX "device_credential_audit_logs_device_id_created_at_idx"
    ON "device_credential_audit_logs"("device_id", "created_at" DESC);

CREATE INDEX "device_credential_audit_logs_enrollment_id_idx"
    ON "device_credential_audit_logs"("enrollment_id");

CREATE INDEX "device_credential_audit_logs_refresh_credential_id_idx"
    ON "device_credential_audit_logs"("refresh_credential_id");

CREATE INDEX "device_credential_audit_logs_rotation_id_idx"
    ON "device_credential_audit_logs"("rotation_id");

CREATE INDEX "device_credential_audit_logs_expires_at_idx"
    ON "device_credential_audit_logs"("expires_at");

CREATE UNIQUE INDEX "program_heartbeats_device_id_key"
    ON "program_heartbeats"("device_id");

ALTER TABLE "integration_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_refresh_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_credential_rotations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_credential_audit_logs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "integration_devices" FROM PUBLIC;
REVOKE ALL ON TABLE "device_enrollments" FROM PUBLIC;
REVOKE ALL ON TABLE "device_refresh_credentials" FROM PUBLIC;
REVOKE ALL ON TABLE "device_credential_rotations" FROM PUBLIC;
REVOKE ALL ON TABLE "device_credential_audit_logs" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE "integration_devices" FROM anon';
        EXECUTE 'REVOKE ALL ON TABLE "device_enrollments" FROM anon';
        EXECUTE 'REVOKE ALL ON TABLE "device_refresh_credentials" FROM anon';
        EXECUTE 'REVOKE ALL ON TABLE "device_credential_rotations" FROM anon';
        EXECUTE 'REVOKE ALL ON TABLE "device_credential_audit_logs" FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE "integration_devices" FROM authenticated';
        EXECUTE 'REVOKE ALL ON TABLE "device_enrollments" FROM authenticated';
        EXECUTE 'REVOKE ALL ON TABLE "device_refresh_credentials" FROM authenticated';
        EXECUTE 'REVOKE ALL ON TABLE "device_credential_rotations" FROM authenticated';
        EXECUTE 'REVOKE ALL ON TABLE "device_credential_audit_logs" FROM authenticated';
    END IF;
END $$;
