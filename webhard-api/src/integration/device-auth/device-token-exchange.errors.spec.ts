import { HttpException } from '@nestjs/common';
import { mapDeviceTokenExchangeError } from './device-token-exchange.errors';
import { DeviceTokenExchangeError } from './device-token-exchange.service';

function expectMapped(error: unknown, status: number, code: string, message: string): void {
  try {
    mapDeviceTokenExchangeError(error);
    throw new Error('Expected token exchange error mapping to throw');
  } catch (mapped: unknown) {
    expect(mapped).toBeInstanceOf(HttpException);
    const exception = mapped as HttpException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toEqual({ code, message });
    expect(JSON.stringify(exception.getResponse())).not.toContain('raw-refresh-credential');
    expect(JSON.stringify(exception.getResponse())).not.toContain('raw-request-id');
    expect(JSON.stringify(exception.getResponse())).not.toContain('raw-access-token');
  }
}

describe('device token exchange errors', () => {
  it('provides a dedicated public error mapper', () => {
    expect(mapDeviceTokenExchangeError).toEqual(expect.any(Function));
  });

  it.each([
    ['DEVICE_TOKEN_EXCHANGE_INVALID', 401, 'device_refresh_invalid', 'Device refresh rejected'],
    [
      'DEVICE_TOKEN_EXCHANGE_CONFLICT',
      409,
      'device_refresh_in_progress',
      'Device refresh in progress',
    ],
    ['DEVICE_TOKEN_EXCHANGE_REVOKED', 401, 'device_revoked', 'Device revoked'],
    [
      'DEVICE_TOKEN_EXCHANGE_UNAVAILABLE',
      503,
      'device_auth_unavailable',
      'Device authentication temporarily unavailable',
    ],
  ] as const)('maps %s to the stable public envelope', (errorCode, status, code, message) => {
    expectMapped(new DeviceTokenExchangeError(errorCode), status, code, message);
  });

  it('maps unknown failures to the same safe unavailable envelope', () => {
    expectMapped(
      new Error('database exchange raw-refresh-credential raw-request-id raw-access-token'),
      503,
      'device_auth_unavailable',
      'Device authentication temporarily unavailable'
    );
  });
});
