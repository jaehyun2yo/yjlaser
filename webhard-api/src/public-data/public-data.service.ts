import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';

const PUBLIC_DATA_CACHE_TTL = 300000; // 300s in ms
const CACHE_KEY_PORTFOLIO_LIST = 'portfolio:list';
const CACHE_KEY_POSTS_LIST = 'posts:list';

@Injectable()
export class PublicDataService {
  private readonly logger = new Logger(PublicDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  // ============ Portfolio ============

  async findAllPortfolio(options?: { limit?: number; offset?: number }) {
    // Only cache default (no pagination offset/limit override) requests
    const isDefault = !options?.offset && !options?.limit;
    if (isDefault) {
      const cached =
        await this.cacheManager.get<ReturnType<typeof this.mapPortfolio>[]>(
          CACHE_KEY_PORTFOLIO_LIST
        );
      if (cached) return cached;
    }

    const portfolios = await this.prisma.executeWithRetry(
      () =>
        this.prisma.portfolio.findMany({
          orderBy: { createdAt: 'desc' },
          skip: options?.offset || 0,
          take: options?.limit || 100,
        }),
      { operationName: 'publicData.findAllPortfolio' }
    );

    const result = portfolios.map((p) => this.mapPortfolio(p));
    if (isDefault) {
      await this.cacheManager.set(CACHE_KEY_PORTFOLIO_LIST, result, PUBLIC_DATA_CACHE_TTL);
    }
    return result;
  }

  private mapPortfolio(p: {
    id: string;
    title: string;
    field: string;
    purpose: string;
    type: string;
    format: string;
    size: string;
    paper: string;
    printing: string;
    finishing: string;
    description: string;
    images: unknown;
    createdAt: Date;
    updatedAt: Date | null;
  }) {
    return {
      id: p.id,
      title: p.title,
      field: p.field,
      purpose: p.purpose,
      type: p.type,
      format: p.format,
      size: p.size,
      paper: p.paper,
      printing: p.printing,
      finishing: p.finishing,
      description: p.description,
      images: p.images,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt?.toISOString() || null,
    };
  }

  async findPortfolioById(id: string) {
    const portfolio = await this.prisma.executeWithRetry(
      () => this.prisma.portfolio.findUnique({ where: { id } }),
      { operationName: 'publicData.findPortfolioById' }
    );
    if (!portfolio) {
      throw new NotFoundException(`Portfolio ${id} not found`);
    }

    return {
      id: portfolio.id,
      title: portfolio.title,
      field: portfolio.field,
      purpose: portfolio.purpose,
      type: portfolio.type,
      format: portfolio.format,
      size: portfolio.size,
      paper: portfolio.paper,
      printing: portfolio.printing,
      finishing: portfolio.finishing,
      description: portfolio.description,
      images: portfolio.images,
      created_at: portfolio.createdAt.toISOString(),
      updated_at: portfolio.updatedAt?.toISOString() || null,
    };
  }

  async createPortfolio(data: {
    title: string;
    field: string;
    purpose: string;
    type: string;
    format: string;
    size: string;
    paper: string;
    printing: string;
    finishing: string;
    description: string;
    images?: unknown;
  }) {
    const portfolio = await this.prisma.executeWithRetry(
      () =>
        this.prisma.portfolio.create({
          data: {
            title: data.title,
            field: data.field,
            purpose: data.purpose,
            type: data.type,
            format: data.format,
            size: data.size,
            paper: data.paper,
            printing: data.printing,
            finishing: data.finishing,
            description: data.description,
            images: (data.images as Prisma.InputJsonValue) || [],
          },
        }),
      { operationName: 'publicData.createPortfolio' }
    );

    await this.cacheManager.del(CACHE_KEY_PORTFOLIO_LIST);
    return { id: portfolio.id };
  }

  async updatePortfolio(id: string, data: UpdatePortfolioDto) {
    const updateData: Prisma.PortfolioUpdateInput = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title as string;
    if (data.field !== undefined) updateData.field = data.field as string;
    if (data.purpose !== undefined) updateData.purpose = data.purpose as string;
    if (data.type !== undefined) updateData.type = data.type as string;
    if (data.format !== undefined) updateData.format = data.format as string;
    if (data.size !== undefined) updateData.size = data.size as string;
    if (data.paper !== undefined) updateData.paper = data.paper as string;
    if (data.printing !== undefined) updateData.printing = data.printing as string;
    if (data.finishing !== undefined) updateData.finishing = data.finishing as string;
    if (data.description !== undefined) updateData.description = data.description as string;
    if (data.images !== undefined) updateData.images = data.images as Prisma.InputJsonValue;

    await this.prisma.executeWithRetry(
      () => this.prisma.portfolio.update({ where: { id }, data: updateData }),
      { operationName: 'publicData.updatePortfolio' }
    );
    await this.cacheManager.del(CACHE_KEY_PORTFOLIO_LIST);
    return { success: true };
  }

  async deletePortfolio(id: string) {
    await this.prisma.executeWithRetry(() => this.prisma.portfolio.delete({ where: { id } }), {
      operationName: 'publicData.deletePortfolio',
    });
    await this.cacheManager.del(CACHE_KEY_PORTFOLIO_LIST);
    return { success: true };
  }

  async countPortfolio() {
    return this.prisma.executeWithRetry(() => this.prisma.portfolio.count(), {
      operationName: 'publicData.countPortfolio',
    });
  }

  // ============ Posts ============

  async findAllPosts(options?: { limit?: number; offset?: number }) {
    const isDefault = !options?.offset && !options?.limit;
    if (isDefault) {
      const cached =
        await this.cacheManager.get<
          { id: number; title: string; content: string; view_count: number; created_at: string }[]
        >(CACHE_KEY_POSTS_LIST);
      if (cached) return cached;
    }

    const posts = await this.prisma.executeWithRetry(
      () =>
        this.prisma.post.findMany({
          orderBy: { createdAt: 'desc' },
          skip: options?.offset || 0,
          take: options?.limit || 100,
        }),
      { operationName: 'publicData.findAllPosts' }
    );

    const result = posts.map((p) => ({
      id: Number(p.id),
      title: p.title,
      content: p.content,
      view_count: p.viewCount,
      created_at: p.createdAt.toISOString(),
    }));

    if (isDefault) {
      await this.cacheManager.set(CACHE_KEY_POSTS_LIST, result, PUBLIC_DATA_CACHE_TTL);
    }
    return result;
  }

  async findPostById(id: bigint) {
    const post = await this.prisma.executeWithRetry(
      () => this.prisma.post.findUnique({ where: { id } }),
      { operationName: 'publicData.findPostById' }
    );
    if (!post) {
      throw new NotFoundException(`Post ${id} not found`);
    }

    return {
      id: Number(post.id),
      title: post.title,
      content: post.content,
      view_count: post.viewCount,
      created_at: post.createdAt.toISOString(),
    };
  }

  async incrementPostViewCount(id: bigint) {
    await this.prisma.executeWithRetry(
      () => this.prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
      { operationName: 'publicData.incrementPostViewCount' }
    );
    return { success: true };
  }

  async countPosts() {
    return this.prisma.executeWithRetry(() => this.prisma.post.count(), {
      operationName: 'publicData.countPosts',
    });
  }

  // ============ Dashboard Stats ============

  /**
   * 대시보드 통계 (기존 RPC: get_dashboard_stats)
   */
  async getDashboardStats() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [todayContactCount, yesterdayContactCount, newCompanyCount, yesterdayCompanyCount] =
      await this.prisma.executeWithRetry(
        () =>
          Promise.all([
            this.prisma.contact.count({
              where: { createdAt: { gte: today } },
            }),
            this.prisma.contact.count({
              where: {
                createdAt: { gte: yesterday, lt: today },
              },
            }),
            this.prisma.company.count({
              where: { createdAt: { gte: thirtyDaysAgo } },
            }),
            this.prisma.company.count({
              where: {
                createdAt: { gte: yesterday, lt: today },
              },
            }),
          ]),
        { operationName: 'publicData.getDashboardStats.counts' }
      );

    // 일별 문의 데이터 (30일간)
    const dailyContacts = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM contacts
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    // 유입 경로 통계
    const referralSources = await this.prisma.$queryRaw<
      { referral_source: string | null; count: bigint }[]
    >`
      SELECT referral_source, COUNT(*) as count
      FROM contacts
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY referral_source
      ORDER BY count DESC
    `;

    return [
      {
        today_contact_count: todayContactCount,
        yesterday_contact_count: yesterdayContactCount,
        new_company_count: newCompanyCount,
        yesterday_company_count: yesterdayCompanyCount,
        daily_contacts: dailyContacts.map((d) => ({
          date: new Date(d.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
          count: Number(d.count),
          fullDate: d.date,
        })),
        referral_sources: referralSources.map((r) => ({
          referral_source: r.referral_source,
          count: Number(r.count),
        })),
      },
    ];
  }
}
