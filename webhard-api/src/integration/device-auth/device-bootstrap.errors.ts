import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DeviceEnrollmentError } from './device-enrollment.service';

export function mapDeviceBootstrapError(error: unknown): never {
  if (error instanceof DeviceEnrollmentError) {
    if (error.code === 'DEVICE_ENROLLMENT_UNAVAILABLE') {
      throw unavailableDeviceAuth();
    }

    throw invalidDeviceEnrollment();
  }

  throw unavailableDeviceAuth();
}

export function invalidDeviceEnrollment(): BadRequestException {
  return new BadRequestException({
    code: 'device_enrollment_invalid',
    message: 'Invalid device enrollment request',
  });
}

/**
 * Keep public bootstrap failures deliberately generic: raw enrollment codes,
 * attempts, and credentials must never be reflected to a caller.
 */
export function invalidBootstrapRequest(): BadRequestException {
  return new BadRequestException({
    code: 'device_enrollment_invalid',
    message: 'Invalid device enrollment request',
  });
}

export function unavailableDeviceAuth(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'device_auth_unavailable',
    message: 'Device authentication temporarily unavailable',
  });
}

export function rateLimitedDeviceAuth(): HttpException {
  return new HttpException(
    {
      code: 'device_auth_rate_limited',
      message: 'Device authentication temporarily rate limited',
    },
    HttpStatus.TOO_MANY_REQUESTS
  );
}
