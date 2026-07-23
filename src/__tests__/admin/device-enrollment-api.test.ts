/**
 * @jest-environment jsdom
 */

import {
  createDeviceEnrollmentCode,
  type CreateDeviceEnrollmentCodeInput,
} from '@/app/(admin)/admin/integration/devices/_lib/device-enrollment-api';

const request: CreateDeviceEnrollmentCodeInput = {
  programType: 'management_program',
  capabilityProfile: 'safe_canary',
  expectedDisplayName: '관리 프로그램 - 사무실 PC',
};
const EXPECTED_ENVIRONMENT = 'dev';

describe('device enrollment API helper', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    document.cookie = 'csrf-token=device-auth-csrf-token; Path=/';
  });

  it('uses the cookie CSRF token and a no-store session request for code issuance', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        enrollmentCode: 'enrollment-code-raw-value',
        enrollmentId: 'enrollment-1',
        environment: 'dev',
        programType: 'management_program',
        capabilityProfile: 'safe_canary',
        expiresAt: '2026-07-20T12:10:00.000Z',
      }),
    });

    await expect(createDeviceEnrollmentCode(request, EXPECTED_ENVIRONMENT)).resolves.toEqual({
      enrollmentCode: 'enrollment-code-raw-value',
      enrollmentId: 'enrollment-1',
      environment: 'dev',
      programType: 'management_program',
      capabilityProfile: 'safe_canary',
      expiresAt: '2026-07-20T12:10:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/devices/enrollment-codes',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'device-auth-csrf-token',
          'x-device-auth-environment': EXPECTED_ENVIRONMENT,
        },
        body: JSON.stringify(request),
      })
    );
  });

  it('does not put a server error body into the thrown message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'enrollment-code-raw-value must never be exposed',
    });

    await expect(createDeviceEnrollmentCode(request, EXPECTED_ENVIRONMENT)).rejects.toThrow(
      '장치 인증 코드 발급 요청에 실패했습니다. (HTTP 500)'
    );
  });

  it('rejects an enrollment-code response with an unknown field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        enrollmentCode: 'enrollment-code-raw-value',
        enrollmentId: 'enrollment-1',
        environment: 'dev',
        programType: 'management_program',
        capabilityProfile: 'safe_canary',
        expiresAt: '2026-07-20T12:10:00.000Z',
        refreshCredential: 'must not be retained by the browser',
      }),
    });

    await expect(createDeviceEnrollmentCode(request, EXPECTED_ENVIRONMENT)).rejects.toThrow(
      '장치 인증 코드 발급 요청에 실패했습니다.'
    );
  });

  it('prepares a missing CSRF cookie before the first code issuance request', async () => {
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    fetchMock
      .mockImplementationOnce(async (url: string, options: RequestInit) => {
        expect(url).toBe('/nestapi/integration/devices/csrf');
        expect(options).toMatchObject({
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'x-device-auth-environment': EXPECTED_ENVIRONMENT,
          },
        });
        document.cookie = 'csrf-token=fresh-device-auth-csrf-token; Path=/';
        return { ok: true, status: 200 };
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enrollmentCode: 'enrollment-code-raw-value',
          enrollmentId: 'enrollment-1',
          environment: 'dev',
          programType: 'management_program',
          capabilityProfile: 'safe_canary',
          expiresAt: '2026-07-20T12:10:00.000Z',
        }),
      });

    await expect(createDeviceEnrollmentCode(request, EXPECTED_ENVIRONMENT)).resolves.toMatchObject({
      enrollmentCode: 'enrollment-code-raw-value',
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/nestapi/integration/devices/enrollment-codes',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'fresh-device-auth-csrf-token',
          'x-device-auth-environment': EXPECTED_ENVIRONMENT,
        },
      })
    );
  });

  it('does not POST a code request when CSRF preparation fails', async () => {
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(createDeviceEnrollmentCode(request, EXPECTED_ENVIRONMENT)).rejects.toThrow(
      '장치 인증 코드 발급 요청에 실패했습니다. (HTTP 403)'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/devices/csrf',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-device-auth-environment': EXPECTED_ENVIRONMENT,
        }),
      })
    );
  });

  it('shares one clearing CSRF bootstrap across concurrent first code requests', async () => {
    document.cookie = 'csrf-token=; Max-Age=0; Path=/';
    let resolveBootstrap: (() => void) | undefined;
    const bootstrap = new Promise<{ ok: boolean; status: number }>((resolve) => {
      resolveBootstrap = () => {
        document.cookie = 'csrf-token=shared-device-auth-csrf-token; Path=/';
        resolve({ ok: true, status: 200 });
      };
    });

    fetchMock.mockImplementation((url: string) => {
      if (url === '/nestapi/integration/devices/csrf') return bootstrap;

      return Promise.resolve({
        ok: true,
        json: async () => ({
          enrollmentCode: 'enrollment-code-raw-value',
          enrollmentId: 'enrollment-1',
          environment: 'dev',
          programType: 'management_program',
          capabilityProfile: 'safe_canary',
          expiresAt: '2026-07-20T12:10:00.000Z',
        }),
      });
    });

    const firstRequest = createDeviceEnrollmentCode(request, EXPECTED_ENVIRONMENT);
    const secondRequest = createDeviceEnrollmentCode(request, EXPECTED_ENVIRONMENT);

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolveBootstrap).toBeDefined();
    resolveBootstrap?.();

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toHaveLength(2);
    expect(
      fetchMock.mock.calls.filter(([url]: [string]) => url === '/nestapi/integration/devices/csrf')
    ).toHaveLength(1);
  });
});
