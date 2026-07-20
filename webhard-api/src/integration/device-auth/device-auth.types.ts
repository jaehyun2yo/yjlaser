import type { IntegrationPermission } from '../auth/integration-permissions';

export const DEVICE_AUTH_ENVIRONMENTS = ['dev', 'stg', 'prd'] as const;

export type DeviceAuthEnvironment = (typeof DEVICE_AUTH_ENVIRONMENTS)[number];
export type DeviceAuthHashKeyVersion = number;

export const DEVICE_CAPABILITY_PROFILES = ['standard', 'safe_canary'] as const;

export type DeviceCapabilityProfile = (typeof DEVICE_CAPABILITY_PROFILES)[number];

export const DEVICE_AUTH_PROGRAM_TYPES = [
  'external_webhard_sync',
  'management_program',
  'nesting_program',
] as const;

export type DeviceAuthProgramType = (typeof DEVICE_AUTH_PROGRAM_TYPES)[number];

export const DEVICE_TOKEN_EXCHANGE_STATUSES = ['completed', 'revoked', 'expired'] as const;

export type DeviceTokenExchangeStatus = (typeof DEVICE_TOKEN_EXCHANGE_STATUSES)[number];

export const DEVICE_CREDENTIAL_ROTATION_STATUSES = [
  'requested',
  'prepared',
  'acknowledged',
  'timed_out',
  'cancelled',
  'expired',
  'revoked',
] as const;

export type DeviceCredentialRotationStatus = (typeof DEVICE_CREDENTIAL_ROTATION_STATUSES)[number];

export type DeviceAccessTokenConfigurationErrorCode =
  | 'DEVICE_ACCESS_TOKEN_CONFIG_INVALID'
  | 'DEVICE_ACCESS_TOKEN_ENVIRONMENT_INVALID'
  | 'DEVICE_ACCESS_TOKEN_ENVIRONMENT_CONFIG_MISSING'
  | 'DEVICE_ACCESS_TOKEN_ISSUER_INVALID'
  | 'DEVICE_ACCESS_TOKEN_AUDIENCE_INVALID'
  | 'DEVICE_ACCESS_TOKEN_CURRENT_KID_INVALID'
  | 'DEVICE_ACCESS_TOKEN_SIGNING_KEYRING_INVALID'
  | 'DEVICE_ACCESS_TOKEN_KEY_ID_INVALID'
  | 'DEVICE_ACCESS_TOKEN_KEY_ID_DUPLICATE'
  | 'DEVICE_ACCESS_TOKEN_KEY_SECRET_INVALID'
  | 'DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID'
  | 'DEVICE_ACCESS_TOKEN_CURRENT_KEY_MISSING';

export type DeviceAccessTokenErrorCode =
  | 'DEVICE_ACCESS_TOKEN_INPUT_INVALID'
  | 'DEVICE_ACCESS_TOKEN_INVALID';

export type DeviceAuthConfigurationErrorCode =
  | 'DEVICE_AUTH_CONFIG_INVALID'
  | 'DEVICE_AUTH_ENVIRONMENT_INVALID'
  | 'DEVICE_AUTH_ENVIRONMENT_CONFIG_MISSING'
  | 'DEVICE_AUTH_CURRENT_HASH_KEY_VERSION_INVALID'
  | 'DEVICE_AUTH_PEPPER_KEYRING_INVALID'
  | 'DEVICE_AUTH_PEPPER_INVALID'
  | 'DEVICE_AUTH_CURRENT_HASH_KEY_MISSING';

export type DeviceAuthRuntimeConfigurationErrorCode =
  | 'DEVICE_AUTH_RUNTIME_CONFIG_INVALID'
  | 'DEVICE_AUTH_RUNTIME_ENVIRONMENT_INVALID'
  | 'DEVICE_AUTH_RUNTIME_HASH_KEY_VERSION_INVALID'
  | 'DEVICE_AUTH_RUNTIME_PEPPER_KEYRING_INVALID'
  | 'DEVICE_AUTH_RUNTIME_AUDIT_HMAC_SECRET_INVALID'
  | 'DEVICE_AUTH_RUNTIME_ACCESS_TOKEN_CONFIG_INVALID'
  | 'DEVICE_AUTH_RUNTIME_TOKEN_EXCHANGE_HMAC_SECRET_INVALID'
  | 'DEVICE_AUTH_RUNTIME_PREPARED_CREDENTIAL_TTL_INVALID'
  | 'DEVICE_AUTH_RUNTIME_ACTIVE_CREDENTIAL_TTL_INVALID'
  | 'DEVICE_AUTH_RUNTIME_AUDIT_LOG_TTL_INVALID'
  | 'DEVICE_AUTH_RUNTIME_ROTATION_DEADLINE_INVALID'
  | 'DEVICE_AUTH_RUNTIME_ROTATION_ACK_RECOVERY_INVALID'
  | 'DEVICE_AUTH_RUNTIME_ROTATION_CONSTRAINT_INVALID'
  | 'DEVICE_AUTH_RUNTIME_ROTATION_ENABLED_INVALID';

export type DeviceAdminActorHashErrorCode =
  | 'DEVICE_ADMIN_ACTOR_HASH_SECRET_INVALID'
  | 'DEVICE_ADMIN_ACTOR_HASH_ENVIRONMENT_INVALID'
  | 'DEVICE_ADMIN_ACTOR_INVALID';

export type DeviceCredentialHashErrorCode =
  | 'DEVICE_CREDENTIAL_INPUT_INVALID'
  | 'DEVICE_CREDENTIAL_CURRENT_HASH_KEY_UNAVAILABLE';

export type DeviceCredentialVerificationFailureCode =
  | 'DEVICE_CREDENTIAL_INPUT_INVALID'
  | 'DEVICE_CREDENTIAL_STORED_HASH_INVALID'
  | 'DEVICE_CREDENTIAL_HASH_KEY_VERSION_UNAVAILABLE'
  | 'DEVICE_CREDENTIAL_MISMATCH';

export type DeviceTokenExchangeRequestHashErrorCode =
  | 'DEVICE_TOKEN_EXCHANGE_REQUEST_ID_INVALID'
  | 'DEVICE_TOKEN_EXCHANGE_HMAC_SECRET_INVALID'
  | 'DEVICE_TOKEN_EXCHANGE_ENVIRONMENT_INVALID';

export interface DeviceCredentialHash {
  readonly hashKeyVersion: DeviceAuthHashKeyVersion;
  readonly credentialHash: string;
}

export type DeviceEnrollmentErrorCode =
  | 'DEVICE_ENROLLMENT_INVALID'
  | 'DEVICE_ENROLLMENT_CONFLICT'
  | 'DEVICE_ENROLLMENT_UNAVAILABLE';

export type DeviceManagementErrorCode =
  | 'DEVICE_MANAGEMENT_INVALID'
  | 'DEVICE_MANAGEMENT_CONFLICT'
  | 'DEVICE_MANAGEMENT_UNAVAILABLE';

export type DeviceTokenExchangeErrorCode =
  | 'DEVICE_TOKEN_EXCHANGE_INVALID'
  | 'DEVICE_TOKEN_EXCHANGE_CONFLICT'
  | 'DEVICE_TOKEN_EXCHANGE_REVOKED'
  | 'DEVICE_TOKEN_EXCHANGE_UNAVAILABLE'
  | 'DEVICE_ROTATION_INCOMPATIBLE';

export interface CreateEnrollmentCodeInput {
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly expectedDisplayName: string;
  readonly actorHash: string;
}

export interface EnrollmentCodeCreated {
  readonly enrollmentCode: string;
  readonly enrollmentId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly expiresAt: Date;
}

export interface EnrollDeviceInput {
  readonly enrollmentCode: string;
  readonly enrollmentAttemptId: string;
  readonly displayName: string;
  readonly refreshCredential: string;
  readonly appVersion?: string;
}

export interface EnrollmentStatusInput {
  readonly enrollmentAttemptId: string;
  readonly refreshCredential: string;
}

export interface ApproveEnrollmentInput {
  readonly deviceId: string;
  readonly actorHash: string;
}

export interface DeviceEnrollmentStatus {
  readonly deviceId: string;
  readonly state: 'pending_approval' | 'active' | 'revoked';
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly credentialVersion: number;
}

export interface ManagedDeviceSummary {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly displayName: string;
  readonly appVersion?: string;
  readonly state: 'pending_approval' | 'active' | 'revoked';
  readonly credentialVersion: number;
  readonly enrolledAt: Date;
  readonly approvedAt?: Date;
  readonly lastHeartbeatAt?: Date;
  readonly revokedAt?: Date;
}

export type DeviceCredentialVerificationResult =
  | {
      readonly valid: true;
    }
  | {
      readonly valid: false;
      readonly code: DeviceCredentialVerificationFailureCode;
    };

export interface DeviceAccessTokenClaims {
  readonly sub: string;
  readonly environment: DeviceAuthEnvironment;
  readonly program_type: DeviceAuthProgramType;
  readonly permissions: readonly string[];
  readonly capability_profile: DeviceCapabilityProfile;
  readonly credential_version: number;
  readonly token_type: 'device_access';
  readonly iat: number;
  readonly exp: number;
}

export interface DeviceAccessTokenIssueInput {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly permissions: readonly string[];
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly credentialVersion: number;
}

export interface DeviceAccessPrincipal {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly permissions: readonly IntegrationPermission[];
  readonly credentialVersion: number;
}

export interface DeviceTokenExchangeInput {
  readonly deviceId: string;
  readonly refreshCredential: string;
  readonly nextRefreshCredential: string;
  readonly refreshRequestId: string;
}

export interface DeviceTokenExchangeResult {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly credentialVersion: number;
  readonly accessToken: string;
  readonly refreshCredentialAction: 'replace_with_candidate' | 'keep_current';
  readonly rotation?: {
    readonly id: string;
    readonly deadlineAt: string;
  };
}
