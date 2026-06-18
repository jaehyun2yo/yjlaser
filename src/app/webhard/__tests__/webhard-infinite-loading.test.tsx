import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { getWebhardFilesQueryKey } from '@/app/webhard/_lib/webhardMainContracts';
import { useWebhardFilesQuery } from '@/app/webhard/hooks/useWebhardFilesQuery';
import type { WebhardFile } from '@/types/webhard';

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

function buildFile(index: number, folderId: string): WebhardFile {
  const padded = String(index).padStart(2, '0');

  return {
    id: `file-${padded}`,
    name: `도면-${padded}.dxf`,
    original_name: `도면-${padded}.dxf`,
    size: 1024 + index,
    mime_type: 'application/dxf',
    path: `webhard/company-a/folder-a/file-${padded}.dxf`,
    folder_id: folderId,
    company_id: 42,
    uploaded_by: 1,
    inquiry_number: null,
    is_downloaded: false,
    created_at: new Date(Date.UTC(2026, 4, 25, 12, 0, index)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 4, 25, 12, 0, index)).toISOString(),
    deleted_at: null,
    deleted_by: null,
    companies: {
      company_name: '테스트업체',
      manager_name: '담당자',
    },
  };
}

describe('Webhard 일반 파일 infinite loading', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('75개 이상인 일반 폴더 파일을 page=1부터 page=2까지 이어 붙인다', async () => {
    const folderId = 'folder-a';
    const firstPage = Array.from({ length: 50 }, (_, index) => buildFile(index + 1, folderId));
    const secondPage = Array.from({ length: 25 }, (_, index) => buildFile(index + 51, folderId));

    fetchMock.mockImplementation((input: string | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const page = Number(url.searchParams.get('page') ?? '1');
      const files = page === 1 ? firstPage : secondPage;

      return Promise.resolve({
        ok: true,
        json: async () => ({
          files,
          total: 75,
          page,
          limit: 50,
          hasMore: page === 1,
        }),
      } as Response);
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useWebhardFilesQuery({
          selectedFolderId: folderId,
          userType: 'company',
          userId: '42',
          isNewFilesMode: false,
          sortBy: 'date',
          sortOrder: 'desc',
          socketConnected: true,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const filesQueryKey = getWebhardFilesQueryKey({
      selectedFolderId: folderId,
      userType: 'company',
      userId: '42',
    });
    const queryState = queryClient.getQueryState(filesQueryKey);
    expect(queryState?.error).toBeNull();

    await waitFor(() => {
      expect(queryClient.getQueryState(filesQueryKey)?.status).toBe('success');
      expect(queryClient.getQueryData<{ files: WebhardFile[] }>(filesQueryKey)?.files).toHaveLength(
        50
      );
    });

    await waitFor(() => expect(result.current.files).toHaveLength(50));

    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.files).toHaveLength(75));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/webhard/files?folderId=folder-a&companyId=42&sortBy=date&sortOrder=desc&page=1&limit=50'
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/webhard/files?folderId=folder-a&companyId=42&sortBy=date&sortOrder=desc&page=2&limit=50'
    );
    expect(result.current.hasNextPage).toBe(false);
  });
});
