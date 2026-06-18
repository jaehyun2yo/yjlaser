import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useWebhardFoldersQuery } from '@/app/webhard/hooks/useWebhardFoldersQuery';
import type { WebhardFolder } from '@/app/webhard/_lib';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function buildFolder(id: string, parentId: string | null): WebhardFolder {
  return {
    id,
    name: id,
    parent_id: parentId,
    company_id: 42,
    created_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:00:00.000Z',
    deleted_at: null,
  };
}

describe('Webhard folder query performance', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('폴더 children 조회 후 자식 폴더 파일 목록을 자동 prefetch하지 않는다', async () => {
    const selectedFolderId = 'parent-folder';
    const childFolders = Array.from({ length: 5 }, (_, index) =>
      buildFolder(`child-${index + 1}`, selectedFolderId)
    );

    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input);

      if (url.startsWith('/api/webhard/folders/') && url.endsWith('/ancestors')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ancestors: [{ id: 'root', name: 'Root', parent_id: null }],
            current: { id: selectedFolderId, name: 'Parent', parent_id: 'root' },
          }),
        } as Response);
      }

      if (url.startsWith('/api/webhard/folders')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ folders: childFolders }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ files: [], pagination: { hasMore: false } }),
      } as Response);
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useWebhardFoldersQuery({
          selectedFolderId,
          userType: 'company',
          userId: '42',
          isNewFilesMode: false,
          sortBy: 'name',
          sortOrder: 'asc',
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.subFolders).toHaveLength(5));

    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls).toContain('/api/webhard/folders?parentId=parent-folder&companyId=42');
    expect(requestedUrls).toContain('/api/webhard/folders/parent-folder/ancestors');
    expect(requestedUrls.some((url) => url.startsWith('/api/webhard/files'))).toBe(false);
  });
});
