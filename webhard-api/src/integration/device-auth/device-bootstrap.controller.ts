import {
  Body,
  Controller,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CsrfExempt } from '../../common/decorators/csrf-exempt.decorator';
import { DEVICE_ENROLLMENT_SERVICE } from './device-auth.tokens';
import { mapDeviceBootstrapError } from './device-bootstrap.errors';
import {
  DeviceBootstrapEnrollmentRateGuard,
  DeviceBootstrapStatusRateGuard,
  getEnrollmentReplayLease,
} from './device-bootstrap-rate.guard';
import {
  DeviceBootstrapEnrollRequestShapeGuard,
  DeviceBootstrapStatusRequestShapeGuard,
} from './device-bootstrap-request-shape.guard';
import { DeviceBootstrapRequestSourceGuard } from './device-bootstrap-request-source.guard';
import { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';
import { EnrollDeviceDto } from './dto/enroll-device.dto';
import { EnrollmentStatusDto } from './dto/enrollment-status.dto';
import type { DeviceEnrollmentService } from './device-enrollment.service';
import type { DeviceEnrollmentStatus } from './device-auth.types';

const NO_STORE_CACHE_CONTROL = 'no-store, private';

@Controller('integration/device-auth')
@UseGuards(DeviceBootstrapRequestSourceGuard)
export class DeviceBootstrapController {
  public constructor(
    @Inject(DEVICE_ENROLLMENT_SERVICE)
    private readonly enrollmentService: DeviceEnrollmentService,
    private readonly rateStore: DeviceBootstrapRateStore
  ) {}

  @Post('enroll')
  @CsrfExempt()
  @UseGuards(DeviceBootstrapEnrollRequestShapeGuard, DeviceBootstrapEnrollmentRateGuard)
  @UsePipes(createPublicBootstrapValidationPipe())
  public async enroll(
    @Body() dto: EnrollDeviceDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<DeviceEnrollmentStatus> {
    response.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    try {
      const status = await this.enrollmentService.enroll({
        enrollmentCode: dto.enrollmentCode,
        enrollmentAttemptId: dto.enrollmentAttemptId,
        displayName: dto.displayName,
        refreshCredential: dto.refreshCredential,
        appVersion: dto.appVersion,
      });
      return toPublicStatusResponse(status);
    } catch (error: unknown) {
      const replayLease = getEnrollmentReplayLease(request);
      if (replayLease) {
        await this.rateStore.releaseEnrollmentReplayLease({
          enrollmentAttemptId: dto.enrollmentAttemptId,
          replayLease,
        });
      }
      return mapDeviceBootstrapError(error);
    }
  }

  @Post('enrollment-status')
  @CsrfExempt()
  @UseGuards(DeviceBootstrapStatusRequestShapeGuard, DeviceBootstrapStatusRateGuard)
  @UsePipes(createPublicBootstrapValidationPipe())
  public async getEnrollmentStatus(
    @Body() dto: EnrollmentStatusDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<DeviceEnrollmentStatus> {
    response.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    try {
      const status = await this.enrollmentService.getEnrollmentStatus({
        enrollmentAttemptId: dto.enrollmentAttemptId,
        refreshCredential: dto.refreshCredential,
      });
      return toPublicStatusResponse(status);
    } catch (error: unknown) {
      return mapDeviceBootstrapError(error);
    }
  }
}

function createPublicBootstrapValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
}

function toPublicStatusResponse(status: DeviceEnrollmentStatus): DeviceEnrollmentStatus {
  return {
    deviceId: status.deviceId,
    state: status.state,
    environment: status.environment,
    programType: status.programType,
    capabilityProfile: status.capabilityProfile,
    credentialVersion: status.credentialVersion,
  };
}
