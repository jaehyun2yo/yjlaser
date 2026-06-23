import { Logger } from '@nestjs/common';
import { StorageProvider } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { hashIdentifier } from '../common/logging/log-event';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BackupExecutionResult, BackupSettingsResponse } from './dto/backup.dto';
import { BackupService } from './backup.service';

type LoggedBackendEvent = {
  schema_version: 1;
  event: string;
  level: string;
  project: string;
  component: string;
  feature: string;
  action: string;
  status: string;
  channel: string;
  actor_id_hash?: string;
  target_id_hash?: string;
  error_type?: string;
  metadata?: Record<string, unknown>;
};

type BackupFileForTest = {
  id: string;
  name: string;
  originalName: string;
  size: bigint;
  path: string;
  companyId: number | null;
  storageProvider: StorageProvider;
  driveFileId: string | null;
  folder: { path: string } | null;
};

type BackupServicePrivate = {
  executeBackupInternal(
    files: BackupFileForTest[],
    settings: BackupSettingsResponse
  ): Promise<BackupExecutionResult>;
};

function serializeLoggerCalls(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(
    spies.flatMap((spy) =>
      spy.mock.calls.flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    )
  );
}

function findJsonLogEvent(spy: jest.SpyInstance, eventName: string): LoggedBackendEvent {
  const event = spy.mock.calls
    .flatMap((call: unknown[]) => call.map((value: unknown) => String(value)))
    .map((value) => {
      try {
        return JSON.parse(value) as Partial<LoggedBackendEvent>;
      } catch {
        return null;
      }
    })
    .find(
      (value): value is LoggedBackendEvent =>
        value?.schema_version === 1 && value.event === eventName
    );

  if (!event) {
    throw new Error(`Missing JSON log event: ${eventName}`);
  }

  return event;
}

function createService(): {
  service: BackupService;
  prisma: {
    executeWithRetry: jest.Mock;
    backupLog: { create: jest.Mock };
    webhardFile: { update: jest.Mock };
  };
  storage: {
    downloadWebhardFile: jest.Mock;
    trashDriveFile: jest.Mock;
    deleteFile: jest.Mock;
  };
} {
  const prisma = {
    executeWithRetry: jest.fn(async (operation: () => unknown) => operation()),
    backupLog: {
      create: jest.fn().mockResolvedValue({ id: 'backup-log-id' }),
    },
    webhardFile: {
      update: jest.fn().mockResolvedValue({ id: 'file-id' }),
    },
  };
  const storage = {
    downloadWebhardFile: jest.fn(),
    trashDriveFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const service = new BackupService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService
  );

  return { service, prisma, storage };
}

describe('BackupService logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('파일 백업 실패 로그에 raw file name, storage key, error message를 남기지 않는다', async () => {
    const { service, storage } = createService();
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    storage.downloadWebhardFile.mockRejectedValue(
      new Error('download failed customers/secret/raw-token/고객도면.dxf')
    );
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const file: BackupFileForTest = {
      id: 'file-123',
      name: 'internal-name.dxf',
      originalName: '고객도면.dxf',
      size: 1234n,
      path: 'customers/secret/raw-token/고객도면.dxf',
      companyId: 7,
      storageProvider: StorageProvider.R2,
      driveFileId: null,
      folder: { path: '대성목형/2026-06' },
    };
    const settings: BackupSettingsResponse = {
      enabled: true,
      retentionDays: 45,
      nasPath: 'D:\\nas-backup\\secret',
      deleteAfterBackup: false,
    };

    await (service as unknown as BackupServicePrivate).executeBackupInternal([file], settings);

    const event = findJsonLogEvent(errorSpy, 'backup_file_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'BackupService',
      feature: 'backup',
      action: 'backup_file',
      status: 'failure',
      channel: 'error',
      actor_id_hash: hashIdentifier(7),
      target_id_hash: hashIdentifier('file-123'),
      error_type: 'Error',
      metadata: {
        reason: 'backup_file_failed',
        storage_provider: StorageProvider.R2,
      },
    });

    const logPayload = serializeLoggerCalls(errorSpy);
    expect(logPayload).not.toContain('고객도면.dxf');
    expect(logPayload).not.toContain('internal-name.dxf');
    expect(logPayload).not.toContain('customers/secret/raw-token');
    expect(logPayload).not.toContain('D:\\nas-backup\\secret');
    expect(logPayload).not.toContain('download failed');
    expect(logPayload).not.toContain('raw-token');
  });

  it('디렉토리 탐색 실패 로그에 raw local path나 error message를 남기지 않는다', () => {
    const { service } = createService();
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('EACCES C:\\Users\\jaehy\\secret\\raw-token');
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const rawPath = 'C:\\Users\\jaehy\\secret\\backup';

    const result = service.browseDirectories(rawPath);

    expect(result.error).toBe('Access denied');
    const event = findJsonLogEvent(errorSpy, 'backup_directory_browse_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'BackupService',
      feature: 'backup',
      action: 'browse_directory',
      status: 'failure',
      channel: 'error',
      target_id_hash: hashIdentifier(path.resolve(rawPath)),
      error_type: 'Error',
      metadata: {
        reason: 'directory_browse_failed',
      },
    });

    const logPayload = serializeLoggerCalls(errorSpy);
    expect(logPayload).not.toContain(rawPath);
    expect(logPayload).not.toContain('C:\\Users\\jaehy\\secret');
    expect(logPayload).not.toContain('EACCES');
    expect(logPayload).not.toContain('raw-token');
  });

  it('예약 백업 skip 로그에 raw NAS path를 남기지 않는다', async () => {
    const { service } = createService();
    jest.spyOn(service, 'startBackup').mockResolvedValue({
      status: 'skipped',
      reason: 'NAS path not accessible: C:\\Users\\jaehy\\secret\\raw-token',
    });
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await service.handleScheduledBackup();

    const event = findJsonLogEvent(logSpy, 'scheduled_backup_skipped');
    expect(event).toMatchObject({
      level: 'info',
      project: 'company_site',
      component: 'BackupService',
      feature: 'backup',
      action: 'run_scheduled_backup',
      status: 'skipped',
      channel: 'audit',
      metadata: {
        reason: 'nas_path_not_accessible',
      },
    });

    const logPayload = serializeLoggerCalls(logSpy);
    expect(logPayload).not.toContain('C:\\Users\\jaehy\\secret');
    expect(logPayload).not.toContain('raw-token');
  });
});
