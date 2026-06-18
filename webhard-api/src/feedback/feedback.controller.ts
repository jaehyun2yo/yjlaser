import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';

@Controller('feedback')
@UseGuards(ApiKeyGuard)
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('companyId', new ParseIntPipe({ optional: true })) companyId?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number
  ) {
    return this.feedbackService.findAll({ status, companyId, limit, offset });
  }

  @Get('status-counts')
  async getStatusCounts() {
    return this.feedbackService.getStatusCounts();
  }

  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.feedbackService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: UpdateFeedbackDto) {
    return this.feedbackService.update(id, dto);
  }
}
