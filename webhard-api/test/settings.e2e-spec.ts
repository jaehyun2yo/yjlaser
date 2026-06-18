import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
} from './helpers/test-utils';

describe('Settings API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /settings', () => {
    it('관리자: 설정 조회', async () => {
      const response = await request(app.getHttpServer())
        .get('/settings')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      expect(response.body).toHaveProperty('fontSize');
      expect(response.body).toHaveProperty('notificationsEnabled');
      expect(typeof response.body.fontSize).toBe('string');
      expect(typeof response.body.notificationsEnabled).toBe('boolean');
    });

    it('업체: 설정 조회', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .get('/settings')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      expect(response.body).toHaveProperty('fontSize');
      expect(response.body).toHaveProperty('notificationsEnabled');
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer())
        .get('/settings')
        .expect(401);
    });
  });

  describe('POST /settings', () => {
    it('관리자: 설정 저장', async () => {
      const newSettings = {
        fontSize: 'medium',
        notificationsEnabled: false,
        downloadFolderPath: 'C:/Downloads/Webhard',
      };

      const response = await request(app.getHttpServer())
        .post('/settings')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send(newSettings)
        .expect(201);

      expect(response.body.fontSize).toBe(newSettings.fontSize);
      expect(response.body.notificationsEnabled).toBe(newSettings.notificationsEnabled);
      expect(response.body.downloadFolderPath).toBe(newSettings.downloadFolderPath);
    });

    it('업체: 설정 저장', async () => {
      const companyId = 1;
      const newSettings = {
        fontSize: 'large',
        notificationsEnabled: true,
      };

      const response = await request(app.getHttpServer())
        .post('/settings')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .send(newSettings)
        .expect(201);

      expect(response.body.fontSize).toBe(newSettings.fontSize);
      expect(response.body.notificationsEnabled).toBe(newSettings.notificationsEnabled);
    });

    it('부분 업데이트 지원', async () => {
      // fontSize만 업데이트
      const response = await request(app.getHttpServer())
        .post('/settings')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ fontSize: 'small' })
        .expect(201);

      expect(response.body.fontSize).toBe('small');
      // 다른 설정은 유지되어야 함
      expect(response.body).toHaveProperty('notificationsEnabled');
    });

    it('잘못된 fontSize 값은 400 반환', async () => {
      await request(app.getHttpServer())
        .post('/settings')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ fontSize: 'invalid-size' })
        .expect(400);
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer())
        .post('/settings')
        .send({ fontSize: 'medium' })
        .expect(401);
    });
  });
});
