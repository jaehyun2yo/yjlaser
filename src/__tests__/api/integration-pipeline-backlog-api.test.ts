import { integrationSyncLogApi } from '@/app/(admin)/admin/integration/_lib/api';

describe('integrationSyncLogApi.getPipelineBacklog', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('pipeline backlog endpoint를 기존 integration API 경로로 호출한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 7,
          filename: 'skip.dxf',
          companyName: '원컴퍼니',
          stage: 'auto_contact',
          status: 'skipped',
          reasonCode: 'auto_contact_excluded_folder',
          fileId: 'file-7',
          folderId: 'folder-7',
          context: { folderPath: '/원컴퍼니/제외' },
          createdAt: '2026-05-10T12:00:00.000Z',
        },
      ],
      text: async () => '',
    });

    const result = await integrationSyncLogApi.getPipelineBacklog(5);

    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/sync-logs/pipeline-backlog?limit=5',
      expect.objectContaining({
        credentials: 'include',
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.reasonCode).toBe('auto_contact_excluded_folder');
  });
});
