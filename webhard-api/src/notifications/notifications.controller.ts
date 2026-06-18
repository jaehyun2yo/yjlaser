import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  DefaultValuePipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';

type NotificationCategory = 'all' | 'webhard' | 'integration' | 'work-management';

function parseNotificationCategory(category?: string): NotificationCategory {
  if (category === 'webhard' || category === 'integration' || category === 'work-management') {
    return category;
  }
  return 'all';
}

function parseOptionalNumericQuery(value: string | undefined, name: string): number | null {
  if (value === undefined || value === '') return null;
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`${name} must be a numeric string`);
  }
  return Number(value);
}

@Controller('notifications')
@UseGuards(ApiKeyGuard)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/v1/notifications
   * 알림 목록 조회
   */
  @Get()
  async getNotifications(
    @Query('userType') userType: string,
    @Query('userId') userIdParam?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number = 0,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('category') category?: string
  ) {
    const notifications = await this.notificationsService.getNotifications(
      userType,
      parseOptionalNumericQuery(userIdParam, 'userId'),
      limit,
      offset,
      unreadOnly === 'true',
      parseNotificationCategory(category)
    );
    return { notifications };
  }

  /**
   * GET /api/v1/notifications/unread-count
   * 읽지 않은 알림 수 조회
   */
  @Get('unread-count')
  async getUnreadCount(
    @Query('userType') userType: string,
    @Query('userId') userIdParam?: string,
    @Query('category') category?: string
  ) {
    const count = await this.notificationsService.getUnreadCount(
      userType,
      parseOptionalNumericQuery(userIdParam, 'userId'),
      parseNotificationCategory(category)
    );
    return { count };
  }

  @Get('unread-summary')
  async getUnreadSummary(
    @Query('userType') userType: string,
    @Query('userId') userIdParam?: string
  ) {
    return this.notificationsService.getUnreadSummary(
      userType,
      parseOptionalNumericQuery(userIdParam, 'userId')
    );
  }

  /**
   * POST /api/v1/notifications/:id/read
   * 알림 읽음 처리
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id') id: string) {
    const success = await this.notificationsService.markRead(id);
    return { success };
  }

  /**
   * POST /api/v1/notifications/read-all
   * 모든 알림 읽음 처리
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Body('userType') userType: string, @Body('userId') userId?: number) {
    const updatedCount = await this.notificationsService.markAllRead(userType, userId ?? null);
    return { updatedCount };
  }
}
