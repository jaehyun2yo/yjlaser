import {
  DeviceAuthRotationCompatibilityError,
  assertDeviceAuthRotationCredentialLifetime,
  buildDeviceAuthRotationCredentialTiming,
  deserializeDeviceCredentialRotationStatus,
  getDeviceAuthRotationRuntimeOperations,
  requireCompatibleDeviceCredentialRotation,
} from './device-auth-rotation-compatibility';

describe('device-auth rotation compatibility', () => {
  it.each([
    'requested',
    'prepared',
    'acknowledged',
    'timed_out',
    'cancelled',
    'expired',
    'revoked',
  ])('deserializes the old and new status %s', (status) => {
    expect(deserializeDeviceCredentialRotationStatus(status)).toBe(status);
  });

  it.each([undefined, null, '', 'EXPIRED', 'unknown', 1])(
    'rejects an unknown status without coercion: %p',
    (status) => {
      expect(() => deserializeDeviceCredentialRotationStatus(status)).toThrow(
        DeviceAuthRotationCompatibilityError
      );
    }
  );

  it('registers no request, directive, prepare, or ack operation while runtime is disabled', () => {
    expect(getDeviceAuthRotationRuntimeOperations(false)).toEqual([]);
  });

  it('exposes the exact runtime operation set only after the flag is enabled', () => {
    expect(getDeviceAuthRotationRuntimeOperations(true)).toEqual([
      'request',
      'directive',
      'prepare',
      'ack',
    ]);
  });

  it('accepts only a complete non-legacy base credential pair', () => {
    expect(
      requireCompatibleDeviceCredentialRotation({
        baseCredentialVersion: 3,
        predecessorCredentialId: 'credential-previous',
      })
    ).toEqual({
      baseCredentialVersion: 3,
      predecessorCredentialId: 'credential-previous',
    });
  });

  it.each([
    { baseCredentialVersion: null, predecessorCredentialId: null },
    { baseCredentialVersion: null, predecessorCredentialId: 'credential-previous' },
    { baseCredentialVersion: 3, predecessorCredentialId: null },
    { baseCredentialVersion: 0, predecessorCredentialId: 'credential-previous' },
  ])('fails closed for a legacy or partial base pair: %p', (rotation) => {
    try {
      requireCompatibleDeviceCredentialRotation(rotation);
      throw new Error('Expected incompatible rotation to fail closed');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DeviceAuthRotationCompatibilityError);
      expect((error as DeviceAuthRotationCompatibilityError).code).toBe(
        'device_rotation_incompatible'
      );
    }
  });

  it('keeps a pre-migration prepared null/null row readable but runtime-incompatible', () => {
    const row = {
      status: deserializeDeviceCredentialRotationStatus('prepared'),
      candidateCredentialId: 'credential-candidate',
      preparedAt: new Date('2026-07-20T00:00:00.000Z'),
      baseCredentialVersion: null,
      predecessorCredentialId: null,
    };

    expect(row.status).toBe('prepared');
    expect(() => requireCompatibleDeviceCredentialRotation(row)).toThrow(
      DeviceAuthRotationCompatibilityError
    );
  });

  it('accepts predecessor and candidate lifetimes strictly beyond deadline plus recovery', () => {
    const deadlineAt = new Date('2026-07-20T00:15:00.000Z');

    expect(
      assertDeviceAuthRotationCredentialLifetime({
        deadlineAt,
        rotationAckRecoverySeconds: 120,
        predecessorExpiresAt: new Date('2026-07-20T00:17:00.000Z'),
        candidateExpiresAt: new Date('2026-08-19T00:00:00.000Z'),
      })
    ).toBeUndefined();
  });

  it('derives candidate expiry from the existing active refresh-credential TTL', () => {
    const now = new Date('2026-07-20T00:00:00.000Z');

    expect(
      buildDeviceAuthRotationCredentialTiming({
        now,
        rotationDeadlineSeconds: 900,
        rotationAckRecoverySeconds: 120,
        activeCredentialTtlMs: 30 * 24 * 60 * 60 * 1_000,
        predecessorExpiresAt: new Date('2026-08-19T00:00:00.000Z'),
      })
    ).toEqual({
      deadlineAt: new Date('2026-07-20T00:15:00.000Z'),
      candidateExpiresAt: new Date('2026-08-19T00:00:00.000Z'),
    });
  });

  it.each([
    {
      label: 'predecessor expires before recovery ends',
      predecessorExpiresAt: new Date('2026-07-20T00:16:59.999Z'),
      candidateExpiresAt: new Date('2026-08-19T00:00:00.000Z'),
    },
    {
      label: 'candidate expires exactly when recovery ends',
      predecessorExpiresAt: new Date('2026-07-20T00:17:00.000Z'),
      candidateExpiresAt: new Date('2026-07-20T00:17:00.000Z'),
    },
  ])('rejects unsafe credential timing when $label', (input) => {
    expect(() =>
      assertDeviceAuthRotationCredentialLifetime({
        deadlineAt: new Date('2026-07-20T00:15:00.000Z'),
        rotationAckRecoverySeconds: 120,
        predecessorExpiresAt: input.predecessorExpiresAt,
        candidateExpiresAt: input.candidateExpiresAt,
      })
    ).toThrow(DeviceAuthRotationCompatibilityError);
  });
});
