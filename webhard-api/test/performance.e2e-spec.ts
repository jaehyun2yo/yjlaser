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
 * 기본 Jest 실행은 작은 smoke profile로 항상 실행한다.
 * RUN_PERF_TESTS=1이면 기존 heavy profile로 더 큰 fixture를 검증한다.
 */
const heavyPerfProfile = shouldRunWebhardPerfTests();
const perfProfile = heavyPerfProfile
  ? {
      depth: 10,
      childFolderCount: 100,
      batchFolderCount: 100,
      fileCount: 100,
      ancestorLimitMs: 200,
      folderMoveLimitMs: 500,
      folderDeleteLimitMs: 1000,
      batchFolderDeleteLimitMs: 1000,
      fileMoveLimitMs: 1000,
      fileMoveApiLimitMs: 500,
      fileDeleteLimitMs: 500,
    }
  : {
      depth: 4,
      childFolderCount: 5,
      batchFolderCount: 5,
      fileCount: 5,
      ancestorLimitMs: 1000,
      folderMoveLimitMs: 1000,
      folderDeleteLimitMs: 1000,
      batchFolderDeleteLimitMs: 1000,
      fileMoveLimitMs: 1000,
      fileMoveApiLimitMs: 1000,
      fileDeleteLimitMs: 1000,
    };

describe('Performance Tests (e2e)', () => {
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
      folderIds = await createNestedFolders(prisma, perfProfile.depth);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it(`깊이 ${perfProfile.depth} 폴더의 조상 조회: < ${perfProfile.ancestorLimitMs}ms`, async () => {
      const deepestFolderId = folderIds[folderIds.length - 1];

      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .get(`/folders/${deepestFolderId}/ancestors`)
          .set('Cookie', `admin-session=${adminCookie}`)
          .expect(200);
      });

      console.log(`조상 조회 소요 시간: ${durationMs.toFixed(2)}ms`);

      expect(durationMs).toBeLessThan(perfProfile.ancestorLimitMs);

      expect(result.body.ancestors.length).toBe(perfProfile.depth - 1);
    });
  });

  describe('폴더 이동 성능', () => {
    let folderIds: string[];
    let targetFolderIds: string[];

    beforeAll(async () => {
      folderIds = await createNestedFolders(prisma, perfProfile.depth);
      targetFolderIds = await createNestedFolders(prisma, perfProfile.depth);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it(`깊이 ${perfProfile.depth} 폴더 이동 (순환참조 검사 포함): < ${perfProfile.folderMoveLimitMs}ms`, async () => {
      const sourceFolder = folderIds[Math.min(4, folderIds.length - 1)];
      const targetParent = targetFolderIds[targetFolderIds.length - 1];

      const { durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .patch(`/folders/${sourceFolder}/move`)
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ parentId: targetParent })
          .expect(200);
      });

      console.log(`폴더 이동 소요 시간: ${durationMs.toFixed(2)}ms`);

      expect(durationMs).toBeLessThan(perfProfile.folderMoveLimitMs);
    });
  });

  describe('폴더 삭제 성능', () => {
    let parentFolderId: string;

    beforeAll(async () => {
      const [parentId] = await createNestedFolders(prisma, 1);
      parentFolderId = parentId;
      await createChildFolders(prisma, parentFolderId, perfProfile.childFolderCount);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it(`${perfProfile.childFolderCount}개 하위 폴더가 있는 폴더 삭제: < ${perfProfile.folderDeleteLimitMs}ms`, async () => {
      const { durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .delete(`/folders/${parentFolderId}`)
          .set('Cookie', `admin-session=${adminCookie}`)
          .expect(200);
      });

      console.log(`폴더 삭제 소요 시간: ${durationMs.toFixed(2)}ms`);

      expect(durationMs).toBeLessThan(perfProfile.folderDeleteLimitMs);
    });
  });

  describe('폴더 배치 삭제 성능', () => {
    let folderIds: string[];

    beforeAll(async () => {
      folderIds = await createChildFolders(prisma, null, perfProfile.batchFolderCount);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it(`${perfProfile.batchFolderCount}개 폴더 배치 삭제: < ${perfProfile.batchFolderDeleteLimitMs}ms`, async () => {
      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .delete('/folders/batch-delete')
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ folderIds })
          .expect(200);
      });

      console.log(`배치 삭제 소요 시간: ${durationMs.toFixed(2)}ms`);
      console.log(`API 응답 durationMs: ${result.body.durationMs}ms`);

      expect(durationMs).toBeLessThan(perfProfile.batchFolderDeleteLimitMs);
      expect(result.body.foldersDeleted).toBe(perfProfile.batchFolderCount);
    });
  });

  describe('파일 배치 이동 성능', () => {
    let fileIds: string[];
    let targetFolderId: string;

    beforeAll(async () => {
      fileIds = await createTestFiles(prisma, perfProfile.fileCount);
      const [folderId] = await createNestedFolders(prisma, 1);
      targetFolderId = folderId;
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it(`${perfProfile.fileCount}개 파일 배치 이동: < ${perfProfile.fileMoveLimitMs}ms`, async () => {
      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .post('/files/batch/move')
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ fileIds, targetFolderId })
          .expect(201);
      });

      console.log(`파일 배치 이동 소요 시간: ${durationMs.toFixed(2)}ms`);
      console.log(`API 응답 durationMs: ${result.body.durationMs}ms`);

      expect(durationMs).toBeLessThan(perfProfile.fileMoveLimitMs);
      expect(result.body.durationMs).toBeLessThan(perfProfile.fileMoveApiLimitMs);
      expect(result.body.processed).toBe(perfProfile.fileCount);
    });
  });

  describe('파일 배치 삭제 성능', () => {
    let fileIds: string[];

    beforeAll(async () => {
      fileIds = await createTestFiles(prisma, perfProfile.fileCount);
    });

    afterAll(async () => {
      await cleanupTestData(prisma);
    });

    it(`${perfProfile.fileCount}개 파일 배치 삭제: < ${perfProfile.fileDeleteLimitMs}ms`, async () => {
      const { result, durationMs } = await measurePerformance(async () => {
        return request(app.getHttpServer())
          .post('/files/batch/delete')
          .set('Cookie', `admin-session=${adminCookie}`)
          .send({ fileIds })
          .expect(201);
      });

      console.log(`파일 배치 삭제 소요 시간: ${durationMs.toFixed(2)}ms`);
      console.log(`API 응답 durationMs: ${result.body.durationMs}ms`);

      expect(durationMs).toBeLessThan(perfProfile.fileDeleteLimitMs);
      expect(result.body.processed).toBe(perfProfile.fileCount);
    });
  });
});
