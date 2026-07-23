import {
  DEVICE_AUTH_ENVIRONMENT_LABELS,
  parseExpectedDeviceAuthEnvironment,
} from '@/app/(admin)/admin/integration/devices/_lib/device-auth-environment';

describe('device-auth environment', () => {
  it.each(['dev', 'stg', 'prd'] as const)('accepts the exact %s environment', (value) => {
    expect(parseExpectedDeviceAuthEnvironment(value)).toBe(value);
  });

  it.each([undefined, '', 'DEV', 'production', 'dev ', null, 1])(
    'fails closed for an invalid environment value: %p',
    (value) => {
      expect(parseExpectedDeviceAuthEnvironment(value)).toBeNull();
    }
  );

  it('provides fixed administrator-facing labels for every supported environment', () => {
    expect(DEVICE_AUTH_ENVIRONMENT_LABELS).toEqual({
      dev: '개발 환경 (dev)',
      stg: '스테이징 환경 (stg)',
      prd: '운영 환경 (prd)',
    });
  });
});
