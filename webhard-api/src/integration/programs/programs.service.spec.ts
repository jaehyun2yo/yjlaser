import { PrismaService } from '../../prisma/prisma.service';
import { ProgramsService } from './programs.service';

const HOSTILE_HOSTNAME = 'DESKTOP-SECRET-01';
const HOSTILE_METADATA = {
  apiKey: 'must-not-be-persisted',
  localPath: 'C:\\Users\\operator\\customer.dxf',
  nested: { owner: 'operator@example.com' },
};

function makePrisma() {
  return {
    executeWithRetry: jest.fn((operation: () => unknown) => operation()),
    programHeartbeat: {
      upsert: jest.fn().mockResolvedValue({
        id: 'heartbeat-001',
        programType: 'management_program',
        instanceName: 'management-01',
        lastSeenAt: new Date('2026-07-20T00:00:00.000Z'),
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'heartbeat-001',
          programType: 'management_program',
          instanceName: 'management-01',
          status: 'online',
          version: '1.2.3',
          hostname: HOSTILE_HOSTNAME,
          metadata: HOSTILE_METADATA,
          lastSeenAt: new Date(),
          createdAt: new Date('2026-07-19T00:00:00.000Z'),
        },
      ]),
    },
  };
}

describe('ProgramsService legacy heartbeat data minimization', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ProgramsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProgramsService(prisma as unknown as PrismaService);
  });

  it('accepts legacy hostname and metadata input without persisting either field', async () => {
    await service.receiveHeartbeat({
      programType: 'management_program',
      instanceName: 'management-01',
      version: '1.2.3',
      hostname: HOSTILE_HOSTNAME,
      metadata: HOSTILE_METADATA,
    });

    const upsertInput = prisma.programHeartbeat.upsert.mock.calls[0][0];

    expect(upsertInput.update).toEqual(
      expect.objectContaining({
        status: 'online',
        version: '1.2.3',
        lastSeenAt: expect.any(Date),
      })
    );
    expect(upsertInput.create).toEqual(
      expect.objectContaining({
        programType: 'management_program',
        instanceName: 'management-01',
        status: 'online',
        version: '1.2.3',
        lastSeenAt: expect.any(Date),
      })
    );
    expect(upsertInput.update).not.toHaveProperty('hostname');
    expect(upsertInput.update).not.toHaveProperty('metadata');
    expect(upsertInput.create).not.toHaveProperty('hostname');
    expect(upsertInput.create).not.toHaveProperty('metadata');
  });

  it('lists only explicitly selected safe fields and never returns legacy host metadata', async () => {
    const response = await service.listPrograms();

    expect(prisma.programHeartbeat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { programType: 'asc' },
        select: {
          id: true,
          programType: true,
          instanceName: true,
          status: true,
          version: true,
          lastSeenAt: true,
          createdAt: true,
        },
      })
    );

    const query = prisma.programHeartbeat.findMany.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('hostname');
    expect(query.select).not.toHaveProperty('metadata');
    expect(response).toEqual([
      expect.objectContaining({
        id: 'heartbeat-001',
        program_type: 'management_program',
        instance_name: 'management-01',
        version: '1.2.3',
        last_seen_at: expect.any(String),
        created_at: '2026-07-19T00:00:00.000Z',
      }),
    ]);
    expect(response[0]).not.toHaveProperty('hostname');
    expect(response[0]).not.toHaveProperty('metadata');
    expect(JSON.stringify(response)).not.toContain(HOSTILE_HOSTNAME);
    expect(JSON.stringify(response)).not.toContain('must-not-be-persisted');
  });
});
