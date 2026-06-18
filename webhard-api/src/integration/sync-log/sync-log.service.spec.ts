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
  stage: string;
  status: string;
  reasonCode: string;
  context: Record<string, unknown>;
};

describe('SyncLogService pipeline backlog', () => {
  it('pipeline event를 sync_logs metadata에 구조화하고 secret/presigned URL 필드를 저장하지 않는다', async () => {
    const prisma = makePrisma();
    const service = new SyncLogService(prisma as never);
    const pipelineService = service as unknown as {
      createPipelineEvent(input: PipelineEventInput): Promise<unknown>;
    };

    await pipelineService.createPipelineEvent({
      filename: 'drawing.dxf',
      companyName: '원컴퍼니',
      stage: 'routing',
      status: 'failed',
      reasonCode: 'routing_failed',
      fileId: 'file-1',
      folderId: 'folder-1',
      context: {
        requestedFolderId: 'folder-1',
        url: 'https://r2.example.com/presigned',
        token: 'raw-token',
        apiKey: 'raw-api-key',
      },
    });

    expect(prisma.syncLog.create).toHaveBeenCalledWith({
      data: {
        filename: 'drawing.dxf',
        companyName: '원컴퍼니',
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
          context: {
            requestedFolderId: 'folder-1',
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
        filename: 'skip.dxf',
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

    expect(result).toEqual([
      {
        id: 7,
        filename: 'skip.dxf',
        companyName: '원컴퍼니',
        stage: 'auto_contact',
        status: 'skipped',
        reasonCode: 'auto_contact_excluded_folder',
        fileId: 'file-7',
        folderId: 'folder-7',
        context: {
          folderPath: '/원컴퍼니/제외',
        },
        createdAt: '2026-05-10T12:00:00.000Z',
      },
    ]);
  });
});
