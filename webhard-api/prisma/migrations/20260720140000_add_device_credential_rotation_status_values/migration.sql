-- PostgreSQL only exposes a newly added enum value after this migration commits.
-- Constraints that use these values intentionally live in the following migration.
ALTER TYPE "DeviceCredentialRotationStatus" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "DeviceCredentialRotationStatus" ADD VALUE IF NOT EXISTS 'revoked';
