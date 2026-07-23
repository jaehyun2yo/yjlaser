import type { DeviceAuthEnvironment } from './device-auth.types';

export interface DeviceAuthRuntimeAttestation {
  readonly event: 'device_auth_runtime_attestation';
  readonly environment: DeviceAuthEnvironment;
}

export function createDeviceAuthRuntimeAttestation(
  environment: DeviceAuthEnvironment
): DeviceAuthRuntimeAttestation {
  return Object.freeze({
    event: 'device_auth_runtime_attestation',
    environment,
  });
}
