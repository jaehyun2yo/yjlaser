import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeviceAccessPrincipal } from './device-auth.types';
import { CANONICAL_SEMVER_PATTERN } from './dto/device-heartbeat.dto';

export type DeviceHeartbeatErrorCode =
  | 'DEVICE_HEARTBEAT_INVALID'
  | 'DEVICE_HEARTBEAT_REVOKED'
  | 'DEVICE_HEARTBEAT_UNAVAILABLE';

export class DeviceHeartbeatError extends Error {
  public constructor(public readonly code: DeviceHeartbeatErrorCode) {
    super(code);
    this.name = 'DeviceHeartbeatError';
  }

  public toJSON(): { readonly code: DeviceHeartbeatErrorCode } {
    return { code: this.code };
  }
}

const DEVICE_HEARTBEAT_CLOCK = Symbol('DEVICE_HEARTBEAT_CLOCK');

@Injectable()
export class DeviceHeartbeatService {
  public constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(DEVICE_HEARTBEAT_CLOCK)
    private readonly now: () => Date = () => new Date()
  ) {}

  public async record(
    principal: DeviceAccessPrincipal,
    input: { readonly appVersion?: string }
  ): Promise<void> {
    const now = this.now();
    const appVersion = input.appVersion;
    if (
      !(now instanceof Date) ||
      !Number.isFinite(now.getTime()) ||
      (appVersion !== undefined &&
        (typeof appVersion !== 'string' ||
          appVersion.length > 50 ||
          !CANONICAL_SEMVER_PATTERN.test(appVersion)))
    ) {
      throw new DeviceHeartbeatError('DEVICE_HEARTBEAT_INVALID');
    }

    try {
      const result = await this.prisma.integrationDevice.updateMany({
        where: {
          id: principal.deviceId,
          environment: principal.environment,
          status: 'active',
          revokedAt: null,
          credentialVersion: principal.credentialVersion,
          programType: principal.programType,
          capabilityProfile: principal.capabilityProfile,
        },
        data: {
          lastHeartbeatAt: now,
          ...(appVersion === undefined ? {} : { appVersion }),
        },
      });
      if (result.count !== 1) {
        throw new DeviceHeartbeatError('DEVICE_HEARTBEAT_REVOKED');
      }
    } catch (error: unknown) {
      if (error instanceof DeviceHeartbeatError) {
        throw error;
      }
      throw new DeviceHeartbeatError('DEVICE_HEARTBEAT_UNAVAILABLE');
    }
  }
}
