import { HttpException } from '@nestjs/common';
import { mapDeviceBootstrapError } from './device-bootstrap.errors';
import { DeviceEnrollmentError } from './device-enrollment.service';

function expectMapped(error: unknown, status: number, code: string): void {
  try {
    mapDeviceBootstrapError(error);
    throw new Error('Expected bootstrap error mapping to throw');
  } catch (mapped: unknown) {
    expect(mapped).toBeInstanceOf(HttpException);
    const exception = mapped as HttpException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code });
    expect(String(exception)).not.toContain('raw-credential');
  }
}

describe('mapDeviceBootstrapError', () => {
  it.each(['DEVICE_ENROLLMENT_INVALID', 'DEVICE_ENROLLMENT_CONFLICT'] as const)(
    'maps %s to one generic invalid enrollment response',
    (code) => {
      expectMapped(new DeviceEnrollmentError(code), 400, 'device_enrollment_invalid');
    }
  );

  it('maps lifecycle availability failures and unknown failures to the same safe 503 response', () => {
    expectMapped(
      new DeviceEnrollmentError('DEVICE_ENROLLMENT_UNAVAILABLE'),
      503,
      'device_auth_unavailable'
    );
    expectMapped(new Error('database raw-credential failure'), 503, 'device_auth_unavailable');
  });
});
