import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { DeviceAccessPrincipal } from './device-auth.types';
import { getDeviceAccessPrincipal } from './device-bearer.guard';

export const CurrentDevicePrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DeviceAccessPrincipal | undefined =>
    getDeviceAccessPrincipal(context.switchToHttp().getRequest<Request>())
);
