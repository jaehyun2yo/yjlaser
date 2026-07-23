import { createHash, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { DeviceAccessTokenService } from '../src/integration/device-auth/device-access-token.service';
import {
  DeviceEnrollmentService,
  type DeviceEnrollmentServiceOptions,
} from '../src/integration/device-auth/device-enrollment.service';
import { DeviceHeartbeatService } from '../src/integration/device-auth/device-heartbeat.service';
import { DeviceManagementService } from '../src/integration/device-auth/device-management.service';
import { DeviceTokenExchangeService } from '../src/integration/device-auth/device-token-exchange.service';
import { loadDeviceAuthRuntimeConfigFromConfigService } from '../src/integration/device-auth/device-auth.runtime-config';
import type { DeviceAuthProgramType } from '../src/integration/device-auth/device-auth.types';
import {
  fingerprintDatabaseTarget,
  type LifecycleServices,
} from './device-auth-dev-lifecycle-smoke';

const CONFIRM_FLAG = '--confirm-prd-write';
const EXPECTED_DATABASE_TARGET_SHA256 =
  'C2E32FB640761BBB560F81A71F5527A16EC7EDBC9FE25C709697D36E4244CDE6';
const DISPLAY_NAME_PREFIX = 'codex-prd-client-e2e-';
const ACTOR_HASH_DOMAIN = 'yjlaser:device-auth:prd-client-e2e:v1:';
const PROGRAM_TYPES = new Set<DeviceAuthProgramType>([
  'external_webhard_sync',
  'management_program',
  'nesting_program',
]);
const ACTIONS = new Set(['issue', 'approve', 'revoke', 'status', 'cleanup']);

interface Command {
  readonly action: 'issue' | 'approve' | 'revoke' | 'status' | 'cleanup';
  readonly programType: DeviceAuthProgramType;
  readonly displayName: string;
}

export interface PrdControlEnvironment {
  readonly DOPPLER_CONFIG?: string;
  readonly DEVICE_AUTH_ENVIRONMENT?: string;
  readonly DATABASE_URL?: string;
}

export function assertPrdControlInvocation(
  argv: readonly string[],
  environment: PrdControlEnvironment,
  expectedDatabaseTargetSha256 = EXPECTED_DATABASE_TARGET_SHA256
): void {
  if (!argv.includes(CONFIRM_FLAG)) {
    throw new Error('device_auth_prd_control_confirmation_required');
  }
  if (environment.DOPPLER_CONFIG !== 'prd' || environment.DEVICE_AUTH_ENVIRONMENT !== 'prd') {
    throw new Error('device_auth_prd_control_environment_mismatch');
  }
  const actual = fingerprintDatabaseTarget(environment.DATABASE_URL);
  const expected = expectedDatabaseTargetSha256.toUpperCase();
  if (
    !/^[A-F0-9]{64}$/.test(actual) ||
    !/^[A-F0-9]{64}$/.test(expected) ||
    !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
  ) {
    throw new Error('device_auth_prd_control_database_target_mismatch');
  }
}

export function parsePrdControlCommand(argv: readonly string[]): Command {
  const values = argv.filter((value) => value !== '--' && value !== CONFIRM_FLAG);
  const [action, programType, displayName, ...extra] = values;
  if (
    extra.length !== 0 ||
    !ACTIONS.has(action ?? '') ||
    !PROGRAM_TYPES.has(programType as DeviceAuthProgramType) ||
    typeof displayName !== 'string' ||
    !displayName.startsWith(DISPLAY_NAME_PREFIX) ||
    displayName.length > 100
  ) {
    throw new Error('device_auth_prd_control_command_invalid');
  }
  return {
    action: action as Command['action'],
    programType: programType as DeviceAuthProgramType,
    displayName,
  };
}

function createActorHash(displayName: string): string {
  return createHash('sha256').update(`${ACTOR_HASH_DOMAIN}${displayName}`).digest('hex');
}

function createPrdLifecycleServices(prisma: PrismaService): LifecycleServices {
  const runtimeConfig = loadDeviceAuthRuntimeConfigFromConfigService(new ConfigService());
  if (runtimeConfig.deviceAuthConfig.environment !== 'prd') {
    throw new Error('device_auth_prd_control_runtime_environment_mismatch');
  }
  const enrollmentOptions: DeviceEnrollmentServiceOptions = runtimeConfig.enrollmentOptions;
  const enrollment = new DeviceEnrollmentService(
    prisma,
    runtimeConfig.deviceAuthConfig,
    enrollmentOptions
  );
  const management = new DeviceManagementService(
    prisma,
    runtimeConfig.deviceAuthConfig,
    enrollmentOptions,
    enrollment
  );
  const accessToken = new DeviceAccessTokenService(
    new JwtService(),
    runtimeConfig.accessTokenConfig
  );
  return {
    enrollment,
    management,
    tokenExchange: new DeviceTokenExchangeService(
      prisma,
      runtimeConfig.deviceAuthConfig,
      enrollmentOptions,
      accessToken,
      runtimeConfig.tokenExchangeRequestHasher,
      runtimeConfig.rotationOptions
    ),
    heartbeat: new DeviceHeartbeatService(prisma),
  };
}

async function cleanupSyntheticRows(
  prisma: PrismaService,
  input: { readonly actorHash: string; readonly displayName: string }
): Promise<void> {
  const devices = await prisma.integrationDevice.findMany({
    where: {
      environment: 'prd',
      programType: { in: [...PROGRAM_TYPES] },
      displayName: input.displayName,
    },
    select: { id: true },
  });
  const deviceIds = devices.map((device) => device.id);
  await prisma.$transaction(async (transaction) => {
    if (deviceIds.length > 0) {
      await transaction.deviceCredentialAuditLog.deleteMany({
        where: { deviceId: { in: deviceIds } },
      });
      await transaction.deviceTokenExchange.deleteMany({
        where: { deviceId: { in: deviceIds } },
      });
      await transaction.deviceCredentialRotation.deleteMany({
        where: { deviceId: { in: deviceIds } },
      });
      await transaction.deviceRefreshCredential.deleteMany({
        where: { deviceId: { in: deviceIds } },
      });
      await transaction.programHeartbeat.updateMany({
        where: { deviceId: { in: deviceIds } },
        data: { deviceId: null },
      });
    }
    await transaction.deviceEnrollment.deleteMany({
      where: { environment: 'prd', actorHash: input.actorHash },
    });
    if (deviceIds.length > 0) {
      await transaction.integrationDevice.deleteMany({
        where: { environment: 'prd', id: { in: deviceIds } },
      });
    }
  });
  const [deviceCount, enrollmentCount] = await Promise.all([
    prisma.integrationDevice.count({
      where: { environment: 'prd', displayName: input.displayName },
    }),
    prisma.deviceEnrollment.count({
      where: { environment: 'prd', actorHash: input.actorHash },
    }),
  ]);
  if (deviceCount !== 0 || enrollmentCount !== 0) {
    throw new Error('device_auth_prd_control_cleanup_failed');
  }
}

async function runCommand(command: Command): Promise<Record<string, unknown>> {
  assertPrdControlInvocation(process.argv.slice(2), {
    DOPPLER_CONFIG: process.env.DOPPLER_CONFIG,
    DEVICE_AUTH_ENVIRONMENT: process.env.DEVICE_AUTH_ENVIRONMENT,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  const prisma = new PrismaService();
  const services = createPrdLifecycleServices(prisma);
  const actorHash = createActorHash(command.displayName);
  await prisma.$connect();
  try {
    const matchingDevices = (await services.management.listDevices()).filter(
      (device) =>
        device.environment === 'prd' &&
        device.displayName === command.displayName &&
        device.programType === command.programType
    );
    const pendingDevices = matchingDevices.filter((device) => device.state === 'pending_approval');
    const activeDevices = matchingDevices.filter((device) => device.state === 'active');
    const current = matchingDevices[0];

    if (command.action === 'issue') {
      if (pendingDevices.length !== 0 || activeDevices.length !== 0) {
        throw new Error('device_auth_prd_control_device_already_exists');
      }
      const enrollment = await services.enrollment.createEnrollmentCode({
        programType: command.programType,
        capabilityProfile: 'safe_canary',
        expectedDisplayName: command.displayName,
        actorHash,
      });
      return {
        action: command.action,
        environment: 'prd',
        programType: command.programType,
        displayName: command.displayName,
        enrollmentCode: enrollment.enrollmentCode,
        expiresAt: enrollment.expiresAt.toISOString(),
      };
    }

    if (command.action === 'cleanup') {
      await cleanupSyntheticRows(prisma, { actorHash, displayName: command.displayName });
      return {
        action: command.action,
        environment: 'prd',
        programType: command.programType,
        displayName: command.displayName,
        cleanupVerified: true,
      };
    }

    if (!current) {
      throw new Error('device_auth_prd_control_device_not_found');
    }
    if (command.action === 'approve') {
      if (pendingDevices.length !== 1) {
        throw new Error('device_auth_prd_control_pending_device_ambiguous');
      }
      const approved = await services.management.approveDevice({
        deviceId: pendingDevices[0].deviceId,
        actorHash,
      });
      return {
        action: command.action,
        environment: approved.environment,
        programType: approved.programType,
        displayName: command.displayName,
        state: approved.state,
      };
    }
    if (command.action === 'revoke') {
      if (activeDevices.length !== 1) {
        throw new Error('device_auth_prd_control_active_device_ambiguous');
      }
      const revoked = await services.management.revokeDevice({
        deviceId: activeDevices[0].deviceId,
        actorHash,
      });
      return {
        action: command.action,
        environment: revoked.environment,
        programType: revoked.programType,
        displayName: command.displayName,
        state: revoked.state,
      };
    }
    return {
      action: command.action,
      environment: current.environment,
      programType: current.programType,
      displayName: command.displayName,
      state: current.state,
      heartbeatObserved: current.lastHeartbeatAt !== undefined,
      deviceGenerationCount: matchingDevices.length,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  try {
    const command = parsePrdControlCommand(process.argv.slice(2));
    const result = await runCommand(command);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : 'device_auth_prd_control_unknown_failure';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
