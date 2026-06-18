jest.mock('@/lib/api/nestjs/core.client', () => ({
  getNestjsClientDiagnostics: () => ({
    apiKeySet: true,
    apiPrefix: '/api/v1',
    baseUrl: 'http://localhost:4000',
  }),
  nestjsFetch: jest.fn(),
  nestjsLogger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { nestjsFetch } from '@/lib/api/nestjs/core.client';
import { serverBatchMoveFiles as barrelBatchMoveFiles } from '@/lib/api/nestjs-server-client';
import {
  serverBatchMoveFiles,
  serverGetFolderStatusMapping,
  serverUpdateAutoContactExcludedFolders,
} from '@/lib/api/nestjs/webhard.client';
import { serverGetCompanies } from '@/lib/api/nestjs/companies.client';
import { serverGetContacts } from '@/lib/api/nestjs/contacts.client';
import {
  serverGetActiveSessionsCount,
  serverUpsertActiveSession,
} from '@/lib/api/nestjs/operations.client';

const mockedNestjsFetch = nestjsFetch as jest.MockedFunction<typeof nestjsFetch>;

describe('AUDIT-15 NestJS domain clients', () => {
  beforeEach(() => {
    mockedNestjsFetch.mockReset();
  });

  it('keeps the existing barrel import path working for webhard functions', async () => {
    mockedNestjsFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { affected: 2 },
    });

    await expect(barrelBatchMoveFiles(['file-a', 'file-b'], 'folder-a')).resolves.toEqual({
      success: true,
      filesMoved: 2,
    });
  });

  it('webhard domain client preserves endpoint, method, body, and error shape', async () => {
    mockedNestjsFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      data: { message: 'conflict' },
    });

    await expect(serverBatchMoveFiles(['file-a'], null)).resolves.toEqual({
      success: false,
      error: 'API error: 409',
    });
    expect(mockedNestjsFetch).toHaveBeenCalledWith('/files/batch/move', {
      method: 'POST',
      body: { fileIds: ['file-a'], targetFolderId: null },
    });
  });

  it('contacts domain client preserves API key auth and cache options', async () => {
    const data = { contacts: [], totalCount: 0, hasMore: false };
    mockedNestjsFetch.mockResolvedValueOnce({ ok: true, status: 200, data });

    await expect(
      serverGetContacts(
        { status: 'received', page: 2, limit: 20, includeTimeline: true },
        { revalidate: 30, tags: ['contacts'] }
      )
    ).resolves.toEqual(data);
    expect(mockedNestjsFetch).toHaveBeenCalledWith(
      '/contacts?status=received&page=2&limit=20&includeTimeline=true',
      {
        useApiKey: true,
        revalidate: 30,
        tags: ['contacts'],
      }
    );
  });

  it('companies domain client preserves query endpoint and API key auth', async () => {
    const data = { companies: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    mockedNestjsFetch.mockResolvedValueOnce({ ok: true, status: 200, data });

    await expect(serverGetCompanies({ page: 1, limit: 10, search: 'laser' })).resolves.toEqual(
      data
    );
    expect(mockedNestjsFetch).toHaveBeenCalledWith('/companies?search=laser&page=1&limit=10', {
      useApiKey: true,
    });
  });

  it('webhard admin config reads use session-scoped auth instead of API key principals', async () => {
    mockedNestjsFetch.mockResolvedValueOnce({ ok: true, status: 200, data: [] });

    await expect(serverGetFolderStatusMapping()).resolves.toEqual([]);

    expect(mockedNestjsFetch).toHaveBeenCalledWith('/folders/config/status-mapping');
  });

  it('webhard admin config writes use session-scoped auth instead of API key principals', async () => {
    mockedNestjsFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true } });

    await expect(serverUpdateAutoContactExcludedFolders(['임시'])).resolves.toEqual({
      success: true,
    });

    expect(mockedNestjsFetch).toHaveBeenCalledWith('/folders/config/auto-contact-excluded', {
      method: 'PUT',
      body: { folders: ['임시'] },
    });
  });

  it('active session heartbeat uses session-scoped auth instead of API key principals', async () => {
    mockedNestjsFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true } });

    await expect(serverUpsertActiveSession('admin', 0, 'admin')).resolves.toBe(true);

    expect(mockedNestjsFetch).toHaveBeenCalledWith('/sessions/upsert', {
      method: 'POST',
      body: { userType: 'admin', userId: 0, username: 'admin', companyName: undefined },
    });
  });

  it('active session dashboard reads use session-scoped auth instead of API key principals', async () => {
    const data = { total_count: 1, admin_count: 1, company_count: 0 };
    mockedNestjsFetch.mockResolvedValueOnce({ ok: true, status: 200, data });

    await expect(serverGetActiveSessionsCount()).resolves.toEqual(data);

    expect(mockedNestjsFetch).toHaveBeenCalledWith('/sessions/count');
  });
});
