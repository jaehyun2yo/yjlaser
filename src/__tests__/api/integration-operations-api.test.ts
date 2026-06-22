import { integrationOperationsApi } from '@/app/(admin)/admin/integration/_lib/api';

describe('integrationOperationsApi.getFailures', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('operation failures endpoint를 기존 integration API 경로로 호출한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            failure_id: 'failure-001',
            job_id: 'job-001',
            order_id: 'order-001',
            source_worker: 'external-webhard-sync',
            event_type: 'file_synced',
            error_code: 'STATE_APPLY_FAILED',
            message: 'sanitized failure',
            retryable: true,
            retry_count: 2,
            resolved_at: null,
            last_event_id: 'event-001',
            created_at: '2026-06-20T01:00:00.000Z',
            updated_at: '2026-06-20T01:05:00.000Z',
            last_event: null,
          },
        ],
        next_cursor: null,
        has_more: false,
        limit: 20,
      }),
      text: async () => '',
    });

    const result = await integrationOperationsApi.getFailures({
      cursor: 'failure-000',
      limit: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/operations/failures?cursor=failure-000&limit=20',
      expect.objectContaining({
        credentials: 'include',
      })
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.error_code).toBe('STATE_APPLY_FAILED');
  });
});
