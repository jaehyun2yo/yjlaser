import { Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SessionUser } from '../../auth/auth.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireIntegrationPermission } from '../auth/require-integration-permission.decorator';
import { CompleteLaserCompletionsDto } from './dto/laser-completion.dto';
import { LaserCompletionsService } from './laser-completions.service';

const LASER_COMPLETION_PROGRAM_NOT_ALLOWED_CODE = 'LASER_COMPLETION_PROGRAM_NOT_ALLOWED';

@Controller('integration/laser-completions')
@UseGuards(ApiKeyGuard)
export class LaserCompletionsController {
  constructor(private laserCompletionsService: LaserCompletionsService) {}

  @Post()
  @RequireIntegrationPermission('contact/process-stage:write')
  async completeByWorkNumbers(
    @Body() dto: CompleteLaserCompletionsDto,
    @CurrentUser() user: SessionUser
  ) {
    if (user.userType !== 'integration' || user.programType !== 'nesting_program') {
      throw new ForbiddenException({
        code: LASER_COMPLETION_PROGRAM_NOT_ALLOWED_CODE,
        message: 'laser-completions endpoint requires nesting_program API key',
      });
    }

    return this.laserCompletionsService.completeByWorkNumbers(dto);
  }
}
