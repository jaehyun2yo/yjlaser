import { createHash } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import type { DeviceAuthProgramType } from '../src/integration/device-auth/device-auth.types';
import {
  assertDevLifecycleInvocation,
  cleanupSyntheticLifecycleRows,
  createDevLifecycleServices,
} from './device-auth-dev-lifecycle-smoke';

const DISPLAY_NAME_PREFIX = 'codex-dev-client-e2e-';
const ACTOR_HASH_DOMAIN = 'yjlaser:device-auth:dev-client-e2e:v1:';
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

function parseCommand(argv: readonly string[]): Command {
  const values = argv.filter((value) => value !== '--' && value !== '--confirm-dev-write');
  const [action, programType, displayName, ...extra] = values;
  if (
    extra.length !== 0 ||
    !ACTIONS.has(action ?? '') ||
    !PROGRAM_TYPES.has(programType as DeviceAuthProgramType) ||
    typeof displayName !== 'string' ||
    !displayName.startsWith(DISPLAY_NAME_PREFIX) ||
    displayName.length > 100
  ) {
    throw new Error('device_auth_dev_client_e2e_command_invalid');
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

async function runCommand(command: Command): Promise<Record<string, unknown>> {
  assertDevLifecycleInvocation(process.argv.slice(2), {
    DOPPLER_CONFIG: process.env.DOPPLER_CONFIG,
    DEVICE_AUTH_ENVIRONMENT: process.env.DEVICE_AUTH_ENVIRONMENT,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  const prisma = new PrismaService();
  const services = createDevLifecycleServices(prisma);
  const actorHash = createActorHash(command.displayName);
  await prisma.$connect();
  try {
    const matchingDevices = (await services.management.listDevices()).filter(
      (device) =>
        device.displayName === command.displayName && device.programType === command.programType
    );
    const current = matchingDevices[0];
    const pendingDevices = matchingDevices.filter((device) => device.state === 'pending_approval');
    const activeDevices = matchingDevices.filter((device) => device.state === 'active');

    if (command.action === 'issue') {
      if (pendingDevices.length !== 0 || activeDevices.length !== 0) {
        throw new Error('device_auth_dev_client_e2e_device_already_exists');
      }
      const enrollment = await services.enrollment.createEnrollmentCode({
        programType: command.programType,
        capabilityProfile: 'safe_canary',
        expectedDisplayName: command.displayName,
        actorHash,
      });
      return {
        action: command.action,
        environment: 'dev',
        programType: command.programType,
        displayName: command.displayName,
        enrollmentCode: enrollment.enrollmentCode,
        expiresAt: enrollment.expiresAt.toISOString(),
      };
    }

    if (command.action === 'cleanup') {
      await cleanupSyntheticLifecycleRows(prisma, {
        actorHash,
        displayNamePrefix: command.displayName,
      });
      return {
        action: command.action,
        environment: 'dev',
        programType: command.programType,
        displayName: command.displayName,
        cleanupVerified: true,
      };
    }

    if (!current) {
      throw new Error('device_auth_dev_client_e2e_device_not_found');
    }

    if (command.action === 'approve') {
      if (pendingDevices.length !== 1) {
        throw new Error('device_auth_dev_client_e2e_pending_device_ambiguous');
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
        throw new Error('device_auth_dev_client_e2e_active_device_ambiguous');
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
    const command = parseCommand(process.argv.slice(2));
    const result = await runCommand(command);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error: unknown) {
    const code =
      error instanceof Error ? error.message : 'device_auth_dev_client_e2e_unknown_failure';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
