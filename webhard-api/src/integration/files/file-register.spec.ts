import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthService } from '../../auth/auth.service';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { FilesService } from '../../files/files.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';
import {
  getDefaultIntegrationPermissions,
  type IntegrationWorkerType,
} from '../auth/integration-permissions';
import { IntegrationFilesController } from './files.controller';
import { IntegrationFilesService } from './files.service';

const EXTERNAL_WEBHARD_KEY = 'external-webhard-key';
const MANAGEMENT_PROGRAM_KEY = 'management-program-key';
const FOLDER_ID = '0f0a3f2b-4bd3-4f90-9099-877dd9dc26c3';

const validRegisterPayload = {
  idempotency_key: 'external_webhard_sync:outbox-456:file.register',
  source_worker: 'external_webhard_sync',
  order_id: 'ord-001',
  company_id: 123,
  folder_id: FOLDER_ID,
  storage_provider: 'google_drive',
  drive_file_id: 'gdrive-file-001',
  file_kind: 'drawing_source',
  path: 'customer/order/sanitized-name.dxf',
  original_name_safe: 'sanitized-name.dxf',
  mime_type: 'application/dxf',
  size_bytes: 123456,
  content_hash: null,
  uploaded_at: '2026-06-19T09:00:00+09:00',
};

describe('Integration files register API', () => {
  let app: INestApplication;
  let authService: jest.Mocked<Pick<AuthService, 'verifySession' | 'verifyWorkerSession'>>;
  let filesService: jest.Mocked<
    Pick<
      FilesService,
      | 'confirmUpload'
      | 'findExistingUploadMetadata'
      | 'getUploadPresignedUrl'
      | 'getBatchUploadPresignedUrls'
    >
  >;

  beforeAll(async () => {
    const workerTypeByKey = new Map<string, IntegrationWorkerType>([
      [EXTERNAL_WEBHARD_KEY, 'external_webhard_sync'],
      [MANAGEMENT_PROGRAM_KEY, 'management_program'],
    ]);

    filesService = {
      confirmUpload: jest.fn().mockResolvedValue({
        id: 'file-001',
        name: 'sanitized-name.dxf',
        original_name: 'sanitized-name.dxf',
        size: 123456,
        mime_type: 'application/dxf',
        path: `${FOLDER_ID}/sanitized-name.dxf`,
        folder_id: FOLDER_ID,
        company_id: 123,
        uploaded_by: 'admin',
        inquiry_number: null,
        is_downloaded: false,
        created_at: '2026-06-19T09:00:00.000Z',
        updated_at: '2026-06-19T09:00:00.000Z',
        deleted_at: null,
        deleted_by: null,
        storage_provider: 'google_drive',
      }),
      findExistingUploadMetadata: jest.fn().mockResolvedValue(null),
      getUploadPresignedUrl: jest.fn(),
      getBatchUploadPresignedUrls: jest.fn(),
    };
    authService = {
      verifySession: jest.fn((cookieValue: string | undefined) => {
        if (cookieValue !== 'admin-session-token') {
          return null;
        }

        return {
          userType: 'admin',
          userId: 'admin',
          companyId: null,
        };
      }),
      verifyWorkerSession: jest.fn().mockReturnValue(null),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationFilesController],
      providers: [
        IntegrationFilesService,
        ApiKeyGuard,
        { provide: FilesService, useValue: filesService },
        {
          provide: ApiKeyService,
          useValue: {
            validateKey: jest.fn(async (rawKey: string) => {
              const workerType = workerTypeByKey.get(rawKey);
              if (!workerType) {
                return null;
              }

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
          useValue: authService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      })
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers file metadata through the integration route without creating upload sessions', async () => {
    const response = await request(app.getHttpServer())
      .post('/integration/files/register')
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .send(validRegisterPayload)
      .expect(201);

    expect(response.body).toEqual({
      file_id: 'file-001',
      order_id: 'ord-001',
      duplicate: false,
      status: 'FILE_RECEIVED',
    });
    expect(filesService.confirmUpload).toHaveBeenCalledWith(
      {
        key: validRegisterPayload.path,
        name: validRegisterPayload.original_name_safe,
        originalName: validRegisterPayload.original_name_safe,
        size: validRegisterPayload.size_bytes,
        mimeType: validRegisterPayload.mime_type,
        folderId: validRegisterPayload.folder_id,
        companyId: validRegisterPayload.company_id,
        driveFileId: validRegisterPayload.drive_file_id,
        storageProvider: 'google_drive',
      },
      {
        userType: 'admin',
        userId: 'integration:file-register',
        companyId: null,
      }
    );
    expect(filesService.findExistingUploadMetadata).toHaveBeenCalledWith({
      driveFileId: validRegisterPayload.drive_file_id,
      path: validRegisterPayload.path,
    });
    expect(filesService.getUploadPresignedUrl).not.toHaveBeenCalled();
    expect(filesService.getBatchUploadPresignedUrls).not.toHaveBeenCalled();
  });

  it('returns duplicate=true without creating a second row when metadata already exists', async () => {
    filesService.findExistingUploadMetadata.mockResolvedValueOnce({
      id: 'file-existing',
      name: 'sanitized-name.dxf',
      original_name: 'sanitized-name.dxf',
      size: 123456,
      mime_type: 'application/dxf',
      path: `${FOLDER_ID}/sanitized-name.dxf`,
      folder_id: FOLDER_ID,
      company_id: 123,
      uploaded_by: 'admin',
      inquiry_number: null,
      is_downloaded: false,
      created_at: '2026-06-19T09:00:00.000Z',
      updated_at: '2026-06-19T09:00:00.000Z',
      deleted_at: null,
      deleted_by: null,
      storage_provider: 'google_drive',
    });

    const response = await request(app.getHttpServer())
      .post('/integration/files/register')
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .send(validRegisterPayload)
      .expect(201);

    expect(response.body).toEqual({
      file_id: 'file-existing',
      order_id: 'ord-001',
      duplicate: true,
      status: 'FILE_RECEIVED',
    });
    expect(filesService.confirmUpload).not.toHaveBeenCalled();
  });

  it('rejects session principals because file registration is API-key only', async () => {
    const response = await request(app.getHttpServer())
      .post('/integration/files/register')
      .set('Cookie', ['admin-session=admin-session-token'])
      .send(validRegisterPayload)
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'INTEGRATION_API_KEY_REQUIRED',
      message: 'Integration API key required',
    });
    expect(filesService.confirmUpload).not.toHaveBeenCalled();
  });

  it('rejects API keys without file/register permission before service execution', async () => {
    const response = await request(app.getHttpServer())
      .post('/integration/files/register')
      .set('X-API-Key', MANAGEMENT_PROGRAM_KEY)
      .send(validRegisterPayload)
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'INTEGRATION_PERMISSION_DENIED',
      required_permission: 'file/register',
    });
    expect(filesService.confirmUpload).not.toHaveBeenCalled();
  });

  it('rejects API keys whose program type does not match source_worker', async () => {
    const response = await request(app.getHttpServer())
      .post('/integration/files/register')
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .send({
        ...validRegisterPayload,
        source_worker: 'management_program',
      })
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'INTEGRATION_SOURCE_WORKER_MISMATCH',
      message: 'API key program type must match source_worker',
    });
    expect(filesService.confirmUpload).not.toHaveBeenCalled();
  });

  it('rejects invalid register payloads before service execution', async () => {
    const input: Record<string, unknown> = { ...validRegisterPayload };
    delete input.drive_file_id;

    await request(app.getHttpServer())
      .post('/integration/files/register')
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .send(input)
      .expect(400);

    expect(filesService.confirmUpload).not.toHaveBeenCalled();
  });

  it('rejects unknown storage providers before service execution', async () => {
    await request(app.getHttpServer())
      .post('/integration/files/register')
      .set('X-API-Key', EXTERNAL_WEBHARD_KEY)
      .send({
        ...validRegisterPayload,
        storage_provider: 'dropbox',
      })
      .expect(400);

    expect(filesService.confirmUpload).not.toHaveBeenCalled();
  });
});
