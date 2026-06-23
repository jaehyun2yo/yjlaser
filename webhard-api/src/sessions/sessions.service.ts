import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private errorMetadata(error: unknown): string {
    const errorType = error instanceof Error ? error.name : typeof error;
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined;

    return errorCode ? `errorType=${errorType} errorCode=${errorCode}` : `errorType=${errorType}`;
  }

  /**
   * 활성 세션 upsert (하트비트)
   */
  async upsertSession(
    userType: string,
    userId: number,
    username: string,
    companyName: string | null
  ): Promise<boolean> {
    try {
      await this.prisma.executeWithRetry(
        () =>
          this.prisma.activeSession.upsert({
            where: {
              userType_userId: { userType, userId },
            },
            create: {
              userType,
              userId,
              username,
              companyName,
              lastActivity: new Date(),
            },
            update: {
              username,
              companyName,
              lastActivity: new Date(),
            },
          }),
        { operationName: 'sessions.upsertSession' }
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to upsert active presence: ${this.errorMetadata(error)}`);
      return false;
    }
  }

  /**
   * 활성 세션 삭제 (로그아웃)
   */
  async deleteSession(userType: string, userId: number): Promise<boolean> {
    try {
      await this.prisma.executeWithRetry(
        () => this.prisma.activeSession.deleteMany({ where: { userType, userId } }),
        { operationName: 'sessions.deleteSession' }
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete active presence: ${this.errorMetadata(error)}`);
      return false;
    }
  }

  /**
   * 활성 세션 수 조회
   */
  async getSessionsCount() {
    // 5분 이내 활동한 세션만 유효
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);

    const [total, admin, company] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.activeSession.count({ where: { lastActivity: { gte: cutoff } } }),
          this.prisma.activeSession.count({
            where: { userType: 'admin', lastActivity: { gte: cutoff } },
          }),
          this.prisma.activeSession.count({
            where: { userType: 'company', lastActivity: { gte: cutoff } },
          }),
        ]),
      { operationName: 'sessions.getSessionsCount' }
    );

    return {
      total_count: total,
      admin_count: admin,
      company_count: company,
    };
  }

  /**
   * 활성 세션 목록 조회
   */
  async getSessionsList() {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);

    const sessions = await this.prisma.executeWithRetry(
      () =>
        this.prisma.activeSession.findMany({
          where: { lastActivity: { gte: cutoff } },
          orderBy: { lastActivity: 'desc' },
        }),
      { operationName: 'sessions.getSessionsList' }
    );

    return sessions.map((s) => ({
      id: s.id,
      user_type: s.userType,
      user_id: s.userId,
      username: s.username,
      company_name: s.companyName,
      last_activity: s.lastActivity.toISOString(),
    }));
  }
}
