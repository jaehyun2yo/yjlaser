import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import { UpdateSettingsDto } from './dto/settings.dto';

@Controller('settings')
@UseGuards(SessionAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /settings - 사용자 설정 조회
   */
  @Get()
  async getSettings(@CurrentUser() user: SessionUser) {
    return this.settingsService.getSettings(user);
  }

  /**
   * POST /settings - 사용자 설정 저장/업데이트
   */
  @Post()
  async updateSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.settingsService.updateSettings(dto, user);
  }
}
