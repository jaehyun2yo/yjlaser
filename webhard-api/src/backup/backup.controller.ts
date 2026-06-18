import { Controller, Get, Put, Post, Body, Query, UseGuards } from '@nestjs/common';
import { BackupService } from './backup.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { BackupAdminGuard, RequireBackupPermission } from './backup-admin.guard';
import {
  UpdateBackupSettingsDto,
  BackupHistoryQueryDto,
  BrowseDirectoriesQueryDto,
} from './dto/backup.dto';

@Controller('backup')
@UseGuards(ApiKeyGuard, BackupAdminGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /**
   * GET /backup/settings - 백업 설정 조회
   */
  @Get('settings')
  @RequireBackupPermission('backup:read')
  async getSettings() {
    return this.backupService.getSettings();
  }

  /**
   * PUT /backup/settings - 백업 설정 업데이트
   */
  @Put('settings')
  @RequireBackupPermission('backup:write')
  async updateSettings(@Body() dto: UpdateBackupSettingsDto) {
    return this.backupService.updateSettings(dto);
  }

  /**
   * GET /backup/eligible - 백업 대상 요약 조회
   */
  @Get('eligible')
  @RequireBackupPermission('backup:read')
  async getEligibleSummary() {
    return this.backupService.getEligibleSummary();
  }

  /**
   * POST /backup/execute - 수동 백업 실행 (비동기)
   */
  @Post('execute')
  @RequireBackupPermission('backup:execute')
  async executeBackup() {
    return this.backupService.startBackup();
  }

  /**
   * GET /backup/status - 백업 진행 상태 조회
   */
  @Get('status')
  @RequireBackupPermission('backup:read')
  async getStatus() {
    return this.backupService.getStatus();
  }

  /**
   * GET /backup/browse-directories - 디렉토리 목록 조회
   */
  @Get('browse-directories')
  @RequireBackupPermission('backup:write')
  async browseDirectories(@Query() query: BrowseDirectoriesQueryDto) {
    return this.backupService.browseDirectories(query.path);
  }

  /**
   * GET /backup/history - 백업 이력 조회
   */
  @Get('history')
  @RequireBackupPermission('backup:read')
  async getHistory(@Query() query: BackupHistoryQueryDto) {
    return this.backupService.getHistory(query.page ?? 1, query.limit ?? 20);
  }
}
