import { Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SessionUser } from '../../auth/auth.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireIntegrationPermission } from '../auth/require-integration-permission.decorator';
import { FileRegisterDto } from './dto/file-register.dto';
import { IntegrationFilesService } from './files.service';

const INTEGRATION_API_KEY_REQUIRED_CODE = 'INTEGRATION_API_KEY_REQUIRED';
const INTEGRATION_SOURCE_WORKER_MISMATCH_CODE = 'INTEGRATION_SOURCE_WORKER_MISMATCH';

@Controller('integration/files')
@UseGuards(ApiKeyGuard)
export class IntegrationFilesController {
  constructor(private readonly integrationFilesService: IntegrationFilesService) {}

  @Post('register')
  @RequireIntegrationPermission('file/register')
  async registerFile(@Body() dto: FileRegisterDto, @CurrentUser() user: SessionUser) {
    if (user.userType !== 'integration') {
      throw new ForbiddenException({
        code: INTEGRATION_API_KEY_REQUIRED_CODE,
        message: 'Integration API key required',
      });
    }

    if (user.programType !== dto.source_worker) {
      throw new ForbiddenException({
        code: INTEGRATION_SOURCE_WORKER_MISMATCH_CODE,
        message: 'API key program type must match source_worker',
      });
    }

    return this.integrationFilesService.registerFile(dto);
  }
}
