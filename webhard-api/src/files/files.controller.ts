import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Req,
  Put,
  Headers,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import { Request, Response } from 'express';
import { Readable } from 'stream';
import { FilesService } from './files.service';
import { StorageService } from '../storage/storage.service';
import { ZipService } from './zip.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { AllowWorkerSession } from '../integration/auth/allow-worker-session.decorator';
import { AllowIntegrationPrincipal } from '../integration/auth/allow-integration-principal.decorator';
import { RequireIntegrationPermission } from '../integration/auth/require-integration-permission.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import {
  GetFilesQueryDto,
  SearchFilesQueryDto,
  CreatePresignedUrlDto,
  ConfirmUploadDto,
  BatchConfirmUploadDto,
  BatchUploadDto,
  RenameFileDto,
  MoveFileDto,
  BatchMoveFilesDto,
  BatchDeleteFilesDto,
  InitiateMultipartDto,
  MultipartPresignDto,
  DownloadZipDto,
} from './dto/file.dto';
import { GetBadgeCountsQueryDto } from './dto/badge-counts.dto';
import { GetNewFilesQueryDto } from './dto/new-files.dto';
import { MarkDownloadedDto } from './dto/mark-downloaded.dto';
import { isOperationalE2eMockStorageEnabled } from '../common/operational-e2e-env.util';

const GOOGLE_DRIVE_UPLOAD_HOST = 'www.googleapis.com';
const GOOGLE_DRIVE_UPLOAD_PATH = '/upload/drive/v3/files';

@Controller('files')
@UseGuards(ApiKeyGuard, CompanyAccessGuard)
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(
    private readonly filesService: FilesService,
    private readonly storageService: StorageService,
    private readonly zipService: ZipService
  ) {}

  /**
   * GET /files - Get files list with pagination
   */
  @Get()
  @AllowWorkerSession()
  async getFiles(@Query() query: GetFilesQueryDto, @CurrentUser() user: SessionUser) {
    return this.filesService.getFiles(query, user);
  }

  /**
   * GET /files/search - Search files by name
   */
  @Get('search')
  async searchFiles(@Query() query: SearchFilesQueryDto, @CurrentUser() user: SessionUser) {
    return this.filesService.searchFiles(query, user);
  }

  /**
   * GET /files/badge-counts - Get undownloaded file counts
   */
  @Get('badge-counts')
  async getBadgeCounts(@Query() query: GetBadgeCountsQueryDto, @CurrentUser() user: SessionUser) {
    return this.filesService.getBadgeCounts(query, user);
  }

  /**
   * GET /files/new - Get new (undownloaded) files list
   */
  @Get('new')
  async getNewFiles(@Query() query: GetNewFilesQueryDto, @CurrentUser() user: SessionUser) {
    return this.filesService.getNewFiles(query, user);
  }

  /**
   * POST /files/mark-downloaded - Mark files as downloaded
   */
  @Post('mark-downloaded')
  @AllowIntegrationPrincipal()
  async markDownloaded(@Body() dto: MarkDownloadedDto, @CurrentUser() user: SessionUser) {
    return this.filesService.markDownloaded(dto, user);
  }

  /**
   * POST /files/presigned-url - Generate presigned URL for upload
   */
  @Post('presigned-url')
  @AllowIntegrationPrincipal()
  @RequireIntegrationPermission('file/register')
  async getPresignedUrl(@Body() dto: CreatePresignedUrlDto, @CurrentUser() user: SessionUser) {
    return this.filesService.getUploadPresignedUrl(dto, user);
  }

  /**
   * POST /files/batch/upload - Generate batch presigned URLs
   */
  @Post('batch/upload')
  @AllowIntegrationPrincipal()
  @RequireIntegrationPermission('file/register')
  async getBatchPresignedUrls(@Body() dto: BatchUploadDto, @CurrentUser() user: SessionUser) {
    const urls = await this.filesService.getBatchUploadPresignedUrls(dto.files, user);
    return { urls };
  }

  /**
   * POST /files/confirm - Confirm upload and save metadata
   */
  @Post('confirm')
  @AllowIntegrationPrincipal()
  @RequireIntegrationPermission('file/register')
  async confirmUpload(@Body() dto: ConfirmUploadDto, @CurrentUser() user: SessionUser) {
    return this.filesService.confirmUpload(dto, user);
  }

  /**
   * POST /files/batch/confirm - 배치 업로드 확인 (최대 500개)
   * 9000파일 동기화: 18 배치 × 500개 = 18 INSERT 문
   */
  @Post('batch/confirm')
  @AllowIntegrationPrincipal()
  @RequireIntegrationPermission('file/register')
  async batchConfirmUpload(@Body() dto: BatchConfirmUploadDto, @CurrentUser() user: SessionUser) {
    return this.filesService.batchConfirmUpload(dto, user);
  }

  /**
   * PUT /files/google-drive/upload - Browser-safe Google Drive resumable upload proxy
   *
   * Google Drive resumable session URLs created by a service account do not return
   * browser CORS headers. Keep Drive file bytes out of Next.js and stream them
   * through the NestJS API instead.
   */
  @Put('google-drive/upload')
  async proxyGoogleDriveUpload(
    @Headers('x-google-drive-upload-url') uploadUrl: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Headers('content-range') contentRange: string | undefined,
    @Req() req: Request,
    @Res() res: Response
  ) {
    if (!uploadUrl || !this.isGoogleDriveUploadUrl(uploadUrl)) {
      throw new BadRequestException('Invalid Google Drive upload URL');
    }

    if (this.isMockGoogleDriveUploadUrl(uploadUrl)) {
      const storageFileId = this.extractMockGoogleDriveStorageFileId(uploadUrl);
      const size = Number(contentLength ?? 0);
      const metadata = {
        id: storageFileId,
        name: storageFileId,
        mimeType: contentType || 'application/octet-stream',
        size: Number.isFinite(size) && size >= 0 ? size : 0,
        parents: ['operational-e2e-mock-parent'],
        uploadProof: 'operational-e2e-mock-upload-proof',
      };
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(metadata));
      return;
    }

    const headers = new globalThis.Headers();
    headers.set('Content-Type', contentType || 'application/octet-stream');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    if (contentRange) {
      headers.set('Content-Range', contentRange);
    }

    const fetchOptions: RequestInit & { duplex: 'half' } = {
      method: 'PUT',
      headers,
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: 'half',
      cache: 'no-store',
    };

    const startedAt = Date.now();
    let driveResponse: globalThis.Response;
    try {
      driveResponse = await fetch(uploadUrl, fetchOptions);
    } catch (error) {
      this.logger.warn(
        `Drive upload proxy failed: elapsedMs=${Date.now() - startedAt}, contentLength=${contentLength ?? 'unknown'}, error=${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }

    const responseContentType = driveResponse.headers.get('content-type');
    if (responseContentType) {
      res.setHeader('Content-Type', responseContentType);
    }

    const range = driveResponse.headers.get('range');
    if (range) {
      res.setHeader('Range', range);
    }

    res.status(driveResponse.status);
    if (!driveResponse.body) {
      this.logger.log(
        `Drive upload proxy finished: status=${driveResponse.status}, elapsedMs=${
          Date.now() - startedAt
        }, contentLength=${contentLength ?? 'unknown'}, proofIssued=false`
      );
      res.end();
      return;
    }

    const responseBody = await driveResponse.text();
    const proofPayload =
      driveResponse.ok && responseContentType?.includes('application/json')
        ? this.buildDriveUploadProofResponse(responseBody)
        : null;

    if (proofPayload) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(JSON.stringify(proofPayload));
    } else {
      res.send(responseBody);
    }

    this.logger.log(
      `Drive upload proxy finished: status=${driveResponse.status}, elapsedMs=${
        Date.now() - startedAt
      }, contentLength=${contentLength ?? 'unknown'}, proofIssued=${Boolean(proofPayload)}`
    );

    if (!driveResponse.ok) {
      this.logger.warn(
        `Drive upload proxy returned non-2xx: status=${driveResponse.status}, elapsedMs=${
          Date.now() - startedAt
        }`
      );
    }
  }

  /**
   * GET /files/:id/download - Get download URL
   */
  @Get(':id/download/stream')
  @AllowWorkerSession()
  async streamDownload(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Res() res: Response
  ) {
    const download = await this.filesService.getDownloadStream(id, user);
    const encodedName = encodeURIComponent(download.fileName);
    res.set({
      'Content-Type': download.mimeType,
      'Content-Length': String(download.size),
      'Content-Disposition': `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
    });
    download.stream.pipe(res);
  }

  /**
   * GET /files/:id/download - Get download URL
   */
  @Get(':id/download')
  @AllowWorkerSession()
  async getDownloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.filesService.getDownloadUrl(id, user);
  }

  /**
   * PATCH /files/:id/rename - Rename file
   */
  @Patch(':id/rename')
  async renameFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameFileDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.filesService.renameFile(id, dto, user);
  }

  /**
   * PATCH /files/:id/move - Move file to another folder
   */
  @Patch(':id/move')
  async moveFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveFileDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.filesService.moveFile(id, dto, user);
  }

  /**
   * POST /files/batch/move - Batch move files
   */
  @Post('batch/move')
  async batchMoveFiles(@Body() dto: BatchMoveFilesDto, @CurrentUser() user: SessionUser) {
    return this.filesService.batchMoveFiles(dto, user);
  }

  /**
   * DELETE /files/:id - Soft delete file (move to trash)
   */
  @Delete(':id')
  async deleteFile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    await this.filesService.deleteFile(id, user);
    return { success: true };
  }

  /**
   * POST /files/batch/delete - Batch soft delete files
   */
  @Post('batch/delete')
  async batchDeleteFiles(@Body() dto: BatchDeleteFilesDto, @CurrentUser() user: SessionUser) {
    return this.filesService.batchDeleteFiles(dto, user);
  }

  /**
   * POST /files/batch/download-zip - ZIP 압축 다운로드 (최대 100개)
   */
  @Post('batch/download-zip')
  async downloadZip(
    @Body() body: DownloadZipDto,
    @CurrentUser() user: SessionUser,
    @Res() res: Response
  ) {
    const files = await this.filesService.getFilesForZip(body.fileIds, user);
    const archive = await this.zipService.createZipStream(files);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="download-${Date.now()}.zip"`,
    });

    archive.pipe(res);
  }

  // ============ Multipart Upload Endpoints ============

  private buildDriveUploadProofResponse(
    responseBody: string
  ): (Record<string, unknown> & { uploadProof: string }) | null {
    try {
      const metadata = JSON.parse(responseBody) as {
        id?: unknown;
        name?: unknown;
        mimeType?: unknown;
        size?: unknown;
        parents?: unknown;
      };
      if (
        typeof metadata.id !== 'string' ||
        typeof metadata.mimeType !== 'string' ||
        !Array.isArray(metadata.parents)
      ) {
        return null;
      }

      const parentStorageFolderIds = metadata.parents.filter(
        (parent): parent is string => typeof parent === 'string'
      );
      if (parentStorageFolderIds.length === 0) {
        return null;
      }

      const size = Number(metadata.size ?? 0);
      if (!Number.isFinite(size) || size < 0) {
        return null;
      }

      const uploadProof = this.storageService.createDriveUploadProof({
        provider: StorageProvider.GOOGLE_DRIVE,
        storageFileId: metadata.id,
        name: typeof metadata.name === 'string' ? metadata.name : metadata.id,
        mimeType: metadata.mimeType,
        size,
        parentStorageFolderIds,
      });

      return { ...metadata, uploadProof };
    } catch {
      return null;
    }
  }

  /**
   * Verify the storage key belongs to the current user's company.
   * Key format: webhard/company-{id}/... or webhard/admin/...
   */
  private verifyKeyOwnership(key: string, user: SessionUser): void {
    if (user.userType === 'admin') return;

    const match = key.match(/^webhard\/company-(\d+)\//);
    if (!match) {
      throw new ForbiddenException('Invalid storage key path');
    }

    if (Number(match[1]) !== user.companyId) {
      throw new ForbiddenException('Access denied to this storage path');
    }
  }

  private isGoogleDriveUploadUrl(value: string): boolean {
    if (this.isMockGoogleDriveUploadUrl(value)) {
      return true;
    }

    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.hostname === GOOGLE_DRIVE_UPLOAD_HOST &&
        url.pathname === GOOGLE_DRIVE_UPLOAD_PATH &&
        url.searchParams.get('uploadType') === 'resumable'
      );
    } catch {
      return false;
    }
  }

  private isMockGoogleDriveUploadUrl(value: string): boolean {
    if (!isOperationalE2eMockStorageEnabled()) {
      return false;
    }

    try {
      const url = new URL(value);
      return (
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
        url.pathname.startsWith('/mock-drive-upload/')
      );
    } catch {
      return false;
    }
  }

  private extractMockGoogleDriveStorageFileId(value: string): string {
    try {
      const url = new URL(value);
      return url.pathname.split('/').filter(Boolean).pop() || 'operational-e2e-mock-file';
    } catch {
      return 'operational-e2e-mock-file';
    }
  }

  /**
   * POST /files/multipart/initiate - 멀티파트 업로드 시작
   * key: 경로 탈출 문자(.., //, \) 및 제어 문자 차단
   */
  @Post('multipart/initiate')
  async initiateMultipartUpload(
    @Body() body: InitiateMultipartDto,
    @CurrentUser() user: SessionUser
  ) {
    this.verifyKeyOwnership(body.key, user);
    return this.storageService.initiateMultipartUpload(body.key, body.contentType);
  }

  /**
   * POST /files/multipart/presign - 파트별 Presigned URL 생성
   * partNumber: 1~10000 범위 강제 (R2/S3 제한)
   */
  @Post('multipart/presign')
  async getMultipartPresignedUrl(
    @Body() body: MultipartPresignDto,
    @CurrentUser() user: SessionUser
  ) {
    this.verifyKeyOwnership(body.key, user);
    const url = await this.storageService.getMultipartPresignedUrl(
      body.key,
      body.uploadId,
      body.partNumber
    );
    return { url };
  }

  /**
   * POST /files/multipart/complete - 멀티파트 업로드 완료
   */
  @Post('multipart/complete')
  async completeMultipartUpload(
    @Body() body: { key: string; uploadId: string; parts: { PartNumber: number; ETag: string }[] },
    @CurrentUser() user: SessionUser
  ) {
    this.verifyKeyOwnership(body.key, user);
    await this.storageService.completeMultipartUpload(body.key, body.uploadId, body.parts);
    return { success: true };
  }

  /**
   * POST /files/multipart/abort - 멀티파트 업로드 취소
   */
  @Post('multipart/abort')
  async abortMultipartUpload(
    @Body() body: { key: string; uploadId: string },
    @CurrentUser() user: SessionUser
  ) {
    this.verifyKeyOwnership(body.key, user);
    await this.storageService.abortMultipartUpload(body.key, body.uploadId);
    return { success: true };
  }
}
