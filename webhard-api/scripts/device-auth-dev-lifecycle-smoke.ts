import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
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
import type {
  DeviceAccessPrincipal,
  DeviceAuthProgramType,
  DeviceEnrollmentStatus,
} from '../src/integration/device-auth/device-auth.types';

const CONFIRM_FLAG = '--confirm-dev-write';
const EXPECTED_DOPPLER_CONFIG = 'dev';
const EXPECTED_DEVICE_AUTH_ENVIRONMENT = 'dev';
const EXPECTED_DEV_DATABASE_TARGET_SHA256 =
  'E8C455AEB9FF837E7FC9CA34086E4EE41213B7BE1B9B207DC5394B9232394DC4';
const ACTOR_HASH_DOMAIN = 'yjlaser:device-auth:dev-lifecycle-smoke:v1:';
const DISPLAY_NAME_PREFIX = 'codex-dev-device-auth-smoke';

const PROGRAM_CASES = [
  { programType: 'external_webhard_sync', appVersion: '1.5.44' },
  { programType: 'management_program', appVersion: '1.46.79' },
  { programType: 'nesting_program', appVersion: '0.4.3' },
] as const satisfies ReadonlyArray<{
  readonly programType: DeviceAuthProgramType;
  readonly appVersion: string;
}>;

export interface DevLifecycleEnvironment {
  readonly DOPPLER_CONFIG?: string;
  readonly DEVICE_AUTH_ENVIRONMENT?: string;
  readonly DATABASE_URL?: string;
}

export interface LifecycleServices {
  readonly enrollment: DeviceEnrollmentService;
  readonly management: DeviceManagementService;
  readonly tokenExchange: DeviceTokenExchangeService;
  readonly heartbeat: DeviceHeartbeatService;
}

interface LifecycleResult {
  readonly programType: DeviceAuthProgramType;
  readonly initialState: 'active';
  readonly revokedState: 'revoked';
  readonly reissuedState: 'active';
  readonly distinctDeviceIds: true;
}

interface SafeEvidence {
  readonly schemaVersion: 1;
  readonly environment: 'dev';
  readonly programs: readonly LifecycleResult[];
  readonly cleanupVerified: true;
}

export function assertDevLifecycleInvocation(
  argv: readonly string[],
  environment: DevLifecycleEnvironment,
  expectedDatabaseTargetSha256 = EXPECTED_DEV_DATABASE_TARGET_SHA256
): void {
  if (!argv.includes(CONFIRM_FLAG)) {
    throw new Error('device_auth_dev_smoke_confirmation_required');
  }
  if (
    environment.DOPPLER_CONFIG !== EXPECTED_DOPPLER_CONFIG ||
    environment.DEVICE_AUTH_ENVIRONMENT !== EXPECTED_DEVICE_AUTH_ENVIRONMENT
  ) {
    throw new Error('device_auth_dev_smoke_environment_mismatch');
  }
  const actualDatabaseTargetSha256 = fingerprintDatabaseTarget(environment.DATABASE_URL);
  if (
    !isMatchingDatabaseTarget(
      actualDatabaseTargetSha256,
      expectedDatabaseTargetSha256.toUpperCase()
    )
  ) {
    throw new Error('device_auth_dev_smoke_database_target_mismatch');
  }
}

export function fingerprintDatabaseTarget(databaseUrl: string | undefined): string {
  try {
    if (!databaseUrl) {
      throw new Error('missing_database_url');
    }
    const parsed = new URL(databaseUrl);
    if (
      (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
      parsed.hostname.length === 0 ||
      parsed.username.length === 0 ||
      parsed.pathname.length <= 1
    ) {
      throw new Error('invalid_database_target');
    }
    const normalizedTarget = [
      parsed.protocol,
      parsed.hostname.toLowerCase(),
      decodeURIComponent(parsed.username).toLowerCase(),
      parsed.port,
      parsed.pathname.toLowerCase(),
    ].join('|');
    return createHash('sha256').update(normalizedTarget).digest('hex').toUpperCase();
  } catch {
    throw new Error('device_auth_dev_smoke_database_target_mismatch');
  }
}

function isMatchingDatabaseTarget(actual: string, expected: string): boolean {
  if (!/^[A-F0-9]{64}$/.test(actual) || !/^[A-F0-9]{64}$/.test(expected)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function selectLifecycleFailure(
  lifecycleFailure: unknown,
  cleanupFailure: unknown
): unknown {
  if (cleanupFailure !== undefined) {
    return new Error(
      lifecycleFailure === undefined
        ? 'device_auth_dev_smoke_cleanup_failed'
        : 'device_auth_dev_smoke_lifecycle_and_cleanup_failed'
    );
  }
  return lifecycleFailure;
}

function createBase64UrlCredential(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url');
}

function createActorHash(runId: string): string {
  return createHash('sha256').update(`${ACTOR_HASH_DOMAIN}${runId}`).digest('hex');
}

function assertStatus(
  status: DeviceEnrollmentStatus,
  expected: {
    readonly state: DeviceEnrollmentStatus['state'];
    readonly programType: DeviceAuthProgramType;
  }
): void {
  if (
    status.environment !== EXPECTED_DEVICE_AUTH_ENVIRONMENT ||
    status.capabilityProfile !== 'safe_canary' ||
    status.programType !== expected.programType ||
    status.state !== expected.state
  ) {
    throw new Error('device_auth_dev_smoke_status_mismatch');
  }
}

async function enrollAndActivate(
  services: LifecycleServices,
  input: {
    readonly actorHash: string;
    readonly displayName: string;
    readonly programType: DeviceAuthProgramType;
    readonly appVersion: string;
  }
): Promise<{
  readonly deviceId: string;
  readonly enrollmentAttemptId: string;
  readonly refreshCredential: string;
  readonly activeStatus: DeviceEnrollmentStatus;
}> {
  const enrollmentAttemptId = createBase64UrlCredential(24);
  const refreshCredential = createBase64UrlCredential(32);
  const enrollment = await services.enrollment.createEnrollmentCode({
    programType: input.programType,
    capabilityProfile: 'safe_canary',
    expectedDisplayName: input.displayName,
    actorHash: input.actorHash,
  });
  const pending = await services.enrollment.enroll({
    enrollmentCode: enrollment.enrollmentCode,
    enrollmentAttemptId,
    displayName: input.displayName,
    refreshCredential,
    appVersion: input.appVersion,
  });
  assertStatus(pending, {
    state: 'pending_approval',
    programType: input.programType,
  });
  const active = await services.management.approveDevice({
    deviceId: pending.deviceId,
    actorHash: input.actorHash,
  });
  assertStatus(active, {
    state: 'active',
    programType: input.programType,
  });
  const confirmed = await services.enrollment.getEnrollmentStatus({
    enrollmentAttemptId,
    refreshCredential,
  });
  assertStatus(confirmed, {
    state: 'active',
    programType: input.programType,
  });
  return {
    deviceId: pending.deviceId,
    enrollmentAttemptId,
    refreshCredential,
    activeStatus: confirmed,
  };
}

async function exchangeAndHeartbeat(
  services: LifecycleServices,
  input: {
    readonly status: DeviceEnrollmentStatus;
    readonly refreshCredential: string;
    readonly appVersion: string;
  }
): Promise<void> {
  const exchange = await services.tokenExchange.exchange({
    deviceId: input.status.deviceId,
    refreshCredential: input.refreshCredential,
    nextRefreshCredential: createBase64UrlCredential(32),
    refreshRequestId: createBase64UrlCredential(24),
  });
  if (
    exchange.environment !== EXPECTED_DEVICE_AUTH_ENVIRONMENT ||
    exchange.capabilityProfile !== 'safe_canary' ||
    exchange.programType !== input.status.programType ||
    exchange.refreshCredentialAction !== 'replace_with_candidate' ||
    typeof exchange.accessToken !== 'string' ||
    exchange.accessToken.length === 0
  ) {
    throw new Error('device_auth_dev_smoke_exchange_mismatch');
  }
  const principal: DeviceAccessPrincipal = {
    deviceId: exchange.deviceId,
    environment: exchange.environment,
    programType: exchange.programType,
    capabilityProfile: exchange.capabilityProfile,
    permissions: [],
    credentialVersion: exchange.credentialVersion,
  };
  await services.heartbeat.record(principal, { appVersion: input.appVersion });
}

async function runProgramLifecycle(
  services: LifecycleServices,
  input: {
    readonly actorHash: string;
    readonly displayName: string;
    readonly programType: DeviceAuthProgramType;
    readonly appVersion: string;
  }
): Promise<LifecycleResult> {
  const initial = await enrollAndActivate(services, input);
  await exchangeAndHeartbeat(services, {
    status: initial.activeStatus,
    refreshCredential: initial.refreshCredential,
    appVersion: input.appVersion,
  });
  const revoked = await services.management.revokeDevice({
    deviceId: initial.deviceId,
    actorHash: input.actorHash,
  });
  assertStatus(revoked, {
    state: 'revoked',
    programType: input.programType,
  });
  const revokedStatus = await services.enrollment.getEnrollmentStatus({
    enrollmentAttemptId: initial.enrollmentAttemptId,
    refreshCredential: initial.refreshCredential,
  });
  assertStatus(revokedStatus, {
    state: 'revoked',
    programType: input.programType,
  });

  const reissued = await enrollAndActivate(services, input);
  if (reissued.deviceId === initial.deviceId) {
    throw new Error('device_auth_dev_smoke_reissue_reused_device');
  }
  await exchangeAndHeartbeat(services, {
    status: reissued.activeStatus,
    refreshCredential: reissued.refreshCredential,
    appVersion: input.appVersion,
  });
  await services.management.revokeDevice({
    deviceId: reissued.deviceId,
    actorHash: input.actorHash,
  });

  return {
    programType: input.programType,
    initialState: 'active',
    revokedState: 'revoked',
    reissuedState: 'active',
    distinctDeviceIds: true,
  };
}

export async function cleanupSyntheticLifecycleRows(
  prisma: PrismaService,
  input: {
    readonly actorHash: string;
    readonly displayNamePrefix: string;
  }
): Promise<void> {
  const devices = await prisma.integrationDevice.findMany({
    where: {
      environment: EXPECTED_DEVICE_AUTH_ENVIRONMENT,
      displayName: { startsWith: input.displayNamePrefix },
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
      where: {
        environment: EXPECTED_DEVICE_AUTH_ENVIRONMENT,
        actorHash: input.actorHash,
      },
    });
    if (deviceIds.length > 0) {
      await transaction.integrationDevice.deleteMany({
        where: {
          id: { in: deviceIds },
          environment: EXPECTED_DEVICE_AUTH_ENVIRONMENT,
        },
      });
    }
  });

  const [remainingDevices, remainingEnrollments] = await Promise.all([
    prisma.integrationDevice.count({
      where: {
        environment: EXPECTED_DEVICE_AUTH_ENVIRONMENT,
        displayName: { startsWith: input.displayNamePrefix },
      },
    }),
    prisma.deviceEnrollment.count({
      where: {
        environment: EXPECTED_DEVICE_AUTH_ENVIRONMENT,
        actorHash: input.actorHash,
      },
    }),
  ]);
  if (remainingDevices !== 0 || remainingEnrollments !== 0) {
    throw new Error('device_auth_dev_smoke_cleanup_failed');
  }
}

export function createDevLifecycleServices(prisma: PrismaService): LifecycleServices {
  const runtimeConfig = loadDeviceAuthRuntimeConfigFromConfigService(new ConfigService());
  if (runtimeConfig.deviceAuthConfig.environment !== EXPECTED_DEVICE_AUTH_ENVIRONMENT) {
    throw new Error('device_auth_dev_smoke_runtime_environment_mismatch');
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
  const tokenExchange = new DeviceTokenExchangeService(
    prisma,
    runtimeConfig.deviceAuthConfig,
    enrollmentOptions,
    accessToken,
    runtimeConfig.tokenExchangeRequestHasher,
    runtimeConfig.rotationOptions
  );
  return {
    enrollment,
    management,
    tokenExchange,
    heartbeat: new DeviceHeartbeatService(prisma),
  };
}

export async function runDevLifecycleSmoke(): Promise<SafeEvidence> {
  assertDevLifecycleInvocation(process.argv.slice(2), {
    DOPPLER_CONFIG: process.env.DOPPLER_CONFIG,
    DEVICE_AUTH_ENVIRONMENT: process.env.DEVICE_AUTH_ENVIRONMENT,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  const runId = randomUUID();
  const actorHash = createActorHash(runId);
  const displayNamePrefix = `${DISPLAY_NAME_PREFIX}-${runId}`;
  const prisma = new PrismaService();
  const services = createDevLifecycleServices(prisma);
  const results: LifecycleResult[] = [];
  await prisma.$connect();
  let failure: unknown;
  try {
    for (const program of PROGRAM_CASES) {
      results.push(
        await runProgramLifecycle(services, {
          actorHash,
          displayName: `${displayNamePrefix}-${program.programType}`,
          programType: program.programType,
          appVersion: program.appVersion,
        })
      );
    }
  } catch (error: unknown) {
    failure = error;
  } finally {
    let cleanupFailure: unknown;
    try {
      await cleanupSyntheticLifecycleRows(prisma, {
        actorHash,
        displayNamePrefix,
      });
    } catch (cleanupError: unknown) {
      cleanupFailure = cleanupError;
    }
    try {
      await prisma.$disconnect();
    } catch (disconnectError: unknown) {
      cleanupFailure ??= disconnectError;
    }
    failure = selectLifecycleFailure(failure, cleanupFailure);
  }
  if (failure !== undefined) {
    throw failure;
  }
  return {
    schemaVersion: 1,
    environment: 'dev',
    programs: results,
    cleanupVerified: true,
  };
}

async function main(): Promise<void> {
  try {
    const evidence = await runDevLifecycleSmoke();
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : 'device_auth_dev_smoke_unknown_failure';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
