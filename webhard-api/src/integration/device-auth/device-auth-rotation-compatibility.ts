import {
  DEVICE_CREDENTIAL_ROTATION_STATUSES,
  type DeviceCredentialRotationStatus,
} from './device-auth.types';

export const DEVICE_AUTH_ROTATION_RUNTIME_OPERATIONS = [
  'request',
  'directive',
  'prepare',
  'ack',
] as const;

export type DeviceAuthRotationRuntimeOperation =
  (typeof DEVICE_AUTH_ROTATION_RUNTIME_OPERATIONS)[number];

export type DeviceAuthRotationCompatibilityErrorCode =
  | 'device_rotation_incompatible'
  | 'device_rotation_lifetime_invalid';

export class DeviceAuthRotationCompatibilityError extends Error {
  public readonly code: DeviceAuthRotationCompatibilityErrorCode;

  public constructor(code: DeviceAuthRotationCompatibilityErrorCode) {
    super(code);
    this.name = 'DeviceAuthRotationCompatibilityError';
    this.code = code;
  }

  public toJSON(): { readonly code: DeviceAuthRotationCompatibilityErrorCode } {
    return { code: this.code };
  }
}

export function deserializeDeviceCredentialRotationStatus(
  value: unknown
): DeviceCredentialRotationStatus {
  if (
    typeof value !== 'string' ||
    !(DEVICE_CREDENTIAL_ROTATION_STATUSES as readonly string[]).includes(value)
  ) {
    throw new DeviceAuthRotationCompatibilityError('device_rotation_incompatible');
  }

  return value as DeviceCredentialRotationStatus;
}

export function getDeviceAuthRotationRuntimeOperations(
  rotationRuntimeEnabled: boolean
): readonly DeviceAuthRotationRuntimeOperation[] {
  return rotationRuntimeEnabled ? DEVICE_AUTH_ROTATION_RUNTIME_OPERATIONS : Object.freeze([]);
}

export function requireCompatibleDeviceCredentialRotation(rotation: {
  readonly baseCredentialVersion: number | null;
  readonly predecessorCredentialId: string | null;
}): {
  readonly baseCredentialVersion: number;
  readonly predecessorCredentialId: string;
} {
  if (
    !Number.isSafeInteger(rotation.baseCredentialVersion) ||
    (rotation.baseCredentialVersion ?? 0) < 1 ||
    typeof rotation.predecessorCredentialId !== 'string' ||
    rotation.predecessorCredentialId.length === 0
  ) {
    throw new DeviceAuthRotationCompatibilityError('device_rotation_incompatible');
  }

  return Object.freeze({
    baseCredentialVersion: rotation.baseCredentialVersion as number,
    predecessorCredentialId: rotation.predecessorCredentialId,
  });
}

export function assertDeviceAuthRotationCredentialLifetime(input: {
  readonly deadlineAt: Date;
  readonly rotationAckRecoverySeconds: number;
  readonly predecessorExpiresAt: Date;
  readonly candidateExpiresAt: Date;
}): void {
  const deadlineAt = input.deadlineAt.getTime();
  const predecessorExpiresAt = input.predecessorExpiresAt.getTime();
  const candidateExpiresAt = input.candidateExpiresAt.getTime();
  const recoveryMilliseconds = input.rotationAckRecoverySeconds * 1_000;
  const recoveryEndsAt = deadlineAt + recoveryMilliseconds;

  if (
    !Number.isFinite(deadlineAt) ||
    !Number.isSafeInteger(input.rotationAckRecoverySeconds) ||
    input.rotationAckRecoverySeconds < 1 ||
    !Number.isFinite(recoveryEndsAt) ||
    !Number.isFinite(predecessorExpiresAt) ||
    !Number.isFinite(candidateExpiresAt) ||
    predecessorExpiresAt < recoveryEndsAt ||
    candidateExpiresAt <= recoveryEndsAt
  ) {
    throw new DeviceAuthRotationCompatibilityError('device_rotation_lifetime_invalid');
  }
}

export function buildDeviceAuthRotationCredentialTiming(input: {
  readonly now: Date;
  readonly rotationDeadlineSeconds: number;
  readonly rotationAckRecoverySeconds: number;
  readonly activeCredentialTtlMs: number;
  readonly predecessorExpiresAt: Date;
}): {
  readonly deadlineAt: Date;
  readonly candidateExpiresAt: Date;
} {
  const now = input.now.getTime();
  if (
    !Number.isFinite(now) ||
    !Number.isSafeInteger(input.rotationDeadlineSeconds) ||
    input.rotationDeadlineSeconds < 1 ||
    !Number.isSafeInteger(input.activeCredentialTtlMs) ||
    input.activeCredentialTtlMs < 1
  ) {
    throw new DeviceAuthRotationCompatibilityError('device_rotation_lifetime_invalid');
  }

  const deadlineAt = new Date(now + input.rotationDeadlineSeconds * 1_000);
  const candidateExpiresAt = new Date(now + input.activeCredentialTtlMs);
  assertDeviceAuthRotationCredentialLifetime({
    deadlineAt,
    rotationAckRecoverySeconds: input.rotationAckRecoverySeconds,
    predecessorExpiresAt: input.predecessorExpiresAt,
    candidateExpiresAt,
  });

  return Object.freeze({ deadlineAt, candidateExpiresAt });
}
