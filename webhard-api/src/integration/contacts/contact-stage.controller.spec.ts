import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { ContactsService } from '../../contacts/contacts.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import {
  getDefaultIntegrationPermissions,
  type IntegrationWorkerType,
} from '../auth/integration-permissions';
import { IntegrationContactsController } from './contacts.controller';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';
const NESTING_PROGRAM_KEY = 'nesting-program-key';
const MANAGEMENT_PROGRAM_KEY = 'management-program-key';
const NARROW_MANAGEMENT_PROGRAM_KEY = 'narrow-management-program-key';
const EXTERNAL_WEBHARD_KEY = 'external-webhard-key';
const LEGACY_ALL_KEY = 'legacy-all-key';
const ADMIN_SESSION = 'admin-session-token';

describe('Integration contacts process-stage API', () => {
  let app: INestApplication;
  let contactsService: jest.Mocked<Pick<ContactsService, 'findOne' | 'updateProcessStage'>>;

  beforeAll(async () => {
    const workerTypeByKey = new Map<string, IntegrationWorkerType>([
      [NESTING_PROGRAM_KEY, 'nesting_program'],
      [MANAGEMENT_PROGRAM_KEY, 'management_program'],
      [EXTERNAL_WEBHARD_KEY, 'external_webhard_sync'],
    ]);

    contactsService = {
      findOne: jest.fn().mockResolvedValue({ id: CONTACT_ID, process_stage: 'laser' }),
      updateProcessStage: jest.fn().mockResolvedValue({
        id: CONTACT_ID,
        process_stage: 'cutting',
        previous_stage: 'laser',
        status_changed: false,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationContactsController],
      providers: [
        ApiKeyGuard,
        { provide: ContactsService, useValue: contactsService },
        {
          provide: ApiKeyService,
          useValue: {
            validateKey: jest.fn(async (rawKey: string) => {
              if (rawKey === NARROW_MANAGEMENT_PROGRAM_KEY) {
                return {
                  id: 'key-narrow-management',
                  programType: 'management_program',
                  permissions: ['event/write'],
                };
              }
              if (rawKey === LEGACY_ALL_KEY) {
                return {
                  id: 'key-legacy-all',
                  programType: 'migration',
                  permissions: ['all'],
                };
              }
              const workerType = workerTypeByKey.get(rawKey);
              if (!workerType) return null;
              return {
                id: `key-${workerType}`,
                programType: workerType,
                permissions: [...getDefaultIntegrationPermissions(workerType)],
              };
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            verifySession: jest.fn((cookieValue: string | undefined) => {
              if (cookieValue !== ADMIN_SESSION) return null;
              return { userType: 'admin', userId: 'admin', companyId: null };
            }),
            verifyWorkerSession: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    contactsService.findOne.mockResolvedValue({
      id: CONTACT_ID,
      process_stage: 'laser',
    } as never);
  });

  afterAll(async () => {
    await app.close();
  });

  it('nesting_program API key can move a Contact from laser to cutting through integration route', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', NESTING_PROGRAM_KEY)
      .send({
        processStage: 'cutting',
        actorName: 'nesting_program',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      id: CONTACT_ID,
      process_stage: 'cutting',
      previous_stage: 'laser',
    });
    expect(contactsService.updateProcessStage).toHaveBeenCalledWith(
      CONTACT_ID,
      'cutting',
      {
        actorType: 'system',
        actorName: 'nesting_program',
      },
      { expectedCurrentStage: 'laser' }
    );
  });

  it('management_program API key can move a Contact from drawing_confirmed to laser through the same integration route', async () => {
    contactsService.findOne.mockResolvedValueOnce({
      id: CONTACT_ID,
      process_stage: 'drawing_confirmed',
    } as never);
    contactsService.updateProcessStage.mockResolvedValueOnce({
      id: CONTACT_ID,
      process_stage: 'laser',
      previous_stage: 'drawing_confirmed',
      previous_status: 'production',
      work_number: '260624-F-001',
      status: 'production',
      inquiry_type: 'cutting_request',
      updated_at: new Date('2026-06-24T00:00:00.000Z'),
      status_changed: false,
    });

    const response = await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .send({
        processStage: 'laser',
        actorName: 'management_program',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      id: CONTACT_ID,
      process_stage: 'laser',
      previous_stage: 'drawing_confirmed',
    });
    expect(contactsService.findOne).toHaveBeenCalledWith(CONTACT_ID);
    expect(contactsService.updateProcessStage).toHaveBeenCalledWith(
      CONTACT_ID,
      'laser',
      {
        actorType: 'system',
        actorName: 'management_program',
      },
      { expectedCurrentStage: 'drawing_confirmed' }
    );
  });

  it('stored event-only management_program key cannot use Contact stage route through runtime defaults', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', NARROW_MANAGEMENT_PROGRAM_KEY)
      .send({
        processStage: 'laser',
      })
      .expect(403);

    expect(contactsService.findOne).not.toHaveBeenCalled();
    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('legacy all key without an allowed stage program cannot mutate Contact processStage', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', LEGACY_ALL_KEY)
      .send({
        processStage: 'laser',
      })
      .expect(403);

    expect(contactsService.findOne).not.toHaveBeenCalled();
    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('management_program cannot skip directly to cutting', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .send({
        processStage: 'cutting',
      })
      .expect(422);

    expect(contactsService.findOne).not.toHaveBeenCalled();
    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('nesting_program cannot move to cutting unless current stage is laser or already cutting', async () => {
    contactsService.findOne.mockResolvedValueOnce({
      id: CONTACT_ID,
      process_stage: 'drawing_confirmed',
    } as never);

    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', NESTING_PROGRAM_KEY)
      .send({
        processStage: 'cutting',
      })
      .expect(422);

    expect(contactsService.findOne).toHaveBeenCalledWith(CONTACT_ID);
    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('admin session cannot use the integration-only Contact stage route', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('Cookie', [`admin-session=${ADMIN_SESSION}`])
      .send({
        processStage: 'cutting',
      })
      .expect(403);

    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('external webhard sync API key cannot mutate Contact processStage', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .send({
        processStage: 'cutting',
      })
      .expect(403);

    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('invalid processStage is rejected before service mutation', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', NESTING_PROGRAM_KEY)
      .send({
        processStage: 'bad_stage',
      })
      .expect(400);

    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('missing processStage is rejected before service mutation', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', NESTING_PROGRAM_KEY)
      .send({})
      .expect(400);

    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });

  it('null processStage is rejected before service mutation', async () => {
    await request(app.getHttpServer())
      .patch(`/integration/contacts/${CONTACT_ID}/process-stage`)
      .set('X-API-Key', NESTING_PROGRAM_KEY)
      .send({
        processStage: null,
      })
      .expect(400);

    expect(contactsService.updateProcessStage).not.toHaveBeenCalled();
  });
});
