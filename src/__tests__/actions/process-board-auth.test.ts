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

import { getProcessBoardContacts } from '@/app/actions/process-board';
import { getSessionUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { serverGetContacts } from '@/lib/api/nestjs-server-client';

const mockedGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;
const mockedGetErpWorkerSession = getErpWorkerSession as jest.MockedFunction<
  typeof getErpWorkerSession
>;
const mockedServerGetContacts = serverGetContacts as jest.MockedFunction<typeof serverGetContacts>;

describe('process board action authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSessionUser.mockResolvedValue(null);
    mockedGetErpWorkerSession.mockResolvedValue(null);
  });

  it('getProcessBoardContacts는 인증 없는 호출에서 backend API를 호출하지 않는다', async () => {
    const result = await getProcessBoardContacts({ workCategory: 'field' });

    expect(result.success).toBe(false);
    expect(result.data).toEqual([]);
    expect(mockedServerGetContacts).not.toHaveBeenCalled();
  });
});
