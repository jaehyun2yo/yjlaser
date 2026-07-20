import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceTokenExchangeError } from './device-token-exchange.service';

export function mapDeviceTokenExchangeError(error: unknown): never {
  if (error instanceof DeviceTokenExchangeError) {
    switch (error.code) {
      case 'DEVICE_TOKEN_EXCHANGE_INVALID':
        throw invalidDeviceRefresh();
      case 'DEVICE_TOKEN_EXCHANGE_CONFLICT':
        throw deviceRefreshInProgress();
      case 'DEVICE_TOKEN_EXCHANGE_REVOKED':
        throw revokedDevice();
      case 'DEVICE_TOKEN_EXCHANGE_UNAVAILABLE':
        throw unavailableDeviceAuth();
      case 'DEVICE_ROTATION_INCOMPATIBLE':
        throw new ConflictException({
          code: 'device_rotation_incompatible',
          message: 'Device credential rotation state conflict',
        });
    }
  }

  throw unavailableDeviceAuth();
}

function invalidDeviceRefresh(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'device_refresh_invalid',
    message: 'Device refresh rejected',
  });
}

function deviceRefreshInProgress(): ConflictException {
  return new ConflictException({
    code: 'device_refresh_in_progress',
    message: 'Device refresh in progress',
  });
}

function revokedDevice(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'device_revoked',
    message: 'Device revoked',
  });
}

function unavailableDeviceAuth(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'device_auth_unavailable',
    message: 'Device authentication temporarily unavailable',
  });
}
