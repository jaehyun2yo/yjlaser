import {
  assertDevLifecycleInvocation,
  fingerprintDatabaseTarget,
  selectLifecycleFailure,
  type DevLifecycleEnvironment,
} from '../../../scripts/device-auth-dev-lifecycle-smoke';

const DEV_ENVIRONMENT: DevLifecycleEnvironment = {
  DOPPLER_CONFIG: 'dev',
  DEVICE_AUTH_ENVIRONMENT: 'dev',
  DATABASE_URL: 'postgresql://dev_user:secret@dev-db.example.test:5432/yjlaser_dev?sslmode=require',
};
const DEV_DATABASE_TARGET_SHA256 = fingerprintDatabaseTarget(DEV_ENVIRONMENT.DATABASE_URL);

describe('device-auth DEV lifecycle smoke safety gate', () => {
  it('requires the explicit DEV write confirmation flag', () => {
    expect(() => assertDevLifecycleInvocation([], DEV_ENVIRONMENT)).toThrow(
      'device_auth_dev_smoke_confirmation_required'
    );
  });

  it.each([
    [{ ...DEV_ENVIRONMENT, DOPPLER_CONFIG: 'prd' }],
    [{ ...DEV_ENVIRONMENT, DEVICE_AUTH_ENVIRONMENT: 'prd' }],
    [{ DOPPLER_CONFIG: 'dev' }],
    [{ DEVICE_AUTH_ENVIRONMENT: 'dev' }],
  ] satisfies ReadonlyArray<readonly [DevLifecycleEnvironment]>)(
    'rejects a non-DEV or incomplete environment',
    (environment) => {
      expect(() => assertDevLifecycleInvocation(['--confirm-dev-write'], environment)).toThrow(
        'device_auth_dev_smoke_environment_mismatch'
      );
    }
  );

  it('accepts only the explicit flag with matching DEV environment markers', () => {
    expect(() =>
      assertDevLifecycleInvocation(
        ['--confirm-dev-write'],
        DEV_ENVIRONMENT,
        DEV_DATABASE_TARGET_SHA256
      )
    ).not.toThrow();
  });

  it.each([
    [undefined],
    ['not-a-database-url'],
    ['mysql://dev_user:secret@dev-db.example.test/yjlaser_dev'],
    ['postgresql://dev_user:secret@production-db.example.test:5432/yjlaser'],
  ])('rejects a missing, invalid, or unexpected database target', (databaseUrl) => {
    expect(() =>
      assertDevLifecycleInvocation(
        ['--confirm-dev-write'],
        { ...DEV_ENVIRONMENT, DATABASE_URL: databaseUrl },
        DEV_DATABASE_TARGET_SHA256
      )
    ).toThrow('device_auth_dev_smoke_database_target_mismatch');
  });

  it('surfaces cleanup failure even when the lifecycle also failed', () => {
    expect(
      selectLifecycleFailure(new Error('lifecycle_failed'), new Error('cleanup_failed'))
    ).toEqual(new Error('device_auth_dev_smoke_lifecycle_and_cleanup_failed'));
  });

  it('sanitizes a cleanup-only failure', () => {
    expect(selectLifecycleFailure(undefined, new Error('sensitive_database_message'))).toEqual(
      new Error('device_auth_dev_smoke_cleanup_failed')
    );
  });

  it('preserves a lifecycle failure when cleanup succeeds', () => {
    const lifecycleFailure = new Error('device_auth_dev_smoke_status_mismatch');
    expect(selectLifecycleFailure(lifecycleFailure, undefined)).toBe(lifecycleFailure);
  });
});
