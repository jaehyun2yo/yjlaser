/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/session', () => ({
  verifySession: jest.fn(),
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  nestjsFetch: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { GET } from '@/app/api/webhard/performance/route';
import { getSessionUser, verifySession } from '@/lib/auth/session';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

const mockedVerifySession = verifySession as jest.MockedFunction<typeof verifySession>;
const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedNestjsFetch = nestjsFetch as jest.MockedFunction<typeof nestjsFetch>;

function makeRequest(): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/webhard/performance'), {
    headers: { cookie: 'admin-session=session-value' },
  });
}

describe('GET /api/webhard/performance', () => {
  const fixedNow = new Date('2026-05-10T12:00:00.000Z');
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    jest.clearAllMocks();
    mockedVerifySession.mockResolvedValue(true);
    mockedGetSessionUser.mockResolvedValue({
      userType: 'admin',
      userId: 'admin',
      companyId: null,
    });
    mockedNestjsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        logs: [
          {
            action: 'UPLOAD',
            created_at: '2026-05-10T11:00:00.000Z',
          },
          {
            action: 'DOWNLOAD',
            created_at: '2026-05-09T10:59:59.000Z',
          },
        ],
        total: 2,
      },
    });
    global.fetch = jest.fn(async () => {
      return Response.json({
        totalFiles: 0,
        totalFolders: 0,
        totalSize: 0,
        totalCompanies: 0,
        newFilesLast24h: 0,
        undownloadedFiles: 0,
        maxFolderDepth: 0,
        avgFolderDepth: 0,
        fileSizeDistribution: { small: 0, medium: 0, large: 0, xlarge: 0 },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('ActivityLogs에 24시간 startDate를 전달하고 stale 로그가 반환되어도 집계에서 제외한다', async () => {
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/activity-logs?limit=10000&startDate=2026-05-09T12%3A00%3A00.000Z',
      { useApiKey: true }
    );
    expect(body.metrics.uploadsLast24h).toBe(1);
    expect(body.metrics.downloadsLast24h).toBe(0);
    expect(body.metrics.recentActivities).toEqual([{ action: 'UPLOAD', count: 1 }]);
  });
});
