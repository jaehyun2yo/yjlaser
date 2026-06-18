import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
  getTestPrismaClient,
  createNestedFolders,
  cleanupTestData,
  randomUUID,
} from './helpers/test-utils';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 폴더 CRUD E2E 테스트
 */
describe('Folders CRUD API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminCookie = getAdminSessionCookie();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getTestPrismaClient();
  });

  afterAll(async () => {
    await cleanupTestData(prisma);
    await app.close();
  });

  describe('POST /folders - 폴더 생성', () => {
    afterEach(async () => {
      await cleanupTestData(prisma, 'crud-test-');
    });

    it('관리자: 루트 레벨 폴더 생성', async () => {
      const response = await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'crud-test-folder' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('crud-test-folder');
      expect(response.body.parent_id).toBeNull();
    });

    it('관리자: 하위 폴더 생성', async () => {
      // 부모 폴더 생성
      const parentResponse = await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'crud-test-parent' })
        .expect(201);

      const parentId = parentResponse.body.id;

      // 하위 폴더 생성
      const response = await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'crud-test-child', parentId })
        .expect(201);

      expect(response.body.parent_id).toBe(parentId);
    });

    // Skip: 테스트 DB에 company 레코드가 없어서 foreign key constraint 오류 발생
    it.skip('업체: 폴더 생성 시 자동으로 companyId 설정', async () => {
      const companyId = 1;
      const response = await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .send({ name: 'crud-test-company-folder' })
        .expect(201);

      expect(response.body.company_id).toBe(companyId);
    });

    it('중복 이름 폴더 생성 시 409 반환', async () => {
      await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'crud-test-duplicate' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'crud-test-duplicate' })
        .expect(409);
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer())
        .post('/folders')
        .send({ name: 'crud-test-unauth' })
        .expect(401);
    });
  });

  describe('PATCH /folders/:id/move - 폴더 이동', () => {
    let folderIds: string[];

    beforeAll(async () => {
      // 깊이 5의 폴더 체인 생성
      folderIds = await createNestedFolders(prisma, 5);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('폴더를 다른 폴더 하위로 이동', async () => {
      // 새 부모 폴더 생성
      const newParent = await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'perf-test-new-parent' })
        .expect(201);

      // 폴더 이동
      const response = await request(app.getHttpServer())
        .patch(`/folders/${folderIds[0]}/move`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ parentId: newParent.body.id })
        .expect(200);

      expect(response.body.parent_id).toBe(newParent.body.id);
    });

    it('폴더를 루트로 이동', async () => {
      // 중간 폴더를 루트로 이동
      const response = await request(app.getHttpServer())
        .patch(`/folders/${folderIds[2]}/move`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ parentId: null })
        .expect(200);

      expect(response.body.parent_id).toBeNull();
    });

    it('자기 자신으로 이동 시도 시 400 반환', async () => {
      await request(app.getHttpServer())
        .patch(`/folders/${folderIds[0]}/move`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ parentId: folderIds[0] })
        .expect(400);
    });

    it('순환참조 방지: 하위 폴더로 이동 시도 시 400 반환', async () => {
      // 새로운 체인 생성
      const newChain = await createNestedFolders(prisma, 5);
      const ancestorId = newChain[0]; // 조상
      const descendantId = newChain[4]; // 후손

      // 조상을 후손 아래로 이동 시도 → 순환참조
      await request(app.getHttpServer())
        .patch(`/folders/${ancestorId}/move`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ parentId: descendantId })
        .expect(400);
    });

    it('존재하지 않는 폴더 이동 시 404 반환', async () => {
      const nonExistentId = randomUUID();
      await request(app.getHttpServer())
        .patch(`/folders/${nonExistentId}/move`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ parentId: null })
        .expect(404);
    });

    it('존재하지 않는 대상 폴더로 이동 시 404 반환', async () => {
      const nonExistentTarget = randomUUID();
      await request(app.getHttpServer())
        .patch(`/folders/${folderIds[0]}/move`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ parentId: nonExistentTarget })
        .expect(404);
    });
  });

  describe('DELETE /folders/:id - 폴더 삭제', () => {
    let folderId: string;

    beforeEach(async () => {
      const [id] = await createNestedFolders(prisma, 1);
      folderId = id;
    });

    afterEach(async () => {
      await cleanupTestData(prisma);
    });

    it('폴더 삭제 (soft delete)', async () => {
      await request(app.getHttpServer())
        .delete(`/folders/${folderId}`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      // 삭제된 폴더는 목록에 나타나지 않음
      const response = await request(app.getHttpServer())
        .get('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      const folderFound = response.body.folders.find(
        (f: { id: string }) => f.id === folderId,
      );
      expect(folderFound).toBeUndefined();
    });

    it('하위 폴더도 함께 삭제됨', async () => {
      // 깊이 3의 폴더 체인 생성
      const chainIds = await createNestedFolders(prisma, 3);

      // 루트 폴더 삭제
      await request(app.getHttpServer())
        .delete(`/folders/${chainIds[0]}`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      // 모든 하위 폴더도 삭제됨
      for (const id of chainIds) {
        const folder = await prisma.webhardFolder.findUnique({
          where: { id },
        });
        expect(folder?.deletedAt).not.toBeNull();
      }
    });

    it('존재하지 않는 폴더 삭제 시 404 반환', async () => {
      const nonExistentId = randomUUID();
      await request(app.getHttpServer())
        .delete(`/folders/${nonExistentId}`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(404);
    });
  });

  describe('POST /folders/batch-delete - 폴더 배치 삭제', () => {
    afterEach(async () => {
      await cleanupTestData(prisma);
    });

    it('여러 폴더 동시 삭제', async () => {
      // 3개 폴더 생성
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/folders')
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ name: `perf-test-batch-${i}` })
          .expect(201);
        ids.push(response.body.id);
      }

      // 배치 삭제
      const response = await request(app.getHttpServer())
        .delete('/folders/batch-delete')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ folderIds: ids })
        .expect(200);

      expect(response.body.foldersDeleted).toBe(3);
    });

    it('빈 배열 전송 시 400 반환', async () => {
      await request(app.getHttpServer())
        .delete('/folders/batch-delete')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ folderIds: [] })
        .expect(400);
    });
  });

  describe('PATCH /folders/:id/rename - 폴더 이름 변경', () => {
    let folderId: string;

    beforeEach(async () => {
      const [id] = await createNestedFolders(prisma, 1);
      folderId = id;
    });

    afterEach(async () => {
      await cleanupTestData(prisma);
    });

    it('폴더 이름 변경', async () => {
      const newName = 'perf-test-renamed-folder';

      const response = await request(app.getHttpServer())
        .patch(`/folders/${folderId}/rename`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: newName })
        .expect(200);

      expect(response.body.name).toBe(newName);
    });

    it('중복 이름으로 변경 시 409 반환', async () => {
      // 같은 레벨에 다른 폴더 생성
      await request(app.getHttpServer())
        .post('/folders')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'perf-test-existing-folder' })
        .expect(201);

      // 중복 이름으로 변경 시도
      await request(app.getHttpServer())
        .patch(`/folders/${folderId}/rename`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ name: 'perf-test-existing-folder' })
        .expect(409);
    });
  });
});
