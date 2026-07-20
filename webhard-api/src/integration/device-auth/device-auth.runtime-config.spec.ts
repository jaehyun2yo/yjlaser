import {
  DeviceAuthRuntimeConfigurationError,
  loadDeviceAuthRuntimeConfig,
  loadDeviceAuthRuntimeConfigFromConfigService,
} from './device-auth.runtime-config';

const PEPPER_V1 = 'synthetic-device-auth-runtime-pepper-v1-0123456789';
const PEPPER_V2 = 'synthetic-device-auth-runtime-pepper-v2-0123456789';
const AUDIT_HMAC_SECRET = 'synthetic-device-auth-runtime-audit-hmac-0123456789';
const ACCESS_TOKEN_SIGNING_SECRET = 'synthetic-device-auth-runtime-signing-secret-0123456789';
const TOKEN_EXCHANGE_HMAC_SECRET = 'synthetic-device-auth-runtime-exchange-hmac-0123456789';

function createAccessTokenKeyringJson(): string {
  return JSON.stringify([{ kid: 'runtime-current', secret: ACCESS_TOKEN_SIGNING_SECRET }]);
}

function createValidEnvironment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DEVICE_AUTH_ENVIRONMENT: 'stg',
    DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION: '2',
    DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON: JSON.stringify({
      '1': PEPPER_V1,
      '2': PEPPER_V2,
    }),
    DEVICE_AUTH_AUDIT_HMAC_SECRET: AUDIT_HMAC_SECRET,
    DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS: String(15 * 60 * 1000),
    DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS: String(30 * 24 * 60 * 60 * 1000),
    DEVICE_AUTH_AUDIT_LOG_TTL_MS: String(30 * 24 * 60 * 60 * 1000),
    DEVICE_AUTH_ACCESS_TOKEN_ISSUER: 'https://device-auth.example.test/stg',
    DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE: 'yjlaser-device-api/stg',
    DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID: 'runtime-current',
    DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON: createAccessTokenKeyringJson(),
    DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET: TOKEN_EXCHANGE_HMAC_SECRET,
    DEVICE_AUTH_ROTATION_DEADLINE_SECONDS: '900',
    DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS: '120',
    DEVICE_AUTH_ROTATION_RUNTIME_ENABLED: 'false',
    ...overrides,
  };
}

function expectRuntimeConfigurationError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected runtime configuration to fail closed');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DeviceAuthRuntimeConfigurationError);
    expect((error as DeviceAuthRuntimeConfigurationError).code).toBe(code);
  }
}

describe('device-auth runtime configuration', () => {
  it('loads exactly one configured environment, strict enrollment TTLs, isolated token configuration, and non-serializable hashers', () => {
    const runtime = loadDeviceAuthRuntimeConfig(createValidEnvironment());
    const extendedRuntime = runtime as typeof runtime & {
      readonly accessTokenConfig?: {
        readonly environment: string;
        readonly issuer: string;
        readonly audience: string;
        readonly keyring: { readonly currentKid: string };
      };
      readonly tokenExchangeRequestHasher?: { readonly digest: (requestId: string) => string };
    };

    expect(runtime.deviceAuthConfig.environment).toBe('stg');
    expect(runtime.deviceAuthConfig.currentHashKeyVersion).toBe(2);
    expect(runtime.deviceAuthConfig.credentialPepperKeyring.getRetainedHashKeyVersions()).toEqual([
      1, 2,
    ]);
    expect(runtime.enrollmentOptions).toEqual({
      preparedCredentialTtlMs: 15 * 60 * 1000,
      activeCredentialTtlMs: 30 * 24 * 60 * 60 * 1000,
      auditLogTtlMs: 30 * 24 * 60 * 60 * 1000,
    });
    expect(
      runtime.adminActorHasher.hashAdmin({
        userType: 'admin',
        userId: 'admin-001',
        companyId: null,
      })
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(extendedRuntime.accessTokenConfig).toMatchObject({
      environment: 'stg',
      issuer: 'https://device-auth.example.test/stg',
      audience: 'yjlaser-device-api/stg',
      keyring: { currentKid: 'runtime-current' },
    });
    expect(runtime.rotationOptions).toEqual({
      rotationDeadlineSeconds: 900,
      rotationAckRecoverySeconds: 120,
      rotationRuntimeEnabled: false,
    });
    expect(
      extendedRuntime.tokenExchangeRequestHasher?.digest(Buffer.alloc(16, 2).toString('base64url'))
    ).toMatch(/^[a-f0-9]{64}$/);

    const serialized = JSON.stringify(runtime);
    expect(serialized).not.toContain(PEPPER_V1);
    expect(serialized).not.toContain(PEPPER_V2);
    expect(serialized).not.toContain(AUDIT_HMAC_SECRET);
    expect(serialized).not.toContain(ACCESS_TOKEN_SIGNING_SECRET);
    expect(serialized).not.toContain(TOKEN_EXCHANGE_HMAC_SECRET);
    expect(serialized).not.toContain('"environment":"dev"');
    expect(serialized).not.toContain('"environment":"prd"');
  });

  it.each([undefined, '', 'dev ', 'DEV', 'qa', 123])(
    'rejects an invalid exact device-auth environment: %p',
    (environment) => {
      expectRuntimeConfigurationError(
        () =>
          loadDeviceAuthRuntimeConfig(
            createValidEnvironment({ DEVICE_AUTH_ENVIRONMENT: environment })
          ),
        'DEVICE_AUTH_RUNTIME_ENVIRONMENT_INVALID'
      );
    }
  );

  it.each([undefined, '', '0', '01', '1.5', '-1', '2147483648', 2])(
    'rejects an invalid canonical hash-key version: %p',
    (version) => {
      expectRuntimeConfigurationError(
        () =>
          loadDeviceAuthRuntimeConfig(
            createValidEnvironment({ DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION: version })
          ),
        'DEVICE_AUTH_RUNTIME_HASH_KEY_VERSION_INVALID'
      );
    }
  );

  it.each([
    undefined,
    '',
    'not-json',
    '[]',
    JSON.stringify({ '01': PEPPER_V1 }),
    JSON.stringify({ '1': 'too-short' }),
    JSON.stringify({ '1': PEPPER_V1 }),
  ])('rejects an invalid or incomplete selected-environment pepper keyring: %p', (keyring) => {
    expectRuntimeConfigurationError(
      () =>
        loadDeviceAuthRuntimeConfig(
          createValidEnvironment({ DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON: keyring })
        ),
      'DEVICE_AUTH_RUNTIME_PEPPER_KEYRING_INVALID'
    );
  });

  it.each([undefined, '', 'too-short', 123])(
    'rejects an invalid dedicated audit HMAC key: %p',
    (secret) => {
      let thrown: unknown;
      try {
        loadDeviceAuthRuntimeConfig(
          createValidEnvironment({ DEVICE_AUTH_AUDIT_HMAC_SECRET: secret })
        );
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(DeviceAuthRuntimeConfigurationError);
      expect((thrown as DeviceAuthRuntimeConfigurationError).code).toBe(
        'DEVICE_AUTH_RUNTIME_AUDIT_HMAC_SECRET_INVALID'
      );
      expect(String(thrown)).not.toContain('too-short');
    }
  );

  it.each([
    {
      label: 'blank issuer',
      overrides: { DEVICE_AUTH_ACCESS_TOKEN_ISSUER: '  ' },
    },
    {
      label: 'blank audience',
      overrides: { DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE: '' },
    },
    {
      label: 'noncanonical current kid',
      overrides: { DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID: 'CURRENT KEY' },
    },
    {
      label: 'signing secret shorter than 32 UTF-8 bytes',
      overrides: {
        DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON: JSON.stringify([
          { kid: 'runtime-current', secret: 'short' },
        ]),
      },
    },
    {
      label: 'missing current signing key',
      overrides: {
        DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON: JSON.stringify([
          { kid: 'another-key', secret: ACCESS_TOKEN_SIGNING_SECRET },
        ]),
      },
    },
    {
      label: 'more than one previous overlap key',
      overrides: {
        DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON: JSON.stringify([
          { kid: 'runtime-current', secret: ACCESS_TOKEN_SIGNING_SECRET },
          {
            kid: 'previous-one',
            secret: `${ACCESS_TOKEN_SIGNING_SECRET}-one`,
            verifyUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          },
          {
            kid: 'previous-two',
            secret: `${ACCESS_TOKEN_SIGNING_SECRET}-two`,
            verifyUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          },
        ]),
      },
    },
  ])('rejects $label from only the named access-token configuration', ({ overrides }) => {
    expectRuntimeConfigurationError(
      () => loadDeviceAuthRuntimeConfig(createValidEnvironment(overrides)),
      'DEVICE_AUTH_RUNTIME_ACCESS_TOKEN_CONFIG_INVALID'
    );
  });

  it.each([undefined, 'too-short-token-exchange-secret'])(
    'rejects a missing or invalid dedicated token-exchange HMAC secret without serializing it: %p',
    (secret) => {
      let thrown: unknown;
      try {
        loadDeviceAuthRuntimeConfig(
          createValidEnvironment({ DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET: secret })
        );
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(DeviceAuthRuntimeConfigurationError);
      expect((thrown as DeviceAuthRuntimeConfigurationError).code).toBe(
        'DEVICE_AUTH_RUNTIME_TOKEN_EXCHANGE_HMAC_SECRET_INVALID'
      );
      if (typeof secret === 'string') {
        expect(String(thrown)).not.toContain(secret);
        expect(JSON.stringify(thrown)).not.toContain(secret);
      }
    }
  );

  it.each([
    {
      key: 'DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS',
      invalidValues: [undefined, '', '299999', '86400001', '01', '1.5', 'not-a-number'],
      code: 'DEVICE_AUTH_RUNTIME_PREPARED_CREDENTIAL_TTL_INVALID',
    },
    {
      key: 'DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS',
      invalidValues: [undefined, '', '3599999', '7776000001', '01', '1.5', 'not-a-number'],
      code: 'DEVICE_AUTH_RUNTIME_ACTIVE_CREDENTIAL_TTL_INVALID',
    },
    {
      key: 'DEVICE_AUTH_AUDIT_LOG_TTL_MS',
      invalidValues: [undefined, '', '86399999', '31536000001', '01', '1.5', 'not-a-number'],
      code: 'DEVICE_AUTH_RUNTIME_AUDIT_LOG_TTL_INVALID',
    },
  ])('fails closed for $key outside its policy range', ({ key, invalidValues, code }) => {
    for (const invalidValue of invalidValues) {
      expectRuntimeConfigurationError(
        () => loadDeviceAuthRuntimeConfig(createValidEnvironment({ [key]: invalidValue })),
        code
      );
    }
  });

  it.each([
    {
      key: 'DEVICE_AUTH_ROTATION_DEADLINE_SECONDS',
      invalidValues: [undefined, '', '0', '299', '86401', '01', '1.5', '-1', 'not-a-number'],
      code: 'DEVICE_AUTH_RUNTIME_ROTATION_DEADLINE_INVALID',
    },
    {
      key: 'DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS',
      invalidValues: [undefined, '', '0', '4', '301', '01', '1.5', '-1', 'not-a-number'],
      code: 'DEVICE_AUTH_RUNTIME_ROTATION_ACK_RECOVERY_INVALID',
    },
  ])('fails closed for $key outside its rotation policy range', ({ key, invalidValues, code }) => {
    for (const invalidValue of invalidValues) {
      expectRuntimeConfigurationError(
        () => loadDeviceAuthRuntimeConfig(createValidEnvironment({ [key]: invalidValue })),
        code
      );
    }
  });

  it('rejects a recovery window equal to the rotation deadline', () => {
    expectRuntimeConfigurationError(
      () =>
        loadDeviceAuthRuntimeConfig(
          createValidEnvironment({
            DEVICE_AUTH_ROTATION_DEADLINE_SECONDS: '300',
            DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS: '300',
          })
        ),
      'DEVICE_AUTH_RUNTIME_ROTATION_CONSTRAINT_INVALID'
    );
  });

  it.each([
    {
      label: 'active credential TTL equals the deadline plus recovery boundary',
      overrides: {
        DEVICE_AUTH_ROTATION_DEADLINE_SECONDS: '3500',
        DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS: '100',
        DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS: '3600000',
      },
    },
    {
      label: 'active credential TTL cannot cover the maximum deadline and recovery',
      overrides: {
        DEVICE_AUTH_ROTATION_DEADLINE_SECONDS: '86400',
        DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS: '300',
        DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS: '86400000',
      },
    },
  ])('rejects rotation timing when $label', ({ overrides }) => {
    expectRuntimeConfigurationError(
      () => loadDeviceAuthRuntimeConfig(createValidEnvironment(overrides)),
      'DEVICE_AUTH_RUNTIME_ROTATION_CONSTRAINT_INVALID'
    );
  });

  it('accepts an active credential TTL one millisecond beyond deadline plus recovery', () => {
    expect(
      loadDeviceAuthRuntimeConfig(
        createValidEnvironment({
          DEVICE_AUTH_ROTATION_DEADLINE_SECONDS: '3500',
          DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS: '100',
          DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS: '3600001',
        })
      ).enrollmentOptions.activeCredentialTtlMs
    ).toBe(3_600_001);
  });

  it.each([undefined, 'false', false])(
    'defaults the rotation runtime off and accepts only an explicit false: %p',
    (value) => {
      expect(
        loadDeviceAuthRuntimeConfig(
          createValidEnvironment({ DEVICE_AUTH_ROTATION_RUNTIME_ENABLED: value })
        ).rotationOptions.rotationRuntimeEnabled
      ).toBe(false);
    }
  );

  it('enables the rotation runtime only with the exact string true', () => {
    expect(
      loadDeviceAuthRuntimeConfig(
        createValidEnvironment({ DEVICE_AUTH_ROTATION_RUNTIME_ENABLED: 'true' })
      ).rotationOptions.rotationRuntimeEnabled
    ).toBe(true);
  });

  it.each(['TRUE', 'False', '1', 'yes', true, 0, null])(
    'rejects ambiguous rotation runtime flag values: %p',
    (value) => {
      expectRuntimeConfigurationError(
        () =>
          loadDeviceAuthRuntimeConfig(
            createValidEnvironment({ DEVICE_AUTH_ROTATION_RUNTIME_ENABLED: value })
          ),
        'DEVICE_AUTH_RUNTIME_ROTATION_ENABLED_INVALID'
      );
    }
  );

  it('does not infer any device-auth setting from unrelated process configuration', () => {
    expectRuntimeConfigurationError(
      () =>
        loadDeviceAuthRuntimeConfig({
          NODE_ENV: 'production',
          SESSION_SECRET: AUDIT_HMAC_SECRET,
          LOG_IDENTIFIER_HASH_SECRET: AUDIT_HMAC_SECRET,
          JWT_SECRET: AUDIT_HMAC_SECRET,
        }),
      'DEVICE_AUTH_RUNTIME_ENVIRONMENT_INVALID'
    );
  });

  it('does not infer access-token or exchange secrets from generic JWT, API-key, or session names', () => {
    expectRuntimeConfigurationError(
      () =>
        loadDeviceAuthRuntimeConfig(
          createValidEnvironment({
            DEVICE_AUTH_ACCESS_TOKEN_ISSUER: undefined,
            DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE: undefined,
            DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID: undefined,
            DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON: undefined,
            DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET: undefined,
            JWT_SECRET: ACCESS_TOKEN_SIGNING_SECRET,
            API_KEY: TOKEN_EXCHANGE_HMAC_SECRET,
            SESSION_SECRET: TOKEN_EXCHANGE_HMAC_SECRET,
          })
        ),
      'DEVICE_AUTH_RUNTIME_ACCESS_TOKEN_CONFIG_INVALID'
    );
  });

  it('reads only the named device-auth variables from ConfigService without defaults', () => {
    const values = createValidEnvironment();
    const get = jest.fn((key: string) => values[key]);

    const runtime = loadDeviceAuthRuntimeConfigFromConfigService({ get });

    expect(runtime.deviceAuthConfig.environment).toBe('stg');
    expect(get.mock.calls.map(([key]) => key)).toEqual([
      'DEVICE_AUTH_ENVIRONMENT',
      'DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION',
      'DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON',
      'DEVICE_AUTH_AUDIT_HMAC_SECRET',
      'DEVICE_AUTH_PREPARED_CREDENTIAL_TTL_MS',
      'DEVICE_AUTH_ACTIVE_CREDENTIAL_TTL_MS',
      'DEVICE_AUTH_AUDIT_LOG_TTL_MS',
      'DEVICE_AUTH_ACCESS_TOKEN_ISSUER',
      'DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE',
      'DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID',
      'DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON',
      'DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET',
      'DEVICE_AUTH_ROTATION_DEADLINE_SECONDS',
      'DEVICE_AUTH_ROTATION_ACK_RECOVERY_SECONDS',
      'DEVICE_AUTH_ROTATION_RUNTIME_ENABLED',
    ]);
  });
});
