import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { DeviceAuthConfig } from './device-auth.config';
import { DEVICE_AUTH_CONFIG } from './device-auth.tokens';

export const DEVICE_AUTH_EXPECTED_ENVIRONMENT_HEADER = 'x-device-auth-environment';

const DEVICE_AUTH_ENVIRONMENT_DISCOVERY_METADATA =
  'device-auth:allow-runtime-environment-discovery';

export const AllowDeviceAuthEnvironmentDiscovery = () =>
  SetMetadata(DEVICE_AUTH_ENVIRONMENT_DISCOVERY_METADATA, true);

@Injectable()
export class DeviceAdminEnvironmentGuard implements CanActivate {
  public constructor(
    @Inject(DEVICE_AUTH_CONFIG)
    private readonly config: DeviceAuthConfig
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    if (
      Reflect.getMetadata(DEVICE_AUTH_ENVIRONMENT_DISCOVERY_METADATA, context.getHandler()) === true
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const expectedEnvironment = request.headers[DEVICE_AUTH_EXPECTED_ENVIRONMENT_HEADER];

    if (
      typeof expectedEnvironment !== 'string' ||
      expectedEnvironment !== this.config.environment
    ) {
      throw new ConflictException({
        code: 'device_auth_environment_mismatch',
        message: 'Device authentication environment mismatch',
      });
    }

    return true;
  }
}
