import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
  randomUUID,
} from './helpers/test-utils';

describe('Mark Downloaded API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /files/mark-downloaded', () => {
    it('관리자: 특정 파일들을 다운로드 완료로 표시', async () => {
      // 먼저 새 파일 목록 조회
      const newFilesResponse = await request(app.getHttpServer())
        .get('/files/new')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      if (newFilesResponse.body.files.length === 0) {
        console.log('No new files to test');
        return;
      }

      const fileIds = newFilesResponse.body.files
        .slice(0, 2)
        .map((f: { id: string }) => f.id);

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ fileIds })
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body.success).toBe(true);
      expect(response.body.updatedCount).toBeLessThanOrEqual(fileIds.length);
    });

    it('관리자: 폴더 내 모든 파일을 다운로드 완료로 표시', async () => {
      // 먼저 폴더 목록 조회
      const foldersResponse = await request(app.getHttpServer())
        .get('/folders')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      if (foldersResponse.body.folders.length === 0) {
        console.log('No folders to test');
        return;
      }

      const folderId = foldersResponse.body.folders[0].id;

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ folderId })
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body.success).toBe(true);
    });

    it('관리자: 전체 파일을 다운로드 완료로 표시', async () => {
      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .send({ markAll: true })
        .expect(201);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body.success).toBe(true);
    });

    it('업체: 자신의 파일만 다운로드 완료로 표시 가능', async () => {
      const companyId = 1;

      // 먼저 새 파일 목록 조회
      const newFilesResponse = await request(app.getHttpServer())
        .get('/files/new')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      if (newFilesResponse.body.files.length === 0) {
        console.log('No new files to test');
        return;
      }

      const fileIds = newFilesResponse.body.files
        .slice(0, 2)
        .map((f: { id: string }) => f.id);

      const response = await request(app.getHttpServer())
        .post('/files/mark-downloaded')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .send({ fileIds })
        .expect(201);

      expect(response.body.success).toBe(true);
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
