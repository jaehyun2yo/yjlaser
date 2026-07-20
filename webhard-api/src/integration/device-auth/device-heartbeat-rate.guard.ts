import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getDeviceAccessPrincipal } from './device-bearer.guard';
import { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';

@Injectable()
export class DeviceHeartbeatRateGuard implements CanActivate {
  public constructor(private readonly rateStore: DeviceBootstrapRateStore) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const principal = getDeviceAccessPrincipal(request);
    if (!principal) {
      throw new UnauthorizedException({
        code: 'device_access_invalid',
        message: 'Device access rejected',
      });
    }

    const decision = await this.rateStore.checkDeviceHeartbeat({ deviceId: principal.deviceId });
    if (decision.kind === 'unavailable') {
      throw new ServiceUnavailableException({
        code: 'device_auth_unavailable',
        message: 'Device authentication temporarily unavailable',
      });
    }
    if (decision.kind === 'limited') {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException(
        {
          code: 'device_auth_rate_limited',
          message: 'Device authentication rate limited',
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }
}
