import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { SessionUser } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { DeviceAdminActorHasher } from './device-admin-actor-hash';
import { DeviceEnrollmentAdminRequestShapeGuard } from './device-enrollment-admin-request-shape.guard';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';
import type { DeviceEnrollmentService } from './device-enrollment.service';
import { DEVICE_ADMIN_ACTOR_HASHER, DEVICE_ENROLLMENT_SERVICE } from './device-auth.tokens';
import { CreateEnrollmentCodeDto } from './dto/create-enrollment-code.dto';

@Controller('integration/devices')
@UseGuards(SessionAuthGuard, AdminGuard, DeviceEnrollmentAdminSessionSourceGuard)
export class DeviceEnrollmentController {
  public constructor(
    @Inject(DEVICE_ENROLLMENT_SERVICE)
    private readonly enrollmentService: DeviceEnrollmentService,
    @Inject(DEVICE_ADMIN_ACTOR_HASHER)
    private readonly adminActorHasher: DeviceAdminActorHasher
  ) {}

  /**
   * A newly created admin session does not necessarily have the CSRF cookie
   * yet. This same-origin, session-only endpoint lets the normal CSRF cookie
   * middleware establish it before the one-time code POST. It never creates
   * an enrollment code and intentionally remains protected from API-key and
   * recovery-key request sources by the controller-level source guard.
   */
  @Get('csrf')
  public prepareCsrf(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store, private');
    return { ok: true };
  }

  @Post('enrollment-codes')
  @UseGuards(DeviceEnrollmentAdminRequestShapeGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  )
  public async createEnrollmentCode(
    @Body() dto: CreateEnrollmentCodeDto,
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) response: Response
  ) {
    const created = await this.enrollmentService.createEnrollmentCode({
      programType: dto.programType,
      capabilityProfile: dto.capabilityProfile,
      expectedDisplayName: dto.expectedDisplayName,
      actorHash: this.adminActorHasher.hashAdmin(user),
    });

    response.setHeader('Cache-Control', 'no-store, private');
    return {
      enrollmentCode: created.enrollmentCode,
      enrollmentId: created.enrollmentId,
      environment: created.environment,
      programType: created.programType,
      capabilityProfile: created.capabilityProfile,
      expiresAt: created.expiresAt,
    };
  }
}
