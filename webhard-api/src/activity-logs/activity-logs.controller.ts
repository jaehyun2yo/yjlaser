import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';

@Controller('activity-logs')
@UseGuards(ApiKeyGuard)
export class ActivityLogsController {
  private readonly logger = new Logger(ActivityLogsController.name);

  constructor(private readonly activityLogsService: ActivityLogsService) {}

  /**
   * POST /api/v1/activity-logs
   * 활동 로그 기록
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateActivityLogDto) {
    return this.activityLogsService.create(dto);
  }

  /**
   * GET /api/v1/activity-logs
   * 활동 로그 목록 조회
   */
  @Get()
  async findAll(
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.activityLogsService.findAll({
      action,
      actorId,
      limit,
      offset,
      startDate: this.parseOptionalDate('startDate', startDate),
      endDate: this.parseOptionalDate('endDate', endDate),
    });
  }

  private parseOptionalDate(fieldName: string, value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    return parsed;
  }
}
