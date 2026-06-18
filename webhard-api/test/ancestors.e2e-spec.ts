import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
  randomUUID,
} from './helpers/test-utils';

describe('Folder Ancestors API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /folders/:id/ancestors', () => {
    it('관리자: 폴더 조상 목록 조회', async () => {
      // 먼저 폴더 목록에서 실제 폴더 ID를 가져옴
      const foldersResponse = await request(app.getHttpServer())
        .get('/folders')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      if (foldersResponse.body.folders.length === 0) {
        // 테스트할 폴더가 없으면 스킵
        console.log('No folders to test');
        return;
      }

      const folderId = foldersResponse.body.folders[0].id;

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
      const companyId = 1;

      // 먼저 폴더 목록에서 실제 폴더 ID를 가져옴
      const foldersResponse = await request(app.getHttpServer())
        .get('/folders')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      const accessibleCompanyFolder = foldersResponse.body.folders.find(
        (f: { company_id: number | null }) => f.company_id === companyId
      );

      if (!accessibleCompanyFolder) {
        console.log('No company-owned folders to test');
        return;
      }

      const folderId = accessibleCompanyFolder.id;

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
      // 중첩된 폴더가 있는 경우 테스트
      const foldersResponse = await request(app.getHttpServer())
        .get('/folders')
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      // 부모가 있는 폴더 찾기
      const childFolder = foldersResponse.body.folders.find(
        (f: { parent_id: string | null }) => f.parent_id !== null
      );

      if (!childFolder) {
        console.log('No nested folders to test');
        return;
      }

      const response = await request(app.getHttpServer())
        .get(`/folders/${childFolder.id}/ancestors`)
        .set('Cookie', `admin-session=${getAdminSessionCookie()}`)
        .expect(200);

      // 조상이 있어야 함
      expect(response.body.ancestors.length).toBeGreaterThan(0);

      // 마지막 조상이 현재 폴더의 부모여야 함
      const lastAncestor = response.body.ancestors[response.body.ancestors.length - 1];
      expect(lastAncestor.id).toBe(childFolder.parent_id);
    });
  });
});
