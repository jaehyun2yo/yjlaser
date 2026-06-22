import { integrationOperationsApi } from '@/app/(admin)/admin/integration/_lib/api';

describe('integrationOperationsApi.getHeartbeats', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('operation heartbeats endpoint를 기존 integration API 경로로 호출한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            heartbeat_id: 'heartbeat-online',
            program_type: 'external_webhard_sync',
            instance_name: 'sync-01',
            status: 'online',
            stored_status: 'online',
            version: '1.0.0',
            hostname: 'host-online',
            last_seen_at: '2026-06-20T01:04:00.000Z',
            lag_seconds: 60,
            created_at: '2026-06-20T00:04:00.000Z',
            updated_at: '2026-06-20T01:04:00.000Z',
          },
        ],
        summary: {
          total: 1,
          online: 1,
          late: 0,
          offline: 0,
        },
        threshold_seconds: {
          late: 120,
          offline: 600,
        },
      }),
      text: async () => '',
    });

    const result = await integrationOperationsApi.getHeartbeats();

    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/operations/heartbeats',
      expect.objectContaining({
        credentials: 'include',
      })
    );
    expect(result.summary.online).toBe(1);
    expect(result.items[0]?.heartbeat_id).toBe('heartbeat-online');
  });
});
