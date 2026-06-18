import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { CompaniesService } from './companies.service';
import type { UploadedCompanyBusinessRegistrationFile } from './companies.service';
import {
  CompanyQueryDto,
  UpdateCompanyStatusDto,
  UpdateWebhardAccessDto,
  UpdateLaserOnlyDto,
  UpdateCompanyProfileDto,
  CheckDuplicateUsernameDto,
  CheckDuplicateBusinessNumberDto,
  CreateCompanyDto,
} from './dto/company.dto';
import { CreateLaserOnlyMappingDto, LinkCompanyDto } from './dto/laser-only-mapping.dto';
import {
  ApproveFolderAliasDto,
  CreateFolderAliasDto,
  ListFolderAliasesDto,
} from './dto/folder-alias.dto';
import { LaserOnlyMappingService } from './laser-only-mapping.service';
import { FolderAliasService } from './folder-alias.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminSessionGuard } from '../auth/guards/admin-session.guard';
import { SessionUser } from '../auth/auth.service';

@Controller('companies')
@UseGuards(ApiKeyGuard)
export class CompaniesController {
  private readonly logger = new Logger(CompaniesController.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly laserOnlyMappingService: LaserOnlyMappingService,
    private readonly folderAliasService: FolderAliasService
  ) {}

  /**
   * GET /api/v1/companies
   * 업체 목록 조회
   */
  @Get()
  async findAll(@Query() query: CompanyQueryDto) {
    return this.companiesService.findAll(query);
  }

  /**
   * GET /api/v1/companies/names
   * 업체명 목록 (셀렉트 박스용)
   */
  @Get('names')
  async findCompanyNames() {
    return this.companiesService.findCompanyNames();
  }

  /**
   * GET /api/v1/companies/count
   * 업체 수 조회
   */
  @Get('count')
  async count(@Query('status') status?: string) {
    const where = status ? { status } : undefined;
    const count = await this.companiesService.count(where);
    return { count };
  }

  /**
   * GET /api/v1/companies/recent
   * 최근 업체 목록
   */
  @Get('recent')
  async findRecent(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    return this.companiesService.findRecent(since);
  }

  /**
   * POST /api/v1/companies/check-username
   * username 중복 체크
   */
  @Post('check-username')
  @HttpCode(HttpStatus.OK)
  async checkDuplicateUsername(@Body() dto: CheckDuplicateUsernameDto) {
    return this.companiesService.checkDuplicateUsername(dto.username, dto.excludeId);
  }

  /**
   * POST /api/v1/companies/check-business-number
   * 사업자등록번호 중복 체크
   */
  @Post('check-business-number')
  @HttpCode(HttpStatus.OK)
  async checkDuplicateBusinessNumber(@Body() dto: CheckDuplicateBusinessNumberDto) {
    return this.companiesService.checkDuplicateBusinessNumber(
      dto.businessRegistrationNumber,
      dto.excludeId
    );
  }

  /**
   * GET /api/v1/companies/by-username/:username
   * username으로 업체 조회
   */
  @Get('by-username/:username')
  async findByUsername(@Param('username') username: string) {
    return this.companiesService.findByUsername(username);
  }

  /**
   * GET /api/v1/companies/by-name/:name
   * 업체명으로 조회
   */
  @Get('by-name/:name')
  async findByCompanyName(@Param('name') name: string) {
    return this.companiesService.findByCompanyName(decodeURIComponent(name));
  }

  /**
   * GET /api/v1/companies/auth/:username
   * 인증용 조회 (password_hash 포함)
   */
  @Get('auth/:username')
  async findForAuth(@Param('username') username: string) {
    return this.companiesService.findForAuth(username);
  }

  /**
   * GET /api/v1/companies/laser-only-mappings
   * 레이저 전용 매핑 목록 조회
   */
  @Get('laser-only-mappings')
  async getLaserOnlyMappings() {
    return this.laserOnlyMappingService.getMappings();
  }

  /**
   * POST /api/v1/companies/laser-only-mappings
   * 레이저 전용 매핑 추가
   */
  @Post('laser-only-mappings')
  @HttpCode(HttpStatus.CREATED)
  async addLaserOnlyMapping(@Body() dto: CreateLaserOnlyMappingDto) {
    return this.laserOnlyMappingService.addMapping(dto.folderName, dto.companyId);
  }

  /**
   * DELETE /api/v1/companies/laser-only-mappings/:id
   * 레이저 전용 매핑 삭제
   */
  @Delete('laser-only-mappings/:id')
  async removeLaserOnlyMapping(@Param('id', ParseIntPipe) id: number) {
    return this.laserOnlyMappingService.removeMapping(id);
  }

  /**
   * PATCH /api/v1/companies/laser-only-mappings/:id/link
   * 레이저 전용 매핑에 업체 연결
   */
  @Patch('laser-only-mappings/:id/link')
  async linkCompanyToMapping(@Param('id', ParseIntPipe) id: number, @Body() dto: LinkCompanyDto) {
    return this.laserOnlyMappingService.linkCompany(id, dto.companyId);
  }

  /**
   * GET /api/v1/companies/folder-aliases
   * 외부웹하드 폴더명 ↔ 업체 매핑 목록 (admin 전용, task 24)
   */
  @Get('folder-aliases')
  @UseGuards(AdminGuard)
  async listFolderAliases(@Query() query: ListFolderAliasesDto) {
    return this.folderAliasService.list(query);
  }

  /**
   * POST /api/v1/companies/folder-aliases
   * 운영자가 (folderName, companyId) 매핑을 직접 등록 + 즉시 승인 (task 25).
   * pending row 없이 바로 approved 생성 — `:id/approve` 와는 별도 라이프사이클.
   * cascadeBackfill (default true) 시 미통합 Contact 일괄 통합.
   */
  @Post('folder-aliases')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AdminSessionGuard)
  async createFolderAlias(@Body() dto: CreateFolderAliasDto, @Req() req: Request) {
    const user = (req as Request & { user?: SessionUser }).user;
    const approvedBy = user?.userId !== undefined ? String(user.userId) : 'admin';
    return this.folderAliasService.createApprovedAlias(dto, approvedBy);
  }

  /**
   * POST /api/v1/companies/folder-aliases/:id/approve
   * Alias 승인 — 동일 folderName 의 다른 pending 자동 rejected.
   * cascadeBackfill=true 시 미통합 Contact 일괄 통합.
   */
  @Post('folder-aliases/:id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  async approveFolderAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveFolderAliasDto,
    @Req() req: Request
  ) {
    const user = (req as Request & { user?: SessionUser }).user;
    const approvedBy = user?.userId !== undefined ? String(user.userId) : 'admin';
    return this.folderAliasService.approve(id, dto, approvedBy);
  }

  /**
   * PATCH /api/v1/companies/folder-aliases/:id/reject
   * Alias 거절 — status='rejected' 단일 전환.
   */
  @Patch('folder-aliases/:id/reject')
  @UseGuards(AdminGuard)
  async rejectFolderAlias(@Param('id', ParseIntPipe) id: number) {
    return this.folderAliasService.reject(id);
  }

  /**
   * DELETE /api/v1/companies/folder-aliases/:id
   * Alias hard delete.
   */
  @Delete('folder-aliases/:id')
  @UseGuards(AdminGuard)
  async deleteFolderAlias(@Param('id', ParseIntPipe) id: number) {
    await this.folderAliasService.delete(id);
    return { ok: true };
  }

  /**
   * GET /api/v1/companies/:id
   * 업체 상세 조회
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findById(id);
  }

  /**
   * POST /api/v1/companies
   * 업체 생성
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  /**
   * POST /api/v1/companies/:id/business-registration/drive
   * 사업자등록증을 관리자 전용 Drive 업체 폴더에 저장한다.
   */
  @Post(':id/business-registration/drive')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBusinessRegistrationToDrive(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedCompanyBusinessRegistrationFile | undefined
  ) {
    if (!file) {
      throw new BadRequestException('사업자등록증 파일이 필요합니다.');
    }
    return this.companiesService.uploadBusinessRegistrationToDrive(id, file);
  }

  /**
   * PATCH /api/v1/companies/:id
   * 업체 수정
   */
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompanyProfileDto) {
    return this.companiesService.update(id, dto);
  }

  /**
   * DELETE /api/v1/companies/:id
   * 업체 삭제 대기 + 매칭 웹하드 루트 폴더 휴지통 이동 (admin session 전용)
   */
  @Delete(':id')
  @UseGuards(AdminSessionGuard)
  async deleteCompany(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = (req as Request & { user?: SessionUser }).user;
    const deletedBy = user?.userId !== undefined ? String(user.userId) : 'admin';
    return this.companiesService.deleteCompany(id, deletedBy);
  }

  /**
   * POST /api/v1/companies/:id/restore
   * 삭제 대기 업체 복구 (admin session 전용)
   */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminSessionGuard)
  async restoreCompany(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.restoreCompany(id);
  }

  /**
   * PATCH /api/v1/companies/:id/status
   * 업체 상태 변경
   */
  @Patch(':id/status')
  async updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompanyStatusDto) {
    return this.companiesService.updateStatus(id, dto.status);
  }

  /**
   * PATCH /api/v1/companies/:id/webhard-access
   * 웹하드 접근 토글
   */
  @Patch(':id/webhard-access')
  async toggleWebhardAccess(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWebhardAccessDto
  ) {
    return this.companiesService.toggleWebhardAccess(id, dto.allowed);
  }

  /**
   * PATCH /api/v1/companies/:id/laser-only
   * 레이저가공 전용 토글
   */
  @Patch(':id/laser-only')
  async toggleLaserOnly(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLaserOnlyDto) {
    return this.companiesService.toggleLaserOnly(id, dto.laserOnly);
  }

  /**
   * POST /api/v1/companies/:id/approve
   * 업체 승인
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id', ParseIntPipe) id: number, @Body('approvedBy') approvedBy: string) {
    return this.companiesService.approve(id, approvedBy);
  }

  /**
   * POST /api/v1/companies/:id/drive-provisioning/retry
   * Google Drive 업체 폴더 생성 재시도
   */
  @Post(':id/drive-provisioning/retry')
  @HttpCode(HttpStatus.OK)
  async retryDriveProvisioning(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.retryDriveProvisioning(id);
  }
}
