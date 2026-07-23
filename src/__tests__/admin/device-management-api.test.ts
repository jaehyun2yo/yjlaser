/**
 * @jest-environment jsdom
 */

import {
  approveManagedDevice,
  getDeviceAuthRuntimeEnvironment,
  listManagedDevices,
  requestManagedDeviceCredentialRotation,
  revokeManagedDevice,
  type DeviceEnrollmentStatus,
  type DeviceRotationSummary,
  type ManagedDeviceSummary,
} from '@/app/(admin)/admin/integration/devices/_lib/device-enrollment-api';

const DEVICE_ID = 'b7dfcfe3-1a80-4ee2-92c9-5be9925c12a3';
const EXPECTED_ENVIRONMENT = 'dev';

const PENDING_DEVICE: ManagedDeviceSummary = {
  deviceId: DEVICE_ID,
  environment: 'dev',
  programType: 'management_program',
  capabilityProfile: 'safe_canary',
  displayName: '관리 프로그램 사무실 PC',
  appVersion: '1.2.3',
  state: 'pending_approval',
  credentialVersion: 1,
  enrolledAt: '2026-07-20T12:00:00.000Z',
};

const APPROVED_STATUS: DeviceEnrollmentStatus = {
  deviceId: DEVICE_ID,
  environment: 'dev',
  programType: 'management_program',
  capabilityProfile: 'safe_canary',
  state: 'active',
  credentialVersion: 1,
};

const ROTATION_SUMMARY: DeviceRotationSummary = {
  id: 'd978ca90-3dc7-47eb-b719-f58d68ad3aa4',
  deviceId: DEVICE_ID,
  status: 'requested',
  deadlineAt: '2026-07-20T12:15:00.000Z',
  credentialVersion: 2,
};

interface JsonResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

describe('device management API helper', () => {
  const fetchMock = jest.fn<Promise<JsonResponse>, [RequestInfo | URL, RequestInit?]>();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: fetchMock as unknown as typeof fetch,
    });
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    document.cookie = 'csrf-token=device-management-csrf-token; Path=/';
  });

  it('lists only declared safe device summaries with a no-store session request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [PENDING_DEVICE],
    });

    await expect(
      listManagedDevices({ expectedEnvironment: EXPECTED_ENVIRONMENT })
    ).resolves.toEqual([PENDING_DEVICE]);

    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/devices',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'x-device-auth-environment': EXPECTED_ENVIRONMENT,
        },
      })
    );
  });

  it.each(['dev', 'stg', 'prd'] as const)(
    'reads the exact %s backend runtime environment with a no-store session request',
    async (environment) => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ environment }),
      });

      await expect(getDeviceAuthRuntimeEnvironment()).resolves.toBe(environment);

      expect(fetchMock).toHaveBeenCalledWith(
        '/nestapi/integration/devices/runtime-environment',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
      );
    }
  );

  it.each([
    {},
    { environment: 'production' },
    { environment: 'dev', issuer: 'must-not-be-accepted' },
    ['dev'],
    null,
  ])('rejects a malformed or expanded runtime environment response: %p', async (body) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    });

    await expect(getDeviceAuthRuntimeEnvironment()).rejects.toMatchObject({
      name: 'DeviceManagementRequestError',
    });
  });

  it('rejects an unsuccessful runtime environment response without parsing the body', async () => {
    const json = jest.fn(async () => ({ environment: 'dev' }));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json,
    });

    await expect(getDeviceAuthRuntimeEnvironment()).rejects.toMatchObject({
      name: 'DeviceManagementRequestError',
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('prepares CSRF then posts no body for an approval action', async () => {
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    fetchMock
      .mockImplementationOnce(async (url: RequestInfo | URL, options?: RequestInit) => {
        expect(url).toBe('/nestapi/integration/devices/csrf');
        expect(options).toMatchObject({
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        document.cookie = 'csrf-token=fresh-device-management-csrf-token; Path=/';
        return { ok: true, status: 200, json: async () => ({}) };
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => APPROVED_STATUS,
      });

    await expect(approveManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT)).resolves.toEqual(
      APPROVED_STATUS
    );

    expect(fetchMock).toHaveBeenLastCalledWith(
      `/nestapi/integration/devices/${DEVICE_ID}/approve-enrollment`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        body: undefined,
        headers: {
          Accept: 'application/json',
          'x-csrf-token': 'fresh-device-management-csrf-token',
          'x-device-auth-environment': EXPECTED_ENVIRONMENT,
        },
      })
    );
  });

  it('keeps approval and revoke responses distinct by their declared safe schemas', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => APPROVED_STATUS,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...PENDING_DEVICE, state: 'revoked' }),
      });

    await expect(approveManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT)).resolves.toEqual(
      APPROVED_STATUS
    );
    await expect(revokeManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT)).resolves.toEqual({
      ...PENDING_DEVICE,
      state: 'revoked',
    });

    const postRequests = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(postRequests).toHaveLength(2);
    for (const [, options] of postRequests) {
      expect(options?.headers).toEqual(
        expect.objectContaining({
          'x-device-auth-environment': EXPECTED_ENVIRONMENT,
        })
      );
    }
  });

  it('requests credential rotation with CSRF and accepts only the safe rotation summary', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ROTATION_SUMMARY,
    });

    await expect(
      requestManagedDeviceCredentialRotation(DEVICE_ID, EXPECTED_ENVIRONMENT)
    ).resolves.toEqual(ROTATION_SUMMARY);

    expect(fetchMock).toHaveBeenCalledWith(
      `/nestapi/integration/devices/${DEVICE_ID}/credential-rotations`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        body: undefined,
        headers: {
          Accept: 'application/json',
          'x-csrf-token': 'device-management-csrf-token',
          'x-device-auth-environment': EXPECTED_ENVIRONMENT,
        },
      })
    );
  });

  it('rejects credential material or malformed fields from a rotation response', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ ...ROTATION_SUMMARY, refreshCredential: 'must not reach the UI' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ ...ROTATION_SUMMARY, deadlineAt: '2026-07-20T21:15:00+09:00' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ...ROTATION_SUMMARY,
          deviceId: '8763d3d9-4b84-4dc1-8526-18175a8ced20',
        }),
      });

    await expect(
      requestManagedDeviceCredentialRotation(DEVICE_ID, EXPECTED_ENVIRONMENT)
    ).rejects.toThrow('장치 관리 요청에 실패했습니다.');
    await expect(
      requestManagedDeviceCredentialRotation(DEVICE_ID, EXPECTED_ENVIRONMENT)
    ).rejects.toThrow('장치 관리 요청에 실패했습니다.');
    await expect(
      requestManagedDeviceCredentialRotation(DEVICE_ID, EXPECTED_ENVIRONMENT)
    ).rejects.toThrow('장치 관리 요청에 실패했습니다.');
  });

  it('does not send an action POST when CSRF bootstrap fails', async () => {
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });

    await expect(approveManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT)).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/devices/csrf',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('uses one CSRF bootstrap for concurrent first actions and sends each action once', async () => {
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    let resolveBootstrap: (() => void) | undefined;
    const bootstrap = new Promise<JsonResponse>((resolve) => {
      resolveBootstrap = () => {
        document.cookie = 'csrf-token=shared-device-management-csrf-token; Path=/';
        resolve({ ok: true, status: 200, json: async () => ({}) });
      };
    });

    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      if (url === '/nestapi/integration/devices/csrf') return bootstrap;

      if (String(url).endsWith('/approve-enrollment')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => APPROVED_STATUS });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ...PENDING_DEVICE, state: 'revoked' }),
      });
    });

    const approval = approveManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT);
    const revoke = revokeManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT);

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolveBootstrap).toBeDefined();
    resolveBootstrap?.();

    await expect(Promise.all([approval, revoke])).resolves.toEqual([
      APPROVED_STATUS,
      { ...PENDING_DEVICE, state: 'revoked' },
    ]);

    const csrfRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/devices/csrf')
    );
    const postRequests = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(csrfRequests).toHaveLength(1);
    expect(postRequests).toHaveLength(2);
    postRequests.forEach(([, options]) => {
      expect(options).toMatchObject({ body: undefined });
      expect(options?.headers).toEqual({
        Accept: 'application/json',
        'x-csrf-token': 'shared-device-management-csrf-token',
        'x-device-auth-environment': EXPECTED_ENVIRONMENT,
      });
    });
  });

  it('does not retry a failed action POST or refresh CSRF automatically', async () => {
    const rawServerMessage = 'refresh credential must never reach the UI';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: rawServerMessage }),
    });

    await expect(revokeManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT)).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/nestapi/integration/devices/${DEVICE_ID}/revoke`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects unexpected credential fields instead of passing them to the UI', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { ...PENDING_DEVICE, refreshCredential: 'must not be projected to a summary' },
      ],
    });

    await expect(listManagedDevices({ expectedEnvironment: EXPECTED_ENVIRONMENT })).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );
  });

  it('projects trimmed display and app values from a safe managed-device response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          ...PENDING_DEVICE,
          displayName: ' 관리 프로그램 사무실 PC ',
          appVersion: ' 1.2.3 ',
        },
      ],
    });

    await expect(
      listManagedDevices({ expectedEnvironment: EXPECTED_ENVIRONMENT })
    ).resolves.toEqual([
      { ...PENDING_DEVICE, displayName: '관리 프로그램 사무실 PC', appVersion: '1.2.3' },
    ]);
  });

  it.each([
    ['a blank display name', { ...PENDING_DEVICE, displayName: '   ' }],
    ['a display name with a control character', { ...PENDING_DEVICE, displayName: '관리\u0000PC' }],
    ['an overlong display name', { ...PENDING_DEVICE, displayName: 'a'.repeat(101) }],
    ['a non-semver app version', { ...PENDING_DEVICE, appVersion: 'release-1' }],
    ['an app version with a control character', { ...PENDING_DEVICE, appVersion: '1.2.3\u0007' }],
    ['an overlong app version', { ...PENDING_DEVICE, appVersion: '1.2.3+build.metadata.123' }],
  ])('rejects %s from a managed-device response', async (_reason, responseSummary) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [responseSummary],
    });

    await expect(listManagedDevices({ expectedEnvironment: EXPECTED_ENVIRONMENT })).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );
  });

  it('rejects a non-canonical device ID from a list response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          ...PENDING_DEVICE,
          deviceId: 'B7DFCFE3-1A80-4EE2-92C9-5BE9925C12A3',
        },
      ],
    });

    await expect(listManagedDevices({ expectedEnvironment: EXPECTED_ENVIRONMENT })).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );
  });

  it('rejects a non-canonical UTC ISO timestamp from a list response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ ...PENDING_DEVICE, enrolledAt: '2026-07-20T12:00:00+09:00' }],
    });

    await expect(listManagedDevices({ expectedEnvironment: EXPECTED_ENVIRONMENT })).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );
  });

  it('rejects unknown fields from approval and revoke action responses', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...APPROVED_STATUS, actorHash: 'must not reach state' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...PENDING_DEVICE, refreshCredential: 'must not reach state' }),
      });

    await expect(approveManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT)).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );
    await expect(revokeManagedDevice(DEVICE_ID, EXPECTED_ENVIRONMENT)).rejects.toThrow(
      '장치 관리 요청에 실패했습니다.'
    );
  });
});
