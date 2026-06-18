import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  getAdminSessionCookie,
  getTestPrismaClient,
  createNestedFolders,
  createChildFolders,
  createTestFiles,
  measurePerformance,
  cleanupTestData,
  shouldRunWebhardPerfTests,
} from './helpers/test-utils';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 성능 테스트
 *
 * 목표:
 * - 깊이 10 폴더 이동: < 500ms
 * - 깊이 10 조상 조회: < 200ms
 * - 100개 하위 폴더 삭제: < 1000ms
 * - 100개 파일 배치 이동: < 500ms
 * - 100개 파일 배치 삭제: < 500ms
 */
const describePerf = shouldRunWebhardPerfTests() ? describe : describe.skip;

describePerf('Performance Tests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminCookie = getAdminSessionCookie();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getTestPrismaClient();
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    await cleanupTestData(prisma);
    await app.close();
  });

  describe('폴더 조상 조회 성능', () => {
    let folderIds: string[];

    beforeAll(async () => {
      // 깊이 10의 폴더 체인 생성
      folderIds = await createNestedFolders(prisma, 10);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('깊이 10 폴더의 조상 조회: < 200ms', async () => {
      const deepestFolderId = folderIds[folderIds.length - 1];

      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .get(`/folders/${deepestFolderId}/ancestors`)
          .set('Cookie', `admin-session=${adminCookie}`)
          .expect(200);
      });

      console.log(`조상 조회 소요 시간: ${durationMs.toFixed(2)}ms`);

      // 성능 목표: 200ms 이내
      expect(durationMs).toBeLessThan(200);

      // 조상 9개 (자신 제외)
      expect(result.body.ancestors.length).toBe(9);
    });
  });

  describe('폴더 이동 성능', () => {
    let folderIds: string[];
    let targetFolderIds: string[];

    beforeAll(async () => {
      // 깊이 10의 폴더 체인 생성
      folderIds = await createNestedFolders(prisma, 10);
      // 이동 대상 폴더 생성
      targetFolderIds = await createNestedFolders(prisma, 10);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('깊이 10 폴더 이동 (순환참조 검사 포함): < 500ms', async () => {
      // 체인의 5번째 폴더를 다른 체인의 끝으로 이동
      const sourceFolder = folderIds[4];
      const targetParent = targetFolderIds[targetFolderIds.length - 1];

      const { durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .patch(`/folders/${sourceFolder}/move`)
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ parentId: targetParent })
          .expect(200);
      });

      console.log(`폴더 이동 소요 시간: ${durationMs.toFixed(2)}ms`);

      // 성능 목표: 500ms 이내
      expect(durationMs).toBeLessThan(500);
    });
  });

  describe('폴더 삭제 성능', () => {
    let parentFolderId: string;
    let childFolderIds: string[];

    beforeAll(async () => {
      // 부모 폴더 생성
      const [parentId] = await createNestedFolders(prisma, 1);
      parentFolderId = parentId;

      // 100개 하위 폴더 생성
      childFolderIds = await createChildFolders(prisma, parentFolderId, 100);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('100개 하위 폴더가 있는 폴더 삭제: < 1000ms', async () => {
      const { durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .delete(`/folders/${parentFolderId}`)
          .set('Cookie', `admin-session=${adminCookie}`)
          .expect(200);
      });

      console.log(`폴더 삭제 소요 시간: ${durationMs.toFixed(2)}ms`);

      // 성능 목표: 1000ms 이내
      expect(durationMs).toBeLessThan(1000);
    });
  });

  describe('폴더 배치 삭제 성능', () => {
    let folderIds: string[];

    beforeAll(async () => {
      // 100개 폴더 생성
      folderIds = await createChildFolders(prisma, null, 100);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('100개 폴더 배치 삭제: < 1000ms', async () => {
      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .delete('/folders/batch-delete')
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ folderIds })
          .expect(200);
      });

      console.log(`배치 삭제 소요 시간: ${durationMs.toFixed(2)}ms`);
      console.log(`API 응답 durationMs: ${result.body.durationMs}ms`);

      // 성능 목표: 1000ms 이내
      expect(durationMs).toBeLessThan(1000);
      expect(result.body.foldersDeleted).toBe(100);
    });
  });

  describe('파일 배치 이동 성능', () => {
    let fileIds: string[];
    let targetFolderId: string;

    beforeAll(async () => {
      // 100개 파일 생성
      fileIds = await createTestFiles(prisma, 100);

      // 이동 대상 폴더 생성
      const [folderId] = await createNestedFolders(prisma, 1);
      targetFolderId = folderId;
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('100개 파일 배치 이동: < 1000ms', async () => {
      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .post('/files/batch/move')
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ fileIds, targetFolderId })
          .expect(201);
      });

      console.log(`파일 배치 이동 소요 시간: ${durationMs.toFixed(2)}ms`);
      console.log(`API 응답 durationMs: ${result.body.durationMs}ms`);

      // 성능 목표: 1000ms 이내 (테스트 환경 변동성 고려, API 자체는 500ms 이내)
      expect(durationMs).toBeLessThan(1000);
      // API 자체 성능은 500ms 이내여야 함
      expect(result.body.durationMs).toBeLessThan(500);
      expect(result.body.processed).toBe(100);
    });
  });

  describe('파일 배치 삭제 성능', () => {
    let fileIds: string[];

    beforeAll(async () => {
      // 100개 파일 생성
      fileIds = await createTestFiles(prisma, 100);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it('100개 파일 배치 삭제: < 500ms', async () => {
      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .post('/files/batch/delete')
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ fileIds })
          .expect(201);
      });

      console.log(`파일 배치 삭제 소요 시간: ${durationMs.toFixed(2)}ms`);
      console.log(`API 응답 durationMs: ${result.body.durationMs}ms`);

      // 성능 목표: 500ms 이내
      expect(durationMs).toBeLessThan(500);
      expect(result.body.processed).toBe(100);
    });
  });
});
