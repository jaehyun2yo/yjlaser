import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { BackupAdminGuard } from './backup-admin.guard';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupSettingsResponse, BackupStartResult } from './dto/backup.dto';
import { AuthService, SessionUser } from '../auth/auth.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { ApiKeyService } from '../integration/auth/api-key.service';

const ADMIN_SESSION_COOKIE = 'admin-session-value';
const COMPANY_SESSION_COOKIE = 'company-session-value';
const API_KEY_WITHOUT_BACKUP_SCOPE = 'api-key-without-backup-scope';
const API_KEY_WITH_BACKUP_WRITE = 'api-key-with-backup-write';
const API_KEY_WITH_BACKUP_EXECUTE = 'api-key-with-backup-execute';

describe('BackupController 권한 경계', () => {
  let app: INestApplication;
  let backupService: jest.Mocked<Pick<BackupService, 'updateSettings' | 'startBackup'>>;
  let apiKeyService: jest.Mocked<Pick<ApiKeyService, 'validateKey'>>;
  let authService: jest.Mocked<Pick<AuthService, 'verifySession'>>;

  const adminUser: SessionUser = {
    userType: 'admin',
    userId: 'admin',
    companyId: 0,
  };

  const companyUser: SessionUser = {
    userType: 'company',
    userId: 7,
    companyId: 7,
  };

  const settingsResponse: BackupSettingsResponse = {
    enabled: true,
    retentionDays: 45,
    nasPath: 'D:\\backup',
    deleteAfterBackup: true,
  };

  const startResponse: BackupStartResult = {
    status: 'started',
    total: 3,
  };

  beforeAll(async () => {
    backupService = {
      updateSettings: jest.fn(),
      startBackup: jest.fn(),
    };

    const permissionsByKey = new Map<string, string[]>([
      [API_KEY_WITHOUT_BACKUP_SCOPE, []],
      [API_KEY_WITH_BACKUP_WRITE, ['backup:write']],
      [API_KEY_WITH_BACKUP_EXECUTE, ['backup:execute']],
    ]);

    apiKeyService = {
      validateKey: jest.fn(async (rawKey: string) => {
        const permissions = permissionsByKey.get(rawKey);
        if (!permissions) {
          return null;
        }

        return {
          id: `test-${rawKey}`,
          programType: 'test-client',
          permissions,
        };
      }),
    };

    authService = {
      verifySession: jest.fn((cookieValue: string | undefined) => {
        if (cookieValue === ADMIN_SESSION_COOKIE) {
          return adminUser;
        }

        if (cookieValue === COMPANY_SESSION_COOKIE) {
          return companyUser;
        }

        return null;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        ApiKeyGuard,
        BackupAdminGuard,
        { provide: BackupService, useValue: backupService },
        { provide: ApiKeyService, useValue: apiKeyService },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      })
    );

    await app.init();
  });

  beforeEach(() => {
    backupService.updateSettings.mockResolvedValue(settingsResponse);
    backupService.startBackup.mockResolvedValue(startResponse);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PUT /backup/settings', () => {
    it('API key-only 요청은 backup:write 권한 없으면 거부한다', async () => {
      await request(app.getHttpServer())
        .put('/backup/settings')
        .set('X-API-Key', API_KEY_WITHOUT_BACKUP_SCOPE)
        .send({ enabled: true })
        .expect(403);

      expect(backupService.updateSettings).not.toHaveBeenCalled();
    });

    it('admin session 요청은 백업 설정 수정을 허용한다', async () => {
      const response = await request(app.getHttpServer())
        .put('/backup/settings')
        .set('Cookie', `admin-session=${ADMIN_SESSION_COOKIE}`)
        .send({ enabled: true })
        .expect(200);

      expect(response.body.enabled).toBe(true);
      expect(backupService.updateSettings).toHaveBeenCalledWith({ enabled: true });
    });

    it('backup:write 권한이 명시된 API key 요청은 백업 설정 수정을 허용한다', async () => {
      const response = await request(app.getHttpServer())
        .put('/backup/settings')
        .set('X-API-Key', API_KEY_WITH_BACKUP_WRITE)
        .send({ enabled: true })
        .expect(200);

      expect(response.body.enabled).toBe(true);
      expect(backupService.updateSettings).toHaveBeenCalledWith({ enabled: true });
    });

    it('backup:execute 권한만 있는 API key 요청은 백업 설정 수정을 거부한다', async () => {
      await request(app.getHttpServer())
        .put('/backup/settings')
        .set('X-API-Key', API_KEY_WITH_BACKUP_EXECUTE)
        .send({ enabled: true })
        .expect(403);

      expect(backupService.updateSettings).not.toHaveBeenCalled();
    });

    it('company session 요청은 백업 설정 수정을 거부한다', async () => {
      await request(app.getHttpServer())
        .put('/backup/settings')
        .set('Cookie', `company-session=${COMPANY_SESSION_COOKIE}`)
        .send({ enabled: true })
        .expect(403);

      expect(backupService.updateSettings).not.toHaveBeenCalled();
    });
  });

  describe('POST /backup/execute', () => {
    it('API key-only 요청은 backup:execute 권한 없으면 거부한다', async () => {
      await request(app.getHttpServer())
        .post('/backup/execute')
        .set('X-API-Key', API_KEY_WITHOUT_BACKUP_SCOPE)
        .expect(403);

      expect(backupService.startBackup).not.toHaveBeenCalled();
    });

    it('admin session 요청은 수동 백업 실행을 허용한다', async () => {
      const response = await request(app.getHttpServer())
        .post('/backup/execute')
        .set('Cookie', `admin-session=${ADMIN_SESSION_COOKIE}`)
        .expect(201);

      expect(response.body.status).toBe('started');
      expect(backupService.startBackup).toHaveBeenCalledTimes(1);
    });

    it('backup:execute 권한이 명시된 API key 요청은 수동 백업 실행을 허용한다', async () => {
      const response = await request(app.getHttpServer())
        .post('/backup/execute')
        .set('X-API-Key', API_KEY_WITH_BACKUP_EXECUTE)
        .expect(201);

      expect(response.body.status).toBe('started');
      expect(backupService.startBackup).toHaveBeenCalledTimes(1);
    });

    it('backup:write 권한만 있는 API key 요청은 수동 백업 실행을 거부한다', async () => {
      await request(app.getHttpServer())
        .post('/backup/execute')
        .set('X-API-Key', API_KEY_WITH_BACKUP_WRITE)
        .expect(403);

      expect(backupService.startBackup).not.toHaveBeenCalled();
    });

    it('company session 요청은 수동 백업 실행을 거부한다', async () => {
      await request(app.getHttpServer())
        .post('/backup/execute')
        .set('Cookie', `company-session=${COMPANY_SESSION_COOKIE}`)
        .expect(403);

      expect(backupService.startBackup).not.toHaveBeenCalled();
    });
  });
});
