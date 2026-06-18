import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/auth.service';
import { UpdateSettingsDto, SettingsResponseDto } from './dto/settings.dto';

const SETTINGS_CACHE_TTL = 300000; // 300s in ms

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  /**
   * Get user settings
   */
  async getSettings(user: SessionUser): Promise<SettingsResponseDto> {
    const userId = this.getUserId(user);
    const cacheKey = `settings:${userId}`;

    const cached = await this.cacheManager.get<SettingsResponseDto>(cacheKey);
    if (cached) return cached;

    try {
      // PrismaService의 executeWithRetry 사용
      let settings = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardSettings.findUnique({
            where: { userId },
          }),
        { operationName: 'getSettings.findUnique' }
      );

      if (!settings) {
        // 기본 설정 생성
        settings = await this.prisma.executeWithRetry(
          () =>
            this.prisma.webhardSettings.create({
              data: {
                userId,
                fontSize: 'small',
                notificationsEnabled: true,
                downloadFolderPath: null,
              },
            }),
          { operationName: 'getSettings.create' }
        );
      }

      const dto = this.mapToDto(settings);
      await this.cacheManager.set(cacheKey, dto, SETTINGS_CACHE_TTL);
      return dto;
    } catch (error) {
      this.logger.error(`Failed to get settings for ${userId}`, error);

      // 에러 발생 시 기본값 반환 (서비스 중단 방지)
      return {
        userId,
        fontSize: 'small',
        notificationsEnabled: true,
        downloadFolderPath: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Update user settings
   */
  async updateSettings(dto: UpdateSettingsDto, user: SessionUser): Promise<SettingsResponseDto> {
    const userId = this.getUserId(user);
    const cacheKey = `settings:${userId}`;

    try {
      // PrismaService의 executeWithRetry 사용
      const settings = await this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardSettings.upsert({
            where: { userId },
            update: {
              ...(dto.fontSize !== undefined && { fontSize: dto.fontSize }),
              ...(dto.notificationsEnabled !== undefined && {
                notificationsEnabled: dto.notificationsEnabled,
              }),
              ...(dto.downloadFolderPath !== undefined && {
                downloadFolderPath: dto.downloadFolderPath,
              }),
              updatedAt: new Date(),
            },
            create: {
              userId,
              fontSize: dto.fontSize ?? 'small',
              notificationsEnabled: dto.notificationsEnabled ?? true,
              downloadFolderPath: dto.downloadFolderPath ?? null,
            },
          }),
        { operationName: 'updateSettings' }
      );

      await this.cacheManager.del(cacheKey);
      return this.mapToDto(settings);
    } catch (error) {
      this.logger.error(`Failed to update settings for ${userId}`, error);

      // 업데이트 실패 시에도 현재 설정 반환 시도
      try {
        const current = await this.getSettings(user);
        return current;
      } catch {
        // 완전히 실패하면 기본값 반환
        return {
          userId,
          fontSize: dto.fontSize ?? 'small',
          notificationsEnabled: dto.notificationsEnabled ?? true,
          downloadFolderPath: dto.downloadFolderPath ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    }
  }

  /**
   * Get user ID string for settings
   */
  private getUserId(user: SessionUser): string {
    if (user.userType === 'admin') {
      return 'admin';
    }
    return `company-${user.companyId}`;
  }

  /**
   * Map database model to DTO
   */
  private mapToDto(settings: {
    userId: string;
    fontSize: string;
    notificationsEnabled: boolean;
    downloadFolderPath: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SettingsResponseDto {
    return {
      userId: settings.userId,
      fontSize: settings.fontSize,
      notificationsEnabled: settings.notificationsEnabled,
      downloadFolderPath: settings.downloadFolderPath,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
