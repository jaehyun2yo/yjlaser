import {
  DeviceAccessTokenConfigurationError,
  loadDeviceAccessTokenConfig,
} from './device-access-token.config';

const CURRENT_SECRET = 'synthetic-current-signing-secret-0123456789';
const PREVIOUS_SECRET = 'synthetic-previous-signing-secret-0123456789';
const NOW = new Date('2026-07-20T00:00:00.000Z');

type TokenConfigInput = {
  environment: unknown;
  environments: Record<string, unknown>;
};

function createValidInput(): TokenConfigInput {
  return {
    environment: 'dev',
    environments: {
      dev: {
        issuer: 'https://device-auth.example.test/dev',
        audience: 'yjlaser-device-api/dev',
        currentKid: 'current-key',
        signingKeyring: [
          { kid: 'current-key', secret: CURRENT_SECRET },
          {
            kid: 'previous-key',
            secret: PREVIOUS_SECRET,
            verifyUntil: '2026-07-20T00:11:00.000Z',
          },
        ],
      },
    },
  };
}

function expectConfigurationError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected device access token configuration to fail closed');
  } catch (error) {
    expect(error).toBeInstanceOf(DeviceAccessTokenConfigurationError);
    expect((error as DeviceAccessTokenConfigurationError).code).toBe(code);
  }
}

describe('device access token configuration', () => {
  it('loads only the selected exact environment and keeps signing secrets out of JSON', () => {
    const config = loadDeviceAccessTokenConfig(createValidInput(), NOW);

    expect(config.environment).toBe('dev');
    expect(config.issuer).toBe('https://device-auth.example.test/dev');
    expect(config.audience).toBe('yjlaser-device-api/dev');
    expect(config.keyring.currentKid).toBe('current-key');
    expect(config.keyring.getVerificationKey('previous-key', NOW)).toBeDefined();
    expect(
      config.keyring.getVerificationKey('previous-key', new Date('2026-07-20T00:15:00.000Z'))
    ).toBeUndefined();

    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain(CURRENT_SECRET);
    expect(serialized).not.toContain(PREVIOUS_SECRET);
  });

  it('rejects an unknown environment and never falls back to another environment configuration', () => {
    const unknownEnvironment = createValidInput();
    unknownEnvironment.environment = 'qa';

    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(unknownEnvironment, NOW),
      'DEVICE_ACCESS_TOKEN_ENVIRONMENT_INVALID'
    );

    const missingSelectedEnvironment = createValidInput();
    missingSelectedEnvironment.environment = 'stg';

    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(missingSelectedEnvironment, NOW),
      'DEVICE_ACCESS_TOKEN_ENVIRONMENT_CONFIG_MISSING'
    );
  });

  it.each([
    {
      name: 'a non-canonical key id',
      mutate: (input: TokenConfigInput) => {
        const environment = input.environments.dev as {
          signingKeyring: Array<Record<string, unknown>>;
        };
        environment.signingKeyring[0].kid = 'Current-Key';
      },
      code: 'DEVICE_ACCESS_TOKEN_KEY_ID_INVALID',
    },
    {
      name: 'a duplicate key id',
      mutate: (input: TokenConfigInput) => {
        const environment = input.environments.dev as {
          signingKeyring: Array<Record<string, unknown>>;
        };
        environment.signingKeyring[1].kid = 'current-key';
      },
      code: 'DEVICE_ACCESS_TOKEN_KEY_ID_DUPLICATE',
    },
    {
      name: 'a signing secret shorter than 32 bytes',
      mutate: (input: TokenConfigInput) => {
        const environment = input.environments.dev as {
          signingKeyring: Array<Record<string, unknown>>;
        };
        environment.signingKeyring[0].secret = 'too-short';
      },
      code: 'DEVICE_ACCESS_TOKEN_KEY_SECRET_INVALID',
    },
  ])('rejects $name without exposing the supplied secret', ({ mutate, code }) => {
    const input = createValidInput();
    mutate(input);

    try {
      loadDeviceAccessTokenConfig(input, NOW);
      throw new Error('Expected device access token configuration to fail closed');
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceAccessTokenConfigurationError);
      expect((error as DeviceAccessTokenConfigurationError).code).toBe(code);
      expect(String(error)).not.toContain(CURRENT_SECRET);
      expect(JSON.stringify(error)).not.toContain(CURRENT_SECRET);
    }
  });

  it('requires issuer, audience, current key, and a live previous-key overlap', () => {
    const missingIssuer = createValidInput();
    delete (missingIssuer.environments.dev as Record<string, unknown>).issuer;
    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(missingIssuer, NOW),
      'DEVICE_ACCESS_TOKEN_ISSUER_INVALID'
    );

    const missingAudience = createValidInput();
    delete (missingAudience.environments.dev as Record<string, unknown>).audience;
    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(missingAudience, NOW),
      'DEVICE_ACCESS_TOKEN_AUDIENCE_INVALID'
    );

    const missingCurrentKey = createValidInput();
    (missingCurrentKey.environments.dev as Record<string, unknown>).currentKid = 'missing-key';
    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(missingCurrentKey, NOW),
      'DEVICE_ACCESS_TOKEN_CURRENT_KEY_MISSING'
    );

    const expiredPreviousKey = createValidInput();
    const environment = expiredPreviousKey.environments.dev as {
      signingKeyring: Array<Record<string, unknown>>;
    };
    environment.signingKeyring[1].verifyUntil = '2026-07-19T23:59:59.000Z';
    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(expiredPreviousKey, NOW),
      'DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID'
    );
  });

  it('allows exactly one previous signing key only through the token lifetime and clock-skew window', () => {
    const maximumOverlap = createValidInput();
    expect(loadDeviceAccessTokenConfig(maximumOverlap, NOW).keyring.currentKid).toBe('current-key');

    const tooLongOverlap = createValidInput();
    const tooLongEnvironment = tooLongOverlap.environments.dev as {
      signingKeyring: Array<Record<string, unknown>>;
    };
    tooLongEnvironment.signingKeyring[1].verifyUntil = '2026-07-20T00:11:01.000Z';
    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(tooLongOverlap, NOW),
      'DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID'
    );

    const twoPreviousKeys = createValidInput();
    const twoPreviousEnvironment = twoPreviousKeys.environments.dev as {
      signingKeyring: Array<Record<string, unknown>>;
    };
    twoPreviousEnvironment.signingKeyring.push({
      kid: 'older-key',
      secret: 'synthetic-older-signing-secret-0123456789',
      verifyUntil: '2026-07-20T00:01:00.000Z',
    });
    expectConfigurationError(
      () => loadDeviceAccessTokenConfig(twoPreviousKeys, NOW),
      'DEVICE_ACCESS_TOKEN_KEY_OVERLAP_INVALID'
    );
  });
});
