import { Logger } from '@nestjs/common';
import { hashIdentifier } from '../common/logging/log-event';
import { SessionUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

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
  error_type?: string;
  metadata?: Record<string, unknown>;
};

type MockPrisma = {
  executeWithRetry: jest.Mock;
  webhardSettings: {
    findUnique: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
  };
};

type MockCache = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
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

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn(async (operation: () => unknown) => operation()),
    webhardSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        userId: 'company-7',
        fontSize: 'small',
        notificationsEnabled: true,
        downloadFolderPath: null,
        createdAt: new Date('2026-06-22T12:00:00.000Z'),
        updatedAt: new Date('2026-06-22T12:00:00.000Z'),
      }),
      upsert: jest.fn().mockResolvedValue({
        userId: 'company-7',
        fontSize: 'large',
        notificationsEnabled: false,
        downloadFolderPath: 'C:\\Users\\jaehy\\secret\\download',
        createdAt: new Date('2026-06-22T12:00:00.000Z'),
        updatedAt: new Date('2026-06-22T12:00:00.000Z'),
      }),
    },
  };
}

function makeCache(): MockCache {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prisma = makePrisma(), cache = makeCache()): SettingsService {
  return new SettingsService(prisma as unknown as PrismaService, cache as never);
}

function makeCompanyUser(): SessionUser {
  return {
    userType: 'company',
    userId: 'manager@example.com',
    companyId: 7,
  };
}

describe('SettingsService logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getSettings 실패 로그에 raw userId나 Error message를 남기지 않는다', async () => {
    const prisma = makePrisma();
    prisma.executeWithRetry.mockRejectedValue(new Error('db failed manager@example.com raw-token'));
    const service = makeService(prisma);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const result = await service.getSettings(makeCompanyUser());

    expect(result).toMatchObject({
      userId: 'company-7',
      fontSize: 'small',
      notificationsEnabled: true,
      downloadFolderPath: null,
    });
    const event = findJsonLogEvent(errorSpy, 'settings_load_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'SettingsService',
      feature: 'settings',
      action: 'load_settings',
      status: 'failure',
      channel: 'error',
      actor_id_hash: hashIdentifier('company-7'),
      error_type: 'Error',
      metadata: {
        reason: 'settings_load_failed',
        user_type: 'company',
      },
    });

    const logPayload = serializeLoggerCalls(errorSpy);
    expect(logPayload).not.toContain('company-7');
    expect(logPayload).not.toContain('manager@example.com');
    expect(logPayload).not.toContain('db failed');
    expect(logPayload).not.toContain('raw-token');
  });

  it('updateSettings 실패 로그에 raw download path나 Error message를 남기지 않는다', async () => {
    const prisma = makePrisma();
    prisma.webhardSettings.upsert.mockRejectedValue(
      new Error('write failed C:\\Users\\jaehy\\secret\\download raw-token')
    );
    prisma.webhardSettings.findUnique.mockResolvedValue({
      userId: 'company-7',
      fontSize: 'medium',
      notificationsEnabled: true,
      downloadFolderPath: null,
      createdAt: new Date('2026-06-22T12:00:00.000Z'),
      updatedAt: new Date('2026-06-22T12:00:00.000Z'),
    });
    const service = makeService(prisma);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const result = await service.updateSettings(
      {
        downloadFolderPath: 'C:\\Users\\jaehy\\secret\\download',
        notificationsEnabled: false,
      },
      makeCompanyUser()
    );

    expect(result).toMatchObject({
      userId: 'company-7',
      fontSize: 'medium',
      notificationsEnabled: true,
      downloadFolderPath: null,
    });
    const event = findJsonLogEvent(errorSpy, 'settings_update_failed');
    expect(event).toMatchObject({
      level: 'error',
      project: 'company_site',
      component: 'SettingsService',
      feature: 'settings',
      action: 'update_settings',
      status: 'failure',
      channel: 'error',
      actor_id_hash: hashIdentifier('company-7'),
      error_type: 'Error',
      metadata: {
        reason: 'settings_update_failed',
        user_type: 'company',
        font_size_present: false,
        notifications_present: true,
        download_path_present: true,
      },
    });

    const logPayload = serializeLoggerCalls(errorSpy);
    expect(logPayload).not.toContain('company-7');
    expect(logPayload).not.toContain('manager@example.com');
    expect(logPayload).not.toContain('C:\\Users\\jaehy\\secret\\download');
    expect(logPayload).not.toContain('write failed');
    expect(logPayload).not.toContain('raw-token');
  });
});
