import { ApiKeyService } from './api-key.service';

interface MockPrisma {
  apiKey: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    delete: jest.Mock;
  };
}

function buildService() {
  const prisma: MockPrisma = {
    apiKey: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  return {
    service: new ApiKeyService(prisma as never),
    prisma,
  };
}

describe('ApiKeyService integration permission defaults', () => {
  it('createApiKey merges program default permissions when no explicit permissions are supplied', async () => {
    const { service, prisma } = buildService();
    prisma.apiKey.create.mockResolvedValue({ id: 'key-1' });

    await service.createApiKey('Nesting', 'nesting_program');

    expect(prisma.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Nesting',
        programType: 'nesting_program',
        permissions: ['event/write', 'job/read', 'contact/process-stage:write'],
      }),
    });
  });

  it('validateKey returns stored permissions without runtime default escalation', async () => {
    const { service, prisma } = buildService();
    prisma.apiKey.findFirst.mockResolvedValue({
      id: 'key-1',
      programType: 'nesting_program',
      permissions: ['event/write'],
    });

    const result = await service.validateKey('raw-key');

    expect(result).toEqual({
      id: 'key-1',
      programType: 'nesting_program',
      permissions: ['event/write'],
    });
  });

  it('validateKey preserves explicit non-default permissions without injecting defaults', async () => {
    const { service, prisma } = buildService();
    prisma.apiKey.findFirst.mockResolvedValue({
      id: 'key-2',
      programType: 'manual_worker',
      permissions: ['event/write', 'custom/permission'],
    });

    const result = await service.validateKey('manual-key');

    expect(result?.permissions).toEqual(['event/write', 'custom/permission']);
  });

  it('listApiKeys returns stored permissions without implying runtime defaults', async () => {
    const { service, prisma } = buildService();
    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: 'key-3',
        name: 'Admin dashboard',
        programType: 'admin_dashboard',
        permissions: ['operation/read'],
        isActive: true,
        lastUsedAt: null,
        createdAt: new Date('2026-06-24T00:00:00.000Z'),
      },
    ]);

    const result = await service.listApiKeys();

    expect(result).toEqual([
      {
        id: 'key-3',
        name: 'Admin dashboard',
        program_type: 'admin_dashboard',
        permissions: ['operation/read'],
        stored_permissions: ['operation/read'],
        is_active: true,
        last_used_at: null,
        created_at: '2026-06-24T00:00:00.000Z',
      },
    ]);
  });
});
