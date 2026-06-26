export interface RuntimeEnv {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  RAILWAY_ENVIRONMENT?: string;
  OPERATIONAL_E2E_MOCK_STORAGE?: string;
}

export function isProductionLikeRuntime(env: RuntimeEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'production' ||
    env.VERCEL_ENV === 'production' ||
    env.RAILWAY_ENVIRONMENT === 'production'
  );
}

export function isOperationalE2eMockStorageEnabled(env: RuntimeEnv = process.env): boolean {
  const enabled = env.OPERATIONAL_E2E_MOCK_STORAGE === 'true';
  if (enabled && isProductionLikeRuntime(env)) {
    throw new Error('OPERATIONAL_E2E_MOCK_STORAGE is not allowed in production runtime');
  }
  return enabled;
}
