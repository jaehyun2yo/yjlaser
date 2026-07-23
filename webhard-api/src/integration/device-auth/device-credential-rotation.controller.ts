import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CsrfExempt } from '../../common/decorators/csrf-exempt.decorator';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { DeviceAdminActorHasher } from './device-admin-actor-hash';
import { DeviceAdminEnvironmentGuard } from './device-admin-environment.guard';
import {
  DEVICE_ADMIN_ACTOR_HASHER,
  DEVICE_CREDENTIAL_ROTATION_SERVICE,
} from './device-auth.tokens';
import {
  DeviceCredentialRotationError,
  DeviceCredentialRotationService,
} from './device-credential-rotation.service';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';
import { DeviceRotationAdminRequestShapeGuard } from './device-rotation-admin-request-shape.guard';
import {
  DeviceRotationAckRequestShapeGuard,
  DeviceRotationPrepareRequestShapeGuard,
} from './device-rotation-request-shape.guard';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';
import { DeviceRotationBearerGuard } from './device-rotation-bearer.guard';
import { getDeviceAccessPrincipal } from './device-bearer.guard';
import type { DeviceRotationSummary } from './dto/device-credential-rotation.dto';

@Controller('integration/devices')
@UseGuards(
  DeviceEnrollmentAdminSessionSourceGuard,
  SessionAuthGuard,
  AdminGuard,
  DeviceAdminEnvironmentGuard,
  DeviceRotationAdminRequestShapeGuard
)
export class DeviceCredentialRotationController {
  public constructor(
    @Inject(DEVICE_CREDENTIAL_ROTATION_SERVICE)
    private readonly service: DeviceCredentialRotationService,
    @Inject(DEVICE_ADMIN_ACTOR_HASHER)
    private readonly actorHasher: DeviceAdminActorHasher
  ) {}

  @Post(':id/credential-rotations')
  public async request(
    @Param('id') deviceId: string,
    @CurrentUser() user: SessionUser
  ): Promise<DeviceRotationSummary> {
    try {
      return serializeRotationSummary(
        await this.service.requestRotation({
          deviceId,
          actorHash: this.actorHasher.hashAdmin(user),
          now: new Date(),
        })
      );
    } catch (error: unknown) {
      return mapRotationError(error);
    }
  }

  @Get(':id/credential-rotations/:rotationId')
  public async get(
    @Param('id') deviceId: string,
    @Param('rotationId') rotationId: string
  ): Promise<DeviceRotationSummary> {
    try {
      return serializeRotationSummary(
        await this.service.getRotation({ deviceId, rotationId, now: new Date() })
      );
    } catch (error: unknown) {
      return mapRotationError(error);
    }
  }

  @Post(':id/credential-rotations/:rotationId/cancel')
  @HttpCode(200)
  public async cancel(
    @Param('id') deviceId: string,
    @Param('rotationId') rotationId: string,
    @CurrentUser() user: SessionUser
  ): Promise<DeviceRotationSummary> {
    try {
      return serializeRotationSummary(
        await this.service.cancelRotation({
          deviceId,
          rotationId,
          actorHash: this.actorHasher.hashAdmin(user),
          now: new Date(),
        })
      );
    } catch (error: unknown) {
      return mapRotationError(error);
    }
  }
}

@Controller('integration/devices/credential-rotations')
@UseGuards(DeviceBearerRequestSourceGuard)
export class DeviceCredentialRotationBearerController {
  public constructor(
    @Inject(DEVICE_CREDENTIAL_ROTATION_SERVICE)
    private readonly service: DeviceCredentialRotationService
  ) {}

  @Post(':rotationId/prepare')
  @CsrfExempt()
  @HttpCode(200)
  @UseGuards(DeviceRotationPrepareRequestShapeGuard, DeviceRotationBearerGuard)
  public async prepare(
    @Param('rotationId') rotationId: string,
    @Body() body: { readonly refreshCredential: string; readonly candidateCredential: string },
    @Req() request: Request
  ) {
    try {
      const principal = getDeviceAccessPrincipal(request);
      if (!principal) throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
      return await this.service.prepare({
        principal,
        rotationId,
        refreshCredential: body.refreshCredential,
        candidateCredential: body.candidateCredential,
        now: new Date(),
      });
    } catch (error: unknown) {
      return mapDeviceRotationError(error);
    }
  }

  @Post(':rotationId/ack')
  @CsrfExempt()
  @HttpCode(200)
  @UseGuards(DeviceRotationAckRequestShapeGuard, DeviceRotationBearerGuard)
  public async ack(
    @Param('rotationId') rotationId: string,
    @Body() body: { readonly candidateCredential: string },
    @Req() request: Request
  ) {
    try {
      const principal = getDeviceAccessPrincipal(request);
      if (!principal) throw new DeviceCredentialRotationError('DEVICE_ROTATION_INVALID');
      return await this.service.ack({
        principal,
        rotationId,
        candidateCredential: body.candidateCredential,
        now: new Date(),
      });
    } catch (error: unknown) {
      return mapDeviceRotationError(error);
    }
  }
}

function mapDeviceRotationError(error: unknown): never {
  if (error instanceof DeviceCredentialRotationError) {
    if (error.code === 'DEVICE_ROTATION_UNAVAILABLE') {
      throw new ServiceUnavailableException({
        code: 'device_auth_unavailable',
        message: 'Device authentication temporarily unavailable',
      });
    }
    if (error.code === 'DEVICE_ROTATION_REVOKED') {
      throw new UnauthorizedException({ code: 'device_revoked', message: 'Device revoked' });
    }
    if (error.code === 'DEVICE_ROTATION_INVALID') {
      throw new UnauthorizedException({
        code: 'device_rotation_invalid',
        message: 'Device credential rotation rejected',
      });
    }
    const mapping = {
      DEVICE_ROTATION_EXPIRED: 'device_rotation_expired',
      DEVICE_ROTATION_INCOMPATIBLE: 'device_rotation_incompatible',
      DEVICE_ROTATION_IN_PROGRESS: 'device_rotation_in_progress',
    } as const;
    const code = mapping[error.code as keyof typeof mapping];
    if (code) {
      throw new ConflictException({
        code,
        message: 'Device credential rotation state conflict',
      });
    }
  }
  throw new ServiceUnavailableException({
    code: 'device_auth_unavailable',
    message: 'Device authentication temporarily unavailable',
  });
}

function serializeRotationSummary(summary: DeviceRotationSummary): DeviceRotationSummary {
  return {
    id: summary.id,
    deviceId: summary.deviceId,
    status: summary.status,
    deadlineAt: summary.deadlineAt,
    ...(summary.credentialVersion === undefined
      ? {}
      : { credentialVersion: summary.credentialVersion }),
  };
}

function mapRotationError(error: unknown): never {
  if (error instanceof DeviceCredentialRotationError) {
    const mapping: Partial<Record<typeof error.code, string>> = {
      DEVICE_ROTATION_INVALID: 'device_rotation_invalid',
      DEVICE_ROTATION_INCOMPATIBLE: 'device_rotation_incompatible',
      DEVICE_ROTATION_EXPIRED: 'device_rotation_expired',
      DEVICE_ROTATION_IN_PROGRESS: 'device_rotation_in_progress',
      DEVICE_ROTATION_REVOKED: 'device_revoked',
    };
    const code = mapping[error.code];
    if (code !== undefined) {
      throw new ConflictException({ code, message: 'Device credential rotation state conflict' });
    }
  }
  throw new ServiceUnavailableException({
    code: 'device_auth_unavailable',
    message: 'Device authentication temporarily unavailable',
  });
}
