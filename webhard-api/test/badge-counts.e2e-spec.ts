import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
} from './helpers/test-utils';

describe('Badge Counts API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /files/badge-counts', () => {
    it('관리자: 전체 새 파일 카운트 조회', async () => {
      const response = await request(app.getHttpServer())
        .get('/files/badge-counts')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalCount');
      expect(typeof response.body.totalCount).toBe('number');
      expect(response.body.totalCount).toBeGreaterThanOrEqual(0);

      // 폴더별 카운트가 있으면 검증
      if (response.body.folderCounts) {
        expect(typeof response.body.folderCounts).toBe('object');
      }
    });

    it('관리자: 특정 업체의 새 파일 카운트 조회', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get(`/files/badge-counts?companyId=${companyId}`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalCount');
      expect(response.body).toHaveProperty('companyId');
      expect(response.body.companyId).toBe(companyId);
    });

    it('업체: 자신의 새 파일 카운트만 조회', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get('/files/badge-counts')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalCount');
      expect(typeof response.body.totalCount).toBe('number');
    });

    it('업체: 다른 업체 카운트 조회 시도시 403 반환', async () => {
      const myCompanyId = 1;
      const otherCompanyId = 999;

      await request(app.getHttpServer())
        .get(`/files/badge-counts?companyId=${otherCompanyId}`)
        .set('Cookie', `admin-session=${getCompanySessionCookie(myCompanyId)}`)
        .expect(403);
    });

    it('폴더별 카운트 포함 조회', async () => {
      const response = await request(app.getHttpServer())
        .get('/files/badge-counts?includeFolderCounts=true')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalCount');
      expect(response.body).toHaveProperty('folderCounts');
      expect(typeof response.body.folderCounts).toBe('object');
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer()).get('/files/badge-counts').expect(401);
    });
  });
});
