import type { PrismaService } from '../../prisma/prisma.service';
import { DeviceHeartbeatError, DeviceHeartbeatService } from './device-heartbeat.service';
import type { DeviceAccessPrincipal } from './device-auth.types';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-07-20T12:00:00.000Z');
const principal: DeviceAccessPrincipal = {
  deviceId: DEVICE_ID,
  environment: 'dev',
  programType: 'management_program',
  capabilityProfile: 'standard',
  permissions: Object.freeze(['event/write']),
  credentialVersion: 7,
};

function makeService(updateResult: unknown = { count: 1 }) {
  const updateMany = jest.fn().mockResolvedValue(updateResult);
  const prisma = { integrationDevice: { updateMany } } as unknown as PrismaService;
  return { service: new DeviceHeartbeatService(prisma, () => NOW), updateMany };
}

describe('DeviceHeartbeatService', () => {
  it('CAS-updates only the selected active device heartbeat timestamp', async () => {
    const { service, updateMany } = makeService();

    await expect(service.record(principal, {})).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: DEVICE_ID,
        environment: 'dev',
        status: 'active',
        revokedAt: null,
        credentialVersion: 7,
        programType: 'management_program',
        capabilityProfile: 'standard',
      },
      data: { lastHeartbeatAt: NOW },
    });
    const serialized = JSON.stringify(updateMany.mock.calls[0][0]);
    expect(serialized).not.toContain('hostname');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('programHeartbeat');
  });

  it('stores only a normalized optional semantic app version', async () => {
    const { service, updateMany } = makeService();

    await service.record(principal, { appVersion: '1.2.3-beta.1+build.9' });
    expect(updateMany.mock.calls[0][0].data).toEqual({
      lastHeartbeatAt: NOW,
      appVersion: '1.2.3-beta.1+build.9',
    });
  });

  it.each(['v1.2.3', '1.2', '1.2.3.4', ' 1.2.3', '1.02.3', '1.2.3-01', '1.2.3-alpha.01', 'latest'])(
    'rejects non-canonical app version %s before Prisma',
    async (appVersion) => {
      const { service, updateMany } = makeService();
      await expect(service.record(principal, { appVersion })).rejects.toMatchObject({
        code: 'DEVICE_HEARTBEAT_INVALID',
      });
      expect(updateMany).not.toHaveBeenCalled();
    }
  );

  it('maps a missed CAS to revocation and infrastructure failures to unavailable', async () => {
    const missed = makeService({ count: 0 });
    await expect(missed.service.record(principal, {})).rejects.toMatchObject({
      code: 'DEVICE_HEARTBEAT_REVOKED',
    });

    const updateMany = jest.fn().mockRejectedValue(new Error('db unavailable'));
    const service = new DeviceHeartbeatService(
      { integrationDevice: { updateMany } } as unknown as PrismaService,
      () => NOW
    );
    await expect(service.record(principal, {})).rejects.toEqual(
      new DeviceHeartbeatError('DEVICE_HEARTBEAT_UNAVAILABLE')
    );
  });
});
