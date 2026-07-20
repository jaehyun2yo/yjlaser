import {
  Body,
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CsrfExempt } from '../../common/decorators/csrf-exempt.decorator';
import { CurrentDevicePrincipal } from './current-device-principal.decorator';
import type { DeviceAccessPrincipal } from './device-auth.types';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';
import { DeviceBearerGuard } from './device-bearer.guard';
import { DeviceHeartbeatRateGuard } from './device-heartbeat-rate.guard';
import { DeviceHeartbeatError, DeviceHeartbeatService } from './device-heartbeat.service';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto';

@Controller('integration/devices')
@UseGuards(DeviceBearerRequestSourceGuard)
export class DeviceBearerController {
  public constructor(private readonly heartbeatService: DeviceHeartbeatService) {}

  @Post('heartbeat')
  @HttpCode(200)
  @CsrfExempt()
  @UseGuards(DeviceBearerGuard, DeviceHeartbeatRateGuard)
  @UsePipes(createStrictHeartbeatValidationPipe())
  public async heartbeat(
    @CurrentDevicePrincipal() principal: DeviceAccessPrincipal,
    @Body() dto: DeviceHeartbeatDto
  ): Promise<{
    readonly ok: true;
    readonly deviceId: string;
    readonly environment: DeviceAccessPrincipal['environment'];
    readonly programType: DeviceAccessPrincipal['programType'];
    readonly capabilityProfile: DeviceAccessPrincipal['capabilityProfile'];
    readonly credentialVersion: number;
  }> {
    try {
      await this.heartbeatService.record(principal, {
        ...(dto.appVersion === undefined ? {} : { appVersion: dto.appVersion }),
      });
    } catch (error: unknown) {
      mapHeartbeatError(error);
    }

    return {
      ok: true,
      deviceId: principal.deviceId,
      environment: principal.environment,
      programType: principal.programType,
      capabilityProfile: principal.capabilityProfile,
      credentialVersion: principal.credentialVersion,
    };
  }

  @Post('canary')
  @HttpCode(200)
  @CsrfExempt()
  @UseGuards(DeviceBearerGuard)
  public canary(@CurrentDevicePrincipal() principal: DeviceAccessPrincipal): {
    readonly ok: true;
    readonly contractVersion: 'v1';
    readonly environment: DeviceAccessPrincipal['environment'];
    readonly programType: DeviceAccessPrincipal['programType'];
    readonly capabilityProfile: DeviceAccessPrincipal['capabilityProfile'];
  } {
    return {
      ok: true,
      contractVersion: 'v1',
      environment: principal.environment,
      programType: principal.programType,
      capabilityProfile: principal.capabilityProfile,
    };
  }
}

function createStrictHeartbeatValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
}

function mapHeartbeatError(error: unknown): never {
  if (error instanceof DeviceHeartbeatError) {
    if (error.code === 'DEVICE_HEARTBEAT_REVOKED') {
      throw new UnauthorizedException({ code: 'device_revoked', message: 'Device revoked' });
    }
    if (error.code === 'DEVICE_HEARTBEAT_INVALID') {
      throw new UnauthorizedException({
        code: 'device_access_invalid',
        message: 'Device access rejected',
      });
    }
  }
  throw new ServiceUnavailableException({
    code: 'device_auth_unavailable',
    message: 'Device authentication temporarily unavailable',
  });
}
