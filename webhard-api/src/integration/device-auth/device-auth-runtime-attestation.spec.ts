import { createDeviceAuthRuntimeAttestation } from './device-auth-runtime-attestation';

describe('createDeviceAuthRuntimeAttestation', () => {
  it.each(['dev', 'stg', 'prd'] as const)(
    'returns only the public runtime environment for %s',
    (environment) => {
      const attestation = createDeviceAuthRuntimeAttestation(environment);

      expect(attestation).toEqual({
        event: 'device_auth_runtime_attestation',
        environment,
      });
      expect(Object.keys(attestation)).toEqual(['event', 'environment']);
    }
  );
});
