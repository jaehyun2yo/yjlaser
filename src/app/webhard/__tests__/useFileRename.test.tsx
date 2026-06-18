import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFileRename } from '@/app/webhard/hooks/useFileRename';
import type { WebhardFile } from '@/types/webhard';

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ error: jest.fn() }),
}));

const file: WebhardFile = {
  id: 'file-1',
  name: 'old.dxf',
  original_name: 'old.dxf',
  path: '/old.dxf',
  size: 10,
  mime_type: 'application/dxf',
  is_downloaded: false,
  folder_id: 'folder-1',
  company_id: 1,
  uploaded_by: 1,
  inquiry_number: null,
  created_at: '2026-05-11T00:00:00.000Z',
  updated_at: '2026-05-11T00:00:00.000Z',
  deleted_at: null,
  deleted_by: null,
};

describe('useFileRename', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...file, name: 'renamed.dxf', original_name: 'renamed.dxf' }),
    }) as jest.Mock;
  });

  it('sends the backend rename contract field name instead of original_name', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useFileRename({
          filesQueryKey: ['webhard', 'files'],
          files: [file],
          notificationSettings: { notifyOnError: true },
        }),
      { wrapper }
    );

    act(() => {
      result.current.startRename(file);
      result.current.setEditingFileName('renamed');
    });

    await act(async () => {
      await result.current.finishRename(file.id);
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/webhard/files/file-1/rename',
      expect.objectContaining({
        body: JSON.stringify({ name: 'renamed.dxf' }),
      })
    );
  });
});
