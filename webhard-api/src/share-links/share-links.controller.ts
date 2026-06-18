import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Res,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { StorageProvider } from '@prisma/client';
import { ShareLinksService } from './share-links.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { AllowIntegrationPrincipal } from '../integration/auth/allow-integration-principal.decorator';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { ValidateShareLinkDto } from './dto/validate-share-link.dto';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import { StorageService } from '../storage/storage.service';

@Controller('share-links')
@UseGuards(ApiKeyGuard, CompanyAccessGuard)
export class ShareLinksController {
  private readonly logger = new Logger(ShareLinksController.name);

  constructor(
    private readonly shareLinksService: ShareLinksService,
    private readonly storageService: StorageService
  ) {}

  /**
   * POST /api/v1/share-links/validate
   * 공유 링크 검증 및 다운로드 카운트 증가 (토큰 기반 — 인증 불필요)
   */
  @Post('validate')
  @AllowIntegrationPrincipal()
  @HttpCode(HttpStatus.OK)
  async validateAndIncrement(@Body() dto: ValidateShareLinkDto) {
    return this.shareLinksService.validateAndIncrement(dto.token);
  }

  /**
   * POST /api/v1/share-links/download/stream
   * 공개 공유 토큰을 검증한 뒤 해당 파일만 stream으로 내려준다.
   */
  @Post('download/stream')
  @AllowIntegrationPrincipal()
  async downloadSharedStream(@Body() dto: ValidateShareLinkDto, @Res() res: Response) {
    const result = await this.shareLinksService.validateAndIncrement(dto.token);
    if (!result.is_valid) {
      throw new ForbiddenException(result.error_message || '유효하지 않은 공유 링크입니다.');
    }

    if (!result.file_path || !result.file_name) {
      throw new BadRequestException('공유 링크 파일 정보가 올바르지 않습니다.');
    }

    const provider =
      result.storage_provider === StorageProvider.GOOGLE_DRIVE
        ? StorageProvider.GOOGLE_DRIVE
        : StorageProvider.R2;
    const download = await this.storageService.downloadWebhardFile({
      storageProvider: provider,
      driveFileId: result.drive_file_id ?? null,
      path: result.file_path,
    });

    const encodedName = encodeURIComponent(result.file_name);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`
    );

    if ('stream' in download) {
      res.setHeader('Content-Type', download.mimeType);
      res.setHeader('Content-Length', String(download.size));
      download.stream.pipe(res);
      return;
    }

    const response = await fetch(download.url);
    if (!response.ok || !response.body) {
      this.logger.warn('Shared R2 download URL fetch failed', {
        status: response.status,
      });
      throw new BadRequestException('공유 링크 다운로드에 실패했습니다.');
    }

    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'application/octet-stream'
    );
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          res.write(Buffer.from(value));
        }
      }
      res.end();
    } catch (error) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }

  /**
   * GET /api/v1/share-links
   * 공유 링크 목록 조회 — company 사용자는 자기 회사만
   */
  @Get()
  async findAll(@Query('companyId') companyId?: string, @CurrentUser() user?: SessionUser) {
    // company 사용자: 자기 회사 공유 링크만 조회 가능
    const effectiveCompanyId =
      user?.userType === 'company'
        ? user.companyId
        : companyId
          ? parseInt(companyId, 10)
          : undefined;
    return this.shareLinksService.findAll(effectiveCompanyId ?? undefined);
  }

  /**
   * POST /api/v1/share-links
   * 공유 링크 생성 — company 사용자는 자기 회사만
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateShareLinkDto, @CurrentUser() user?: SessionUser) {
    const createDto =
      user?.userType === 'company' && user.companyId ? { ...dto, companyId: user.companyId } : dto;
    return this.shareLinksService.create(createDto, user);
  }
}
