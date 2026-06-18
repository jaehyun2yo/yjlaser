import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
} from './helpers/test-utils';

describe('Storage API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /storage', () => {
    it('관리자: 전체 저장공간 사용량 조회 성공', async () => {
      const response = await request(app.getHttpServer())
        .get('/storage')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('max');
      expect(typeof response.body.current).toBe('number');
      expect(typeof response.body.max).toBe('number');
      expect(response.body.current).toBeGreaterThanOrEqual(0);
      expect(response.body.max).toBeGreaterThan(0);
    });

    it('관리자: 특정 업체 저장공간 사용량 조회', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get(`/storage?companyId=${companyId}`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('max');
      expect(response.body).toHaveProperty('companyId');
      expect(response.body.companyId).toBe(companyId);
    });

    it('업체: 자신의 저장공간 사용량만 조회', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get('/storage')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('max');
      // 업체는 자신의 companyId에 대한 데이터만 받아야 함
    });

    it('업체: 다른 업체 저장공간 조회 시도시 403 반환', async () => {
      const myCompanyId = 1;
      const otherCompanyId = 999;

      await request(app.getHttpServer())
        .get(`/storage?companyId=${otherCompanyId}`)
        .set('Cookie', `admin-session=${getCompanySessionCookie(myCompanyId)}`)
        .expect(403);
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer()).get('/storage').expect(401);
    });

    it('잘못된 세션은 401 반환', async () => {
      await request(app.getHttpServer())
        .get('/storage')
        .set('Cookie', 'session=invalid-session-cookie')
        .expect(401);
    });
  });

  describe('GET /storage/breakdown', () => {
    it('관리자: 저장공간 상세 내역 조회', async () => {
      const response = await request(app.getHttpServer())
        .get('/storage/breakdown')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('byCompany');
      expect(Array.isArray(response.body.byCompany)).toBe(true);
    });

    it('업체: 저장공간 상세 내역 조회 (자신의 데이터만)', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get('/storage/breakdown')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('byFolder');
    });
  });
});
