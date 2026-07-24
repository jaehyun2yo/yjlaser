import {
  DeviceBootstrapRateStore,
  DeviceBootstrapRateStoreConfigurationError,
  type DeviceBootstrapFetch,
  type DeviceBootstrapFetchResponse,
  type DeviceBootstrapRateStoreConfiguration,
} from './device-bootstrap-rate-store';

const RAW_UPSTASH_URL = 'https://device-bootstrap-rate.example.test';
const RAW_UPSTASH_TOKEN = 'device-bootstrap-upstash-token-do-not-log';
const RAW_HMAC_SECRET = 'device-bootstrap-rate-hmac-secret-0123456789';
const RAW_PEER = '203.0.113.44';
const RAW_ENROLLMENT_CODE = 'enrollment-code-raw-value-do-not-log';
const RAW_ENROLLMENT_ATTEMPT = 'enrollment-attempt-raw-value-do-not-log';
const RAW_REFRESH_CREDENTIAL = 'refresh-credential-raw-value-do-not-log';
const RAW_REFRESH_REQUEST_ID = 'refresh-request-id-raw-value-do-not-log';

type FetchCall = {
  readonly input: string;
  readonly init: RequestInit;
};

function createConfiguration(
  environment: 'dev' | 'stg' | 'prd' = 'stg',
  overrides: Partial<DeviceBootstrapRateStoreConfiguration> = {}
): DeviceBootstrapRateStoreConfiguration {
  return {
    environment,
    upstashRedisRestUrl: RAW_UPSTASH_URL,
    upstashRedisRestToken: RAW_UPSTASH_TOKEN,
    rateLimitHmacSecret: RAW_HMAC_SECRET,
    ...overrides,
  };
}

function createResponse(result: unknown): DeviceBootstrapFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({ result }),
  };
}

function createFetch(...responses: Array<DeviceBootstrapFetchResponse | Error>): {
  readonly fetch: DeviceBootstrapFetch;
  readonly calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      calls.push({ input, init });
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected fetch call');
      }
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
  };
}

function readEvalCommand(call: FetchCall): unknown[] {
  expect(call.init.method).toBe('POST');
  expect(call.init.headers).toEqual({
    Authorization: `Bearer ${RAW_UPSTASH_TOKEN}`,
    'Content-Type': 'application/json',
  });
  expect(typeof call.init.body).toBe('string');
  const parsed = JSON.parse(call.init.body as string) as unknown;
  expect(Array.isArray(parsed)).toBe(true);
  return parsed as unknown[];
}

function commandContainsRawProof(command: readonly unknown[], proof: string): boolean {
  return command.some((value) => typeof value === 'string' && value.includes(proof));
}

function createMultibyteProof(byteLength: number): string {
  const threeByteCharacterCount = Math.floor(byteLength / 3);
  return `${'가'.repeat(threeByteCharacterCount)}${'a'.repeat(byteLength % 3)}`;
}

describe('DeviceBootstrapRateStore', () => {
  it('reads only the dedicated bootstrap Redis settings and does not fall back to generic settings', () => {
    const values: Record<string, unknown> = {
      DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL: RAW_UPSTASH_URL,
      DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN: RAW_UPSTASH_TOKEN,
      DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET: RAW_HMAC_SECRET,
      UPSTASH_REDIS_REST_URL: 'https://generic.example.test',
      UPSTASH_REDIS_REST_TOKEN: 'generic-token',
      NODE_ENV: 'production',
      DEVICE_AUTH_AUDIT_HMAC_SECRET: 'other-secret-that-must-not-be-reused',
    };
    const get = jest.fn((key: string) => values[key]);

    const store = DeviceBootstrapRateStore.fromConfigService(
      { get },
      'stg',
      createFetch(createResponse([1, 0]))
    );

    expect(store).toBeInstanceOf(DeviceBootstrapRateStore);
    expect(get.mock.calls.map(([key]) => key)).toEqual([
      'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL',
      'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN',
      'DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET',
    ]);

    const missingDedicatedGet = jest.fn((key: string) =>
      key.startsWith('UPSTASH_') || key === 'NODE_ENV' || key === 'DEVICE_AUTH_AUDIT_HMAC_SECRET'
        ? values[key]
        : undefined
    );
    expect(() =>
      DeviceBootstrapRateStore.fromConfigService(
        { get: missingDedicatedGet },
        'prd',
        createFetch(createResponse([1, 0]))
      )
    ).toThrow(DeviceBootstrapRateStoreConfigurationError);
    expect(missingDedicatedGet.mock.calls.map(([key]) => key)).toEqual([
      'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_URL',
      'DEVICE_AUTH_BOOTSTRAP_UPSTASH_REDIS_REST_TOKEN',
      'DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET',
    ]);
  });

  it('rejects a dedicated Redis token with leading or trailing whitespace without serializing it', () => {
    const rawWhitespaceToken = ` ${RAW_UPSTASH_TOKEN} `;
    let thrown: unknown;

    try {
      new DeviceBootstrapRateStore(
        createConfiguration('stg', { upstashRedisRestToken: rawWhitespaceToken }),
        createFetch(createResponse([1, 0]))
      );
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DeviceBootstrapRateStoreConfigurationError);
    expect((thrown as DeviceBootstrapRateStoreConfigurationError).code).toBe(
      'DEVICE_BOOTSTRAP_RATE_STORE_TOKEN_INVALID'
    );
    expect(String(thrown)).not.toContain(rawWhitespaceToken);
    expect(JSON.stringify(thrown)).not.toContain(rawWhitespaceToken);
  });

  it('uses one atomic EVAL for enrollment quota and a 60-second nonce replay lease without raw inputs', async () => {
    const transport = createFetch(createResponse([1, 0]));
    const nonceBytes = Buffer.alloc(32, 7);
    const store = new DeviceBootstrapRateStore(createConfiguration(), {
      ...transport,
      now: () => new Date('2026-07-20T00:00:15.000Z'),
      randomBytes: () => nonceBytes,
    });

    const decision = await store.acquireEnrollment({
      peerAddress: RAW_PEER,
      enrollmentCode: RAW_ENROLLMENT_CODE,
      enrollmentAttemptId: RAW_ENROLLMENT_ATTEMPT,
    });

    expect(decision).toEqual({
      kind: 'allowed',
      replayLease: { nonce: nonceBytes.toString('base64url') },
    });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].input).toBe(RAW_UPSTASH_URL);
    expect(transport.calls[0].input).not.toContain('/pipeline');
    expect(transport.calls[0].init.redirect).toBe('error');

    const command = readEvalCommand(transport.calls[0]);
    expect(command[0]).toBe('EVAL');
    expect(command[2]).toBe('4');
    expect(command[1]).toEqual(
      expect.stringContaining("redis.call('SET', KEYS[4], ARGV[7], 'EX', ARGV[8], 'NX')")
    );
    expect(command.slice(3, 7)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^yjlaser:device-auth:v1:bootstrap:stg:rate:enroll:global:[a-f0-9]{64}$/
        ),
        expect.stringMatching(
          /^yjlaser:device-auth:v1:bootstrap:stg:rate:enroll:peer:[a-f0-9]{64}$/
        ),
        expect.stringMatching(
          /^yjlaser:device-auth:v1:bootstrap:stg:rate:enroll:code:[a-f0-9]{64}$/
        ),
        expect.stringMatching(/^yjlaser:device-auth:v1:bootstrap:stg:replay:attempt:[a-f0-9]{64}$/),
      ])
    );
    expect(command.slice(7)).toEqual([
      '30',
      '45',
      '6',
      '585',
      '3',
      '585',
      nonceBytes.toString('base64url'),
      '60',
    ]);

    const serializedCommand = JSON.stringify(command);
    expect(serializedCommand).not.toContain(RAW_PEER);
    expect(serializedCommand).not.toContain(RAW_ENROLLMENT_CODE);
    expect(serializedCommand).not.toContain(RAW_ENROLLMENT_ATTEMPT);
    expect(serializedCommand).not.toContain(RAW_HMAC_SECRET);
    expect(JSON.stringify(store)).not.toContain(RAW_UPSTASH_TOKEN);
    expect(JSON.stringify(store)).not.toContain(RAW_HMAC_SECRET);
  });

  it('accepts boolean and integer EXPIRE success values in every quota Lua script', async () => {
    const transport = createFetch(
      createResponse([1, 0]),
      createResponse([1, 0]),
      createResponse([1, 0])
    );
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);

    await store.acquireEnrollment({
      peerAddress: RAW_PEER,
      enrollmentCode: RAW_ENROLLMENT_CODE,
      enrollmentAttemptId: RAW_ENROLLMENT_ATTEMPT,
    });
    await store.checkEnrollmentStatus({
      peerAddress: RAW_PEER,
      refreshCredential: RAW_REFRESH_CREDENTIAL,
    });
    await store.checkDeviceHeartbeat({ deviceId: RAW_ENROLLMENT_ATTEMPT });

    expect(transport.calls).toHaveLength(3);
    for (const call of transport.calls) {
      const script = String(readEvalCommand(call)[1]);
      expect(script).toContain('expiryResult ~= 1 and expiryResult ~= true');
    }
  });

  it('accepts boolean and string SET NX success values in the replay Lua script', async () => {
    const transport = createFetch(createResponse([1, 0]));
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);

    await store.acquireEnrollment({
      peerAddress: RAW_PEER,
      enrollmentCode: RAW_ENROLLMENT_CODE,
      enrollmentAttemptId: RAW_ENROLLMENT_ATTEMPT,
    });

    const script = String(readEvalCommand(transport.calls[0])[1]);
    expect(script).toContain("leaseResult ~= 'OK' and leaseResult ~= true");
  });

  it('accepts a Redis Lua status-reply table for SET NX success', async () => {
    const transport = createFetch(createResponse([1, 0]));
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);

    await store.acquireEnrollment({
      peerAddress: RAW_PEER,
      enrollmentCode: RAW_ENROLLMENT_CODE,
      enrollmentAttemptId: RAW_ENROLLMENT_ATTEMPT,
    });

    const script = String(readEvalCommand(transport.calls[0])[1]);
    expect(script).toContain("type(leaseResult) ~= 'table' or leaseResult.ok ~= 'OK'");
  });

  it('returns a bounded retry decision for a quota or replay limit instead of throwing raw backend details', async () => {
    const transport = createFetch(createResponse([0, 17]));
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);

    const decision = await store.acquireEnrollment({
      peerAddress: RAW_PEER,
      enrollmentCode: RAW_ENROLLMENT_CODE,
      enrollmentAttemptId: RAW_ENROLLMENT_ATTEMPT,
    });

    expect(decision).toEqual({ kind: 'limited', retryAfterSeconds: 17 });
  });

  it('uses distinct HMAC identifiers for every environment and rate-limit scope', async () => {
    const devTransport = createFetch(createResponse([1, 0]), createResponse([1, 0]));
    const stgTransport = createFetch(createResponse([1, 0]), createResponse([1, 0]));
    const prdTransport = createFetch(createResponse([1, 0]), createResponse([1, 0]));
    const stores = [
      ['dev', devTransport],
      ['stg', stgTransport],
      ['prd', prdTransport],
    ] as const;

    for (const [environment, transport] of stores) {
      const store = new DeviceBootstrapRateStore(createConfiguration(environment), transport);
      await store.acquireEnrollment({
        peerAddress: RAW_PEER,
        enrollmentCode: RAW_ENROLLMENT_CODE,
        enrollmentAttemptId: RAW_ENROLLMENT_ATTEMPT,
      });
      await store.checkEnrollmentStatus({
        peerAddress: RAW_PEER,
        refreshCredential: RAW_REFRESH_CREDENTIAL,
      });
    }

    const enrollKeySets = stores.map(([, transport]) =>
      readEvalCommand(transport.calls[0]).slice(3, 7).map(String)
    );
    const statusKeySets = stores.map(([, transport]) =>
      readEvalCommand(transport.calls[1]).slice(3, 6).map(String)
    );
    expect(new Set(enrollKeySets.map((keys) => keys.join('|'))).size).toBe(3);
    for (let index = 0; index < stores.length; index += 1) {
      expect(enrollKeySets[index]).not.toContain(statusKeySets[index][0]);
      expect(enrollKeySets[index]).not.toContain(statusKeySets[index][1]);
      expect(enrollKeySets[index]).not.toContain(statusKeySets[index][2]);
    }
  });

  it('checks status quotas in one EVAL with the approved global, peer, and refresh policy', async () => {
    const transport = createFetch(createResponse([0, 23]));
    const store = new DeviceBootstrapRateStore(createConfiguration(), {
      ...transport,
      now: () => new Date('2026-07-20T00:00:15.000Z'),
    });

    const decision = await store.checkEnrollmentStatus({
      peerAddress: RAW_PEER,
      refreshCredential: RAW_REFRESH_CREDENTIAL,
    });

    expect(decision).toEqual({ kind: 'limited', retryAfterSeconds: 23 });
    const command = readEvalCommand(transport.calls[0]);
    expect(command[0]).toBe('EVAL');
    expect(command[2]).toBe('3');
    expect(command[1]).toEqual(expect.stringContaining("redis.call('INCR', KEYS[index])"));
    expect(command.slice(6)).toEqual(['180', '45', '60', '585', '12', '585']);
    const serializedCommand = JSON.stringify(command);
    expect(serializedCommand).not.toContain(RAW_PEER);
    expect(serializedCommand).not.toContain(RAW_REFRESH_CREDENTIAL);
  });

  it('uses one atomic EVAL for token quota and a 60-second request-ID lease without raw inputs', async () => {
    const transport = createFetch(createResponse([1, 0]));
    const nonceBytes = Buffer.alloc(32, 8);
    const store = new DeviceBootstrapRateStore(createConfiguration(), {
      ...transport,
      now: () => new Date('2026-07-20T00:00:15.000Z'),
      randomBytes: () => nonceBytes,
    });

    const decision = await store.acquireTokenExchange({
      peerAddress: RAW_PEER,
      refreshCredential: RAW_REFRESH_CREDENTIAL,
      refreshRequestId: RAW_REFRESH_REQUEST_ID,
    });

    expect(decision).toEqual({
      kind: 'allowed',
      requestLease: { nonce: nonceBytes.toString('base64url') },
    });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].input).toBe(RAW_UPSTASH_URL);
    expect(transport.calls[0].init.redirect).toBe('error');

    const command = readEvalCommand(transport.calls[0]);
    expect(command[0]).toBe('EVAL');
    expect(command[2]).toBe('4');
    expect(command[1]).toEqual(
      expect.stringContaining("redis.call('SET', KEYS[4], ARGV[7], 'EX', ARGV[8], 'NX')")
    );
    expect(command.slice(3, 7)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^yjlaser:device-auth:v1:bootstrap:stg:rate:token:global:[a-f0-9]{64}$/
        ),
        expect.stringMatching(
          /^yjlaser:device-auth:v1:bootstrap:stg:rate:token:peer:[a-f0-9]{64}$/
        ),
        expect.stringMatching(
          /^yjlaser:device-auth:v1:bootstrap:stg:rate:token:refresh:[a-f0-9]{64}$/
        ),
        expect.stringMatching(/^yjlaser:device-auth:v1:bootstrap:stg:replay:request:[a-f0-9]{64}$/),
      ])
    );
    expect(command.slice(7)).toEqual([
      '120',
      '45',
      '60',
      '585',
      '12',
      '585',
      nonceBytes.toString('base64url'),
      '60',
    ]);

    const serializedCommand = JSON.stringify(command);
    expect(serializedCommand).not.toContain(RAW_PEER);
    expect(serializedCommand).not.toContain(RAW_REFRESH_CREDENTIAL);
    expect(serializedCommand).not.toContain(RAW_REFRESH_REQUEST_ID);
  });

  it.each([
    [
      'refresh credential beyond the legacy identifier boundary',
      () => ({ refreshCredential: 'a'.repeat(513), refreshRequestId: RAW_REFRESH_REQUEST_ID }),
    ],
    [
      'refresh request ID beyond the legacy identifier boundary',
      () => ({ refreshCredential: RAW_REFRESH_CREDENTIAL, refreshRequestId: 'a'.repeat(513) }),
    ],
    [
      'refresh credential containing an opaque control character',
      () => ({ refreshCredential: 'abc\u0001def', refreshRequestId: RAW_REFRESH_REQUEST_ID }),
    ],
    [
      'refresh request ID containing an opaque control character',
      () => ({ refreshCredential: RAW_REFRESH_CREDENTIAL, refreshRequestId: 'abc\u0001def' }),
    ],
  ])(
    'passes %s through the token quota and nonce-matched release boundary',
    async (_label, createInput) => {
      const transport = createFetch(createResponse([1, 0]), createResponse([1]));
      const nonce = Buffer.alloc(32, 8).toString('base64url');
      const store = new DeviceBootstrapRateStore(createConfiguration(), {
        ...transport,
        randomBytes: () => Buffer.alloc(32, 8),
      });
      const input = createInput();

      await expect(
        store.acquireTokenExchange({ peerAddress: RAW_PEER, ...input })
      ).resolves.toEqual({ kind: 'allowed', requestLease: { nonce } });
      await expect(
        store.releaseTokenExchangeRequestLease({
          refreshRequestId: input.refreshRequestId,
          requestLease: { nonce },
        })
      ).resolves.toEqual({ kind: 'released' });

      expect(transport.calls).toHaveLength(2);
      const acquireCommand = readEvalCommand(transport.calls[0]);
      const releaseCommand = readEvalCommand(transport.calls[1]);
      const releaseScript = String(releaseCommand[1]);
      const commandContainsRawInput = [acquireCommand, releaseCommand].some(
        (command) =>
          commandContainsRawProof(command, input.refreshCredential) ||
          commandContainsRawProof(command, input.refreshRequestId)
      );

      expect(String(acquireCommand[6]) === String(releaseCommand[3])).toBe(true);
      expect(String(acquireCommand[13]) === String(releaseCommand[4])).toBe(true);
      expect(
        releaseScript.includes("if redis.call('GET', KEYS[1]) == ARGV[1] then") &&
          releaseScript.includes("return redis.call('DEL', KEYS[1])")
      ).toBe(true);
      expect(releaseScript.includes("redis.call('DECR'")).toBe(false);
      expect(commandContainsRawInput).toBe(false);
    }
  );

  it('allows an exactly 4 KiB multibyte request ID through token acquire and release', async () => {
    const transport = createFetch(createResponse([1, 0]), createResponse([1]));
    const nonce = Buffer.alloc(32, 12).toString('base64url');
    const store = new DeviceBootstrapRateStore(createConfiguration(), {
      ...transport,
      randomBytes: () => Buffer.alloc(32, 12),
    });
    const requestId = createMultibyteProof(4 * 1024);

    expect(Buffer.byteLength(requestId, 'utf8') === 4 * 1024).toBe(true);
    await expect(
      store.acquireTokenExchange({
        peerAddress: RAW_PEER,
        refreshCredential: RAW_REFRESH_CREDENTIAL,
        refreshRequestId: requestId,
      })
    ).resolves.toEqual({ kind: 'allowed', requestLease: { nonce } });
    await expect(
      store.releaseTokenExchangeRequestLease({
        refreshRequestId: requestId,
        requestLease: { nonce },
      })
    ).resolves.toEqual({ kind: 'released' });
    expect(transport.calls).toHaveLength(2);
  });

  it('allows an exactly 4 KiB multibyte refresh credential through token acquire', async () => {
    const transport = createFetch(createResponse([1, 0]));
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);
    const refreshCredential = createMultibyteProof(4 * 1024);

    expect(Buffer.byteLength(refreshCredential, 'utf8') === 4 * 1024).toBe(true);
    await expect(
      store.acquireTokenExchange({
        peerAddress: RAW_PEER,
        refreshCredential,
        refreshRequestId: RAW_REFRESH_REQUEST_ID,
      })
    ).resolves.toMatchObject({ kind: 'allowed' });
    expect(transport.calls).toHaveLength(1);
  });

  it.each([
    [
      'refresh credential',
      () => ({
        refreshCredential: createMultibyteProof(4 * 1024 + 1),
        refreshRequestId: RAW_REFRESH_REQUEST_ID,
      }),
    ],
    [
      'refresh request ID',
      () => ({
        refreshCredential: RAW_REFRESH_CREDENTIAL,
        refreshRequestId: createMultibyteProof(4 * 1024 + 1),
      }),
    ],
  ])(
    'rejects a 4,097-byte multibyte %s in token acquire and release',
    async (_label, createInput) => {
      const transport = createFetch();
      const store = new DeviceBootstrapRateStore(createConfiguration(), transport);
      const input = createInput();
      const rejectedRequestId = createMultibyteProof(4 * 1024 + 1);

      expect(Buffer.byteLength(rejectedRequestId, 'utf8') === 4 * 1024 + 1).toBe(true);
      await expect(
        store.acquireTokenExchange({ peerAddress: RAW_PEER, ...input })
      ).resolves.toEqual({ kind: 'unavailable' });
      await expect(
        store.releaseTokenExchangeRequestLease({
          refreshRequestId: rejectedRequestId,
          requestLease: { nonce: Buffer.alloc(32, 13).toString('base64url') },
        })
      ).resolves.toEqual({ kind: 'unavailable' });
      expect(transport.calls).toHaveLength(0);
    }
  );

  it('releases a token request-ID lease through the same nonce-matching compare-and-delete', async () => {
    const transport = createFetch(createResponse([1]));
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);

    const decision = await store.releaseTokenExchangeRequestLease({
      refreshRequestId: RAW_REFRESH_REQUEST_ID,
      requestLease: { nonce: Buffer.alloc(32, 10).toString('base64url') },
    });

    expect(decision).toEqual({ kind: 'released' });
    const command = readEvalCommand(transport.calls[0]);
    expect(command[2]).toBe('1');
    expect(command[1]).toEqual(
      expect.stringContaining("if redis.call('GET', KEYS[1]) == ARGV[1] then")
    );
    expect(command[1]).not.toContain("redis.call('DECR'");
    expect(JSON.stringify(command)).not.toContain(RAW_REFRESH_REQUEST_ID);
  });

  it('releases a replay lease only through nonce-matching compare-and-delete and keeps mismatch opaque', async () => {
    const transport = createFetch(createResponse([0]));
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);

    const decision = await store.releaseEnrollmentReplayLease({
      enrollmentAttemptId: RAW_ENROLLMENT_ATTEMPT,
      replayLease: { nonce: Buffer.alloc(32, 9).toString('base64url') },
    });

    expect(decision).toEqual({ kind: 'released' });
    const command = readEvalCommand(transport.calls[0]);
    expect(command[0]).toBe('EVAL');
    expect(command[2]).toBe('1');
    expect(command[1]).toEqual(
      expect.stringContaining("if redis.call('GET', KEYS[1]) == ARGV[1] then")
    );
    expect(command[1]).toEqual(expect.stringContaining("return redis.call('DEL', KEYS[1])"));
    expect(JSON.stringify(command)).not.toContain(RAW_ENROLLMENT_ATTEMPT);
  });

  it('uses one HMAC device quota with an exact 6 per 60-second heartbeat window', async () => {
    const transport = createFetch(createResponse([1, 0]), createResponse([0, 41]));
    const store = new DeviceBootstrapRateStore(createConfiguration('dev'), {
      ...transport,
      now: () => new Date('2026-07-20T00:00:15.000Z'),
    });

    await expect(store.checkDeviceHeartbeat({ deviceId: RAW_ENROLLMENT_ATTEMPT })).resolves.toEqual(
      {
        kind: 'allowed',
      }
    );
    await expect(store.checkDeviceHeartbeat({ deviceId: RAW_ENROLLMENT_ATTEMPT })).resolves.toEqual(
      {
        kind: 'limited',
        retryAfterSeconds: 41,
      }
    );

    const command = readEvalCommand(transport.calls[0]);
    expect(command[0]).toBe('EVAL');
    expect(command[2]).toBe('1');
    expect(command[3]).toMatch(/^yjlaser:device-auth:v1:heartbeat:dev:device:[a-f0-9]{64}$/);
    expect(command.slice(4)).toEqual(['6', '45']);
    expect(String(command[1])).toContain("redis.call('INCR', KEYS[1])");
    expect(JSON.stringify(command)).not.toContain(RAW_ENROLLMENT_ATTEMPT);
    expect(JSON.stringify(command)).not.toContain(RAW_HMAC_SECRET);
  });

  it.each([
    ['fetch rejection', new Error(`network failed for ${RAW_ENROLLMENT_CODE}`)],
    [
      'a non-2xx transport response even when a faulty adapter marks it ok',
      {
        ok: true,
        status: 503,
        json: async () => ({ result: [1, 0] }),
      } satisfies DeviceBootstrapFetchResponse,
    ],
    ['invalid result shape', createResponse({ allowed: true })],
    [
      'backend command error envelope',
      {
        ok: true,
        status: 200,
        json: async () => ({ error: `ERR ${RAW_UPSTASH_TOKEN}` }),
      } satisfies DeviceBootstrapFetchResponse,
    ],
  ])('fails closed as unavailable on %s without leaking raw inputs', async (_label, response) => {
    const transport = createFetch(response);
    const store = new DeviceBootstrapRateStore(createConfiguration(), transport);

    const decision = await store.checkEnrollmentStatus({
      peerAddress: RAW_PEER,
      refreshCredential: RAW_REFRESH_CREDENTIAL,
    });

    expect(decision).toEqual({ kind: 'unavailable' });
    expect(JSON.stringify(decision)).not.toContain(RAW_PEER);
    expect(JSON.stringify(decision)).not.toContain(RAW_REFRESH_CREDENTIAL);
    expect(JSON.stringify(decision)).not.toContain(RAW_UPSTASH_TOKEN);
  });
});
