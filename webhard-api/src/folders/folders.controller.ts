import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { FoldersService } from './folders.service';
import { WebhardConfigService } from './webhard-config.service';
import { AllowIntegrationPrincipal } from '../integration/auth/allow-integration-principal.decorator';
import { DeviceEndpointPolicyGuard } from '../integration/auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../integration/auth/integration-principal-source.guard';
import { RequireDeviceEndpointPolicy } from '../integration/auth/require-device-endpoint-policy.decorator';
import {
  CurrentIntegrationPrincipal,
  type CurrentIntegrationPrincipalValue,
} from '../integration/auth/current-integration-principal.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import {
  GetFoldersQueryDto,
  CreateFolderDto,
  RenameFolderDto,
  MoveFolderDto,
  BatchDeleteFoldersDto,
  InitializeCompanyFoldersDto,
  UpdateFolderTemplateDto,
} from './dto/folder.dto';
import {
  UpdateFolderStatusMappingDto,
  UpdateExcludedFoldersDto,
  UpdateAutoContactExcludedFoldersDto,
} from './dto/webhard-config.dto';

@Controller('folders')
@UseGuards(IntegrationPrincipalSourceGuard, DeviceEndpointPolicyGuard, CompanyAccessGuard)
export class FoldersController {
  constructor(
    private readonly foldersService: FoldersService,
    private readonly webhardConfigService: WebhardConfigService
  ) {}

  /**
   * GET /folders - Get folders list
   */
  @Get()
  async getFolders(@Query() query: GetFoldersQueryDto, @CurrentUser() user: SessionUser) {
    return this.foldersService.getFolders(query, user);
  }

  /**
   * GET /folders/template - Get current folder template
   */
  @Get('template')
  @UseGuards(AdminGuard)
  async getFolderTemplate() {
    return this.foldersService.getFolderTemplate();
  }

  /**
   * PUT /folders/template - Update folder template
   */
  @Put('template')
  @UseGuards(AdminGuard)
  async updateFolderTemplate(@Body() dto: UpdateFolderTemplateDto) {
    return this.foldersService.updateFolderTemplate(dto.template);
  }

  /**
   * POST /folders/initialize - Initialize default folder structure for a company
   */
  @Post('initialize')
  @AllowIntegrationPrincipal()
  async initializeCompanyFolders(@Body() dto: InitializeCompanyFoldersDto) {
    return this.foldersService.initializeCompanyFolders(dto.companyId, dto.companyName);
  }

  /**
   * GET /folders/company-info/:companyId - Get company webhard access info
   * Returns company name, webhard_access, and whether root folder exists
   */
  @Get('company-info/:companyId')
  async getCompanyWebhardInfo(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.foldersService.getCompanyWebhardInfo(companyId);
  }

  /**
   * task 26: GET /folders/external-unmatched
   *
   * 외부웹하드 직하의 미매칭 root 폴더 목록 (admin UI 매뉴얼 매핑 폼 후보).
   * AdminGuard — admin 세션만 접근. API key 호출은 차단.
   */
  @Get('external-unmatched')
  @UseGuards(AdminGuard)
  async getExternalUnmatchedFolders() {
    return this.foldersService.getExternalUnmatchedFolders();
  }

  /**
   * task 27 Phase C: GET /folders/external-husk
   *
   * 외부웹하드 직하의 정리 가능한 husk 목록 (자식·파일 0).
   * AdminGuard — admin 세션만 접근. API key 호출은 차단.
   */
  @Get('external-husk')
  @UseGuards(AdminGuard)
  async getEmptyExternalHusks() {
    return this.foldersService.getEmptyExternalHusks();
  }

  /**
   * task 27 Phase C: DELETE /folders/external-husk/:rootId
   *
   * 단일 husk root cascade soft-delete. 안전 가드:
   * - depth=2 외부웹하드 root + companyId IS NULL + 자식·파일 0 만 허용.
   * - 위반 시 400 / 422.
   */
  @Delete('external-husk/:rootId')
  @UseGuards(AdminGuard)
  async cleanupEmptyExternalHusk(@Param('rootId') rootId: string) {
    return this.foldersService.cleanupEmptyExternalHusk(rootId);
  }

  /**
   * GET /folders/tree - Get folder tree for navigation
   */
  @Get('tree')
  async getFolderTree(@CurrentUser() user: SessionUser) {
    return this.foldersService.getFolderTree(user);
  }

  /**
   * GET /folders/children - Get child folders (지연 로딩용)
   * ?parentId=xxx 또는 parentId 미지정 시 루트 폴더 반환
   */
  @Get('children')
  @AllowIntegrationPrincipal()
  @RequireDeviceEndpointPolicy('GET', '/folders/children')
  async getChildFolders(
    @Query('parentId') parentId: string | undefined,
    @CurrentIntegrationPrincipal() principal: CurrentIntegrationPrincipalValue
  ) {
    const effectiveParentId = parentId === undefined || parentId === '' ? null : parentId;
    if (principal.mode === 'device_bearer') {
      return this.foldersService.getChildFoldersForDevice(effectiveParentId, principal.device);
    }
    return this.foldersService.getChildFolders(effectiveParentId, principal.user);
  }

  /**
   * GET /folders/batch-delete - Get batch delete statistics
   * Note: Must be before :id routes to avoid matching as UUID
   */
  @Get('batch-delete')
  async getBatchDeleteStats(
    @Query('folderIds') folderIds: string,
    @CurrentUser() user: SessionUser
  ) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const ids = folderIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => UUID_RE.test(id));

    if (ids.length === 0) {
      throw new BadRequestException('No valid folder IDs provided');
    }
    if (ids.length > 100) {
      throw new BadRequestException('Too many folder IDs (max 100)');
    }

    return this.foldersService.getBatchDeleteStats(ids, user);
  }

  /**
   * DELETE /folders/batch-delete - Batch delete folders
   * Note: Must be before :id routes to avoid matching as UUID
   */
  @Delete('batch-delete')
  async batchDeleteFolders(@Body() dto: BatchDeleteFoldersDto, @CurrentUser() user: SessionUser) {
    return this.foldersService.batchDeleteFolders(dto.folderIds, user);
  }

  // --- Webhard Config Endpoints ---

  /**
   * GET /folders/config/status-mapping - Get folder-to-contact-status mapping
   */
  @Get('config/status-mapping')
  @UseGuards(AdminGuard)
  async getFolderStatusMapping() {
    return this.webhardConfigService.getStoredMappings();
  }

  /**
   * PUT /folders/config/status-mapping - Update folder-to-contact-status mapping
   */
  @Put('config/status-mapping')
  @UseGuards(AdminGuard)
  async updateFolderStatusMapping(@Body() dto: UpdateFolderStatusMappingDto) {
    return this.webhardConfigService.updateFolderStatusMapping(dto.mappings);
  }

  /**
   * GET /folders/config/excluded-folders - Get excluded folders list
   */
  @Get('config/excluded-folders')
  @UseGuards(AdminGuard)
  async getExcludedFolders() {
    return this.webhardConfigService.getExcludedFolders();
  }

  /**
   * PUT /folders/config/excluded-folders - Update excluded folders list
   */
  @Put('config/excluded-folders')
  @UseGuards(AdminGuard)
  async updateExcludedFolders(@Body() dto: UpdateExcludedFoldersDto) {
    return this.webhardConfigService.updateExcludedFolders(dto.folders);
  }

  /**
   * GET /folders/config/auto-contact-excluded - Get auto-contact excluded folders list
   */
  @Get('config/auto-contact-excluded')
  @UseGuards(AdminGuard)
  async getAutoContactExcludedFolders() {
    return this.webhardConfigService.getAutoContactExcludedFolders();
  }

  /**
   * PUT /folders/config/auto-contact-excluded - Update auto-contact excluded folders list
   */
  @Put('config/auto-contact-excluded')
  @UseGuards(AdminGuard)
  async updateAutoContactExcludedFolders(@Body() dto: UpdateAutoContactExcludedFoldersDto) {
    return this.webhardConfigService.updateAutoContactExcludedFolders(dto.folders);
  }

  /**
   * GET /folders/:id/ancestors - Get folder ancestors (breadcrumb)
   */
  @Get(':id/ancestors')
  async getFolderAncestors(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser
  ) {
    return this.foldersService.getAncestors(id, user);
  }

  /**
   * GET /folders/:id - Get folder detail with contents
   */
  @Get(':id')
  async getFolderDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.foldersService.getFolderDetail(id, user);
  }

  /**
   * POST /folders - Create a new folder
   */
  @Post()
  @AllowIntegrationPrincipal()
  @RequireDeviceEndpointPolicy('POST', '/folders')
  async createFolder(
    @Body() dto: CreateFolderDto,
    @CurrentIntegrationPrincipal() principal: CurrentIntegrationPrincipalValue
  ) {
    if (principal.mode === 'device_bearer') {
      return this.foldersService.createFolderForDevice(dto, principal.device);
    }
    return this.foldersService.createFolder(dto, principal.user);
  }

  /**
   * PATCH /folders/:id/rename - Rename folder
   */
  @Patch(':id/rename')
  @RequireDeviceEndpointPolicy('PATCH', '/folders/:id/rename')
  async renameFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameFolderDto,
    @CurrentIntegrationPrincipal() principal: CurrentIntegrationPrincipalValue
  ) {
    if (principal.mode === 'device_bearer') {
      return this.foldersService.renameFolderForDevice(id, dto, principal.device);
    }
    return this.foldersService.renameFolder(id, dto, principal.user);
  }

  /**
   * PATCH /folders/:id/move - Move folder
   */
  @Patch(':id/move')
  @RequireDeviceEndpointPolicy('PATCH', '/folders/:id/move')
  async moveFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveFolderDto,
    @CurrentIntegrationPrincipal() principal: CurrentIntegrationPrincipalValue
  ) {
    if (principal.mode === 'device_bearer') {
      return this.foldersService.moveFolderForDevice(id, dto, principal.device);
    }
    return this.foldersService.moveFolder(id, dto, principal.user);
  }

  /**
   * DELETE /folders/:id - Delete folder (soft delete)
   */
  @Delete(':id')
  async deleteFolder(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    await this.foldersService.deleteFolder(id, user);
    return { success: true };
  }
}
