import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CompleteLaserCompletionsDto } from './dto/laser-completion.dto';
import { LaserCompletionsService } from './laser-completions.service';

@Controller('integration/laser-completions')
@UseGuards(ApiKeyGuard)
export class LaserCompletionsController {
  constructor(private laserCompletionsService: LaserCompletionsService) {}

  @Post()
  async completeByWorkNumbers(@Body() dto: CompleteLaserCompletionsDto) {
    return this.laserCompletionsService.completeByWorkNumbers(dto);
  }
}
