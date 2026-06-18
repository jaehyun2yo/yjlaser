import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, StorageProvider } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  UpdateBackupSettingsDto,
  BackupSettingsResponse,
  BackupEligibleSummary,
  BackupExecutionResult,
  BackupHistoryItem,
  BackupHistoryResponse,
  BackupStartResult,
  BackupStatusResponse,
  BrowseDirectoriesResponse,
} from './dto/backup.dto';

interface BackupConfig {
  enabled: boolean;
  retentionDays: number;
  nasPath: string;
  deleteAfterBackup: boolean;
}

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  retentionDays: 45,
  nasPath: '',
  deleteAfterBackup: true,
};

const BACKUP_SETTINGS_KEY = 'backup.config';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private progress: BackupStatusResponse = {
    isRunning: false,
    total: 0,
    success: 0,
    failed: 0,
  };

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService
  ) {}

  /**
   * 백업 설정 조회
   */
  async getSettings(): Promise<BackupSettingsResponse> {
    try {
      const setting = await this.prisma.executeWithRetry(
        () =>
          this.prisma.systemSetting.findUnique({
            where: { key: BACKUP_SETTINGS_KEY },
          }),
        { operationName: 'backup.getSettings' }
      );

      if (!setting) {
        return { ...DEFAULT_BACKUP_CONFIG };
      }

      const value = setting.value as Record<string, unknown>;
      return {
        enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_BACKUP_CONFIG.enabled,
        retentionDays:
          typeof value.retentionDays === 'number'
            ? value.retentionDays
            : typeof value.periodDays === 'number'
              ? value.periodDays
              : DEFAULT_BACKUP_CONFIG.retentionDays,
        nasPath: typeof value.nasPath === 'string' ? value.nasPath : DEFAULT_BACKUP_CONFIG.nasPath,
        deleteAfterBackup:
          typeof value.deleteAfterBackup === 'boolean'
            ? value.deleteAfterBackup
            : DEFAULT_BACKUP_CONFIG.deleteAfterBackup,
      };
    } catch (error) {
      this.logger.error('Failed to get backup settings', error);
      return { ...DEFAULT_BACKUP_CONFIG };
    }
  }

  /**
   * 백업 설정 업데이트
   */
  async updateSettings(dto: UpdateBackupSettingsDto): Promise<BackupSettingsResponse> {
    const current = await this.getSettings();

    const updated: BackupConfig = {
      enabled: dto.enabled ?? current.enabled,
      retentionDays: dto.retentionDays ?? current.retentionDays,
      nasPath: dto.nasPath ?? current.nasPath,
      deleteAfterBackup: dto.deleteAfterBackup ?? current.deleteAfterBackup,
    };

    await this.prisma.executeWithRetry(
      () =>
        this.prisma.systemSetting.upsert({
          where: { key: BACKUP_SETTINGS_KEY },
          update: { value: updated as unknown as Prisma.InputJsonValue },
          create: { key: BACKUP_SETTINGS_KEY, value: updated as unknown as Prisma.InputJsonValue },
        }),
      { operationName: 'backup.updateSettings' }
    );

    return updated;
  }

  /**
   * 백업 대상 파일 조회
   */
  private async getEligibleFiles(retentionDays: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.findMany({
          where: {
            createdAt: { lt: cutoffDate },
            deletedAt: null,
          },
          include: {
            folder: true,
          },
        }),
      { operationName: 'backup.getEligibleFiles' }
    );
  }

  /**
   * 백업 대상 요약 조회
   */
  async getEligibleSummary(): Promise<BackupEligibleSummary> {
    const settings = await this.getSettings();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.retentionDays);

    const [count, sizeResult] = await Promise.all([
      this.prisma.executeWithRetry(
        () =>
          this.prisma.webhardFile.count({
            where: {
              createdAt: { lt: cutoffDate },
              deletedAt: null,
            },
          }),
        { operationName: 'backup.eligibleCount' }
      ),
      this.prisma.executeWithRetry<{ _sum: { size: bigint | null } }>(
        () =>
          this.prisma.webhardFile.aggregate({
            where: {
              createdAt: { lt: cutoffDate },
              deletedAt: null,
            },
            _sum: { size: true },
          }),
        { operationName: 'backup.eligibleSize' }
      ),
    ]);

    return {
      fileCount: count,
      totalSize: Number(sizeResult._sum.size ?? 0),
      retentionDays: settings.retentionDays,
    };
  }

  /**
   * 백업 진행 상태 조회
   */
  getStatus(): BackupStatusResponse {
    return { ...this.progress };
  }

  /**
   * 백업 시작 (비동기 — 즉시 반환)
   */
  async startBackup(): Promise<BackupStartResult> {
    if (this.progress.isRunning) {
      return { status: 'already_running' };
    }

    const settings = await this.getSettings();

    if (!settings.enabled) {
      return { status: 'skipped', reason: 'Backup is disabled' };
    }

    if (!settings.nasPath) {
      return { status: 'skipped', reason: 'NAS path is not configured' };
    }

    if (!fs.existsSync(settings.nasPath)) {
      return { status: 'skipped', reason: `NAS path not accessible: ${settings.nasPath}` };
    }

    const files = await this.getEligibleFiles(settings.retentionDays);

    if (files.length === 0) {
      return { status: 'skipped', reason: 'No eligible files found' };
    }

    this.progress = { isRunning: true, total: files.length, success: 0, failed: 0 };

    void this.executeBackupInternal(files, settings);

    return { status: 'started', total: files.length };
  }

  /**
   * 백업 실행 (내부용 — startBackup에서 fire-and-forget으로 호출)
   */
  private async executeBackupInternal(
    files: Awaited<ReturnType<typeof this.getEligibleFiles>>,
    settings: BackupSettingsResponse
  ): Promise<BackupExecutionResult> {
    let success = 0;
    let failed = 0;

    try {
      for (const file of files) {
        try {
          // 폴더 경로 구성
          const companyDir = file.companyId ? `company-${file.companyId}` : 'admin';
          const folderPath = file.folder?.path ?? '';
          const backupDir = path.join(settings.nasPath, companyDir, folderPath);
          const backupFilePath = path.join(backupDir, file.originalName);

          // 디렉토리 생성
          fs.mkdirSync(backupDir, { recursive: true });

          const buffer = await this.downloadFileBuffer(file);

          // NAS에 파일 저장
          fs.writeFileSync(backupFilePath, buffer);

          // BackupLog 기록 (success)
          await this.prisma.executeWithRetry(
            () =>
              this.prisma.backupLog.create({
                data: {
                  fileId: file.id,
                  fileName: file.name,
                  originalName: file.originalName,
                  fileSize: file.size,
                  r2Key: file.path,
                  backupPath: backupFilePath,
                  companyId: file.companyId,
                  status: 'success',
                },
              }),
            { operationName: 'backup.logSuccess' }
          );

          if (settings.deleteAfterBackup) {
            await this.deleteFileFromStorage(file);

            await this.prisma.executeWithRetry(
              () =>
                this.prisma.webhardFile.update({
                  where: { id: file.id },
                  data: { deletedAt: new Date(), deletedBy: 'backup-system' },
                }),
              { operationName: 'backup.markDeleted' }
            );
          }

          success++;
          this.progress.success++;
        } catch (error) {
          failed++;
          this.progress.failed++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to backup file ${file.id}: ${errorMessage}`);

          // BackupLog 기록 (failed)
          try {
            await this.prisma.executeWithRetry(
              () =>
                this.prisma.backupLog.create({
                  data: {
                    fileId: file.id,
                    fileName: file.name,
                    originalName: file.originalName,
                    fileSize: file.size,
                    r2Key: file.path,
                    backupPath: '',
                    companyId: file.companyId,
                    status: 'failed',
                    error: errorMessage.substring(0, 1000),
                  },
                }),
              { operationName: 'backup.logFailed' }
            );
          } catch (logError) {
            this.logger.error('Failed to create backup log entry', logError);
          }
        }
      }

      this.logger.log(
        `Backup completed: ${success} success, ${failed} failed out of ${files.length} files`
      );
      return { total: files.length, success, failed, skipped: false };
    } catch (error) {
      this.logger.error('Backup failed with unexpected error', error);
      return { total: files.length, success, failed, skipped: false };
    } finally {
      this.progress.isRunning = false;
    }
  }

  /**
   * 백업 이력 조회
   */
  async getHistory(page: number = 1, limit: number = 20): Promise<BackupHistoryResponse> {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.executeWithRetry(
        () =>
          this.prisma.backupLog.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        { operationName: 'backup.history' }
      ),
      this.prisma.executeWithRetry(() => this.prisma.backupLog.count(), {
        operationName: 'backup.historyCount',
      }),
    ]);

    const mappedItems: BackupHistoryItem[] = items.map((item) => ({
      id: item.id,
      fileId: item.fileId,
      fileName: item.fileName,
      originalName: item.originalName,
      fileSize: item.fileSize.toString(),
      r2Key: item.r2Key,
      backupPath: item.backupPath,
      companyId: item.companyId,
      status: item.status,
      error: item.error,
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      items: mappedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 디렉토리 목록 조회 (NAS 경로 브라우징)
   */
  browseDirectories(dirPath?: string): BrowseDirectoriesResponse {
    // 경로 미지정 시 Windows 드라이브 목록 반환
    if (!dirPath) {
      const drives: string[] = [];
      for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
        const drive = `${letter}:\\`;
        if (fs.existsSync(drive)) {
          drives.push(drive);
        }
      }
      return { path: '', parent: null, directories: drives };
    }

    const normalizedPath = path.resolve(dirPath);

    if (!fs.existsSync(normalizedPath)) {
      return {
        path: normalizedPath,
        parent: path.dirname(normalizedPath),
        directories: [],
        error: 'Path does not exist',
      };
    }

    try {
      const stat = fs.statSync(normalizedPath);
      if (!stat.isDirectory()) {
        return {
          path: normalizedPath,
          parent: path.dirname(normalizedPath),
          directories: [],
          error: 'Not a directory',
        };
      }

      const entries = fs.readdirSync(normalizedPath, { withFileTypes: true });
      const directories = entries
        .filter((e) => {
          try {
            return e.isDirectory();
          } catch {
            return false;
          }
        })
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'ko'));

      const parent = path.dirname(normalizedPath);
      return {
        path: normalizedPath,
        parent: parent !== normalizedPath ? parent : null,
        directories,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to browse directory: ${normalizedPath}`, msg);
      return {
        path: normalizedPath,
        parent: path.dirname(normalizedPath),
        directories: [],
        error: 'Access denied',
      };
    }
  }

  /**
   * 매일 새벽 2시 자동 백업 실행
   */
  @Cron('0 2 * * *')
  async handleScheduledBackup(): Promise<void> {
    this.logger.log('Starting scheduled backup...');
    try {
      const result = await this.startBackup();
      if (result.status === 'skipped') {
        this.logger.log(`Scheduled backup skipped: ${result.reason}`);
      } else if (result.status === 'already_running') {
        this.logger.warn('Scheduled backup skipped: already running');
      } else {
        this.logger.log(`Scheduled backup started: ${result.total} files`);
      }
    } catch (error) {
      this.logger.error('Scheduled backup failed with unexpected error', error);
    }
  }

  private async downloadFileBuffer(file: {
    path: string;
    storageProvider: StorageProvider;
    driveFileId: string | null;
  }): Promise<Buffer> {
    const download = await this.storageService.downloadWebhardFile({
      path: file.path,
      storageProvider: file.storageProvider,
      driveFileId: file.driveFileId,
    });

    if ('stream' in download) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of download.stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }

    const response = await fetch(download.url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download backup source: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async deleteFileFromStorage(file: {
    path: string;
    storageProvider: StorageProvider;
    driveFileId: string | null;
  }): Promise<void> {
    if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
      if (!file.driveFileId) {
        throw new Error('Drive file id is missing');
      }
      await this.storageService.trashDriveFile({ storageFileId: file.driveFileId });
      return;
    }

    await this.storageService.deleteFile(file.path);
  }
}
