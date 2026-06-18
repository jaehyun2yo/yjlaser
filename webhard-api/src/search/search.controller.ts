import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionUser } from '../auth/auth.service';
import { SearchQueryDto } from './dto/search.dto';

@Controller('search')
@UseGuards(ApiKeyGuard, CompanyAccessGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search - 통합 검색 (파일 + 폴더)
   */
  @Get()
  async search(@Query() query: SearchQueryDto, @CurrentUser() user: SessionUser) {
    return this.searchService.search(query, user);
  }
}
