import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import {
  PendingNestingTasksQueryDto,
  ReportNestingTaskResultDto,
  UpdateNestingTaskStatusDto,
} from './dto/nesting-task.dto';
import { NestingTasksService } from './nesting-tasks.service';

@Controller('integration/nesting-tasks')
@UseGuards(ApiKeyGuard)
export class NestingTasksController {
  constructor(private nestingTasksService: NestingTasksService) {}

  @Get('pending')
  async getPendingTasks(@Query() query: PendingNestingTasksQueryDto) {
    return this.nestingTasksService.getPendingTasks(query);
  }

  @Patch(':taskId/status')
  async updateStatus(@Param('taskId') taskId: string, @Body() dto: UpdateNestingTaskStatusDto) {
    return this.nestingTasksService.updateStatus(taskId, dto);
  }

  @Post(':taskId/result')
  async reportResult(@Param('taskId') taskId: string, @Body() dto: ReportNestingTaskResultDto) {
    return this.nestingTasksService.reportResult(taskId, dto);
  }
}
