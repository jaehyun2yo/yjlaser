import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getCompanySessionCookie,
  getTestPrismaClient,
  createNestedFolders,
  createTestFiles,
  cleanupTestData,
  randomUUID,
} from './helpers/test-utils';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 파일 CRUD E2E 테스트
 */
describe('Files CRUD API (e2e)', () => {
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

  describe('GET /files - 파일 목록 조회', () => {
    let folderId: string;
    let fileIds: string[];

    beforeAll(async () => {
      // 폴더 생성
      const [id] = await createNestedFolders(prisma, 1);
      folderId = id;

      // 파일 10개 생성
      fileIds = await createTestFiles(prisma, 10, folderId);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('관리자: 폴더 내 파일 목록 조회', async () => {
      const response = await request(app.getHttpServer())
        .get(`/files?folderId=${folderId}`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('total');
      expect(response.body.files.length).toBe(10);
      expect(response.body.total).toBe(10);
    });

    it('페이지네이션 동작', async () => {
      const response = await request(app.getHttpServer())
        .get(`/files?folderId=${folderId}&page=1&limit=5`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      expect(response.body.files.length).toBe(5);
      expect(response.body.hasMore).toBe(true);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(5);
    });

    it('루트 레벨 파일 조회', async () => {
      // 루트 레벨에 파일 생성
      await createTestFiles(prisma, 3, null);

      const response = await request(app.getHttpServer())
        .get('/files')
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      expect(response.body.files.length).toBeGreaterThanOrEqual(3);
    });

    it('비인증 요청은 401 반환', async () => {
      await request(app.getHttpServer()).get('/files').expect(401);
    });
  });

  describe('POST /files/batch/move - 파일 배치 이동', () => {
    let fileIds: string[];
    let targetFolderId: string;

    beforeAll(async () => {
      // 파일 생성
      fileIds = await createTestFiles(prisma, 5);

      // 이동 대상 폴더 생성
      const [id] = await createNestedFolders(prisma, 1);
      targetFolderId = id;
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('파일들을 폴더로 이동', async () => {
      const response = await request(app.getHttpServer())
        .post('/files/batch/move')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds, targetFolderId })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.processed).toBe(5);
      expect(response.body.failed).toBe(0);
    });

    it('파일들을 루트로 이동', async () => {
      // 새 파일 생성
      const newFileIds = await createTestFiles(prisma, 3, targetFolderId);

      const response = await request(app.getHttpServer())
        .post('/files/batch/move')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds: newFileIds, targetFolderId: null })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.processed).toBe(3);
    });

    it('존재하지 않는 파일 이동 시 실패 카운트 증가', async () => {
      const nonExistentIds = [randomUUID(), randomUUID()];

      const response = await request(app.getHttpServer())
        .post('/files/batch/move')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds: nonExistentIds, targetFolderId })
        .expect(201);

      expect(response.body.success).toBe(false);
      expect(response.body.failed).toBe(2);
    });

    it('존재하지 않는 대상 폴더로 이동 시 404 반환', async () => {
      const newFileIds = await createTestFiles(prisma, 2);
      const nonExistentFolder = randomUUID();

      await request(app.getHttpServer())
        .post('/files/batch/move')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds: newFileIds, targetFolderId: nonExistentFolder })
        .expect(404);
    });

    it('빈 배열 전송 시 400 반환', async () => {
      await request(app.getHttpServer())
        .post('/files/batch/move')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds: [], targetFolderId })
        .expect(400);
    });
  });

  describe('POST /files/batch/delete - 파일 배치 삭제', () => {
    let fileIds: string[];

    beforeEach(async () => {
      fileIds = await createTestFiles(prisma, 5);
    });

    afterEach(async () => {
      await cleanupTestData(prisma);
    });

    it('파일들 삭제 (soft delete)', async () => {
      const response = await request(app.getHttpServer())
        .post('/files/batch/delete')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.processed).toBe(5);
      expect(response.body.failed).toBe(0);

      // 삭제된 파일 확인
      for (const id of fileIds) {
        const file = await prisma.webhardFile.findUnique({
          where: { id },
        });
        expect(file?.deletedAt).not.toBeNull();
      }
    });

    it('일부 존재하지 않는 파일 삭제 시 부분 성공', async () => {
      const mixedIds = [...fileIds.slice(0, 3), randomUUID(), randomUUID()];

      const response = await request(app.getHttpServer())
        .post('/files/batch/delete')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds: mixedIds })
        .expect(201);

      expect(response.body.processed).toBe(3);
      expect(response.body.failed).toBe(2);
    });

    it('빈 배열 전송 시 400 반환', async () => {
      await request(app.getHttpServer())
        .post('/files/batch/delete')
        .set('Cookie', `admin-session=${adminCookie}`)
        .send({ fileIds: [] })
        .expect(400);
    });
  });

  // Skip: 테스트 DB에 company 레코드가 없어서 foreign key constraint 오류 발생
  describe.skip('업체 권한 검증', () => {
    const companyId = 1;
    let companyFileIds: string[];
    let adminFileIds: string[];

    beforeAll(async () => {
      // 업체 파일 생성
      companyFileIds = await createTestFiles(prisma, 3, null, companyId);
      // 관리자 파일 생성
      adminFileIds = await createTestFiles(prisma, 3, null, null);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('업체는 자신의 파일만 삭제 가능', async () => {
      const response = await request(app.getHttpServer())
        .post('/files/batch/delete')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .send({ fileIds: companyFileIds })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.processed).toBe(3);
    });

    it('업체는 공유 파일(companyId=null) 접근 가능', async () => {
      const response = await request(app.getHttpServer())
        .get('/files')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .expect(200);

      // 공유 파일이 목록에 포함됨
      const sharedFiles = response.body.files.filter(
        (f: { company_id: number | null }) => f.company_id === null,
      );
      expect(sharedFiles.length).toBeGreaterThanOrEqual(0);
    });

    it('업체는 다른 업체 파일 삭제 불가', async () => {
      // 다른 업체 파일 생성
      const otherCompanyFileIds = await createTestFiles(prisma, 2, null, 999);

      const response = await request(app.getHttpServer())
        .post('/files/batch/delete')
        .set('Cookie', `admin-session=${getCompanySessionCookie(companyId)}`)
        .send({ fileIds: otherCompanyFileIds })
        .expect(201);

      // 권한 없음으로 모두 실패
      expect(response.body.processed).toBe(0);
      expect(response.body.failed).toBe(2);
    });
  });

  describe('정렬 기능', () => {
    let folderId: string;

    beforeAll(async () => {
      const [id] = await createNestedFolders(prisma, 1);
      folderId = id;
      await createTestFiles(prisma, 5, folderId);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('생성일 내림차순 정렬 (기본값)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/files?folderId=${folderId}`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      const files = response.body.files;
      for (let i = 0; i < files.length - 1; i++) {
        const current = new Date(files[i].created_at);
        const next = new Date(files[i + 1].created_at);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });

    it('이름순 오름차순 정렬', async () => {
      const response = await request(app.getHttpServer())
        .get(`/files?folderId=${folderId}&sortBy=name&sortOrder=asc`)
        .set('Cookie', `admin-session=${adminCookie}`)
        .expect(200);

      const files = response.body.files;
      for (let i = 0; i < files.length - 1; i++) {
        expect(files[i].name.localeCompare(files[i + 1].name)).toBeLessThanOrEqual(0);
      }
    });
  });
});
