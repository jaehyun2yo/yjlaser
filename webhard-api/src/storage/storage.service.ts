import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProvider } from '@prisma/client';
import { SessionUser } from '../auth/auth.service';
import { extractR2Key } from '../common/r2-key.util';
import { redactErrorMessage } from '../common/logging/request-redaction';
import { isOperationalE2eMockStorageEnabled } from '../common/operational-e2e-env.util';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';
import {
  BatchMoveFileInput,
  BatchStorageFileOperationResult,
  BatchTrashFileInput,
  ConfirmUploadedFileInput,
  CreateFolderInput,
  CreateUploadSessionInput,
  DeleteFileInput,
  DeleteFolderInput,
  DownloadFileResult,
  MoveFileInput,
  MoveFolderInput,
  RenameFileInput,
  RenameFolderInput,
  RestoreFileInput,
  StorageFileMetadata,
  TrashFileInput,
  UploadBufferInput,
  UploadBufferResult,
  UploadSessionResult,
} from './storage-provider.interface';
import {
  StorageUsageResponseDto,
  StorageBreakdownResponseDto,
  DEFAULT_STORAGE_LIMIT,
  ADMIN_STORAGE_LIMIT,
} from './dto/storage.dto';
import { StorageRepairService } from './storage-repair.service';

export interface PresignedUrlResult {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface DeleteResult {
  success: boolean;
  deleted: string[];
  errors: string[];
}

interface DriveUploadProofPayload {
  v: 1;
  storageFileId: string;
  mimeType: string;
  size: number;
  parentDigests: string[];
  issuedAt: number;
  expiresAt: number;
}

export interface CreateDriveUploadProofInput extends StorageFileMetadata {
  ttlMs?: number;
}

export interface VerifyDriveUploadProofInput {
  proof: string;
  storageFileId: string;
  expectedParentStorageFolderId: string;
}

interface WebhardDriveIdMissingSample {
  id: string;
  name: string;
  companyId: number | null;
  path: string | null;
}

interface WebhardDuplicateCompanyRoot {
  companyId: number;
  count: number;
  folders: WebhardDriveIdMissingSample[];
}

interface WebhardDriveApiMissingSample extends WebhardDriveIdMissingSample {
  driveId: string;
}

interface WebhardDriveApiErrorSample extends WebhardDriveApiMissingSample {
  status: number | null;
  message: string;
}

interface WebhardStorageRepairEventSample {
  id: number;
  operation: string | null;
  resourceType: string | null;
  resourceId: string | null;
  driveId: string | null;
  reason: string | null;
  detectedAt: string | null;
  createdAt: string;
}

export interface WebhardStorageConsistencyDiagnostics {
  lastCheckedAt: string;
  quotaBackoffCount: number;
  missingDriveIds: {
    folders: { count: number; samples: WebhardDriveIdMissingSample[] };
    files: { count: number; samples: WebhardDriveIdMissingSample[] };
  };
  duplicateActiveCompanyRoots: {
    companyCount: number;
    companies: WebhardDuplicateCompanyRoot[];
  };
  driveApi404: {
    enabled: boolean;
    limit: number;
    checkedFolders: number;
    checkedFiles: number;
    totalCandidateFolders: number;
    totalCandidateFiles: number;
    truncated: boolean;
    missingFolders: { count: number; samples: WebhardDriveApiMissingSample[] };
    missingFiles: { count: number; samples: WebhardDriveApiMissingSample[] };
    errors: WebhardDriveApiErrorSample[];
    skippedReason: string | null;
  };
  recentRepairEvents: WebhardStorageRepairEventSample[];
}

/** Presigned URL 만료 시간 (초) */
const PRESIGNED_EXPIRES = {
  DOWNLOAD: 300, // 5분 (다운로드는 빠르게 완료)
  UPLOAD: 600, // 10분 (업로드는 약간의 여유)
  MULTIPART: 3600, // 1시간 (멀티파트는 파트별 시간 필요)
} as const;

const STORAGE_USAGE_TTL = 30000; // 30s in ms
const STORAGE_METRICS_TTL = 300000; // 5min in ms
const DRIVE_UPLOAD_PROOF_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly mockStorage: boolean;
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Optional() private readonly googleDriveStorageProvider?: GoogleDriveStorageProvider,
    @Optional() private readonly storageRepairService?: StorageRepairService
  ) {
    this.mockStorage = isOperationalE2eMockStorageEnabled({
      NODE_ENV: this.configService.get<string>('NODE_ENV'),
      VERCEL_ENV: this.configService.get<string>('VERCEL_ENV'),
      RAILWAY_ENVIRONMENT: this.configService.get<string>('RAILWAY_ENVIRONMENT'),
      OPERATIONAL_E2E_MOCK_STORAGE: this.configService.get<string>('OPERATIONAL_E2E_MOCK_STORAGE'),
    });
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucketName = this.configService.get<string>(
      'R2_BUCKET_NAME',
      this.mockStorage ? 'yjlaser-operational-e2e' : 'yjlaser'
    );
    this.publicBaseUrl = this.mockStorage
      ? this.configService.get<string>(
          'OPERATIONAL_E2E_MOCK_STORAGE_PUBLIC_BASE_URL',
          'http://127.0.0.1:4000/mock-r2'
        )
      : this.configService.get<string>('R2_PUBLIC_BASE_URL', 'https://yjlaser.net');

    if (!this.mockStorage && (!accountId || !accessKeyId || !secretAccessKey)) {
      throw new Error('R2 configuration is incomplete');
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.mockStorage
        ? 'http://127.0.0.1:4000'
        : `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKeyId ?? 'operational-e2e-mock-access-key',
        secretAccessKey: secretAccessKey ?? 'operational-e2e-mock-secret-key',
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({
        httpAgent: new http.Agent({ maxSockets: 50 }),
        httpsAgent: new https.Agent({ maxSockets: 50 }),
        connectionTimeout: 5000,
        socketTimeout: 30000,
      }),
    });
  }

  private getGoogleDriveStorageProvider(): GoogleDriveStorageProvider {
    if (!this.googleDriveStorageProvider) {
      throw new InternalServerErrorException('Google Drive storage provider is not configured');
    }
    return this.googleDriveStorageProvider;
  }

  private createMockStorageId(prefix: string): string {
    return `mock-${prefix}-${crypto.randomUUID()}`;
  }

  createDriveUploadProof(input: CreateDriveUploadProofInput): string {
    const now = Date.now();
    const payload: DriveUploadProofPayload = {
      v: 1,
      storageFileId: input.storageFileId,
      mimeType: input.mimeType,
      size: input.size,
      parentDigests: input.parentStorageFolderIds.map((parentId) =>
        this.signDriveUploadProofClaim(`parent:${parentId}`)
      ),
      issuedAt: now,
      expiresAt: now + (input.ttlMs ?? DRIVE_UPLOAD_PROOF_TTL_MS),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.signDriveUploadProofClaim(`payload:${encodedPayload}`);
    return `${encodedPayload}.${signature}`;
  }

  verifyDriveUploadProof(input: VerifyDriveUploadProofInput): StorageFileMetadata {
    const proofParts = input.proof.split('.');
    if (proofParts.length !== 2) {
      throw new BadRequestException('Invalid Drive upload proof');
    }
    const [encodedPayload, signature] = proofParts;

    const expectedSignature = this.signDriveUploadProofClaim(`payload:${encodedPayload}`);
    if (!this.timingSafeEqualHex(signature, expectedSignature)) {
      throw new BadRequestException('Invalid Drive upload proof');
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid Drive upload proof');
    }
    if (!this.isDriveUploadProofPayload(parsedPayload)) {
      throw new BadRequestException('Invalid Drive upload proof');
    }

    const payload = parsedPayload;
    if (payload.storageFileId !== input.storageFileId || Date.now() > payload.expiresAt) {
      throw new BadRequestException('Invalid Drive upload proof');
    }

    const expectedParentDigest = this.signDriveUploadProofClaim(
      `parent:${input.expectedParentStorageFolderId}`
    );
    if (!payload.parentDigests.includes(expectedParentDigest)) {
      throw new BadRequestException('Drive file parent mismatch');
    }

    return {
      provider: StorageProvider.GOOGLE_DRIVE,
      storageFileId: payload.storageFileId,
      name: payload.storageFileId,
      mimeType: payload.mimeType,
      size: payload.size,
      parentStorageFolderIds: [input.expectedParentStorageFolderId],
    };
  }

  private signDriveUploadProofClaim(value: string): string {
    const secret =
      this.configService.get<string>('WEBHARD_UPLOAD_PROOF_SECRET') ||
      this.configService.get<string>('SESSION_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('Drive upload proof secret is not configured');
    }
    return crypto.createHmac('sha256', secret).update(value).digest('hex');
  }

  private isDriveUploadProofPayload(value: unknown): value is DriveUploadProofPayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      candidate.v === 1 &&
      typeof candidate.storageFileId === 'string' &&
      typeof candidate.mimeType === 'string' &&
      typeof candidate.size === 'number' &&
      Number.isFinite(candidate.size) &&
      Array.isArray(candidate.parentDigests) &&
      candidate.parentDigests.every((digest) => typeof digest === 'string') &&
      typeof candidate.issuedAt === 'number' &&
      Number.isFinite(candidate.issuedAt) &&
      typeof candidate.expiresAt === 'number' &&
      Number.isFinite(candidate.expiresAt)
    );
  }

  private timingSafeEqualHex(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  /**
   * Generate presigned URL for file upload
   */
  async getUploadPresignedUrl(
    key: string,
    contentType: string,
    expiresIn: number = PRESIGNED_EXPIRES.UPLOAD
  ): Promise<PresignedUrlResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return { url, key, expiresAt };
    } catch (error) {
      this.logPresignedUrlGenerationFailure('upload', error);
      throw new InternalServerErrorException('Failed to generate upload URL');
    }
  }

  /**
   * Generate presigned URL for file download
   */
  async getDownloadPresignedUrl(
    key: string,
    expiresIn: number = PRESIGNED_EXPIRES.DOWNLOAD,
    fileName?: string
  ): Promise<PresignedUrlResult> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ResponseCacheControl: 'private, max-age=3600',
        ...(fileName && {
          ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        }),
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return { url, key, expiresAt };
    } catch (error) {
      this.logPresignedUrlGenerationFailure('download', error);
      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }

  /**
   * Get public URL for a file (via CDN)
   */
  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    if (this.mockStorage) {
      return true;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a single file
   */
  async deleteFile(key: string): Promise<boolean> {
    if (this.mockStorage) {
      return true;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete file', error);
      return false;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(keys: string[]): Promise<DeleteResult> {
    if (keys.length === 0) {
      return { success: true, deleted: [], errors: [] };
    }
    if (this.mockStorage) {
      return { success: true, deleted: keys, errors: [] };
    }

    const deleted: string[] = [];
    const errors: string[] = [];

    // R2 allows up to 1000 objects per request
    const chunkSize = 1000;
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += chunkSize) {
      chunks.push(keys.slice(i, i + chunkSize));
    }

    // 3개씩 병렬 처리 (순차 → 3x 속도 향상)
    const PARALLEL = 3;
    for (let i = 0; i < chunks.length; i += PARALLEL) {
      const batch = chunks.slice(i, i + PARALLEL);
      await Promise.all(
        batch.map(async (chunk) => {
          try {
            const command = new DeleteObjectsCommand({
              Bucket: this.bucketName,
              Delete: {
                Objects: chunk.map((key) => ({ Key: key })),
                Quiet: false,
              },
            });

            const result = await this.s3Client.send(command);

            result.Deleted?.forEach((d) => {
              if (d.Key) deleted.push(d.Key);
            });

            result.Errors?.forEach((e) => {
              if (e.Key) errors.push(`${e.Key}: ${e.Message}`);
            });
          } catch (error) {
            this.logger.error('Failed to delete files batch', error);
            chunk.forEach((key) => errors.push(`${key}: Batch delete failed`));
          }
        })
      );
    }

    return {
      success: errors.length === 0,
      deleted,
      errors,
    };
  }

  /**
   * Generate storage path for a file
   * Format: webhard/{companyId}/{folderId}/{filename}
   */
  generateStoragePath(companyId: number | null, folderId: string | null, filename: string): string {
    const parts = ['webhard'];

    if (companyId !== null) {
      parts.push(`company-${companyId}`);
    } else {
      parts.push('admin');
    }

    if (folderId) {
      parts.push(folderId);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = this.sanitizeFilename(filename);
    parts.push(`${timestamp}-${random}-${sanitizedFilename}`);

    return parts.join('/');
  }

  /**
   * Get performance metrics for admin dashboard (5min cache)
   */
  async getPerformanceMetrics() {
    const cacheKey = 'storage:perf-metrics';
    const cached = await this.cacheManager.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const result = await this.fetchPerformanceMetrics();
    await this.cacheManager.set(cacheKey, result, STORAGE_METRICS_TTL);
    return result;
  }

  async getWebhardConsistencyDiagnostics(input?: {
    verifyDriveApi?: boolean;
    verifyDriveApiLimit?: number;
  }): Promise<WebhardStorageConsistencyDiagnostics> {
    const verifyDriveApi = input?.verifyDriveApi ?? false;
    const requestedLimit = input?.verifyDriveApiLimit;
    const verifyDriveApiLimit = Number.isFinite(requestedLimit)
      ? Math.max(0, Math.min(requestedLimit as number, 500))
      : 50;
    const sampleTake = 20;

    const [
      missingDriveFolderCount,
      missingDriveFolderSamples,
      missingDriveFileCount,
      missingDriveFileSamples,
      activeCompanyRoots,
      totalCandidateFolders,
      totalCandidateFiles,
      driveFolderCandidates,
      driveFileCandidates,
      recentRepairEvents,
    ] = await Promise.all([
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.count({
            where: { storageProvider: StorageProvider.GOOGLE_DRIVE, driveFolderId: null },
          }),
        { operationName: 'webhardConsistency.missingDriveFolderCount' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: { storageProvider: StorageProvider.GOOGLE_DRIVE, driveFolderId: null },
            select: { id: true, name: true, companyId: true, path: true },
            orderBy: { createdAt: 'asc' },
            take: sampleTake,
          }),
        { operationName: 'webhardConsistency.missingDriveFolderSamples' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.count({
            where: { storageProvider: StorageProvider.GOOGLE_DRIVE, driveFileId: null },
          }),
        { operationName: 'webhardConsistency.missingDriveFileCount' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.findMany({
            where: { storageProvider: StorageProvider.GOOGLE_DRIVE, driveFileId: null },
            select: { id: true, name: true, companyId: true, path: true },
            orderBy: { createdAt: 'asc' },
            take: sampleTake,
          }),
        { operationName: 'webhardConsistency.missingDriveFileSamples' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: { companyId: { not: null }, parentId: null, deletedAt: null },
            select: { id: true, name: true, companyId: true, path: true },
            orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
          }),
        { operationName: 'webhardConsistency.activeCompanyRoots' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.count({
            where: {
              storageProvider: StorageProvider.GOOGLE_DRIVE,
              driveFolderId: { not: null },
              deletedAt: null,
            },
          }),
        { operationName: 'webhardConsistency.driveFolderCandidateCount' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.count({
            where: {
              storageProvider: StorageProvider.GOOGLE_DRIVE,
              driveFileId: { not: null },
              deletedAt: null,
            },
          }),
        { operationName: 'webhardConsistency.driveFileCandidateCount' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFolder.findMany({
            where: {
              storageProvider: StorageProvider.GOOGLE_DRIVE,
              driveFolderId: { not: null },
              deletedAt: null,
            },
            select: { id: true, name: true, companyId: true, path: true, driveFolderId: true },
            orderBy: { createdAt: 'asc' },
            take: verifyDriveApi ? verifyDriveApiLimit : 0,
          }),
        { operationName: 'webhardConsistency.driveFolderCandidates' }
      ),
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.findMany({
            where: {
              storageProvider: StorageProvider.GOOGLE_DRIVE,
              driveFileId: { not: null },
              deletedAt: null,
            },
            select: { id: true, name: true, companyId: true, path: true, driveFileId: true },
            orderBy: { createdAt: 'asc' },
            take: verifyDriveApi ? verifyDriveApiLimit : 0,
          }),
        { operationName: 'webhardConsistency.driveFileCandidates' }
      ),
      this.getRecentStorageRepairEvents(sampleTake),
    ]);

    const duplicateRoots = this.buildDuplicateCompanyRoots(activeCompanyRoots);
    const driveApi404 = await this.checkDriveApiMissing({
      enabled: verifyDriveApi,
      limit: verifyDriveApiLimit,
      totalCandidateFolders,
      totalCandidateFiles,
      folders: driveFolderCandidates.map((folder) => ({
        id: folder.id,
        name: folder.name,
        companyId: folder.companyId,
        path: folder.path,
        driveId: folder.driveFolderId as string,
      })),
      files: driveFileCandidates.map((file) => ({
        id: file.id,
        name: file.name,
        companyId: file.companyId,
        path: file.path,
        driveId: file.driveFileId as string,
      })),
    });

    return {
      lastCheckedAt: new Date().toISOString(),
      quotaBackoffCount: this.countQuotaBackoffEvents(driveApi404.errors, recentRepairEvents),
      missingDriveIds: {
        folders: { count: missingDriveFolderCount, samples: missingDriveFolderSamples },
        files: { count: missingDriveFileCount, samples: missingDriveFileSamples },
      },
      duplicateActiveCompanyRoots: {
        companyCount: duplicateRoots.length,
        companies: duplicateRoots,
      },
      driveApi404,
      recentRepairEvents,
    };
  }

  private buildDuplicateCompanyRoots(
    roots: WebhardDriveIdMissingSample[]
  ): WebhardDuplicateCompanyRoot[] {
    const byCompany = new Map<number, WebhardDriveIdMissingSample[]>();
    for (const root of roots) {
      if (root.companyId === null) continue;
      const current = byCompany.get(root.companyId) ?? [];
      current.push(root);
      byCompany.set(root.companyId, current);
    }

    return Array.from(byCompany.entries())
      .filter(([, folders]) => folders.length > 1)
      .map(([companyId, folders]) => ({ companyId, count: folders.length, folders }));
  }

  private async checkDriveApiMissing(input: {
    enabled: boolean;
    limit: number;
    totalCandidateFolders: number;
    totalCandidateFiles: number;
    folders: WebhardDriveApiMissingSample[];
    files: WebhardDriveApiMissingSample[];
  }): Promise<WebhardStorageConsistencyDiagnostics['driveApi404']> {
    const empty = {
      enabled: input.enabled,
      limit: input.limit,
      checkedFolders: 0,
      checkedFiles: 0,
      totalCandidateFolders: input.totalCandidateFolders,
      totalCandidateFiles: input.totalCandidateFiles,
      truncated:
        input.totalCandidateFolders > input.folders.length ||
        input.totalCandidateFiles > input.files.length,
      missingFolders: { count: 0, samples: [] as WebhardDriveApiMissingSample[] },
      missingFiles: { count: 0, samples: [] as WebhardDriveApiMissingSample[] },
      errors: [] as WebhardDriveApiErrorSample[],
      skippedReason: null as string | null,
    };

    if (!input.enabled) {
      return { ...empty, skippedReason: 'verifyDriveApi=false' };
    }

    if (input.limit === 0) {
      return { ...empty, skippedReason: 'verifyDriveApiLimit=0' };
    }

    if (!this.googleDriveStorageProvider) {
      return { ...empty, skippedReason: 'Google Drive storage provider is not configured' };
    }

    const hasDriveConfig = Boolean(
      this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON') &&
      this.configService.get<string>('GOOGLE_DRIVE_SHARED_DRIVE_ID')
    );
    if (!hasDriveConfig) {
      return { ...empty, skippedReason: 'Google Drive credentials or shared drive id is missing' };
    }

    const missingFolders: WebhardDriveApiMissingSample[] = [];
    const missingFiles: WebhardDriveApiMissingSample[] = [];
    const errors: WebhardDriveApiErrorSample[] = [];

    for (const folder of input.folders) {
      await this.checkDriveObject('folder', folder, missingFolders, errors);
    }
    for (const file of input.files) {
      await this.checkDriveObject('file', file, missingFiles, errors);
    }

    return {
      ...empty,
      checkedFolders: input.folders.length,
      checkedFiles: input.files.length,
      missingFolders: { count: missingFolders.length, samples: missingFolders.slice(0, 20) },
      missingFiles: { count: missingFiles.length, samples: missingFiles.slice(0, 20) },
      errors: errors.slice(0, 20),
    };
  }

  private async checkDriveObject(
    resourceType: 'folder' | 'file',
    item: WebhardDriveApiMissingSample,
    missing: WebhardDriveApiMissingSample[],
    errors: WebhardDriveApiErrorSample[]
  ): Promise<void> {
    try {
      await this.googleDriveStorageProvider?.getItemMetadata(item.driveId);
    } catch (error) {
      const status = this.getHttpStatus(error);
      if (status === 404) {
        missing.push(item);
        await this.recordDriveDiagnosticMismatch(resourceType, item, 'drive_api_404', status);
        return;
      }
      if (status === 403 || status === 429) {
        await this.recordDriveDiagnosticMismatch(
          resourceType,
          item,
          'drive_quota_or_backoff',
          status
        );
      }
      errors.push({
        ...item,
        status,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getHttpStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) return null;
    const candidate = error as { code?: unknown; response?: { status?: unknown } };
    const status = Number(candidate.code ?? candidate.response?.status);
    return Number.isFinite(status) ? status : null;
  }

  private async recordDriveDiagnosticMismatch(
    resourceType: 'folder' | 'file',
    item: WebhardDriveApiMissingSample,
    reason: string,
    status: number | null
  ): Promise<void> {
    if (!this.storageRepairService) return;

    await this.storageRepairService.recordDriveDbMismatch({
      operation: 'diagnostic',
      storageProvider: 'google_drive',
      resourceType,
      resourceId: item.id,
      driveFileId: resourceType === 'file' ? item.driveId : undefined,
      driveFolderId: resourceType === 'folder' ? item.driveId : undefined,
      webhardFileId: resourceType === 'file' ? item.id : undefined,
      webhardFolderId: resourceType === 'folder' ? item.id : undefined,
      reason,
      detectedAt: new Date(),
      expectedDbState: {
        existsInDrive: true,
        name: item.name,
        companyId: item.companyId,
        path: item.path,
      },
      actualDriveState: { missing: status === 404, status },
    });
  }

  private async getRecentStorageRepairEvents(
    limit: number
  ): Promise<WebhardStorageRepairEventSample[]> {
    const logs = await this.prisma.executeWithRetry(
      () =>
        this.prisma.syncLog.findMany({
          where: { status: 'api_error' },
          select: { id: true, metadata: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: Math.max(limit * 3, limit),
        }),
      { operationName: 'webhardConsistency.recentStorageRepairEvents' }
    );

    const events: WebhardStorageRepairEventSample[] = [];
    for (const log of logs) {
      const metadata = log.metadata;
      if (!this.isRecord(metadata) || metadata.auditKind !== 'storage_repair') continue;

      events.push({
        id: log.id,
        operation: this.asNullableString(metadata.operation),
        resourceType: this.asNullableString(metadata.resourceType),
        resourceId: this.asNullableString(metadata.resourceId),
        driveId: this.asNullableString(metadata.driveId),
        reason: this.asNullableString(metadata.reason),
        detectedAt: this.asNullableString(metadata.detectedAt),
        createdAt: log.createdAt.toISOString(),
      });

      if (events.length >= limit) break;
    }

    return events;
  }

  private countQuotaBackoffEvents(
    driveApiErrors: WebhardDriveApiErrorSample[],
    recentRepairEvents: WebhardStorageRepairEventSample[]
  ): number {
    const currentErrors = driveApiErrors.filter(
      (error) => error.status === 403 || error.status === 429
    ).length;
    const recentEvents = recentRepairEvents.filter(
      (event) => event.reason === 'drive_quota_or_backoff'
    ).length;

    return currentErrors + recentEvents;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private asNullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  /**
   * 성능 메트릭 실제 쿼리 (8개 병렬 실행)
   */
  private async fetchPerformanceMetrics() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalFilesResult,
      totalFoldersResult,
      totalSizeResult,
      totalCompaniesResult,
      newFilesResult,
      undownloadedResult,
      fileSizeDistResult,
      folderDepthResult,
    ] = await Promise.all([
      // 총 파일 수
      this.prisma.executeWithRetry(
        () => this.prisma.webhardFile.count({ where: { deletedAt: null } }),
        { operationName: 'perfMetrics.totalFiles' }
      ),
      // 총 폴더 수
      this.prisma.executeWithRetry(
        () => this.prisma.webhardFolder.count({ where: { deletedAt: null } }),
        { operationName: 'perfMetrics.totalFolders' }
      ),
      // 총 저장 용량
      this.prisma.executeWithRetry<{ _sum: { size: bigint | null } }>(
        () =>
          this.prisma.webhardFile.aggregate({
            where: { deletedAt: null },
            _sum: { size: true },
          }),
        { operationName: 'perfMetrics.totalSize' }
      ),
      // 등록 업체 수
      this.prisma.executeWithRetry(() => this.prisma.company.count(), {
        operationName: 'perfMetrics.totalCompanies',
      }),
      // 24시간 내 신규 파일
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.count({
            where: { deletedAt: null, createdAt: { gte: oneDayAgo } },
          }),
        { operationName: 'perfMetrics.newFiles' }
      ),
      // 미다운로드 파일
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.count({
            where: { deletedAt: null, isDownloaded: false },
          }),
        { operationName: 'perfMetrics.undownloaded' }
      ),
      // 파일 크기 분포 (raw query)
      this.prisma.executeWithRetry<{ category: string; count: bigint }[]>(
        () =>
          this.prisma.$queryRaw<{ category: string; count: bigint }[]>`SELECT
              CASE
                WHEN size < 1048576 THEN 'small'
                WHEN size < 104857600 THEN 'medium'
                WHEN size < 1073741824 THEN 'large'
                ELSE 'xlarge'
              END as category,
              COUNT(*) as count
            FROM webhard_files
            WHERE deleted_at IS NULL
            GROUP BY category`,
        { operationName: 'perfMetrics.fileSizeDist' }
      ),
      // 폴더 깊이 (path 기반)
      this.prisma.executeWithRetry<{ max_depth: number; avg_depth: number }[]>(
        () =>
          this.prisma.$queryRaw<{ max_depth: number; avg_depth: number }[]>`SELECT
              COALESCE(MAX(array_length(string_to_array(path, '/'), 1)), 0) as max_depth,
              COALESCE(ROUND(AVG(array_length(string_to_array(path, '/'), 1))::numeric, 1), 0) as avg_depth
            FROM webhard_folders
            WHERE deleted_at IS NULL AND path IS NOT NULL AND path != ''`,
        { operationName: 'perfMetrics.folderDepth' }
      ),
    ]);

    // 파일 크기 분포 매핑
    const distMap: Record<string, number> = { small: 0, medium: 0, large: 0, xlarge: 0 };
    for (const row of fileSizeDistResult) {
      distMap[row.category] = Number(row.count);
    }

    const depthData = folderDepthResult[0] || { max_depth: 0, avg_depth: 0 };

    return {
      totalFiles: totalFilesResult,
      totalFolders: totalFoldersResult,
      totalSize: Number(totalSizeResult._sum.size ?? 0),
      totalCompanies: totalCompaniesResult,
      newFilesLast24h: newFilesResult,
      undownloadedFiles: undownloadedResult,
      maxFolderDepth: Number(depthData.max_depth),
      avgFolderDepth: Number(depthData.avg_depth),
      fileSizeDistribution: distMap,
    };
  }

  // ============ Multipart Upload Methods ============

  /**
   * Initiate multipart upload
   */
  async initiateMultipartUpload(
    key: string,
    contentType: string
  ): Promise<{ uploadId: string; key: string }> {
    if (this.mockStorage) {
      return { uploadId: this.createMockStorageId('multipart'), key };
    }

    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });
      const result = await this.s3Client.send(command);
      return { uploadId: result.UploadId!, key };
    } catch (error) {
      this.logger.error('Failed to initiate multipart upload', error);
      throw new InternalServerErrorException('Failed to initiate multipart upload');
    }
  }

  /**
   * Get presigned URL for uploading a single part
   */
  async getMultipartPresignedUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn = PRESIGNED_EXPIRES.MULTIPART
  ): Promise<string> {
    try {
      const command = new UploadPartCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logPresignedUrlGenerationFailure('multipart', error);
      throw new InternalServerErrorException('Failed to generate part upload URL');
    }
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[]
  ): Promise<void> {
    if (this.mockStorage) {
      return;
    }

    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      });
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error('Failed to complete multipart upload', error);
      throw new InternalServerErrorException('Failed to complete multipart upload');
    }
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    if (this.mockStorage) {
      return;
    }

    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
      });
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error('Failed to abort multipart upload', error);
    }
  }

  /**
   * Get file content as Buffer from R2
   */
  async getFileBuffer(key: string): Promise<Buffer> {
    if (this.mockStorage) {
      return Buffer.alloc(0);
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const response = await this.s3Client.send(command);
      const stream = response.Body;
      if (!stream) {
        throw new Error(`Empty response body for key: ${key}`);
      }
      // Convert readable stream to Buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to get file buffer for key: ${key}`, error);
      throw new InternalServerErrorException('Failed to download file from storage');
    }
  }

  async generateDriveIds(count: number): Promise<string[]> {
    if (this.mockStorage) {
      return Array.from({ length: count }, () => this.createMockStorageId('drive'));
    }
    return this.getGoogleDriveStorageProvider().generateIds(count);
  }

  async createDriveFolder(input: CreateFolderInput): Promise<{ storageFolderId: string }> {
    if (this.mockStorage) {
      return { storageFolderId: input.storageFolderId ?? this.createMockStorageId('folder') };
    }
    return this.getGoogleDriveStorageProvider().createFolder(input);
  }

  async renameDriveFolder(input: RenameFolderInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().renameFolder(input);
  }

  async moveDriveFolder(input: MoveFolderInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().moveFolder(input);
  }

  async trashDriveFolder(input: DeleteFolderInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().deleteFolder(input);
  }

  async restoreDriveFolder(input: DeleteFolderInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().restoreFile({
      storageFileId: input.storageFolderId,
    });
  }

  async createDriveUploadSession(input: CreateUploadSessionInput): Promise<UploadSessionResult> {
    if (this.mockStorage) {
      const storageFileId = input.storageFileId ?? this.createMockStorageId('file');
      return {
        provider: StorageProvider.GOOGLE_DRIVE,
        storageFileId,
        uploadUrl: `http://127.0.0.1:4000/mock-drive-upload/${storageFileId}`,
        expiresAt: new Date(Date.now() + PRESIGNED_EXPIRES.UPLOAD * 1000),
        headers: {},
      };
    }
    return this.getGoogleDriveStorageProvider().createUploadSession(input);
  }

  async confirmDriveUploadedFile(input: ConfirmUploadedFileInput): Promise<StorageFileMetadata> {
    if (this.mockStorage) {
      return {
        provider: StorageProvider.GOOGLE_DRIVE,
        storageFileId: input.storageFileId,
        name: 'mock-upload',
        mimeType: 'application/octet-stream',
        size: 0,
        parentStorageFolderIds: [input.expectedParentStorageFolderId],
      };
    }
    return this.getGoogleDriveStorageProvider().confirmUploadedFile(input);
  }

  async uploadDriveBuffer(input: UploadBufferInput): Promise<UploadBufferResult> {
    if (this.mockStorage) {
      return {
        provider: StorageProvider.GOOGLE_DRIVE,
        storageFileId: input.storageFileId ?? this.createMockStorageId('file'),
        name: input.fileName,
        mimeType: input.mimeType,
        size: input.buffer.length,
        parentStorageFolderIds: [input.parentStorageFolderId],
      };
    }
    return this.getGoogleDriveStorageProvider().uploadBuffer(input);
  }

  async renameDriveFile(input: RenameFileInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().renameFile(input);
  }

  async moveDriveFile(input: MoveFileInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().moveFile(input);
  }

  async moveDriveFiles(inputs: BatchMoveFileInput[]): Promise<BatchStorageFileOperationResult[]> {
    if (this.mockStorage) {
      return inputs.map((input) => ({ storageFileId: input.storageFileId, success: true }));
    }
    return this.getGoogleDriveStorageProvider().moveFiles(inputs);
  }

  async trashDriveFile(input: TrashFileInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().trashFile(input);
  }

  async trashDriveFiles(inputs: BatchTrashFileInput[]): Promise<BatchStorageFileOperationResult[]> {
    if (this.mockStorage) {
      return inputs.map((input) => ({ storageFileId: input.storageFileId, success: true }));
    }
    return this.getGoogleDriveStorageProvider().trashFiles(inputs);
  }

  async restoreDriveFile(input: RestoreFileInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().restoreFile(input);
  }

  async deleteDriveFile(input: DeleteFileInput): Promise<void> {
    if (this.mockStorage) {
      return;
    }
    return this.getGoogleDriveStorageProvider().deleteFile(input);
  }

  async downloadWebhardFile(file: {
    storageProvider: StorageProvider;
    driveFileId: string | null;
    path: string;
  }): Promise<DownloadFileResult | PresignedUrlResult> {
    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
      if (this.mockStorage) {
        return {
          stream: Readable.from(Buffer.alloc(0)),
          mimeType: 'application/octet-stream',
          size: 0,
        };
      }
      if (!file.driveFileId) {
        throw new InternalServerErrorException('Drive file id is missing');
      }
      return this.getGoogleDriveStorageProvider().downloadFile({ storageFileId: file.driveFileId });
    }

    return this.getDownloadPresignedUrl(extractR2Key(file.path));
  }

  /**
   * Sanitize filename for storage
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 200);
  }

  private logPresignedUrlGenerationFailure(
    operation: 'upload' | 'download' | 'multipart',
    error: unknown
  ): void {
    this.logger.error(
      `presigned_url_generation_failed action=generate_presigned_url operation=${operation} status=failure errorType=${this.getSafeErrorType(error)} messageHash=${this.getRedactedErrorMessageHash(error)}`
    );
  }

  private getSafeErrorType(error: unknown): string {
    const rawType = error instanceof Error && error.name ? error.name : typeof error;
    return rawType.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80) || 'unknown';
  }

  private getRedactedErrorMessageHash(error: unknown): string {
    const rawMessage =
      error instanceof Error ? `${error.name}:${error.message}` : String(error ?? 'unknown');
    const redactedMessage = redactErrorMessage(rawMessage);
    return crypto.createHash('sha256').update(redactedMessage).digest('hex').slice(0, 16);
  }

  /**
   * Get storage usage for a user
   * company_storage 트리거 테이블에서 조회 (O(1)), fallback으로 aggregate 사용
   */
  async getStorageUsage(
    user: SessionUser,
    queryCompanyId?: number
  ): Promise<StorageUsageResponseDto> {
    const effectiveCompanyId = user.userType === 'company' ? user.companyId : queryCompanyId;
    const storageCompanyId = effectiveCompanyId ?? 0;
    const isAdminAllUsage = user.userType === 'admin' && queryCompanyId === undefined;
    const cacheKey = isAdminAllUsage ? 'storage:usage:admin' : `storage:usage:${storageCompanyId}`;

    const cached = await this.cacheManager.get<StorageUsageResponseDto>(cacheKey);
    if (cached) return cached;

    let active = 0;
    let trash = 0;
    const companyScope =
      effectiveCompanyId !== undefined && effectiveCompanyId !== null
        ? { companyId: effectiveCompanyId }
        : {};
    const sumFilesByDeletedState = async (deleted: boolean, operationName: string) => {
      const result = await this.prisma.executeWithRetry<{ _sum: { size: bigint | null } }>(
        () =>
          this.prisma.webhardFile.aggregate({
            where: {
              deletedAt: deleted ? { not: null } : null,
              ...companyScope,
            },
            _sum: { size: true },
          }),
        { operationName }
      );
      return Number(result._sum.size ?? 0);
    };

    try {
      if (isAdminAllUsage) {
        // 관리자 전체 용량은 모든 업체/관리자 저장량의 합계이다.
        const storage = await this.prisma.executeWithRetry<{
          _sum: { usedBytes: bigint | null };
        }>(
          () =>
            this.prisma.companyStorage.aggregate({
              _sum: { usedBytes: true },
            }),
          { operationName: 'getStorageUsage.companyStorage.aggregateAll' }
        );

        active = Number(storage._sum.usedBytes ?? 0);
      } else {
        // company_storage 테이블에서 즉시 조회 (트리거가 실시간 갱신)
        const storage = await this.prisma.executeWithRetry<{ usedBytes: bigint } | null>(
          () =>
            this.prisma.companyStorage.findUnique({
              where: { companyId: storageCompanyId },
            }),
          { operationName: 'getStorageUsage.companyStorage' }
        );

        active = Number(storage?.usedBytes ?? 0);
      }
      trash = await sumFilesByDeletedState(true, 'getStorageUsage.trash');
    } catch {
      // company_storage 테이블이 없는 경우 기존 aggregate fallback
      [active, trash] = await Promise.all([
        sumFilesByDeletedState(false, 'getStorageUsage.fallback.active'),
        sumFilesByDeletedState(true, 'getStorageUsage.fallback.trash'),
      ]);
    }

    const max =
      user.userType === 'admin' && !queryCompanyId ? ADMIN_STORAGE_LIMIT : DEFAULT_STORAGE_LIMIT;
    const current = active + trash;
    const percentage = Math.round((current / max) * 100 * 100) / 100;
    const activePercentage = Math.round((active / max) * 100 * 100) / 100;
    const trashPercentage = Math.round((trash / max) * 100 * 100) / 100;

    const result: StorageUsageResponseDto = {
      active,
      trash,
      current,
      max,
      companyId: effectiveCompanyId ?? undefined,
      percentage,
      activePercentage,
      trashPercentage,
    };
    await this.cacheManager.set(cacheKey, result, STORAGE_USAGE_TTL);
    return result;
  }

  /**
   * Get storage breakdown by company or folder
   */
  async getStorageBreakdown(user: SessionUser): Promise<StorageBreakdownResponseDto> {
    const cacheKey = `storage:breakdown:${user.userType === 'company' ? user.companyId : 'admin'}`;
    const cached = await this.cacheManager.get<StorageBreakdownResponseDto>(cacheKey);
    if (cached) return cached;

    if (user.userType === 'admin') {
      // 관리자: 업체별 저장공간 내역 (executeWithRetry로 감싸서 08P01 에러 시 자동 재시도)
      const byCompanyRaw = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.groupBy({
            by: ['companyId'],
            where: {
              deletedAt: null,
            },
            _sum: {
              size: true,
            },
            _count: true,
          }),
        { operationName: 'getStorageBreakdown.admin.groupBy' }
      );

      // 업체 정보 조회
      const companyIds = byCompanyRaw
        .map((item) => item.companyId)
        .filter((id): id is number => id !== null);

      const companies = await this.prisma.executeWithRetry<{ id: number; companyName: string }[]>(
        () =>
          this.prisma.company.findMany({
            where: {
              id: { in: companyIds },
            },
            select: {
              id: true,
              companyName: true,
            },
          }),
        { operationName: 'getStorageBreakdown.admin.findCompanies' }
      );

      const companyMap = new Map(companies.map((c) => [c.id, c.companyName]));

      const byCompany = byCompanyRaw.map((item) => ({
        companyId: item.companyId ?? 0,
        companyName: item.companyId ? companyMap.get(item.companyId) || 'Unknown' : '관리자',
        used: Number(item._sum.size ?? 0),
        fileCount: item._count,
      }));

      const total = byCompany.reduce((sum: number, item: { used: number }) => sum + item.used, 0);

      const adminResult: StorageBreakdownResponseDto = { total, byCompany };
      await this.cacheManager.set(cacheKey, adminResult, STORAGE_USAGE_TTL);
      return adminResult;
    } else {
      // 업체: 폴더별 저장공간 내역 (executeWithRetry로 감싸서 08P01 에러 시 자동 재시도)
      const byFolderRaw = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.groupBy({
            by: ['folderId'],
            where: {
              deletedAt: null,
              companyId: user.companyId,
            },
            _sum: {
              size: true,
            },
            _count: true,
          }),
        { operationName: 'getStorageBreakdown.company.groupBy' }
      );

      // 폴더 정보 조회
      const folderIds = byFolderRaw
        .map((item) => item.folderId)
        .filter((id): id is string => id !== null);

      const folders = await this.prisma.executeWithRetry<{ id: string; name: string }[]>(
        () =>
          this.prisma.webhardFolder.findMany({
            where: {
              id: { in: folderIds },
            },
            select: {
              id: true,
              name: true,
            },
          }),
        { operationName: 'getStorageBreakdown.company.findFolders' }
      );

      const folderMap = new Map(folders.map((f) => [f.id, f.name]));

      const byFolder = byFolderRaw.map((item) => ({
        folderId: item.folderId ?? 'root',
        folderName: item.folderId ? folderMap.get(item.folderId) || 'Unknown' : '루트',
        used: Number(item._sum.size ?? 0),
        fileCount: item._count,
      }));

      const total = byFolder.reduce((sum: number, item: { used: number }) => sum + item.used, 0);

      const companyResult: StorageBreakdownResponseDto = { total, byFolder };
      await this.cacheManager.set(cacheKey, companyResult, STORAGE_USAGE_TTL);
      return companyResult;
    }
  }

  /**
   * Invalidate storage usage/breakdown caches for a company after file upload or deletion.
   */
  async invalidateStorageCache(companyId: number | null): Promise<void> {
    const id = companyId ?? 0;
    await Promise.all([
      this.cacheManager.del('storage:usage:admin'),
      this.cacheManager.del(`storage:usage:${id}`),
      this.cacheManager.del('storage:breakdown:admin'),
      this.cacheManager.del(`storage:breakdown:${companyId ?? 'admin'}`),
    ]);
  }
}
