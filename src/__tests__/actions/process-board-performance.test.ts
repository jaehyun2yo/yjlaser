/**
 * @jest-environment node
 */

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionUser: jest.fn(),
}));

jest.mock('@/lib/auth/erp-session', () => ({
  getErpWorkerSession: jest.fn(),
}));

jest.mock('@/lib/api/nestjs-server-client', () => ({
  serverGetContacts: jest.fn(),
  serverCreateContact: jest.fn(),
  serverGetDistinctCompanyNames: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    createLogger: () => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { getDeliveredContacts, getProcessBoardContacts } from '@/app/actions/process-board';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { serverGetContacts } from '@/lib/api/nestjs-server-client';

const mockedGetErpWorkerSession = getErpWorkerSession as jest.MockedFunction<
  typeof getErpWorkerSession
>;
const mockedServerGetContacts = serverGetContacts as jest.MockedFunction<typeof serverGetContacts>;

describe('process board performance contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetErpWorkerSession.mockResolvedValue({
      workerId: 'worker-1',
      workerName: '작업자',
    });
    mockedServerGetContacts.mockResolvedValue({
      contacts: [],
      totalCount: 0,
      hasMore: false,
    });
  });

  it('worker list actions honor an explicit small limit instead of forcing 1000 rows', async () => {
    await getProcessBoardContacts({ workCategory: 'field', limit: 50 });

    expect(mockedServerGetContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        workCategory: 'field',
        limit: 50,
      }),
      { revalidate: 0 }
    );
  });

  it('delivered search uses server-side search, a small limit, and skips eager timeline payload', async () => {
    await getDeliveredContacts({ search: 'laser' });

    expect(mockedServerGetContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'delivered',
        search: 'laser',
        limit: 20,
        includeTimeline: false,
      })
    );
  });
});
