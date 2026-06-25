import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  DefaultValuePipe,
  Param,
  Body,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { AllowWorkerSession } from '../integration/auth/allow-worker-session.decorator';
import { RequireIntegrationPermission } from '../integration/auth/require-integration-permission.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import { Public } from '../integration/auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ContactsService } from './contacts.service';
import type { ContactDriveUploadFields, UploadedContactDriveFile } from './contacts.service';
import { ContactTimelineService } from './contact-timeline.service';
import { DrawingRevisionService } from './drawing-revision.service';
import { WorkerContactAccessService } from '../worker-access/worker-contact-access.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { CreateWorkerNoteDto } from './dto/create-worker-note.dto';
import { BatchStartDeliveryDto } from './dto/batch-start-delivery.dto';
import { BatchCompleteDeliveryDto } from './dto/batch-complete-delivery.dto';
import {
  UpdateContactDto,
  UpdateStatusDto,
  UpdateProcessStageDto,
  UpdateInquiryTypeDto,
  AcknowledgeBadgeDto,
  CompleteLaserDto,
  DeleteContactDto,
} from './dto/update-contact.dto';
import {
  CreateDrawingRevisionDto,
  GetDrawingRevisionUploadUrlsDto,
  UpdateDrawingRevisionVisibilityDto,
} from './dto/drawing-revision.dto';
import { QueryContactDto, CompanyContactsQueryDto, CountContactDto } from './dto/query-contact.dto';
import { CompanyDrawingUploadDto, LinkWebhardFileDto } from './dto/company-drawing.dto';
import { SplitContactDto } from './dto/split-contact.dto';
import { ToggleStageCompletedDto } from './dto/toggle-stage-completed.dto';
import { AdvanceSplitGroupStageDto } from './dto/advance-split-group-stage.dto';

type ContactActorType = 'admin' | 'company' | 'worker' | 'system';

interface RequestedActor {
  actorType?: string;
  actorName?: string;
  companyName?: string;
}

interface ResolvedActor {
  actorType: ContactActorType;
  actorName?: string;
  companyName?: string;
}

@Controller('contacts')
@UseGuards(ApiKeyGuard)
export class ContactsController {
  private readonly logger = new Logger(ContactsController.name);

  constructor(
    private contactsService: ContactsService,
    private timelineService: ContactTimelineService,
    private drawingRevisionService: DrawingRevisionService,
    private prisma: PrismaService,
    private _storageService: StorageService,
    private workerContactAccessService: WorkerContactAccessService
  ) {}

  /**
   * GET /api/v1/contacts/status-counts
   * 상태별 카운트 (RPC get_status_counts 대체)
   */
  @Get('status-counts')
  @RequireIntegrationPermission('job/read')
  async getStatusCounts(@CurrentUser() user: SessionUser, @Query('search') search?: string) {
    this.assertAdminOrIntegration(user);
    return this.contactsService.getStatusCounts(search);
  }

  /**
   * GET /api/v1/contacts/analytics/stage-duration
   * 공정별 소요시간 분석
   */
  @Get('analytics/stage-duration')
  @RequireIntegrationPermission('job/read')
  async getStageDuration(
    @CurrentUser() user: SessionUser,
    @Query('companyName') companyName?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string
  ) {
    this.assertAdminOrIntegration(user);
    return this.timelineService.getStageDurationAnalytics({ companyName, dateFrom, dateTo });
  }

  /**
   * GET /api/v1/contacts/count
   * 조건부 카운트
   */
  @Get('count')
  @RequireIntegrationPermission('job/read')
  async count(@Query() query: CountContactDto, @CurrentUser() user: SessionUser) {
    this.assertAdminOrIntegration(user);
    const count = await this.contactsService.count(query);
    return { count };
  }

  /**
   * GET /api/v1/contacts/recent-ids
   * 최근 문의 ID 목록
   */
  @Get('recent-ids')
  @RequireIntegrationPermission('job/read')
  async getRecentIds(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrIntegration(user);
    const ids = await this.contactsService.getRecentIds(limit);
    return { ids };
  }

  /**
   * GET /api/v1/contacts/by-work-number
   * 작업번호(F-번호)로 문의 조회
   */
  @Get('by-work-number')
  @RequireIntegrationPermission('job/read')
  async findByWorkNumber(
    @Query('workNumber') workNumber: string,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrIntegration(user);
    const normalizedWorkNumber = workNumber?.trim();
    if (!normalizedWorkNumber) {
      throw new BadRequestException('workNumber 파라미터가 필요합니다.');
    }
    const contact = await this.contactsService.findByWorkNumber(normalizedWorkNumber);
    return { contact };
  }

  /**
   * GET /api/v1/contacts/by-inquiry-number
   * 문의번호(O-번호)로 문의 조회
   */
  @Get('by-inquiry-number')
  @RequireIntegrationPermission('job/read')
  async findByInquiryNumber(
    @Query('inquiryNumber') inquiryNumber: string,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrIntegration(user);
    const normalizedInquiryNumber = inquiryNumber?.trim();
    if (!normalizedInquiryNumber) {
      throw new BadRequestException('inquiryNumber 파라미터가 필요합니다.');
    }
    const contact = await this.contactsService.findByInquiryNumber(normalizedInquiryNumber);
    return { contact };
  }

  /**
   * GET /api/v1/contacts/by-company
   * 업체별 문의 목록 조회
   */
  @Get('by-company')
  @RequireIntegrationPermission('job/read')
  async findByCompany(@Query() query: CompanyContactsQueryDto, @CurrentUser() user: SessionUser) {
    this.assertAdminOrIntegration(user);
    return this.contactsService.findByCompany(query);
  }

  /**
   * POST /api/v1/contacts/cleanup
   * 10일 지난 삭제 건 영구삭제
   */
  @Post('cleanup')
  async cleanup(@CurrentUser() user: SessionUser) {
    this.assertAdmin(user);
    return this.contactsService.cleanup();
  }

  /**
   * POST /api/v1/contacts/find-duplicate
   * 중복 체크 (company_name + original_filename)
   */
  @Post('find-duplicate')
  @RequireIntegrationPermission('job/read')
  async findDuplicate(
    @Body('companyName') companyName: string,
    @Body('originalFilename') originalFilename: string,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrIntegration(user);
    const contact = await this.contactsService.findDuplicate(companyName, originalFilename);
    return { exists: !!contact, contactId: contact?.id ?? null };
  }

  /**
   * DELETE /api/v1/contacts/batch-by-pattern
   * 배치 삭제 (company_name 패턴)
   */
  @Delete('batch-by-pattern')
  async deleteBatchByPattern(@Body('pattern') pattern: string, @CurrentUser() user: SessionUser) {
    this.assertAdmin(user);
    return this.contactsService.deleteBatchByCompanyPattern(pattern);
  }

  /**
   * GET /api/v1/contacts/distinct-companies
   * 고유 업체명 목록 조회
   */
  @Get('distinct-companies')
  @RequireIntegrationPermission('job/read')
  async getDistinctCompanies(
    @Query('status') status: string | undefined,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrIntegration(user);
    const companies = await this.contactsService.getDistinctCompanyNames(status);
    return { companies };
  }

  /**
   * DELETE /api/v1/contacts/delete-all
   * 모든 문의 삭제 (개발 서버 전용)
   */
  @Delete('delete-all')
  async deleteAll(@CurrentUser() user: SessionUser) {
    this.assertAdmin(user);
    this.logger.warn('DELETE ALL contacts requested');
    return this.contactsService.deleteAll();
  }

  /**
   * POST /api/v1/contacts/batch-start-delivery/drive-proof
   * 납품증빙 파일을 각 문의 Drive 폴더에 저장하고 일괄 납품 완료 처리한다.
   */
  @Post('batch-start-delivery/drive-proof')
  @AllowWorkerSession()
  @UseInterceptors(FileInterceptor('file'))
  async batchStartDeliveryWithDriveProof(
    @Body('contactIds') contactIdsRaw: string,
    @Body('actorType') actorType: string | undefined,
    @Body('actorName') actorName: string | undefined,
    @UploadedFile() file: UploadedContactDriveFile | undefined,
    @CurrentUser() user: SessionUser
  ) {
    const contactIds = this.parseContactIds(contactIdsRaw);
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContacts(user, contactIds);

    if (!file) {
      throw new BadRequestException('납품증빙 파일이 필요합니다.');
    }

    const dto = new BatchStartDeliveryDto();
    dto.contactIds = contactIds;
    dto.deliveryProofOriginalName = file.originalname;
    dto.deliveryProofFileSize = file.size;
    dto.deliveryProofMimeType = file.mimetype || 'application/octet-stream';
    dto.actorType = actorType;
    dto.actorName = actorName;

    const actor = this.resolveMutationActor(user, dto);
    if (actor) {
      dto.actorType = actor.actorType;
      dto.actorName = actor.actorName;
    }

    return this.contactsService.batchStartDeliveryWithDriveProof(dto, file);
  }

  /**
   * POST /api/v1/contacts/batch-start-delivery
   * 일괄 납품 시작 (status → delivering)
   */
  @Post('batch-start-delivery')
  @AllowWorkerSession()
  async batchStartDelivery(@Body() dto: BatchStartDeliveryDto, @CurrentUser() user: SessionUser) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContacts(user, dto.contactIds);
    const actor = this.resolveMutationActor(user, dto);
    if (actor) {
      dto.actorType = actor.actorType;
      dto.actorName = actor.actorName;
    }
    return this.contactsService.batchStartDelivery(dto);
  }

  /**
   * POST /api/v1/contacts/batch-complete-delivery
   * 일괄 납품 완료 (delivering → delivered, processStage → null)
   */
  @Post('batch-complete-delivery')
  @AllowWorkerSession()
  async batchCompleteDelivery(
    @Body() dto: BatchCompleteDeliveryDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContacts(user, dto.contactIds);
    const actor = this.resolveMutationActor(user, dto);
    if (actor) {
      dto.actorType = actor.actorType;
      dto.actorName = actor.actorName;
    }
    return this.contactsService.batchCompleteDelivery(dto);
  }

  /**
   * GET /api/v1/contacts/drawing-revisions/:revisionId
   * 도면 수정 이력 접근 제어 메타데이터
   */
  @Get('drawing-revisions/:revisionId')
  @AllowWorkerSession()
  async getDrawingRevisionAccessInfo(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: SessionUser
  ) {
    const info = await this.assertDrawingRevisionFileAccess(revisionId, user);
    return info;
  }

  /**
   * GET /api/v1/contacts/drawing-revisions/:revisionId/download
   * 도면 파일 다운로드 URL
   */
  @Get('drawing-revisions/:revisionId/download')
  @AllowWorkerSession()
  async getDrawingRevisionDownloadUrl(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Query('fileIndex') fileIndex: string | undefined,
    @CurrentUser() user: SessionUser
  ) {
    await this.assertDrawingRevisionFileAccess(revisionId, user);
    const index = fileIndex != null ? parseInt(fileIndex, 10) : 0;
    return this.drawingRevisionService.getRevisionDownloadUrl(revisionId, index);
  }

  /**
   * PATCH /api/v1/contacts/drawing-revisions/:revisionId/visibility
   * 공개 여부 변경
   */
  @Patch('drawing-revisions/:revisionId/visibility')
  async updateDrawingRevisionVisibility(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: UpdateDrawingRevisionVisibilityDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdmin(user);
    return this.drawingRevisionService.updateVisibility(revisionId, dto.isPublic);
  }

  /**
   * GET /api/v1/contacts
   * 문의 목록 조회
   */
  @Get()
  @RequireIntegrationPermission('job/read')
  async findAll(@Query() query: QueryContactDto, @CurrentUser() user: SessionUser) {
    this.assertAdminOrIntegration(user);
    return this.contactsService.findAll(query);
  }

  /**
   * POST /api/v1/contacts/:id/files/drive
   * 공개 문의 생성 후 첨부/도면/참고사진을 Google Drive 문의 폴더에 저장한다.
   */
  @Post(':id/files/drive')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'attachment', maxCount: 1 },
      { name: 'drawing_file', maxCount: 1 },
      { name: 'reference_photos', maxCount: 10 },
    ])
  )
  async uploadContactFilesToDrive(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: ContactDriveUploadFields
  ) {
    return this.contactsService.uploadContactFilesToDrive(id, files ?? {});
  }

  /**
   * POST /api/v1/contacts/:id/revision-request-file/drive
   * 수정요청 첨부 파일을 Google Drive 문의 폴더에 저장한다.
   */
  @Post(':id/revision-request-file/drive')
  @UseInterceptors(FileInterceptor('file'))
  async uploadRevisionRequestFileToDrive(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedContactDriveFile | undefined
  ) {
    if (!file) {
      throw new BadRequestException('수정요청 첨부 파일이 필요합니다.');
    }
    return this.contactsService.uploadRevisionRequestFileToDrive(id, file);
  }

  /**
   * GET /api/v1/contacts/:id/drawing-download
   * 첨부파일 다운로드 (presigned URL) — 관리자 전용
   */
  @Get(':id/drawing-download')
  @UseGuards(AdminGuard)
  async getDrawingDownload(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactsService.getDrawingDownloadUrl(id);
  }

  /**
   * GET /api/v1/contacts/:id/file-download
   * 파일 타입별 presigned URL 다운로드 — 관리자 전용
   */
  @Get(':id/file-download')
  @UseGuards(AdminGuard)
  async getFileDownload(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type: string,
    @Query('index') indexStr?: string
  ) {
    const index = indexStr != null ? parseInt(indexStr, 10) : undefined;
    return this.contactsService.getFileDownloadUrl(id, type, index);
  }

  /**
   * GET /api/v1/contacts/:id/webhard-info
   * 웹하드 연동 정보 조회 — 관리자 전용
   */
  @Get(':id/webhard-info')
  @UseGuards(AdminGuard)
  async getWebhardInfo(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactsService.getWebhardInfo(id);
  }

  /**
   * GET /api/v1/contacts/:id/latest-drawing
   * 현재 공정 단계 기준 최신 도면 조회
   */
  @Get(':id/latest-drawing')
  @AllowWorkerSession()
  async getLatestDrawing(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    await this.assertLatestDrawingAccess(id, user);
    const drawing = await this.drawingRevisionService.getLatestForCurrentStage(id, {
      includePrivate: user.userType !== 'company',
    });
    return { drawing: drawing ?? null };
  }

  /**
   * GET /api/v1/contacts/:id/latest-drawing-url
   * 최신 도면 다운로드 URL — 마지막 업로드 리비전 우선, 없으면 contact.drawingFileUrl fallback
   */
  @Get(':id/latest-drawing-url')
  @AllowWorkerSession()
  async getLatestDrawingUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser
  ): Promise<{ url: string; fileName: string }> {
    await this.assertLatestDrawingAccess(id, user);
    const revision = await this.drawingRevisionService.getLatestUploaded(id, {
      includePrivate: user.userType !== 'company',
    });
    if (revision) {
      return this.drawingRevisionService.getRevisionDownloadUrl(revision.id, 0);
    }
    if (user.userType === 'company') {
      throw new NotFoundException('도면이 없습니다.');
    }
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      select: {
        drawingFileUrl: true,
      },
    });
    if (!contact?.drawingFileUrl) {
      throw new NotFoundException('도면이 없습니다.');
    }
    return this.contactsService.getDrawingDownloadUrl(id);
  }

  /**
   * GET /api/v1/contacts/:id/drawing-revisions
   * 도면 수정 이력 조회
   */
  @Get(':id/drawing-revisions')
  @AllowWorkerSession()
  async getDrawingRevisions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includePrivate') includePrivate: string | undefined,
    @CurrentUser() user: SessionUser
  ) {
    await this.assertDrawingRevisionAccess(id, user);
    const shouldIncludePrivate = user.userType === 'company' ? false : includePrivate !== 'false';
    return this.drawingRevisionService.getRevisions(id, {
      includePrivate: shouldIncludePrivate,
    });
  }

  /**
   * POST /api/v1/contacts/:id/drawing-revisions
   * 도면 수정 등록
   */
  @Post(':id/drawing-revisions')
  @AllowWorkerSession()
  async createDrawingRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDrawingRevisionDto,
    @CurrentUser() user: SessionUser
  ) {
    const actor = await this.resolveDrawingRevisionActor(id, user, dto);
    const result = await this.drawingRevisionService.createRevision(id, dto, {
      actorType: actor.actorType,
      actorName: actor.actorName ?? actor.actorType,
    });
    return { ...result.revision, webhardWarning: result.webhardWarning };
  }

  /**
   * POST /api/v1/contacts/:id/drawing-revisions/upload-urls
   * 도면 업로드 presigned URL
   */
  @Post(':id/drawing-revisions/upload-urls')
  @AllowWorkerSession()
  async getDrawingRevisionUploadUrls(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GetDrawingRevisionUploadUrlsDto,
    @CurrentUser() user: SessionUser
  ) {
    await this.assertDrawingRevisionAccess(id, user);
    return this.drawingRevisionService.getUploadPresignedUrls(id, dto.files);
  }

  /**
   * POST /api/v1/contacts/:id/company-drawing
   * 거래처가 문의에 도면을 업로드한다.
   */
  @Post(':id/company-drawing')
  @UseGuards(CompanyAccessGuard)
  async uploadCompanyDrawing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompanyDrawingUploadDto,
    @CurrentUser() user: SessionUser
  ) {
    const companyName = await this.resolveCompanyName(user, dto.companyName);
    const contact = await this.contactsService.verifyCompanyOwnership(id, companyName);

    const PURPOSE_TO_REASON: Record<string, string> = {
      revision_submit: 'revision_request',
      mold_request: 'field_correction',
      other: 'other',
    };

    const revisionResult = await this.drawingRevisionService.createRevision(
      id,
      {
        reason: PURPOSE_TO_REASON[dto.purpose],
        files: dto.files,
        note: dto.note,
        source: 'manual',
        processStage: contact.processStage ?? undefined,
      },
      { actorType: 'company', actorName: companyName }
    );

    // Contact drawingFileUrl 업데이트
    const drawingUpdate: {
      drawingFileUrl?: string | null;
      drawingFileName?: string | null;
      processStage?: string;
      confirmedAt?: Date;
    } = {
      drawingFileUrl: dto.files[0]?.url ?? null,
      drawingFileName: dto.files[0]?.name ?? null,
    };

    // mold_request → processStage = drawing_confirmed
    if (dto.purpose === 'mold_request') {
      drawingUpdate.processStage = 'drawing_confirmed';
      drawingUpdate.confirmedAt = new Date();

      await this.timelineService
        .recordChange({
          contactId: id,
          changeType: 'process_stage_change',
          fromStage: contact.processStage,
          toStage: 'drawing_confirmed',
          actorType: 'company',
          actorName: companyName,
          source: 'manual',
        })
        .catch((err) => {
          this.logger.error(
            `Timeline record failed: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    await this.contactsService.updateContactDrawingFields(id, drawingUpdate);

    return { ...revisionResult.revision, webhardWarning: revisionResult.webhardWarning };
  }

  /**
   * POST /api/v1/contacts/:id/link-webhard-file
   * 웹하드에 업로드된 파일을 문의에 연결한다.
   */
  @Post(':id/link-webhard-file')
  @UseGuards(CompanyAccessGuard)
  async linkWebhardFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkWebhardFileDto,
    @CurrentUser() user: SessionUser
  ) {
    const companyName = await this.resolveCompanyName(user, dto.companyName);
    const contact = await this.contactsService.verifyCompanyOwnership(id, companyName);

    // WebhardFile 조회 — 존재 + 미삭제 확인
    const webhardFile = await this.contactsService.findWebhardFileOrFail(dto.fileId);

    // 거래처 사용자: WebhardFile의 companyId 일치 확인
    if (user.userType !== 'admin' && user.companyId !== webhardFile.companyId) {
      throw new ForbiddenException('해당 파일에 대한 접근 권한이 없습니다.');
    }

    const PURPOSE_TO_REASON: Record<string, string> = {
      revision_submit: 'revision_request',
      mold_request: 'field_correction',
      other: 'other',
    };

    const revisionResult2 = await this.drawingRevisionService.createRevision(
      id,
      {
        reason: PURPOSE_TO_REASON[dto.purpose],
        files: [
          {
            url: webhardFile.path,
            name: webhardFile.name,
            size: Number(webhardFile.size),
            mimeType: webhardFile.mimeType,
          },
        ],
        source: 'manual',
        processStage: contact.processStage ?? undefined,
      },
      { actorType: 'company', actorName: companyName }
    );

    // Contact drawingFileUrl 업데이트
    const drawingUpdate2: {
      drawingFileUrl?: string | null;
      drawingFileName?: string | null;
      processStage?: string;
      confirmedAt?: Date;
    } = {
      drawingFileUrl: webhardFile.path,
      drawingFileName: webhardFile.name,
    };

    if (dto.purpose === 'mold_request') {
      drawingUpdate2.processStage = 'drawing_confirmed';
      drawingUpdate2.confirmedAt = new Date();

      await this.timelineService
        .recordChange({
          contactId: id,
          changeType: 'process_stage_change',
          fromStage: contact.processStage,
          toStage: 'drawing_confirmed',
          actorType: 'company',
          actorName: companyName,
          source: 'manual',
        })
        .catch((err) => {
          this.logger.error(
            `Timeline record failed: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    await this.contactsService.updateContactDrawingFields(id, drawingUpdate2);

    // WebhardFile.inquiryNumber 업데이트 (연결 표시)
    await this.contactsService.updateWebhardFileInquiryNumber(dto.fileId, contact.inquiryNumber);

    return { ...revisionResult2.revision, webhardWarning: revisionResult2.webhardWarning };
  }

  /**
   * POST /api/v1/contacts/:id/merge-drawing-from/:sourceId
   * sourceId의 도면을 현재 문의(id)로 복사하고, sourceId를 soft delete
   */
  @Post(':id/merge-drawing-from/:sourceId')
  @UseGuards(AdminGuard)
  async mergeDrawingFrom(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string
  ) {
    return this.contactsService.mergeDrawingsFromSource(id, sourceId);
  }

  /**
   * POST /api/v1/contacts/:id/split
   * 문의 분할 (N개 하위 문의 생성)
   */
  @Post(':id/split')
  @AllowWorkerSession()
  async splitContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SplitContactDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const children = await this.contactsService.splitContact(id, dto);
    const parent = await this.contactsService.findOne(id);
    return { parent, children };
  }

  /**
   * GET /api/v1/contacts/:id/children
   * 하위 문의 목록 조회
   */
  @Get(':id/children')
  @RequireIntegrationPermission('job/read')
  async getChildren(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    this.assertAdminOrIntegration(user);
    return this.contactsService.getChildren(id);
  }

  /**
   * PATCH /api/v1/contacts/:id/stage-completed
   * 단계 완료 체크 토글
   */
  @Patch(':id/stage-completed')
  @AllowWorkerSession()
  async toggleStageCompleted(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleStageCompletedDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    return this.contactsService.toggleStageCompleted(id, dto);
  }

  /**
   * POST /api/v1/contacts/:id/children/advance-stage
   * 그룹 일괄 다음 단계 이동
   */
  @Post(':id/children/advance-stage')
  @AllowWorkerSession()
  async advanceSplitGroupStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdvanceSplitGroupStageDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const actor = this.resolveMutationActor(user, dto);
    if (actor) {
      dto.actorType = actor.actorType;
      dto.actorName = actor.actorName;
    }
    return this.contactsService.advanceSplitGroupStage(id, dto);
  }

  /**
   * GET /api/v1/contacts/:id
   * 문의 단건 조회
   */
  @Get(':id')
  @RequireIntegrationPermission('job/read')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    this.assertAdminOrIntegration(user);
    return this.contactsService.findOne(id);
  }

  /**
   * POST /api/v1/contacts
   * 문의 생성 (공개 폼 제출 — 인증 불필요)
   */
  @Public()
  @Post()
  async create(@Body() dto: CreateContactDto) {
    return this.contactsService.create(dto);
  }

  /**
   * PATCH /api/v1/contacts/:id
   * 문의 수정
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdmin(user);
    return this.contactsService.update(id, dto);
  }

  /**
   * PATCH /api/v1/contacts/:id/status
   * 상태 변경
   */
  @Patch(':id/status')
  @AllowWorkerSession()
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const actor = this.resolveMutationActor(user, dto);
    return this.contactsService.updateStatus(id, dto.status, actor);
  }

  /**
   * PATCH /api/v1/contacts/:id/process-stage
   * 공정 단계 변경
   */
  @Patch(':id/process-stage')
  @AllowWorkerSession()
  async updateProcessStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessStageDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const actor = this.resolveMutationActor(user, dto);
    return this.contactsService.updateProcessStage(id, dto.processStage ?? null, actor);
  }

  /**
   * POST /api/v1/contacts/:id/complete-laser
   * 레이저 전용 문의 완료 처리
   */
  @Post(':id/complete-laser')
  @AllowWorkerSession()
  async completeLaser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteLaserDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const actor = this.resolveMutationActor(user, dto);
    return this.contactsService.completeLaserOnlyContact(id, actor);
  }

  /**
   * GET /api/v1/contacts/:id/notes
   * 작업자 노트 목록 조회
   */
  @Get(':id/notes')
  @RequireIntegrationPermission('job/read')
  async getWorkerNotes(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    this.assertAdminOrIntegration(user);
    return this.contactsService.getWorkerNotes(id);
  }

  /**
   * POST /api/v1/contacts/:id/notes
   * 작업자 노트 추가 (최대 3개)
   */
  @Post(':id/notes')
  @AllowWorkerSession()
  async addWorkerNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkerNoteDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const data =
      user.userType === 'worker' ? { ...dto, createdBy: this.getWorkerActorName(user) } : dto;
    return this.contactsService.addWorkerNote(id, data);
  }

  /**
   * DELETE /api/v1/contacts/:id/notes/:noteId
   * 작업자 노트 삭제
   */
  @Delete(':id/notes/:noteId')
  @AllowWorkerSession()
  async deleteWorkerNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseIntPipe) noteId: number,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    return this.contactsService.deleteWorkerNote(id, noteId);
  }

  /**
   * PATCH /api/v1/contacts/:id/toggle-urgent
   * 긴급 토글
   */
  @Patch(':id/toggle-urgent')
  @AllowWorkerSession()
  async toggleUrgent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const actor =
      this.resolveMutationActor(user, {}) ??
      ({
        actorType: 'admin',
        actorName: String(user.userId),
      } satisfies ResolvedActor);
    return this.contactsService.toggleUrgent(id, actor);
  }

  /**
   * GET /api/v1/contacts/:id/timeline
   * 통합 타임라인 조회 (ContactStatusHistory + DrawingRevision 인터리브)
   *
   * 거래처 세션일 때는 서버에서 필터링(isPublic=false 제외, actorName 마스킹,
   * note 제거, status_change 화이트리스트 적용). 클라이언트가 forCompany 쿼리를
   * 넘기더라도 무시한다 — 세션 타입에서만 결정한다.
   */
  @Get(':id/timeline')
  @RequireIntegrationPermission('job/read')
  async getTimeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    const forCompany = user?.userType === 'company';

    if (forCompany) {
      if (!user.companyId) {
        throw new ForbiddenException('업체 정보가 없습니다.');
      }
      const companyName = await this.contactsService.getCompanyNameByCompanyId(user.companyId);
      await this.contactsService.verifyCompanyOwnership(id, companyName);
    }

    const timeline = await this.timelineService.getTimeline(id, { forCompany });
    return { timeline };
  }

  /**
   * PATCH /api/v1/contacts/:id/inquiry-type
   * 문의 유형 변경
   */
  @Patch(':id/inquiry-type')
  @AllowWorkerSession()
  async updateInquiryType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInquiryTypeDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, id);
    const actor = this.resolveMutationActor(user, dto);
    return this.contactsService.updateInquiryType(id, dto.inquiryType, actor);
  }

  /**
   * POST /api/v1/contacts/:id/acknowledge-badge
   * 뱃지 확인 (booking/delivery 변경 알림)
   */
  @Post(':id/acknowledge-badge')
  async acknowledgeBadge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AcknowledgeBadgeDto) {
    return this.contactsService.acknowledgeBadge(id, dto.field);
  }

  /**
   * POST /api/v1/contacts/:id/restore
   * 삭제 복원
   */
  @Post(':id/restore')
  async restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    this.assertAdmin(user);
    return this.contactsService.restore(id);
  }

  /**
   * DELETE /api/v1/contacts/:id
   * 삭제 (soft 또는 permanent)
   */
  @Delete(':id')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteContactDto,
    @CurrentUser() user: SessionUser
  ) {
    this.assertAdmin(user);
    if (dto.permanent) {
      return this.contactsService.permanentDelete(id);
    }
    return this.contactsService.softDelete(id);
  }

  /**
   * POST /api/v1/contacts/backfill-timeline
   * 기존 문의 타임라인 백필 (일회성)
   */
  @Post('backfill-timeline')
  async backfillTimeline(@CurrentUser() user: SessionUser) {
    this.assertAdmin(user);
    return this.timelineService.backfillFromTimestamps();
  }

  private assertAdmin(user: SessionUser): void {
    if (!user || user.userType !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }

  private assertAdminOrWorker(user: SessionUser): void {
    if (user.userType !== 'admin' && user.userType !== 'worker') {
      throw new ForbiddenException('Admin or worker access required');
    }
  }

  private assertAdminOrIntegration(user: SessionUser): void {
    if (!user || (user.userType !== 'admin' && user.userType !== 'integration')) {
      throw new ForbiddenException('Admin or integration access required');
    }
  }

  private resolveMutationActor(
    user: SessionUser,
    requested: RequestedActor
  ): ResolvedActor | undefined {
    if (requested.actorType === 'worker') {
      if (user.userType !== 'worker') {
        throw new ForbiddenException('Verified worker session required');
      }
      return { actorType: 'worker', actorName: this.getWorkerActorName(user) };
    }

    if (user.userType === 'worker') {
      if (requested.actorType && requested.actorType !== 'worker') {
        throw new ForbiddenException('Worker session cannot act as another actor');
      }
      return { actorType: 'worker', actorName: this.getWorkerActorName(user) };
    }

    if (user.userType === 'company') {
      throw new ForbiddenException('Company session cannot mutate worker workflow');
    }

    if (user.userType === 'integration') {
      throw new ForbiddenException('Integration API key cannot mutate worker workflow');
    }

    if (!requested.actorType) {
      return undefined;
    }

    if (requested.actorType === 'admin' || requested.actorType === 'system') {
      return {
        actorType: requested.actorType,
        actorName: requested.actorName,
        companyName: requested.companyName,
      };
    }

    if (requested.actorType === 'company') {
      throw new ForbiddenException('Company actor is not allowed for worker workflow');
    }

    throw new ForbiddenException('Unsupported actor type');
  }

  private getWorkerActorName(user: SessionUser): string {
    return user.workerName ?? String(user.userId);
  }

  private parseContactIds(raw: string | undefined): string[] {
    if (!raw) {
      throw new BadRequestException('contactIds가 필요합니다.');
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new BadRequestException('contactIds 배열이 필요합니다.');
      }
      if (
        !parsed.every(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        )
      ) {
        throw new BadRequestException('contactIds 배열이 올바르지 않습니다.');
      }
      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('contactIds JSON이 올바르지 않습니다.');
    }
  }

  private async resolveDrawingRevisionActor(
    contactId: string,
    user: SessionUser,
    requested: RequestedActor
  ): Promise<ResolvedActor> {
    if (user.userType === 'company') {
      if (requested.actorType && requested.actorType !== 'company') {
        throw new ForbiddenException('Company session cannot act as another actor');
      }
      const companyName = await this.resolveCompanyName(user, requested.companyName ?? '');
      await this.contactsService.verifyCompanyOwnership(contactId, companyName);
      return { actorType: 'company', actorName: companyName, companyName };
    }

    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, contactId);

    return (
      this.resolveMutationActor(user, requested) ?? {
        actorType: 'admin',
        actorName: 'admin',
      }
    );
  }

  private async assertDrawingRevisionAccess(contactId: string, user: SessionUser): Promise<void> {
    if (user.userType === 'company') {
      const companyName = await this.resolveCompanyName(user, '');
      await this.contactsService.verifyCompanyOwnership(contactId, companyName);
      return;
    }

    this.assertAdminOrWorker(user);
    await this.assertWorkerCanAccessContact(user, contactId);
  }

  private async assertDrawingRevisionFileAccess(
    revisionId: string,
    user: SessionUser
  ): Promise<Awaited<ReturnType<DrawingRevisionService['getRevisionAccessInfo']>>> {
    if (user.userType === 'integration') {
      throw new ForbiddenException('Session access required');
    }

    const info = await this.drawingRevisionService.getRevisionAccessInfo(revisionId);

    if (user.userType === 'admin') {
      return info;
    }

    if (user.userType === 'worker') {
      await this.workerContactAccessService.assertCanAccessContact(user, info.contactId);
      return info;
    }

    if (user.userType === 'company') {
      const companyName = await this.resolveCompanyName(user, '');
      if (info.companyName !== companyName || !info.isPublic) {
        throw new ForbiddenException('해당 도면에 대한 접근 권한이 없습니다.');
      }
      return info;
    }

    throw new ForbiddenException('Session access required');
  }

  private async assertLatestDrawingAccess(contactId: string, user: SessionUser): Promise<void> {
    if (user.userType === 'integration') {
      throw new ForbiddenException('Session access required');
    }

    if (user.userType === 'admin') {
      return;
    }

    if (user.userType === 'worker') {
      await this.workerContactAccessService.assertCanAccessContact(user, contactId);
      return;
    }

    if (user.userType === 'company') {
      const companyName = await this.resolveCompanyName(user, '');
      await this.contactsService.verifyCompanyOwnership(contactId, companyName);
      return;
    }

    throw new ForbiddenException('Session access required');
  }

  private async assertWorkerCanAccessContact(user: SessionUser, contactId: string): Promise<void> {
    if (user.userType !== 'worker') return;
    await this.workerContactAccessService.assertCanAccessContact(user, contactId);
  }

  private async assertWorkerCanAccessContacts(
    user: SessionUser,
    contactIds: string[]
  ): Promise<void> {
    if (user.userType !== 'worker') return;
    await this.workerContactAccessService.assertCanAccessContacts(user, contactIds);
  }

  /**
   * 세션 사용자 기반 companyName 결정
   * admin → DTO의 companyName 사용, company → 세션에서 파생
   */
  private async resolveCompanyName(user: SessionUser, dtoCompanyName: string): Promise<string> {
    if (user.userType === 'admin') {
      return dtoCompanyName;
    }
    if (!user.companyId) {
      throw new ForbiddenException('업체 정보가 없습니다.');
    }
    return this.contactsService.getCompanyNameByCompanyId(user.companyId);
  }
}
