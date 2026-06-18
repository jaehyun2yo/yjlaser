import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StorageService } from './storage.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import { GetStorageQueryDto } from './dto/storage.dto';

@Controller('storage')
@UseGuards(ApiKeyGuard, CompanyAccessGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * GET /storage - 저장공간 사용량 조회
   */
  @Get()
  async getStorageUsage(@Query() query: GetStorageQueryDto, @CurrentUser() user: SessionUser) {
    return this.storageService.getStorageUsage(user, query.companyId);
  }

  /**
   * GET /storage/breakdown - 저장공간 상세 내역 조회
   */
  @Get('breakdown')
  async getStorageBreakdown(@CurrentUser() user: SessionUser) {
    return this.storageService.getStorageBreakdown(user);
  }

  /**
   * GET /storage/performance - 성능 메트릭 조회 (관리자용)
   */
  @Get('performance')
  @UseGuards(AdminGuard)
  async getPerformanceMetrics() {
    return this.storageService.getPerformanceMetrics();
  }

  /**
   * GET /storage/webhard-consistency - Google Drive 웹하드 정합성 진단 (관리자용)
   */
  @Get('webhard-consistency')
  @UseGuards(AdminGuard)
  async getWebhardConsistencyDiagnostics(
    @Query('verifyDriveApi') verifyDriveApi?: string,
    @Query('verifyDriveApiLimit') verifyDriveApiLimit?: string
  ) {
    return this.storageService.getWebhardConsistencyDiagnostics({
      verifyDriveApi: verifyDriveApi === 'true',
      verifyDriveApiLimit: verifyDriveApiLimit ? Number(verifyDriveApiLimit) : undefined,
    });
  }
}
