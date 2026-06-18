import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TrashService } from './trash.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import { GetTrashQueryDto } from './dto/trash.dto';

@Controller('trash')
@UseGuards(ApiKeyGuard, CompanyAccessGuard)
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  /**
   * GET /trash - Get trash files list
   */
  @Get()
  async getTrashFiles(@Query() query: GetTrashQueryDto, @CurrentUser() user: SessionUser) {
    return this.trashService.getTrashFiles(query, user);
  }

  /**
   * GET /trash/count - Get trash count
   */
  @Get('count')
  async getTrashCount(@CurrentUser() user: SessionUser) {
    return this.trashService.getTrashCount(user);
  }

  /**
   * POST /trash/:id/restore - Restore file from trash
   */
  @Post(':id/restore')
  async restoreFile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    await this.trashService.restoreFile(id, user);
    return { success: true };
  }

  /**
   * DELETE /trash/:id - Permanently delete file
   */
  @Delete(':id')
  async permanentlyDeleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser
  ) {
    await this.trashService.permanentlyDeleteFile(id, user);
    return { success: true };
  }

  /**
   * DELETE /trash - Empty trash (delete all files in trash)
   */
  @Delete()
  async emptyTrash(@CurrentUser() user: SessionUser) {
    return this.trashService.emptyTrash(user);
  }
}
