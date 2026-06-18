import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { PublicDataService } from './public-data.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { Public } from '../integration/auth/public.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';

@Controller('public-data')
@UseGuards(ApiKeyGuard)
export class PublicDataController {
  private readonly logger = new Logger(PublicDataController.name);

  constructor(private readonly publicDataService: PublicDataService) {}

  // ============ Portfolio ============

  @Get('portfolio')
  @Public()
  async findAllPortfolio(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return this.publicDataService.findAllPortfolio({ limit, offset });
  }

  @Get('portfolio/count')
  @Public()
  async countPortfolio() {
    const count = await this.publicDataService.countPortfolio();
    return { count };
  }

  @Get('portfolio/:id')
  @Public()
  async findPortfolioById(@Param('id') id: string) {
    return this.publicDataService.findPortfolioById(id);
  }

  @Post('portfolio')
  @HttpCode(HttpStatus.CREATED)
  async createPortfolio(@Body() dto: CreatePortfolioDto) {
    return this.publicDataService.createPortfolio(dto);
  }

  @Patch('portfolio/:id')
  async updatePortfolio(@Param('id') id: string, @Body() dto: UpdatePortfolioDto) {
    return this.publicDataService.updatePortfolio(id, dto);
  }

  @Delete('portfolio/:id')
  @HttpCode(HttpStatus.OK)
  async deletePortfolio(@Param('id') id: string) {
    return this.publicDataService.deletePortfolio(id);
  }

  // ============ Posts ============

  @Get('posts')
  @Public()
  async findAllPosts(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return this.publicDataService.findAllPosts({ limit, offset });
  }

  @Get('posts/count')
  @Public()
  async countPosts() {
    const count = await this.publicDataService.countPosts();
    return { count };
  }

  @Get('posts/:id')
  @Public()
  async findPostById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.publicDataService.findPostById(id);
  }

  @Post('posts/:id/view')
  @Public()
  @HttpCode(HttpStatus.OK)
  async incrementViewCount(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.publicDataService.incrementPostViewCount(id);
  }

  // ============ Dashboard Stats ============

  @Get('dashboard-stats')
  @Public()
  async getDashboardStats() {
    return this.publicDataService.getDashboardStats();
  }
}
