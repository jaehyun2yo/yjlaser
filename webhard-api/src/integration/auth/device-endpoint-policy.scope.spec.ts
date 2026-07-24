import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { ContactsController } from '../../contacts/contacts.controller';
import { ContactsService } from '../../contacts/contacts.service';
import { ContactTimelineService } from '../../contacts/contact-timeline.service';
import { DrawingRevisionService } from '../../contacts/drawing-revision.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { WorkerContactAccessService } from '../../worker-access/worker-contact-access.service';
import { IntegrationContactsController } from '../contacts/contacts.controller';
import { InventoryController } from '../inventory/inventory.controller';
import { InventoryService } from '../inventory/inventory.service';
import { LaserCompletionsController } from '../laser-completions/laser-completions.controller';
import { LaserCompletionsService } from '../laser-completions/laser-completions.service';
import { NestingTasksController } from '../nesting-tasks/nesting-tasks.controller';
import { NestingTasksService } from '../nesting-tasks/nesting-tasks.service';
import { ProgramsAccessGuard } from '../programs/programs-access.guard';
import { ProgramsController } from '../programs/programs.controller';
import { ProgramsService } from '../programs/programs.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';

jest.setTimeout(30_000);

type Method = 'get' | 'post' | 'patch' | 'delete';

const HELD_ROUTES: ReadonlyArray<readonly [Method, string]> = [
  ['get', '/integration/inventory/alerts'],
  ['get', '/integration/inventory/items'],
  ['get', '/integration/inventory/items/item-1'],
  ['post', '/integration/inventory/items'],
  ['patch', '/integration/inventory/items/item-1'],
  ['post', '/integration/inventory/items/item-1/in'],
  ['post', '/integration/inventory/items/item-1/out'],
  ['post', '/integration/inventory/items/item-1/adjust'],
  ['get', '/integration/inventory/items/item-1/transactions'],
  ['get', '/integration/nesting-tasks/pending'],
  ['patch', '/integration/nesting-tasks/task-1/status'],
  ['post', '/integration/nesting-tasks/task-1/result'],
  ['post', '/integration/laser-completions'],
  ['post', '/integration/programs/heartbeat'],
  ['get', '/integration/programs'],
  ['patch', '/integration/contacts/550e8400-e29b-41d4-a716-446655440000/process-stage'],
  ['get', '/contacts/by-work-number?workNumber=F-001'],
  ['post', '/contacts/cleanup'],
  ['delete', '/contacts/batch-by-pattern'],
  ['delete', '/contacts/delete-all'],
];

describe('device endpoint policy untouched legacy scope', () => {
  let app: INestApplication;
  const serviceCall = jest.fn();
  const serviceProxy = new Proxy(
    {},
    {
      get: (_target, property) => (property === 'then' ? undefined : serviceCall),
    }
  );

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [
        InventoryController,
        NestingTasksController,
        LaserCompletionsController,
        ProgramsController,
        IntegrationContactsController,
        ContactsController,
      ],
      providers: [
        ApiKeyGuard,
        ProgramsAccessGuard,
        { provide: ApiKeyService, useValue: { validateKey: jest.fn().mockResolvedValue(null) } },
        {
          provide: AuthService,
          useValue: {
            verifySession: jest.fn().mockReturnValue({
              userType: 'admin',
              userId: 'admin',
              companyId: 0,
            }),
            verifyWorkerSession: jest.fn().mockReturnValue(null),
          },
        },
        { provide: AdminGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: CompanyAccessGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: InventoryService, useValue: serviceProxy },
        { provide: NestingTasksService, useValue: serviceProxy },
        { provide: LaserCompletionsService, useValue: serviceProxy },
        { provide: ProgramsService, useValue: serviceProxy },
        { provide: ContactsService, useValue: serviceProxy },
        { provide: ContactTimelineService, useValue: serviceProxy },
        { provide: DrawingRevisionService, useValue: serviceProxy },
        { provide: PrismaService, useValue: serviceProxy },
        { provide: StorageService, useValue: serviceProxy },
        { provide: WorkerContactAccessService, useValue: serviceProxy },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(CompanyAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());
  beforeEach(() => serviceCall.mockClear());

  it.each(HELD_ROUTES)('%s %s rejects bearer-only before service/write', async (method, path) => {
    await send(method, path, { Authorization: 'Bearer synthetic.jwt.token' });
    expect(serviceCall).not.toHaveBeenCalled();
  });

  it.each(HELD_ROUTES)(
    '%s %s rejects bearer plus valid static key before service/write',
    async (method, path) => {
      await send(method, path, {
        Authorization: 'Bearer synthetic.jwt.token',
        'X-API-Key': 'legacy-key',
      });
      expect(serviceCall).not.toHaveBeenCalled();
    }
  );

  it.each(HELD_ROUTES)(
    '%s %s rejects bearer plus named session before service/write',
    async (method, path) => {
      await send(method, path, {
        Authorization: 'Bearer synthetic.jwt.token',
        Cookie: 'admin-session=synthetic',
      });
      expect(serviceCall).not.toHaveBeenCalled();
    }
  );

  async function send(method: Method, path: string, headers: Record<string, string>) {
    const agent = request(app.getHttpServer());
    const call =
      method === 'get'
        ? agent.get(path)
        : method === 'post'
          ? agent.post(path)
          : method === 'patch'
            ? agent.patch(path)
            : agent.delete(path);
    for (const [name, value] of Object.entries(headers)) call.set(name, value);
    const response = await call.send({});
    expect([401, 403]).toContain(response.status);
  }
});
