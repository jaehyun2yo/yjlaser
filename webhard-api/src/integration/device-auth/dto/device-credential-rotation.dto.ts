import type { DeviceCredentialRotationStatus } from '../device-auth.types';

export interface DeviceRotationSummary {
  readonly id: string;
  readonly deviceId: string;
  readonly status: DeviceCredentialRotationStatus;
  readonly deadlineAt: string;
  readonly credentialVersion?: number;
}
