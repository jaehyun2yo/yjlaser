import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_DEVICE_ACCESS_PERMISSIONS,
  type IntegrationPermission,
} from '../auth/integration-permissions';
import type { DeviceAccessTokenService } from './device-access-token.service';
import type { DeviceAuthConfig } from './device-auth.config';
import { DEVICE_ACCESS_TOKEN_SERVICE, DEVICE_AUTH_CONFIG } from './device-auth.tokens';
import type {
  DeviceAccessPrincipal,
  DeviceAccessTokenClaims,
  DeviceAuthProgramType,
} from './device-auth.types';
import { getDeviceBearerToken } from './device-bearer-request-source.guard';

type DevicePrincipalRequest = Request & { deviceAuthInfo?: DeviceAccessPrincipal };
const DEVICE_BEARER_CLOCK = Symbol('DEVICE_BEARER_CLOCK');

@Injectable()
export class DeviceBearerGuard implements CanActivate {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(DEVICE_AUTH_CONFIG) private readonly config: DeviceAuthConfig,
    @Inject(DEVICE_ACCESS_TOKEN_SERVICE)
    private readonly accessTokenService: DeviceAccessTokenService,
    @Optional()
    @Inject(DEVICE_BEARER_CLOCK)
    private readonly now: () => Date = () => new Date()
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DevicePrincipalRequest>();
    const token = getDeviceBearerToken(request);
    if (!token) {
      throw invalidAccess();
    }

    let claims: DeviceAccessTokenClaims;
    try {
      claims = await this.accessTokenService.verify(token);
    } catch {
      throw invalidAccess();
    }

    const permissions = derivePermissions(claims);
    if (!permissions || claims.environment !== this.config.environment) {
      throw invalidAccess();
    }

    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw unavailableAccess();
    }

    let device: {
      readonly id: string;
      readonly environment: string;
      readonly programType: string;
      readonly capabilityProfile: string;
      readonly credentialVersion: number;
    } | null;
    try {
      device = await this.prisma.integrationDevice.findFirst({
        where: {
          id: claims.sub,
          environment: this.config.environment,
          status: 'active',
          revokedAt: null,
          credentialVersion: claims.credential_version,
          programType: claims.program_type,
          capabilityProfile: claims.capability_profile,
          tokenExchanges: {
            none: {
              credentialVersion: claims.credential_version,
              status: 'revoked',
            },
          },
          refreshCredentials: {
            some: {
              status: 'active',
              revokedAt: null,
              expiresAt: { gt: now },
              credentialVersion: claims.credential_version,
            },
          },
        },
        select: {
          id: true,
          environment: true,
          programType: true,
          capabilityProfile: true,
          credentialVersion: true,
        },
      });
    } catch {
      throw unavailableAccess();
    }

    if (!device) {
      if (await this.isExplicitlyRevoked(claims)) {
        throw revokedAccess();
      }
      throw invalidAccess();
    }

    const principal: DeviceAccessPrincipal = Object.freeze({
      deviceId: device.id,
      environment: claims.environment,
      programType: claims.program_type,
      capabilityProfile: claims.capability_profile,
      permissions: Object.freeze([...permissions]),
      credentialVersion: claims.credential_version,
    });
    request.deviceAuthInfo = principal;
    return true;
  }

  private async isExplicitlyRevoked(claims: DeviceAccessTokenClaims): Promise<boolean> {
    try {
      const state = await this.prisma.integrationDevice.findFirst({
        where: {
          id: claims.sub,
          environment: this.config.environment,
        },
        select: {
          status: true,
          revokedAt: true,
          refreshCredentials: {
            where: { credentialVersion: claims.credential_version },
            select: { status: true, revokedAt: true, expiresAt: true },
          },
          tokenExchanges: {
            where: { credentialVersion: claims.credential_version, status: 'revoked' },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!state) {
        return false;
      }
      const explicitlyRevokedCredential = state.refreshCredentials.some(
        (credential) => credential.status === 'revoked' || credential.revokedAt !== null
      );
      return (
        state.status === 'revoked' ||
        state.revokedAt !== null ||
        explicitlyRevokedCredential ||
        state.tokenExchanges.length > 0
      );
    } catch {
      throw unavailableAccess();
    }
  }
}

export function getDeviceAccessPrincipal(request: Request): DeviceAccessPrincipal | undefined {
  return (request as DevicePrincipalRequest).deviceAuthInfo;
}

function derivePermissions(
  claims: DeviceAccessTokenClaims
): readonly IntegrationPermission[] | undefined {
  if (claims.capability_profile === 'safe_canary') {
    return claims.permissions.length === 0 ? [] : undefined;
  }
  if (!isSupportedProgramType(claims.program_type)) {
    return undefined;
  }
  const expected = DEFAULT_DEVICE_ACCESS_PERMISSIONS[claims.program_type];
  if (
    claims.permissions.length !== expected.length ||
    !expected.every((permission) => claims.permissions.includes(permission))
  ) {
    return undefined;
  }
  return expected;
}

function isSupportedProgramType(value: string): value is DeviceAuthProgramType {
  return (
    value === 'external_webhard_sync' ||
    value === 'management_program' ||
    value === 'nesting_program'
  );
}

function invalidAccess(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'device_access_invalid',
    message: 'Device access rejected',
  });
}

function revokedAccess(): UnauthorizedException {
  return new UnauthorizedException({ code: 'device_revoked', message: 'Device revoked' });
}

function unavailableAccess(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'device_auth_unavailable',
    message: 'Device authentication temporarily unavailable',
  });
}
