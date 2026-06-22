import { SyncLogService } from './sync-log.service';
import { SyncLogStatus } from './dto/sync-log.dto';

interface MockPrisma {
  executeWithRetry: jest.Mock;
  syncLog: {
    create: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
}

function makePrisma(): MockPrisma {
  return {
    executeWithRetry: jest.fn((fn: () => unknown) => fn()),
    syncLog: {
      create: jest.fn().mockResolvedValue({
        id: 1,
        filename: 'drawing.dxf',
        companyName: '원컴퍼니',
        status: SyncLogStatus.API_ERROR,
        errorMessage: 'routing_failed',
        metadata: {},
        createdAt: new Date('2026-05-10T12:00:00.000Z'),
      }),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

type PipelineEventInput = {
  filename: string;
  companyName?: string;
  stage: 'routing' | 'auto_contact';
  status: 'failed' | 'skipped';
  reasonCode: string;
  fileId?: string;
  folderId?: string;
  context?: Record<string, unknown>;
};

type PipelineBacklogQuery = {
  limit?: number;
};

type PipelineBacklogItem = {
  id: number;
  filename: string;
  companyName: string | null;
  stage: string;
  status: string;
  reasonCode: string;
  context: Record<string, unknown>;
};

function spyOnSyncLogLoggerLog(service: SyncLogService) {
  const logger = (
    service as unknown as {
      logger: { log: (...args: unknown[]) => void };
    }
  ).logger;

  return jest.spyOn(logger, 'log').mockImplementation(() => undefined);
}

describe('SyncLogService pipeline backlog', () => {
  it('create logger는 raw filename/companyName 없이 식별자와 상태만 남긴다', async () => {
    const prisma = makePrisma();
    const service = new SyncLogService(prisma as never);
    const logSpy = spyOnSyncLogLoggerLog(service);

    await service.create({
      filename: '거래처-도면-raw-name.dxf',
      companyName: '민감거래처',
      status: SyncLogStatus.SYNCED,
    } as never);

    const serializedCalls = JSON.stringify(logSpy.mock.calls);
    expect(serializedCalls).not.toContain('거래처-도면-raw-name.dxf');
    expect(serializedCalls).not.toContain('민감거래처');
    expect(logSpy).toHaveBeenCalledWith(
      {
        action: 'sync_log_created',
        status: SyncLogStatus.SYNCED,
        syncLogId: 1,
      },
      'SyncLog created'
    );
  });

  it('pipeline event를 sync_logs metadata에 구조화하고 raw filename/companyName/path를 저장하지 않는다', async () => {
    const prisma = makePrisma();
    const service = new SyncLogService(prisma as never);
    const pipelineService = service as unknown as {
      createPipelineEvent(input: PipelineEventInput): Promise<unknown>;
    };

    await pipelineService.createPipelineEvent({
      filename: '거래처-도면-raw-name.dxf',
      companyName: '원컴퍼니',
      stage: 'routing',
      status: 'failed',
      reasonCode: 'routing_failed',
      fileId: 'file-1',
      folderId: 'folder-1',
      context: {
        requestedFolderId: 'folder-1',
        folderPath: '/원컴퍼니/칼선의뢰/거래처-도면-raw-name.dxf',
        url: 'https://r2.example.com/presigned',
        token: 'raw-token',
        apiKey: 'raw-api-key',
        nested: {
          fileName: 'nested-raw-name.dxf',
          safeCount: 2,
        },
      },
    });

    const serializedCreateCall = JSON.stringify(prisma.syncLog.create.mock.calls[0][0]);
    expect(serializedCreateCall).not.toContain('거래처-도면-raw-name.dxf');
    expect(serializedCreateCall).not.toContain('원컴퍼니');
    expect(serializedCreateCall).not.toContain('/원컴퍼니/칼선의뢰');
    expect(serializedCreateCall).not.toContain('nested-raw-name.dxf');
    expect(serializedCreateCall).not.toContain('raw-token');
    expect(serializedCreateCall).not.toContain('raw-api-key');

    expect(prisma.syncLog.create).toHaveBeenCalledWith({
      data: {
        filename: 'file.dxf',
        companyName: undefined,
        status: SyncLogStatus.API_ERROR,
        contactId: undefined,
        orderId: undefined,
        errorMessage: 'routing_failed',
        md5Hash: undefined,
        metadata: {
          auditKind: 'webhard_pipeline',
          stage: 'routing',
          pipelineStatus: 'failed',
          reasonCode: 'routing_failed',
          fileId: 'file-1',
          folderId: 'folder-1',
          fileExtension: '.dxf',
          context: {
            requestedFolderId: 'folder-1',
            nested: {
              safeCount: 2,
            },
          },
        },
      },
    });
  });

  it('pipeline backlog 조회는 최근 실패/skip 목록을 sanitized shape로 반환한다', async () => {
    const prisma = makePrisma();
    prisma.syncLog.findMany.mockResolvedValue([
      {
        id: 7,
        filename: '거래처-skip-raw-name.dxf',
        companyName: '원컴퍼니',
        status: SyncLogStatus.SKIPPED,
        errorMessage: 'auto_contact_excluded_folder',
        metadata: {
          auditKind: 'webhard_pipeline',
          stage: 'auto_contact',
          pipelineStatus: 'skipped',
          reasonCode: 'auto_contact_excluded_folder',
          fileId: 'file-7',
          folderId: 'folder-7',
          context: {
            folderPath: '/원컴퍼니/제외',
            token: 'raw-token',
            nested: {
              fileName: 'inner-raw-name.dxf',
              safeCount: 1,
            },
          },
        },
        createdAt: new Date('2026-05-10T12:00:00.000Z'),
      },
    ]);
    const service = new SyncLogService(prisma as never);
    const pipelineService = service as unknown as {
      findPipelineBacklog(query: PipelineBacklogQuery): Promise<PipelineBacklogItem[]>;
    };

    const result = await pipelineService.findPipelineBacklog({ limit: 10 });

    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain('거래처-skip-raw-name.dxf');
    expect(serializedResult).not.toContain('원컴퍼니');
    expect(serializedResult).not.toContain('/원컴퍼니/제외');
    expect(serializedResult).not.toContain('raw-token');
    expect(serializedResult).not.toContain('inner-raw-name.dxf');

    expect(result).toEqual([
      {
        id: 7,
        filename: 'file.dxf',
        companyName: null,
        stage: 'auto_contact',
        status: 'skipped',
        reasonCode: 'auto_contact_excluded_folder',
        fileId: 'file-7',
        folderId: 'folder-7',
        context: {
          nested: {
            safeCount: 1,
          },
        },
        createdAt: '2026-05-10T12:00:00.000Z',
      },
    ]);
  });
});
