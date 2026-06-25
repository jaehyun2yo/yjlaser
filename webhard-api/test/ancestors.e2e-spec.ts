import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  cleanupTestCompanies,
  cleanupTestData,
  createNestedFolders,
  createTestCompany,
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
  getTestPrismaClient,
  randomUUID,
} from './helpers/test-utils';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Folder Ancestors API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminFolderIds: string[];
  let companyFolderIds: string[];
  let companyId: number;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getTestPrismaClient();
    adminFolderIds = await createNestedFolders(prisma, 2);
    const company = await createTestCompany(prisma);
    companyId = company.id;
    companyFolderIds = await createNestedFolders(prisma, 2, companyId);
  });

  afterAll(async () => {
    await cleanupTestData(prisma);
    await cleanupTestCompanies(prisma);
    await app.close();
  });

  describe('GET /folders/:id/ancestors', () => {
    it('관리자: 폴더 조상 목록 조회', async () => {
      const folderId = adminFolderIds[0];

      const response = await request(app.getHttpServer())
        .get(`/folders/${folderId}/ancestors`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('ancestors');
      expect(response.body).toHaveProperty('current');
      expect(Array.isArray(response.body.ancestors)).toBe(true);
      expect(response.body.current).toHaveProperty('id');
      expect(response.body.current.id).toBe(folderId);
    });

    it('업체: 자신이 접근 가능한 폴더의 조상 조회', async () => {
      const folderId = companyFolderIds[0];

      const response = await request(app.getHttpServer())
        .get(`/folders/${folderId}/ancestors`)
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      expect(response.body).toHaveProperty('ancestors');
      expect(response.body).toHaveProperty('current');
    });

    it('존재하지 않는 폴더 ID는 404 반환', async () => {
      const nonExistentId = randomUUID();

      await request(app.getHttpServer())
        .get(`/folders/${nonExistentId}/ancestors`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(404);
    });

    it('잘못된 UUID 형식은 400 반환', async () => {
      await request(app.getHttpServer())
        .get('/folders/invalid-uuid/ancestors')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(400);
    });

    it('비인증 요청은 401 반환', async () => {
      const fakeId = randomUUID();
      await request(app.getHttpServer()).get(`/folders/${fakeId}/ancestors`).expect(401);
    });

    it('조상 목록이 루트부터 현재까지 순서대로 정렬됨', async () => {
      const childFolderId = adminFolderIds[1];
      const parentFolderId = adminFolderIds[0];

      const response = await request(app.getHttpServer())
        .get(`/folders/${childFolderId}/ancestors`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      // 조상이 있어야 함
      expect(response.body.ancestors.length).toBeGreaterThan(0);

      // 마지막 조상이 현재 폴더의 부모여야 함
      const lastAncestor = response.body.ancestors[response.body.ancestors.length - 1];
      expect(lastAncestor.id).toBe(parentFolderId);
    });
  });
});
