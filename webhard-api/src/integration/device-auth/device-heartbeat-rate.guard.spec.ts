import { ExecutionContext } from '@nestjs/common';
import type { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';
import { DeviceHeartbeatRateGuard } from './device-heartbeat-rate.guard';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

function makeContext() {
  const request = {
    deviceAuthInfo: {
      deviceId: DEVICE_ID,
      environment: 'dev',
      programType: 'nesting_program',
      capabilityProfile: 'standard',
      permissions: Object.freeze(['event/write']),
      credentialVersion: 4,
    },
  };
  const response = { setHeader: jest.fn() };
  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
    response,
  };
}

describe('DeviceHeartbeatRateGuard', () => {
  it('checks the verified device identity after bearer verification', async () => {
    const checkDeviceHeartbeat = jest.fn().mockResolvedValue({ kind: 'allowed' });
    const guard = new DeviceHeartbeatRateGuard({
      checkDeviceHeartbeat,
    } as unknown as DeviceBootstrapRateStore);

    await expect(guard.canActivate(makeContext().context)).resolves.toBe(true);
    expect(checkDeviceHeartbeat).toHaveBeenCalledWith({ deviceId: DEVICE_ID });
  });

  it('limits the seventh call before the controller writes and adds Retry-After', async () => {
    const checkDeviceHeartbeat = jest
      .fn()
      .mockResolvedValue({ kind: 'limited', retryAfterSeconds: 41 });
    const guard = new DeviceHeartbeatRateGuard({
      checkDeviceHeartbeat,
    } as unknown as DeviceBootstrapRateStore);
    const { context, response } = makeContext();

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 429,
      response: {
        code: 'device_auth_rate_limited',
        message: 'Device authentication rate limited',
      },
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '41');
  });

  it('fails closed when the dedicated store is unavailable or the principal is absent', async () => {
    const checkDeviceHeartbeat = jest.fn().mockResolvedValue({ kind: 'unavailable' });
    const guard = new DeviceHeartbeatRateGuard({
      checkDeviceHeartbeat,
    } as unknown as DeviceBootstrapRateStore);

    await expect(guard.canActivate(makeContext().context)).rejects.toMatchObject({
      status: 503,
      response: { code: 'device_auth_unavailable' },
    });

    const contextWithoutPrincipal = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(contextWithoutPrincipal)).rejects.toMatchObject({ status: 401 });
  });
});
