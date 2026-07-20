import { createHmac } from 'crypto';
import type { SessionUser } from '../../auth/auth.service';
import { DeviceAdminActorHashError, DeviceAdminActorHasher } from './device-admin-actor-hash';

const AUDIT_HMAC_SECRET = 'synthetic-device-auth-audit-hmac-secret-0123456789';

function makeAdmin(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userType: 'admin',
    userId: 'admin-001',
    companyId: null,
    ...overrides,
  };
}

function expectActorHashError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected admin actor hash operation to fail closed');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DeviceAdminActorHashError);
    expect((error as DeviceAdminActorHashError).code).toBe(code);
  }
}

describe('DeviceAdminActorHasher', () => {
  it('uses the exact environment-bound canonical admin payload and returns full lower hex', () => {
    const hasher = new DeviceAdminActorHasher('stg', AUDIT_HMAC_SECRET);

    const hash = hasher.hashAdmin(makeAdmin({ userId: 42 }));

    expect(hash).toBe(
      createHmac('sha256', AUDIT_HMAC_SECRET)
        .update('yjlaser:device-auth:v1:admin-actor:stg:admin:42', 'utf8')
        .digest('hex')
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hasher.hashAdmin(makeAdmin({ userId: 42 }))).toBe(hash);
    expect(
      new DeviceAdminActorHasher('prd', AUDIT_HMAC_SECRET).hashAdmin(makeAdmin({ userId: 42 }))
    ).not.toBe(hash);
    expect(hasher.hashAdmin(makeAdmin({ userId: 43 }))).not.toBe(hash);
  });

  it('never serializes the dedicated audit HMAC secret', () => {
    const hasher = new DeviceAdminActorHasher('dev', AUDIT_HMAC_SECRET);

    expect(JSON.stringify(hasher)).toBeUndefined();
  });

  it.each([
    makeAdmin({ userType: 'company' }),
    makeAdmin({ userType: 'worker' }),
    makeAdmin({ userType: 'integration' }),
    makeAdmin({ userId: '' }),
    makeAdmin({ userId: '   ' }),
    makeAdmin({ userId: Number.NaN }),
    makeAdmin({ userId: 1.5 }),
  ])('rejects a non-canonical non-admin principal without exposing its id', (user) => {
    const hasher = new DeviceAdminActorHasher('dev', AUDIT_HMAC_SECRET);

    expectActorHashError(() => hasher.hashAdmin(user), 'DEVICE_ADMIN_ACTOR_INVALID');
    try {
      hasher.hashAdmin(user);
    } catch (error: unknown) {
      const rawUserId = String(user.userId);
      if (rawUserId.length > 0) {
        expect(String(error)).not.toContain(rawUserId);
        expect(JSON.stringify(error)).not.toContain(rawUserId);
      }
    }
  });

  it('rejects blank, short, or non-string audit HMAC keys without echoing them', () => {
    for (const invalidSecret of [undefined, '', '   ', ' '.repeat(32), 'too-short', 123]) {
      let thrown: unknown;
      try {
        new DeviceAdminActorHasher('dev', invalidSecret);
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(DeviceAdminActorHashError);
      expect((thrown as DeviceAdminActorHashError).code).toBe(
        'DEVICE_ADMIN_ACTOR_HASH_SECRET_INVALID'
      );
      expect(String(thrown)).not.toContain('too-short');
    }
  });

  it('rejects an environment outside the three fixed device-auth deployments', () => {
    expectActorHashError(
      () => new DeviceAdminActorHasher('qa' as never, AUDIT_HMAC_SECRET),
      'DEVICE_ADMIN_ACTOR_HASH_ENVIRONMENT_INVALID'
    );
  });
});
