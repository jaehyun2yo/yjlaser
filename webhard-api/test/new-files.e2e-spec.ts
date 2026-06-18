import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
} from './helpers/test-utils';

describe('New Files API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /files/new', () => {
    it('관리자: 전체 새 파일 목록 조회', async () => {
      const response = await request(app.getHttpServer())
        .get('/files/new')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.files)).toBe(true);
      expect(typeof response.body.total).toBe('number');

      // 파일이 있으면 구조 검증
      if (response.body.files.length > 0) {
        const file = response.body.files[0];
        expect(file).toHaveProperty('id');
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('is_downloaded');
        expect(file.is_downloaded).toBe(false);
      }
    });

    it('관리자: 특정 업체의 새 파일 목록 조회', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get(`/files/new?companyId=${companyId}`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('total');

      // 모든 파일이 해당 업체 또는 공유 파일인지 검증
      for (const file of response.body.files) {
        expect(file.company_id === companyId || file.company_id === null).toBe(true);
      }
    });

    it('업체: 자신의 새 파일만 조회', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get('/files/new')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('total');

      // 모든 파일이 자신의 업체 또는 공유 파일인지 검증
      for (const file of response.body.files) {
        expect(file.company_id === companyId || file.company_id === null).toBe(true);
      }
    });

    it('정렬 옵션 적용: created_at desc (기본값)', async () => {
      const response = await request(app.getHttpServer())
        .get('/files/new')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      // 파일이 2개 이상이면 정렬 검증
      if (response.body.files.length >= 2) {
        const dates = response.body.files.map((f: { created_at: string }) =>
          new Date(f.created_at).getTime(),
        );
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
        }
      }
    });

    it('정렬 옵션 적용: name asc', async () => {
      const response = await request(app.getHttpServer())
        .get('/files/new?sortBy=name&sortOrder=asc')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      // 파일이 2개 이상이면 정렬 검증
      if (response.body.files.length >= 2) {
        const names = response.body.files.map((f: { name: string }) => f.name);
        const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
        expect(names).toEqual(sortedNames);
      }
    });

    it('페이지네이션 적용', async () => {
      const limit = 5;
      const response = await request(app.getHttpServer())
        .get(`/files/new?limit=${limit}`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body.files.length).toBeLessThanOrEqual(limit);
      expect(response.body).toHaveProperty('hasMore');
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer())
        .get('/files/new')
        .expect(401);
    });
  });
});
