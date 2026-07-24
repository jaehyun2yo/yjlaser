import { DeviceAuthConfigurationError, loadDeviceAuthConfig } from './device-auth.config';

const DEV_V1_PEPPER = 'synthetic-device-auth-dev-v1-pepper-0123456789';
const DEV_V2_PEPPER = 'synthetic-device-auth-dev-v2-pepper-0123456789';
const STG_V1_PEPPER = 'synthetic-device-auth-stg-v1-pepper-0123456789';
const PRD_V1_PEPPER = 'synthetic-device-auth-prd-v1-pepper-0123456789';

function makeEnvironmentProfiles(): Record<string, unknown> {
  return {
    dev: {
      currentHashKeyVersion: 2,
      credentialPepperKeyring: {
        '1': DEV_V1_PEPPER,
        '2': DEV_V2_PEPPER,
      },
    },
    stg: {
      currentHashKeyVersion: 1,
      credentialPepperKeyring: {
        '1': STG_V1_PEPPER,
      },
    },
    prd: {
      currentHashKeyVersion: 1,
      credentialPepperKeyring: {
        '1': PRD_V1_PEPPER,
      },
    },
  };
}

function makeConfigSource(
  environment: unknown,
  environments: unknown = makeEnvironmentProfiles()
): Record<string, unknown> {
  return {
    environment,
    environments,
  };
}

function expectConfigurationError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected device-auth configuration to fail closed');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DeviceAuthConfigurationError);
    const configurationError = error as DeviceAuthConfigurationError;
    expect(configurationError.code).toBe(code);
  }
}

describe('loadDeviceAuthConfig', () => {
  it('accepts schema-compatible numeric key versions and canonical numeric keyring keys', () => {
    const config = loadDeviceAuthConfig(
      makeConfigSource('dev', {
        dev: {
          currentHashKeyVersion: 2,
          credentialPepperKeyring: {
            '1': DEV_V1_PEPPER,
            '2': DEV_V2_PEPPER,
          },
        },
      })
    );

    expect(config.currentHashKeyVersion).toBe(2);
    expect(config.credentialPepperKeyring.hasVersion(1)).toBe(true);
    expect(config.credentialPepperKeyring.hasVersion(2)).toBe(true);
  });

  it('rejects non-Int current versions and noncanonical keyring object keys', () => {
    for (const invalidCurrentVersion of ['v1', '1', 0, -1, 1.5, 2_147_483_648]) {
      expectConfigurationError(
        () =>
          loadDeviceAuthConfig(
            makeConfigSource('dev', {
              dev: {
                currentHashKeyVersion: invalidCurrentVersion,
                credentialPepperKeyring: {
                  '1': DEV_V1_PEPPER,
                },
              },
            })
          ),
        'DEVICE_AUTH_CURRENT_HASH_KEY_VERSION_INVALID'
      );
    }

    for (const noncanonicalKey of ['v1', '01', '1.0', '2147483648']) {
      expectConfigurationError(
        () =>
          loadDeviceAuthConfig(
            makeConfigSource('dev', {
              dev: {
                currentHashKeyVersion: 1,
                credentialPepperKeyring: {
                  [noncanonicalKey]: DEV_V1_PEPPER,
                },
              },
            })
          ),
        'DEVICE_AUTH_PEPPER_INVALID'
      );
    }
  });

  it('selects only the explicitly configured dev profile and keeps pepper values non-enumerable', () => {
    const config = loadDeviceAuthConfig(makeConfigSource('dev'));

    expect(config.environment).toBe('dev');
    expect(config.currentHashKeyVersion).toBe(2);
    expect(Object.keys(config.credentialPepperKeyring)).toEqual([]);

    const serializedConfig = JSON.stringify(config);
    expect(serializedConfig).not.toContain(DEV_V1_PEPPER);
    expect(serializedConfig).not.toContain(DEV_V2_PEPPER);
    expect(serializedConfig).not.toContain(STG_V1_PEPPER);
    expect(serializedConfig).not.toContain(PRD_V1_PEPPER);
  });

  it.each([undefined, '', 'qa', 'DEV', { value: 'dev' }])(
    'rejects an invalid deployment environment: %p',
    (environment) => {
      expectConfigurationError(
        () => loadDeviceAuthConfig(makeConfigSource(environment)),
        'DEVICE_AUTH_ENVIRONMENT_INVALID'
      );
    }
  );

  it('does not fall back from stg to a configured dev profile', () => {
    const devOnlyProfiles = {
      dev: makeEnvironmentProfiles().dev,
    };

    expectConfigurationError(
      () => loadDeviceAuthConfig(makeConfigSource('stg', devOnlyProfiles)),
      'DEVICE_AUTH_ENVIRONMENT_CONFIG_MISSING'
    );
  });

  it('rejects incomplete or inconsistent keyring configuration without echoing pepper values', () => {
    const profiles = makeEnvironmentProfiles();
    const devProfile = profiles.dev as Record<string, unknown>;

    expectConfigurationError(
      () =>
        loadDeviceAuthConfig(
          makeConfigSource('dev', {
            dev: {
              credentialPepperKeyring: devProfile.credentialPepperKeyring,
            },
          })
        ),
      'DEVICE_AUTH_CURRENT_HASH_KEY_VERSION_INVALID'
    );

    expectConfigurationError(
      () =>
        loadDeviceAuthConfig(
          makeConfigSource('dev', {
            dev: {
              currentHashKeyVersion: 2,
            },
          })
        ),
      'DEVICE_AUTH_PEPPER_KEYRING_INVALID'
    );

    let mismatchError: unknown;
    try {
      loadDeviceAuthConfig(
        makeConfigSource('dev', {
          dev: {
            currentHashKeyVersion: 9,
            credentialPepperKeyring: devProfile.credentialPepperKeyring,
          },
        })
      );
    } catch (error: unknown) {
      mismatchError = error;
    }

    expect(mismatchError).toBeInstanceOf(DeviceAuthConfigurationError);
    const configurationError = mismatchError as DeviceAuthConfigurationError;
    expect(configurationError.code).toBe('DEVICE_AUTH_CURRENT_HASH_KEY_MISSING');
    expect(configurationError.message).not.toContain(DEV_V1_PEPPER);
    expect(configurationError.message).not.toContain(DEV_V2_PEPPER);
  });
});
