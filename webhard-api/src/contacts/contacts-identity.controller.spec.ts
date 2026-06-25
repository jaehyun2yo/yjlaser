import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { ApiKeyService } from '../integration/auth/api-key.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactTimelineService } from './contact-timeline.service';
import { DrawingRevisionService } from './drawing-revision.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WorkerContactAccessService } from '../worker-access/worker-contact-access.service';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';
const JOB_READ_KEY = 'job-read-key';
const FILE_REGISTER_KEY = 'file-register-key';
const COMPANY_SESSION = 'company-session-token';

describe('ContactsController operational identity lookup auth', () => {
  let app: INestApplication;
  let contactsService: jest.Mocked<
    Pick<
      ContactsService,
      | 'findAll'
      | 'findOne'
      | 'findDuplicate'
      | 'findByWorkNumber'
      | 'findByInquiryNumber'
      | 'findByCompany'
      | 'getStatusCounts'
      | 'count'
      | 'getRecentIds'
      | 'getDistinctCompanyNames'
      | 'getChildren'
      | 'getWorkerNotes'
    >
  >;
  let timelineService: jest.Mocked<
    Pick<ContactTimelineService, 'getStageDurationAnalytics' | 'getTimeline'>
  >;

  beforeAll(async () => {
    contactsService = {
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            id: CONTACT_ID,
            workNumber: '260624-F-001',
            inquiryNumber: '260624-O-001',
            companyId: 42,
            webhardFolderId: 'folder-1',
          },
        ],
        total: 1,
      }),
      findOne: jest.fn().mockResolvedValue({
        id: CONTACT_ID,
        workNumber: '260624-F-001',
        inquiryNumber: '260624-O-001',
        companyId: 42,
        webhardFolderId: 'folder-1',
      }),
      findDuplicate: jest.fn().mockResolvedValue({ id: CONTACT_ID }),
      findByWorkNumber: jest.fn().mockResolvedValue({
        id: CONTACT_ID,
        workNumber: '260624-F-001',
        companyId: 42,
        webhardFolderId: 'folder-1',
      }),
      findByInquiryNumber: jest.fn().mockResolvedValue({
        id: CONTACT_ID,
        inquiryNumber: '260624-O-001',
        companyId: 42,
        webhardFolderId: 'folder-1',
      }),
      findByCompany: jest.fn().mockResolvedValue([{ id: CONTACT_ID, companyName: 'Acme' }]),
      getStatusCounts: jest.fn().mockResolvedValue({ received: 1 }),
      count: jest.fn().mockResolvedValue(1),
      getRecentIds: jest.fn().mockResolvedValue([CONTACT_ID]),
      getDistinctCompanyNames: jest.fn().mockResolvedValue(['Acme']),
      getChildren: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getWorkerNotes: jest.fn().mockResolvedValue([]),
    };

    timelineService = {
      getStageDurationAnalytics: jest.fn().mockResolvedValue({ stages: [] }),
      getTimeline: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        ApiKeyGuard,
        { provide: ContactsService, useValue: contactsService },
        { provide: ContactTimelineService, useValue: timelineService },
        { provide: DrawingRevisionService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: WorkerContactAccessService, useValue: {} },
        {
          provide: ApiKeyService,
          useValue: {
            validateKey: jest.fn(async (rawKey: string) => {
              if (rawKey === JOB_READ_KEY) {
                return {
                  id: 'key-job-read',
                  programType: 'nesting_program',
                  permissions: ['job/read'],
                };
              }
              if (rawKey === FILE_REGISTER_KEY) {
                return {
                  id: 'key-file-register',
                  programType: 'external_webhard_sync',
                  permissions: ['file/register'],
                };
              }
              return null;
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            verifySession: jest.fn((sessionCookie: string) => {
              if (sessionCookie === COMPANY_SESSION) {
                return {
                  userType: 'company',
                  userId: 7,
                  companyId: 42,
                };
              }
              return null;
            }),
            verifyWorkerSession: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows job/read API keys to read Contact identity by workNumber', async () => {
    const response = await request(app.getHttpServer())
      .get('/contacts/by-work-number')
      .query({ workNumber: '260624-F-001' })
      .set('X-API-Key', JOB_READ_KEY)
      .expect(200);

    expect(response.body.contact).toMatchObject({
      id: CONTACT_ID,
      workNumber: '260624-F-001',
      companyId: 42,
      webhardFolderId: 'folder-1',
    });
    expect(contactsService.findByWorkNumber).toHaveBeenCalledWith('260624-F-001');
  });

  it('rejects low-scope API keys from Contact identity lookup', async () => {
    await request(app.getHttpServer())
      .get('/contacts/by-inquiry-number')
      .query({ inquiryNumber: '260624-O-001' })
      .set('X-API-Key', FILE_REGISTER_KEY)
      .expect(403);

    expect(contactsService.findByInquiryNumber).not.toHaveBeenCalled();
  });

  it('rejects low-scope API keys from Contact list reads before service access', async () => {
    await request(app.getHttpServer())
      .get('/contacts')
      .set('X-API-Key', FILE_REGISTER_KEY)
      .expect(403);

    expect(contactsService.findAll).not.toHaveBeenCalled();
  });

  it('rejects low-scope API keys from Contact detail reads before service access', async () => {
    await request(app.getHttpServer())
      .get(`/contacts/${CONTACT_ID}`)
      .set('X-API-Key', FILE_REGISTER_KEY)
      .expect(403);

    expect(contactsService.findOne).not.toHaveBeenCalled();
  });

  it('rejects company sessions from workNumber operational identity lookup before service access', async () => {
    await request(app.getHttpServer())
      .get('/contacts/by-work-number')
      .query({ workNumber: '260624-F-001' })
      .set('Cookie', [`company-session=${COMPANY_SESSION}`])
      .expect(403);

    expect(contactsService.findByWorkNumber).not.toHaveBeenCalled();
  });

  it('rejects company sessions from inquiryNumber operational identity lookup before service access', async () => {
    await request(app.getHttpServer())
      .get('/contacts/by-inquiry-number')
      .query({ inquiryNumber: '260624-O-001' })
      .set('Cookie', [`company-session=${COMPANY_SESSION}`])
      .expect(403);

    expect(contactsService.findByInquiryNumber).not.toHaveBeenCalled();
  });

  it('rejects low-scope API keys from company Contact list reads before service access', async () => {
    await request(app.getHttpServer())
      .get('/contacts/by-company')
      .query({ companyName: 'Acme' })
      .set('X-API-Key', FILE_REGISTER_KEY)
      .expect(403);

    expect(contactsService.findByCompany).not.toHaveBeenCalled();
  });

  it('rejects company sessions from company Contact list reads before service access', async () => {
    await request(app.getHttpServer())
      .get('/contacts/by-company')
      .query({ companyName: 'Other Company' })
      .set('Cookie', [`company-session=${COMPANY_SESSION}`])
      .expect(403);

    expect(contactsService.findByCompany).not.toHaveBeenCalled();
  });

  it('allows job/read API keys to check duplicate Contact candidates', async () => {
    const response = await request(app.getHttpServer())
      .post('/contacts/find-duplicate')
      .send({ companyName: 'Acme', originalFilename: 'part.dxf' })
      .set('X-API-Key', JOB_READ_KEY)
      .expect(201);

    expect(response.body).toEqual({ exists: true, contactId: CONTACT_ID });
    expect(contactsService.findDuplicate).toHaveBeenCalledWith('Acme', 'part.dxf');
  });

  it('rejects low-scope API keys from duplicate Contact lookup before service access', async () => {
    await request(app.getHttpServer())
      .post('/contacts/find-duplicate')
      .send({ companyName: 'Acme', originalFilename: 'part.dxf' })
      .set('X-API-Key', FILE_REGISTER_KEY)
      .expect(403);

    expect(contactsService.findDuplicate).not.toHaveBeenCalled();
  });

  it('rejects company sessions from duplicate Contact lookup before service access', async () => {
    await request(app.getHttpServer())
      .post('/contacts/find-duplicate')
      .send({ companyName: 'Other Company', originalFilename: 'part.dxf' })
      .set('Cookie', [`company-session=${COMPANY_SESSION}`])
      .expect(403);

    expect(contactsService.findDuplicate).not.toHaveBeenCalled();
  });

  it.each([
    ['/contacts/status-counts', 'getStatusCounts'],
    ['/contacts/analytics/stage-duration', 'getStageDurationAnalytics'],
    ['/contacts/count', 'count'],
    ['/contacts/recent-ids', 'getRecentIds'],
    ['/contacts/distinct-companies', 'getDistinctCompanyNames'],
    [`/contacts/${CONTACT_ID}/children`, 'getChildren'],
    [`/contacts/${CONTACT_ID}/notes`, 'getWorkerNotes'],
    [`/contacts/${CONTACT_ID}/timeline`, 'getTimeline'],
  ])('rejects low-scope API keys from %s before service access', async (path, serviceMethod) => {
    await request(app.getHttpServer()).get(path).set('X-API-Key', FILE_REGISTER_KEY).expect(403);

    const service =
      serviceMethod === 'getStageDurationAnalytics' || serviceMethod === 'getTimeline'
        ? timelineService
        : contactsService;
    expect(service[serviceMethod as keyof typeof service]).not.toHaveBeenCalled();
  });
});
