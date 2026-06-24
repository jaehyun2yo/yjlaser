import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  cleanupTestCompanies,
  cleanupTestData,
  createNestedFolders,
  createTestCompany,
  createTestFiles,
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
  getTestPrismaClient,
  randomUUID,
} from './helpers/test-utils';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Mark Downloaded API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getTestPrismaClient();
  });

  afterAll(async () => {
    await cleanupTestData(prisma);
    await cleanupTestCompanies(prisma);
    await app.close();
  });

  afterEach(async () => {
    await cleanupTestData(prisma);
    await cleanupTestCompanies(prisma);
  });

  describe('POST /files/mark-downloaded', () => {
    it('관리자: 특정 파일들을 다운로드 완료로 표시', async () => {
      const fileIds = await createTestFiles(prisma, 2);

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ fileIds })
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body.success).toBe(true);
      expect(response.body.updatedCount).toBe(fileIds.length);
    });

    it('관리자: 폴더 내 모든 파일을 다운로드 완료로 표시', async () => {
      const [folderId] = await createNestedFolders(prisma, 1);
      await createTestFiles(prisma, 2, folderId);

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ folderId })
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body.success).toBe(true);
      expect(response.body.updatedCount).toBe(2);
    });

    it('관리자: 전체 파일을 다운로드 완료로 표시', async () => {
      await createTestFiles(prisma, 2);

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ markAll: true })
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body.success).toBe(true);
      expect(response.body.updatedCount).toBeGreaterThanOrEqual(2);
    });

    it('업체: 자신의 파일만 다운로드 완료로 표시 가능', async () => {
      const company = await createTestCompany(prisma);
      const fileIds = await createTestFiles(prisma, 2, null, company.id);

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getCompanySessionCookie(company.id)}`)
        .send({ fileIds })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.updatedCount).toBe(2);
    });

    it('fileIds와 folderId 모두 없으면 400 반환 (markAll=false일 때)', async () => {
      await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({})
        .expect(400);
    });

    it('존재하지 않는 파일 ID는 무시하고 성공 반환', async () => {
      const nonExistentIds = [randomUUID(), randomUUID()];

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ fileIds: nonExistentIds })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.updatedCount).toBe(0);
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .send({ markAll: true })
        .expect(401);
    });
  });
});
