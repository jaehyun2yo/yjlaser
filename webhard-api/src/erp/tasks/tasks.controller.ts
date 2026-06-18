import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import {
  GetTasksQueryDto,
  GetTodayTasksQueryDto,
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
  ReorderTasksDto,
  BatchDeleteTasksDto,
} from './dto/task.dto';

@Controller('erp/tasks')
@UseGuards(SessionAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * GET /erp/tasks - Get tasks list with filters
   */
  @Get()
  async getTasks(@Query() query: GetTasksQueryDto) {
    return this.tasksService.getTasks(query);
  }

  /**
   * GET /erp/tasks/today - Get today's tasks (for mobile workers)
   */
  @Get('today')
  async getTodayTasks(@Query() query: GetTodayTasksQueryDto) {
    return this.tasksService.getTodayTasks(query);
  }

  /**
   * GET /erp/tasks/kanban - Get kanban board data
   */
  @Get('kanban')
  async getKanbanData(@Query() query: GetTasksQueryDto) {
    return this.tasksService.getKanbanData(query);
  }

  /**
   * GET /erp/tasks/:id - Get single task
   */
  @Get(':id')
  async getTask(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.getTask(id);
  }

  /**
   * POST /erp/tasks - Create new task (admin only)
   */
  @Post()
  @UseGuards(AdminGuard)
  async createTask(@Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(dto);
  }

  /**
   * PATCH /erp/tasks/:id - Update task details (admin only)
   */
  @Patch(':id')
  @UseGuards(AdminGuard)
  async updateTask(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.updateTask(id, dto);
  }

  /**
   * PATCH /erp/tasks/:id/status - Update task status (workers can use this)
   */
  @Patch(':id/status')
  async updateTaskStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateTaskStatus(id, dto);
  }

  /**
   * PATCH /erp/tasks/reorder - Reorder tasks (drag and drop)
   */
  @Patch('batch/reorder')
  @UseGuards(AdminGuard)
  async reorderTasks(@Body() dto: ReorderTasksDto) {
    return this.tasksService.reorderTasks(dto);
  }

  /**
   * DELETE /erp/tasks/:id - Delete task (admin only)
   */
  @Delete(':id')
  @UseGuards(AdminGuard)
  async deleteTask(@Param('id', ParseUUIDPipe) id: string) {
    await this.tasksService.deleteTask(id);
    return { success: true };
  }

  /**
   * POST /erp/tasks/batch/delete - Batch delete tasks (admin only)
   */
  @Post('batch/delete')
  @UseGuards(AdminGuard)
  async batchDeleteTasks(@Body() dto: BatchDeleteTasksDto) {
    return this.tasksService.batchDeleteTasks(dto.taskIds);
  }
}
