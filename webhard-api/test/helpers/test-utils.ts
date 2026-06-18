import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { StorageProvider } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

// 세션 쿠키 이름 (서버와 동일해야 함)
export const SESSION_COOKIE_NAME = 'admin-session';

// 테스트 모듈 인스턴스 캐싱
let cachedModuleFixture: TestingModule | null = null;

/**
 * 테스트용 세션 쿠키 생성
 */
export function createSessionCookie(userType: 'admin' | 'company', userId?: number): string {
  const sessionSecret = process.env.SESSION_SECRET || 'test-secret-key-for-e2e-testing-32';
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = crypto.randomBytes(16).toString('hex');
  const sessionData = JSON.stringify({
    kind: 'browser',
    userType,
    userId: userType === 'company' ? userId : 'admin',
    iat: issuedAt,
    exp: issuedAt + 60 * 60 * 4,
  });

  const dataToSign = `${token}:${sessionData}`;
  const signature = crypto.createHmac('sha256', sessionSecret).update(dataToSign).digest('hex');

  return `${dataToSign}.${signature}`;
}

/**
 * 테스트용 관리자 세션 쿠키
 */
export function getAdminSessionCookie(): string {
  return createSessionCookie('admin');
}

/**
 * 테스트용 업체 세션 쿠키
 */
export function getCompanySessionCookie(companyId: number): string {
  return createSessionCookie('company', companyId);
}

/**
 * 테스트 애플리케이션 생성
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  await app.init();
  return app;
}

/**
 * 랜덤 UUID 생성 (테스트용)
 */
export function randomUUID(): string {
  return crypto.randomUUID();
}

/**
 * 테스트용 파일 데이터 생성
 */
export function createTestFileData(overrides: Record<string, unknown> = {}) {
  return {
    name: `test-file-${Date.now()}.txt`,
    originalName: `original-${Date.now()}.txt`,
    size: 1024,
    mimeType: 'text/plain',
    path: `webhard/admin/${Date.now()}-test.txt`,
    folderId: null,
    companyId: null,
    uploadedBy: 'admin',
    inquiryNumber: null,
    isDownloaded: false,
    ...overrides,
  };
}

/**
 * 테스트용 폴더 데이터 생성
 */
export function createTestFolderData(overrides: Record<string, unknown> = {}) {
  return {
    name: `test-folder-${Date.now()}`,
    parentId: null,
    companyId: null,
    path: null,
    ...overrides,
  };
}

export interface WebhardFolderFixtureRow {
  id: string;
  name: string;
  parentId: string | null;
  companyId: number | null;
  path: string;
  folderKind: 'root' | 'normal';
  deletedAt: null;
}

export interface WebhardFolderTreeFixtureOptions {
  prefix: string;
  totalFolders: number;
  childrenPerFolder: number;
  rootCount?: number;
  companyId?: number | null;
}

export interface WebhardFileFixtureRow {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  path: string;
  folderId: string | null;
  companyId: number | null;
  uploadedBy: string;
  inquiryNumber: null;
  isDownloaded: false;
  deletedAt: null;
}

export interface WebhardFileFixtureOptions {
  prefix: string;
  totalFiles: number;
  folderIds: Array<string | null>;
  companyId?: number | null;
  size?: number;
  mimeType?: string;
  uploadedBy?: string;
}

export interface WebhardFixtureCleanupWhere {
  name: {
    startsWith: string;
  };
}

function assertSafeFixturePrefix(prefix: string): void {
  if (!/^perf-[a-z0-9-]{4,}$/i.test(prefix)) {
    throw new Error(`Unsafe fixture prefix: ${prefix}`);
  }
}

function fixtureSequence(prefix: string, kind: 'folder' | 'file', index: number): string {
  return `${prefix}-${kind}-${String(index).padStart(6, '0')}`;
}

/**
 * Deterministic in-memory folder tree fixture for webhard performance tests.
 * Heavy DB inserts should consume this output only behind RUN_PERF_TESTS=1.
 */
export function buildWebhardFolderTreeFixture(
  options: WebhardFolderTreeFixtureOptions
): WebhardFolderFixtureRow[] {
  assertSafeFixturePrefix(options.prefix);
  if (options.totalFolders < 1) throw new Error('totalFolders must be at least 1');
  if (options.childrenPerFolder < 1) throw new Error('childrenPerFolder must be at least 1');

  const companyId = options.companyId ?? null;
  const rootCount = Math.min(options.rootCount ?? 1, options.totalFolders);
  const folders: WebhardFolderFixtureRow[] = [];

  for (let rootIndex = 0; rootIndex < rootCount; rootIndex++) {
    const id = fixtureSequence(options.prefix, 'folder', folders.length);
    const name = `${options.prefix}-root-${String(rootIndex).padStart(6, '0')}`;
    folders.push({
      id,
      name,
      parentId: null,
      companyId,
      path: `/${name}`,
      folderKind: 'root',
      deletedAt: null,
    });
  }

  let parentIndex = 0;
  while (folders.length < options.totalFolders) {
    const parent = folders[parentIndex];
    if (!parent) throw new Error('Unable to build folder fixture tree');

    for (
      let childIndex = 0;
      childIndex < options.childrenPerFolder && folders.length < options.totalFolders;
      childIndex++
    ) {
      const id = fixtureSequence(options.prefix, 'folder', folders.length);
      const name = id;
      folders.push({
        id,
        name,
        parentId: parent.id,
        companyId,
        path: `${parent.path}/${name}`,
        folderKind: 'normal',
        deletedAt: null,
      });
    }
    parentIndex++;
  }

  return folders;
}

/**
 * Deterministic in-memory file fixture. Large counts are opt-in only.
 */
export function buildWebhardFileFixture(
  options: WebhardFileFixtureOptions
): WebhardFileFixtureRow[] {
  assertSafeFixturePrefix(options.prefix);
  if (options.totalFiles < 0) throw new Error('totalFiles must be greater than or equal to 0');
  if (options.folderIds.length === 0) throw new Error('folderIds must contain at least one entry');

  const companyId = options.companyId ?? null;
  const size = options.size ?? 1024;
  const mimeType = options.mimeType ?? 'application/dxf';
  const uploadedBy = options.uploadedBy ?? 'admin';

  return Array.from({ length: options.totalFiles }, (_, index) => {
    const id = fixtureSequence(options.prefix, 'file', index);
    const name = `${id}.dxf`;
    const folderId = options.folderIds[index % options.folderIds.length] ?? null;
    const folderPathPart = folderId ?? 'root';

    return {
      id,
      name,
      originalName: name,
      size,
      mimeType,
      path: `webhard/${options.prefix}/${folderPathPart}/${name}`,
      folderId,
      companyId,
      uploadedBy,
      inquiryNumber: null,
      isDownloaded: false,
      deletedAt: null,
    };
  });
}

export function buildWebhardFixtureCleanupWhere(prefix: string): WebhardFixtureCleanupWhere {
  assertSafeFixturePrefix(prefix);
  return {
    name: { startsWith: prefix },
  };
}

export function shouldRunWebhardPerfTests(
  env: { readonly [key: string]: string | undefined } = process.env
): boolean {
  return env.RUN_PERF_TESTS === '1';
}

/**
 * 테스트용 Prisma 클라이언트 접근
 */
export async function getTestPrismaClient(): Promise<PrismaService> {
  if (!cachedModuleFixture) {
    cachedModuleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  }
  return cachedModuleFixture.get<PrismaService>(PrismaService);
}

/**
 * 깊이 N의 폴더 체인 생성 (DB에 직접 삽입)
 * @param prisma PrismaService 인스턴스
 * @param depth 폴더 깊이
 * @param companyId 업체 ID (옵션)
 * @returns 생성된 폴더 ID 배열 (루트 → 최하위 순서)
 */
export async function createNestedFolders(
  prisma: PrismaService,
  depth: number,
  companyId: number | null = null
): Promise<string[]> {
  const folderIds: string[] = [];
  let parentId: string | null = null;
  let parentPath: string | null = null;

  for (let i = 0; i < depth; i++) {
    const folderId = crypto.randomUUID();
    const name = `perf-test-folder-${i}-${Date.now()}`;
    const folderPath: string = parentPath ? `${parentPath}/${name}` : `/${name}`;
    await prisma.webhardFolder.create({
      data: {
        id: folderId,
        name,
        parentId,
        companyId,
        path: folderPath,
        storageProvider: StorageProvider.R2,
      },
    });
    folderIds.push(folderId);
    parentId = folderId;
    parentPath = folderPath;
  }

  return folderIds;
}

/**
 * 다수의 하위 폴더 생성 (DB에 직접 삽입)
 * @param prisma PrismaService 인스턴스
 * @param parentId 부모 폴더 ID
 * @param count 생성할 폴더 수
 * @param companyId 업체 ID (옵션)
 * @returns 생성된 폴더 ID 배열
 */
export async function createChildFolders(
  prisma: PrismaService,
  parentId: string | null,
  count: number,
  companyId: number | null = null
): Promise<string[]> {
  const folderIds: string[] = [];
  const parent = parentId
    ? await prisma.webhardFolder.findUnique({
        where: { id: parentId },
        select: { path: true },
      })
    : null;
  const parentPath = parent?.path ?? null;

  for (let i = 0; i < count; i++) {
    const folderId = crypto.randomUUID();
    const name = `perf-test-child-${i}-${Date.now()}`;
    const folderPath: string = parentPath ? `${parentPath}/${name}` : `/${name}`;
    await prisma.webhardFolder.create({
      data: {
        id: folderId,
        name,
        parentId,
        companyId,
        path: folderPath,
        storageProvider: StorageProvider.R2,
      },
    });
    folderIds.push(folderId);
  }

  return folderIds;
}

/**
 * 테스트용 파일 생성 (DB에 직접 삽입)
 * @param prisma PrismaService 인스턴스
 * @param count 생성할 파일 수
 * @param folderId 폴더 ID (옵션)
 * @param companyId 업체 ID (옵션)
 * @returns 생성된 파일 ID 배열
 */
export async function createTestFiles(
  prisma: PrismaService,
  count: number,
  folderId: string | null = null,
  companyId: number | null = null
): Promise<string[]> {
  const fileIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const fileId = crypto.randomUUID();
    await prisma.webhardFile.create({
      data: {
        id: fileId,
        name: `perf-test-file-${i}-${Date.now()}.txt`,
        originalName: `original-${i}.txt`,
        size: 1024,
        mimeType: 'text/plain',
        path: `webhard/test/${fileId}.txt`,
        folderId,
        companyId,
        uploadedBy: '0',
        storageProvider: StorageProvider.R2,
      },
    });
    fileIds.push(fileId);
  }

  return fileIds;
}

/**
 * 성능 측정 래퍼
 * @param fn 측정할 함수
 * @returns 결과와 소요 시간(ms)
 */
export async function measurePerformance<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const startTime = performance.now();
  const result = await fn();
  const durationMs = performance.now() - startTime;
  return { result, durationMs };
}

/**
 * 테스트 데이터 정리 (특정 접두사로 시작하는 폴더/파일 삭제)
 * @param prisma PrismaService 인스턴스
 * @param prefix 삭제할 데이터의 이름 접두사 (기본: 'perf-test-')
 */
export async function cleanupTestData(
  prisma: PrismaService,
  prefix: string = 'perf-test-'
): Promise<void> {
  // 파일 먼저 삭제
  await prisma.webhardFile.deleteMany({
    where: {
      name: { startsWith: prefix },
    },
  });

  // 폴더 삭제 (하위 폴더부터 삭제해야 하므로 여러 번 실행)
  let deleted = 1;
  while (deleted > 0) {
    const result = await prisma.webhardFolder.deleteMany({
      where: {
        name: { startsWith: prefix },
        children: { none: {} },
      },
    });
    deleted = result.count;
  }
}
