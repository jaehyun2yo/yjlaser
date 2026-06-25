import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { Prisma, StorageProvider } from '@prisma/client';
import { Readable } from 'stream';
import { AppModule } from '../../src/app.module';
import { assertOperationalFixtureSeedAllowed } from '../../src/integration/operational-fixture-policy';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GoogleDriveStorageProvider } from '../../src/storage/google-drive-storage.provider';
import type {
  BatchMoveFileInput,
  BatchStorageFileOperationResult,
  BatchTrashFileInput,
  ConfirmUploadedFileInput,
  CreateFolderInput,
  CreateUploadSessionInput,
  DeleteFileInput,
  DeleteFolderInput,
  DownloadFileInput,
  DownloadFileResult,
  MoveFileInput,
  MoveFolderInput,
  RenameFileInput,
  RenameFolderInput,
  RestoreFileInput,
  StorageFileMetadata,
  StorageProviderClient,
  TrashFileInput,
  UploadBufferInput,
  UploadBufferResult,
  UploadSessionResult,
} from '../../src/storage/storage-provider.interface';

export { assertOperationalFixtureSeedAllowed };

// 세션 쿠키 이름 (서버와 동일해야 함)
export const SESSION_COOKIE_NAME = 'admin-session';

// 테스트 모듈 인스턴스 캐싱
let cachedModuleFixture: TestingModule | null = null;

interface TestDriveItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  parentStorageFolderIds: string[];
  buffer: Buffer;
  trashed: boolean;
}

type TestGoogleDriveStorageProvider = StorageProviderClient &
  Pick<GoogleDriveStorageProvider, 'getItemMetadata'>;

function createTestDriveItemMetadata(item: TestDriveItem): StorageFileMetadata {
  return {
    provider: StorageProvider.GOOGLE_DRIVE,
    storageFileId: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    parentStorageFolderIds: item.parentStorageFolderIds,
  };
}

function createTestGoogleDriveStorageProvider(): TestGoogleDriveStorageProvider {
  const items = new Map<string, TestDriveItem>();
  const nextId = () => `test-drive-${crypto.randomUUID()}`;
  const ensureItem = (storageFileId: string): TestDriveItem => {
    let item = items.get(storageFileId);
    if (!item) {
      item = {
        id: storageFileId,
        name: storageFileId,
        mimeType: 'application/octet-stream',
        size: 0,
        parentStorageFolderIds: [],
        buffer: Buffer.alloc(0),
        trashed: false,
      };
      items.set(storageFileId, item);
    }
    return item;
  };
  const moveItem = (input: MoveFileInput): void => {
    const item = ensureItem(input.storageFileId);
    item.parentStorageFolderIds = [input.toParentStorageFolderId];
  };
  const trashItem = (input: TrashFileInput): void => {
    ensureItem(input.storageFileId).trashed = true;
  };

  return {
    provider: StorageProvider.GOOGLE_DRIVE,
    async generateIds(count: number): Promise<string[]> {
      return Array.from({ length: count }, nextId);
    },
    async createFolder(input: CreateFolderInput): Promise<{ storageFolderId: string }> {
      const storageFolderId = input.storageFolderId ?? nextId();
      items.set(storageFolderId, {
        id: storageFolderId,
        name: input.name,
        mimeType: 'application/vnd.google-apps.folder',
        size: 0,
        parentStorageFolderIds: input.parentStorageFolderId ? [input.parentStorageFolderId] : [],
        buffer: Buffer.alloc(0),
        trashed: false,
      });
      return { storageFolderId };
    },
    async renameFolder(input: RenameFolderInput): Promise<void> {
      ensureItem(input.storageFolderId).name = input.name;
    },
    async moveFolder(input: MoveFolderInput): Promise<void> {
      const item = ensureItem(input.storageFolderId);
      item.parentStorageFolderIds = input.parentStorageFolderId
        ? [input.parentStorageFolderId]
        : [];
    },
    async deleteFolder(input: DeleteFolderInput): Promise<void> {
      items.delete(input.storageFolderId);
    },
    async getItemMetadata(storageFileId: string): Promise<StorageFileMetadata> {
      return createTestDriveItemMetadata(ensureItem(storageFileId));
    },
    async createUploadSession(input: CreateUploadSessionInput): Promise<UploadSessionResult> {
      const storageFileId = input.storageFileId ?? nextId();
      items.set(storageFileId, {
        id: storageFileId,
        name: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        parentStorageFolderIds: [input.parentStorageFolderId],
        buffer: Buffer.alloc(0),
        trashed: false,
      });
      return {
        provider: StorageProvider.GOOGLE_DRIVE,
        storageFileId,
        uploadUrl: `https://example.test/upload/${storageFileId}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        headers: {},
      };
    },
    async confirmUploadedFile(input: ConfirmUploadedFileInput): Promise<StorageFileMetadata> {
      const item = ensureItem(input.storageFileId);
      item.parentStorageFolderIds = [input.expectedParentStorageFolderId];
      return createTestDriveItemMetadata(item);
    },
    async uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult> {
      const storageFileId = input.storageFileId ?? nextId();
      const item = {
        id: storageFileId,
        name: input.fileName,
        mimeType: input.mimeType,
        size: input.buffer.length,
        parentStorageFolderIds: [input.parentStorageFolderId],
        buffer: input.buffer,
        trashed: false,
      };
      items.set(storageFileId, item);
      return createTestDriveItemMetadata(item);
    },
    async downloadFile(input: DownloadFileInput): Promise<DownloadFileResult> {
      const item = ensureItem(input.storageFileId);
      return {
        stream: Readable.from(item.buffer),
        mimeType: item.mimeType,
        size: item.size,
      };
    },
    async renameFile(input: RenameFileInput): Promise<void> {
      ensureItem(input.storageFileId).name = input.name;
    },
    async moveFile(input: MoveFileInput): Promise<void> {
      moveItem(input);
    },
    async moveFiles(inputs: BatchMoveFileInput[]): Promise<BatchStorageFileOperationResult[]> {
      return inputs.map((input) => {
        moveItem(input);
        return { storageFileId: input.storageFileId, success: true, status: 200 };
      });
    },
    async trashFile(input: TrashFileInput): Promise<void> {
      trashItem(input);
    },
    async trashFiles(inputs: BatchTrashFileInput[]): Promise<BatchStorageFileOperationResult[]> {
      return inputs.map((input) => {
        trashItem(input);
        return { storageFileId: input.storageFileId, success: true, status: 200 };
      });
    },
    async restoreFile(input: RestoreFileInput): Promise<void> {
      ensureItem(input.storageFileId).trashed = false;
    },
    async deleteFile(input: DeleteFileInput): Promise<void> {
      items.delete(input.storageFileId);
    },
  };
}

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
  })
    .overrideProvider(GoogleDriveStorageProvider)
    .useValue(createTestGoogleDriveStorageProvider())
    .compile();

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
 * 테스트용 업체 생성
 */
export async function createTestCompany(
  prisma: PrismaService,
  overrides: Partial<Prisma.CompanyUncheckedCreateInput> = {}
): Promise<{ id: number; companyName: string }> {
  const unique = crypto.randomUUID().slice(0, 12);
  return prisma.company.create({
    data: {
      companyName: `perf-test-company-${unique}`,
      managerName: '테스트담당자',
      username: `perf-test-company-${unique}`,
      passwordHash: 'test-password-hash',
      businessRegistrationNumber: `perf-test-${unique}`,
      representativeName: '테스트대표',
      businessAddress: '테스트주소',
      managerPosition: '담당자',
      managerPhone: '010-0000-0000',
      managerEmail: `perf-test-${unique}@example.com`,
      quoteMethodEmail: true,
      quoteMethodFax: false,
      quoteMethodSms: false,
      status: 'active',
      webhardAccess: true,
      laserOnly: false,
      isApproved: true,
      ...overrides,
    },
    select: {
      id: true,
      companyName: true,
    },
  });
}

export interface OperationalWorkflowFixtureOptions {
  prefix?: string;
  company?: Partial<Prisma.CompanyUncheckedCreateInput> | null;
  contact?: Partial<Prisma.ContactUncheckedCreateInput>;
  folder?: Partial<Prisma.WebhardFolderUncheckedCreateInput>;
  file?: Partial<Prisma.WebhardFileUncheckedCreateInput>;
}

export interface OperationalWorkflowFixture {
  company: { id: number; companyName: string } | null;
  contact: {
    id: string;
    inquiryNumber: string | null;
    workNumber: string | null;
    companyId: number | null;
    webhardFolderId: string | null;
  };
  folder: {
    id: string;
    contactId: string | null;
    companyId: number | null;
    inquiryNumber: string | null;
    workNumber: string | null;
  };
  file: {
    id: string;
    folderId: string | null;
    companyId: number | null;
    inquiryNumber: string | null;
  };
}

function assertSafeOperationalFixturePrefix(prefix: string): void {
  if (!/^operational-test-[a-z0-9-]{8,}$/i.test(prefix)) {
    throw new Error(`Unsafe operational fixture prefix: ${prefix}`);
  }
}

/**
 * Contact/Webhard 운영 연동 테스트용 로컬 fixture.
 * Supabase anon/authenticated direct table access 대신 Prisma test helper 경로를 고정한다.
 */
export async function createOperationalWorkflowFixture(
  prisma: PrismaService,
  options: OperationalWorkflowFixtureOptions = {}
): Promise<OperationalWorkflowFixture> {
  assertOperationalFixtureSeedAllowed();

  const unique = crypto.randomUUID().slice(0, 12);
  const prefix = options.prefix ?? `operational-test-${unique}`;
  assertSafeOperationalFixturePrefix(prefix);

  const company =
    options.company === null
      ? null
      : await createTestCompany(prisma, {
          companyName: `${prefix}-company`,
          username: `${prefix}-company`,
          businessRegistrationNumber: `${prefix}-brn`,
          managerEmail: `${prefix}@example.com`,
          ...options.company,
        });

  const contactId = options.contact?.id ?? crypto.randomUUID();
  const folderId = options.folder?.id ?? crypto.randomUUID();
  const fileId = options.file?.id ?? crypto.randomUUID();
  const companyName = company?.companyName ?? `${prefix}-external-company`;
  const inquiryNumber = options.contact?.inquiryNumber ?? `260624-O-${unique.slice(0, 4)}`;
  const workNumber = options.contact?.workNumber ?? `260624-F-${unique.slice(4, 8)}`;
  const companyId = options.contact?.companyId ?? company?.id ?? null;
  const folderPath =
    companyId === null
      ? `/외부웹하드/${companyName}/문의/${inquiryNumber}`
      : `/${companyName}/문의/${inquiryNumber}`;

  const contact = await prisma.contact.create({
    data: {
      id: contactId,
      name: `${prefix}-contact`,
      email: `${prefix}@example.com`,
      phone: '010-0000-0000',
      companyName,
      companyId,
      status: 'new',
      source: 'webhard',
      inquiryType: 'cutting_request',
      inquiryNumber,
      workNumber,
      processStage: 'drawing_confirmed',
      webhardFolderId: folderId,
      ...options.contact,
    },
    select: {
      id: true,
      inquiryNumber: true,
      workNumber: true,
      companyId: true,
      webhardFolderId: true,
    },
  });

  const folder = await prisma.webhardFolder.create({
    data: {
      id: folderId,
      name: inquiryNumber ?? `${prefix}-folder`,
      parentId: null,
      companyId,
      path: folderPath,
      contactId,
      folderKind: 'inquiry',
      inquiryNumber,
      workNumber,
      storageProvider: StorageProvider.R2,
      ...options.folder,
    },
    select: {
      id: true,
      contactId: true,
      companyId: true,
      inquiryNumber: true,
      workNumber: true,
    },
  });

  const file = await prisma.webhardFile.create({
    data: {
      id: fileId,
      name: `${prefix}-drawing.dxf`,
      originalName: `${prefix}-drawing.dxf`,
      size: 1024,
      mimeType: 'application/dxf',
      path: `webhard/${prefix}/${fileId}.dxf`,
      folderId,
      companyId,
      uploadedBy: 'admin',
      inquiryNumber,
      isDownloaded: false,
      storageProvider: StorageProvider.R2,
      ...options.file,
    },
    select: {
      id: true,
      folderId: true,
      companyId: true,
      inquiryNumber: true,
    },
  });

  return { company, contact, folder, file };
}

export async function cleanupOperationalWorkflowFixtures(
  prisma: PrismaService,
  prefix: string
): Promise<void> {
  assertOperationalFixtureSeedAllowed();
  assertSafeOperationalFixturePrefix(prefix);

  await prisma.webhardFile.deleteMany({
    where: {
      OR: [{ name: { startsWith: prefix } }, { path: { startsWith: `webhard/${prefix}` } }],
    },
  });

  let deletedFolders = 1;
  while (deletedFolders > 0) {
    const result = await prisma.webhardFolder.deleteMany({
      where: {
        OR: [
          { name: { startsWith: prefix } },
          { path: { startsWith: `/${prefix}` } },
          { path: { startsWith: `/외부웹하드/${prefix}` } },
        ],
        children: { none: {} },
      },
    });
    deletedFolders = result.count;
  }

  await prisma.contact.deleteMany({
    where: {
      OR: [
        { name: { startsWith: prefix } },
        { email: { startsWith: prefix } },
        { companyName: { startsWith: prefix } },
      ],
    },
  });

  await prisma.company.deleteMany({
    where: {
      OR: [{ companyName: { startsWith: prefix } }, { username: { startsWith: prefix } }],
    },
  });
}

/**
 * 테스트용 업체 및 회사 소유 웹하드 데이터 정리
 */
export async function cleanupTestCompanies(
  prisma: PrismaService,
  prefix: string = 'perf-test-company-'
): Promise<void> {
  const companies = await prisma.company.findMany({
    where: {
      companyName: { startsWith: prefix },
    },
    select: { id: true },
  });

  const companyIds = companies.map((company) => company.id);
  if (companyIds.length === 0) return;

  await prisma.webhardFile.deleteMany({
    where: {
      companyId: { in: companyIds },
    },
  });

  let deleted = 1;
  while (deleted > 0) {
    const result = await prisma.webhardFolder.deleteMany({
      where: {
        companyId: { in: companyIds },
        children: { none: {} },
      },
    });
    deleted = result.count;
  }

  await prisma.company.deleteMany({
    where: {
      id: { in: companyIds },
    },
  });
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
