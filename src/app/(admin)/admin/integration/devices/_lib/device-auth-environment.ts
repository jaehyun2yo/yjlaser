export const DEVICE_AUTH_ENVIRONMENTS = ['dev', 'stg', 'prd'] as const;

export type DeviceAuthEnvironment = (typeof DEVICE_AUTH_ENVIRONMENTS)[number];

export const DEVICE_AUTH_ENVIRONMENT_LABELS: Readonly<Record<DeviceAuthEnvironment, string>> =
  Object.freeze({
    dev: '개발 환경 (dev)',
    stg: '스테이징 환경 (stg)',
    prd: '운영 환경 (prd)',
  });

export function parseExpectedDeviceAuthEnvironment(value: unknown): DeviceAuthEnvironment | null {
  return typeof value === 'string' &&
    (DEVICE_AUTH_ENVIRONMENTS as readonly string[]).includes(value)
    ? (value as DeviceAuthEnvironment)
    : null;
}
