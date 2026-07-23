import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import type { DeviceAuthConfig } from './device-auth.config';
import { DeviceAdminActorHasher } from './device-admin-actor-hash';
import {
  AllowDeviceAuthEnvironmentDiscovery,
  DeviceAdminEnvironmentGuard,
} from './device-admin-environment.guard';
import {
  DEVICE_ADMIN_ACTOR_HASHER,
  DEVICE_AUTH_CONFIG,
  DEVICE_MANAGEMENT_SERVICE,
} from './device-auth.tokens';
import type {
  DeviceAuthEnvironment,
  DeviceEnrollmentStatus,
  ManagedDeviceSummary,
} from './device-auth.types';
import { DeviceEnrollmentAdminEmptyBodyGuard } from './device-enrollment-admin-empty-body.guard';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';
import { DeviceEnrollmentError } from './device-enrollment.service';
import { DeviceManagementError, DeviceManagementService } from './device-management.service';

@Controller('integration/devices')
@UseGuards(
  SessionAuthGuard,
  AdminGuard,
  DeviceEnrollmentAdminSessionSourceGuard,
  DeviceAdminEnvironmentGuard
)
export class DeviceManagementController {
  public constructor(
    @Inject(DEVICE_MANAGEMENT_SERVICE)
    private readonly managementService: DeviceManagementService,
    @Inject(DEVICE_ADMIN_ACTOR_HASHER)
    private readonly adminActorHasher: DeviceAdminActorHasher,
    @Inject(DEVICE_AUTH_CONFIG)
    private readonly deviceAuthConfig: DeviceAuthConfig
  ) {}

  @Get()
  public async list(): Promise<readonly ManagedDeviceSummary[]> {
    try {
      return await this.managementService.listDevices();
    } catch (error: unknown) {
      return mapDeviceManagementError(error);
    }
  }

  @Get('runtime-environment')
  @AllowDeviceAuthEnvironmentDiscovery()
  public getRuntimeEnvironment(): { readonly environment: DeviceAuthEnvironment } {
    return { environment: this.deviceAuthConfig.environment };
  }

  @Post(':id/approve-enrollment')
  @HttpCode(200)
  @UseGuards(DeviceEnrollmentAdminEmptyBodyGuard)
  public async approve(
    @Param('id') deviceId: string,
    @CurrentUser() user: SessionUser
  ): Promise<DeviceEnrollmentStatus> {
    try {
      return await this.managementService.approveDevice({
        deviceId,
        actorHash: this.adminActorHasher.hashAdmin(user),
      });
    } catch (error: unknown) {
      return mapDeviceManagementError(error);
    }
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @UseGuards(DeviceEnrollmentAdminEmptyBodyGuard)
  public async revoke(
    @Param('id') deviceId: string,
    @CurrentUser() user: SessionUser
  ): Promise<ManagedDeviceSummary> {
    try {
      return await this.managementService.revokeDevice({
        deviceId,
        actorHash: this.adminActorHasher.hashAdmin(user),
      });
    } catch (error: unknown) {
      return mapDeviceManagementError(error);
    }
  }
}

function mapDeviceManagementError(error: unknown): never {
  if (
    (error instanceof DeviceManagementError && error.code === 'DEVICE_MANAGEMENT_INVALID') ||
    (error instanceof DeviceEnrollmentError && error.code === 'DEVICE_ENROLLMENT_INVALID')
  ) {
    throw new BadRequestException({
      code: 'device_management_invalid',
      message: 'Invalid device management request',
    });
  }

  if (
    (error instanceof DeviceManagementError && error.code === 'DEVICE_MANAGEMENT_CONFLICT') ||
    (error instanceof DeviceEnrollmentError && error.code === 'DEVICE_ENROLLMENT_CONFLICT')
  ) {
    throw new ConflictException({
      code: 'device_management_conflict',
      message: 'Device management state conflict',
    });
  }

  throw new ServiceUnavailableException({
    code: 'device_management_unavailable',
    message: 'Device management temporarily unavailable',
  });
}
