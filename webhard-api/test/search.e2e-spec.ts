import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
} from './helpers/test-utils';

describe('Search API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /search', () => {
    it('관리자: 통합 검색 (파일 + 폴더)', async () => {
      const response = await request(app.getHttpServer())
        .get('/search?q=test')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('folders');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.files)).toBe(true);
      expect(Array.isArray(response.body.folders)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('관리자: 특정 업체의 데이터만 검색', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get(`/search?q=test&companyId=${companyId}`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('folders');

      // 모든 파일이 해당 업체 또는 공유 파일인지 검증
      for (const file of response.body.files) {
        expect(file.company_id === companyId || file.company_id === null).toBe(true);
      }

      // 모든 폴더가 해당 업체 또는 공유 폴더인지 검증
      for (const folder of response.body.folders) {
        expect(folder.company_id === companyId || folder.company_id === null).toBe(true);
      }
    });

    it('업체: 자신의 데이터만 검색', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get('/search?q=test')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('folders');

      // 모든 파일이 자신의 업체 또는 공유 파일인지 검증
      for (const file of response.body.files) {
        expect(file.company_id === companyId || file.company_id === null).toBe(true);
      }
    });

    it('빈 쿼리는 400 반환', async () => {
      await request(app.getHttpServer())
        .get('/search?q=')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(400);
    });

    it('limit 옵션 적용', async () => {
      const limit = 5;
      const response = await request(app.getHttpServer())
        .get(`/search?q=test&limit=${limit}`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body.files.length).toBeLessThanOrEqual(limit);
      expect(response.body.folders.length).toBeLessThanOrEqual(limit);
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer())
        .get('/search?q=test')
        .expect(401);
    });
  });
});
