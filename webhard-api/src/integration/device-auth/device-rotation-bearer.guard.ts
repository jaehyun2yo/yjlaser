import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from '../auth/integration-permissions';
import type { DeviceAccessTokenService } from './device-access-token.service';
import {
  DEVICE_ACCESS_TOKEN_SERVICE,
  DEVICE_AUTH_CONFIG,
  DEVICE_AUTH_ROTATION_OPTIONS,
} from './device-auth.tokens';
import type { DeviceAuthRotationRuntimeOptions } from './device-auth.runtime-config';
import type { DeviceAuthConfig } from './device-auth.config';
import type { DeviceAccessPrincipal, DeviceAccessTokenClaims } from './device-auth.types';
import { DeviceBearerGuard } from './device-bearer.guard';
import { getDeviceBearerToken } from './device-bearer-request-source.guard';
import { verifyDeviceCredential } from './device-credential-hash';

type RotationRequest = Request & { deviceAuthInfo?: DeviceAccessPrincipal };

@Injectable()
export class DeviceRotationBearerGuard implements CanActivate {
  private readonly now = (): Date => new Date();

  public constructor(
    private readonly deviceBearerGuard: DeviceBearerGuard,
    private readonly prisma?: PrismaService,
    @Inject(DEVICE_AUTH_CONFIG) private readonly config?: DeviceAuthConfig,
    @Inject(DEVICE_ACCESS_TOKEN_SERVICE)
    private readonly accessTokenService?: Pick<DeviceAccessTokenService, 'verify'>,
    @Inject(DEVICE_AUTH_ROTATION_OPTIONS)
    private readonly rotationOptions?: Pick<
      DeviceAuthRotationRuntimeOptions,
      'rotationAckRecoverySeconds'
    >
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await this.deviceBearerGuard.canActivate(context);
    } catch (error: unknown) {
      if (
        !this.isAckRequest(context) ||
        !this.prisma ||
        !this.config ||
        !this.accessTokenService ||
        !this.rotationOptions
      ) {
        throw error;
      }
      return this.recoverAcknowledgedAck(context, error);
    }
  }

  private isAckRequest(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    return (
      request.method === 'POST' &&
      (request.originalUrl ?? request.url ?? request.route?.path ?? '').endsWith('/ack')
    );
  }

  private async recoverAcknowledgedAck(
    context: ExecutionContext,
    originalError: unknown
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RotationRequest>();
    const token = getDeviceBearerToken(request);
    const rotationId = request.params?.rotationId;
    const candidateCredential = (request.body as { candidateCredential?: unknown } | undefined)
      ?.candidateCredential;
    if (!token || typeof rotationId !== 'string' || typeof candidateCredential !== 'string')
      throw originalError;
    let claims: DeviceAccessTokenClaims;
    try {
      claims = await this.accessTokenService!.verify(token);
    } catch {
      throw originalError;
    }
    const expectedPermissions = DEFAULT_DEVICE_ACCESS_PERMISSIONS[claims.program_type];
    if (
      claims.environment !== this.config!.environment ||
      claims.capability_profile !== 'standard' ||
      !expectedPermissions ||
      claims.permissions.length !== expectedPermissions.length ||
      !expectedPermissions.every((permission) => claims.permissions.includes(permission))
    )
      throw originalError;
    let row;
    try {
      row = await this.prisma!.deviceCredentialRotation.findFirst({
        where: { id: rotationId, deviceId: claims.sub, status: 'acknowledged' },
        select: {
          id: true,
          status: true,
          baseCredentialVersion: true,
          acknowledgedAt: true,
          device: {
            select: {
              id: true,
              environment: true,
              programType: true,
              capabilityProfile: true,
              status: true,
              credentialVersion: true,
              revokedAt: true,
            },
          },
          candidateCredential: {
            select: {
              credentialHash: true,
              hashKeyVersion: true,
              status: true,
              credentialVersion: true,
              expiresAt: true,
              revokedAt: true,
            },
          },
        },
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'device_auth_unavailable',
        message: 'Device authentication temporarily unavailable',
      });
    }
    const now = this.now();
    if (
      !row ||
      row.id !== rotationId ||
      row.status !== 'acknowledged' ||
      row.baseCredentialVersion === null ||
      row.acknowledgedAt === null ||
      !row.candidateCredential ||
      claims.credential_version !== row.device.credentialVersion - 1 ||
      row.baseCredentialVersion !== claims.credential_version ||
      row.device.id !== claims.sub ||
      row.device.environment !== this.config!.environment ||
      row.device.programType !== claims.program_type ||
      row.device.capabilityProfile !== 'standard' ||
      row.device.status !== 'active' ||
      row.device.revokedAt !== null ||
      row.candidateCredential.status !== 'active' ||
      row.candidateCredential.credentialVersion !== row.device.credentialVersion ||
      row.candidateCredential.revokedAt !== null ||
      row.candidateCredential.expiresAt.getTime() <= now.getTime() ||
      now.getTime() >
        row.acknowledgedAt.getTime() + this.rotationOptions!.rotationAckRecoverySeconds * 1_000 ||
      !verifyDeviceCredential(this.config!, candidateCredential, row.candidateCredential).valid
    )
      throw originalError;
    request.deviceAuthInfo = Object.freeze({
      deviceId: row.device.id,
      environment: claims.environment,
      programType: claims.program_type,
      capabilityProfile: 'standard',
      permissions: Object.freeze([...expectedPermissions]),
      credentialVersion: claims.credential_version,
    });
    return true;
  }
}
