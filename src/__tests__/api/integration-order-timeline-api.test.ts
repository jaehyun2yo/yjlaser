import { integrationOrderApi } from '@/app/(admin)/admin/integration/_lib/api';

describe('integrationOrderApi.getOrderTimeline', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('order timeline endpoint를 기존 integration API 경로로 호출한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        order_id: 'order-001',
        contact_id: '11111111-2222-4333-8444-555555555555',
        legacy_order_contact_id: 123,
        inquiry_number: '260619-O-001',
        work_number: '260619-F-001',
        company_name: '원컴퍼니',
        production_status: 'DXF_READY',
        confirmation_status: 'CONFIRMED',
        classification_status: 'CLASSIFIED',
        nesting_status: null,
        billing_status: null,
        events: [
          {
            timeline_id: 'job_event:job-event-001',
            source_model: 'job_event',
            event_id: 'job-event-001',
            order_id: 'order-001',
            contact_id: '11111111-2222-4333-8444-555555555555',
            inquiry_number: '260619-O-001',
            work_number: '260619-F-001',
            event_type: 'drawing.classified',
            source: 'management_program',
            source_worker: 'management_program',
            occurred_at: '2026-06-20T01:04:00.000Z',
            received_at: '2026-06-20T01:04:02.000Z',
            created_at: '2026-06-20T01:04:03.000Z',
            result: 'success',
            state_apply_status: 'applied',
            failure_id: null,
            order_event_id: 'order-event-001',
            job_id: 'job-001',
            from_status: null,
            to_status: null,
            actor_name: null,
            message: null,
            processed_count: 1,
            duration_ms: 250,
          },
        ],
        failures: [],
      }),
      text: async () => '',
    });

    const result = await integrationOrderApi.getOrderTimeline('order-001');

    expect(fetchMock).toHaveBeenCalledWith(
      '/nestapi/integration/orders/order-001/timeline',
      expect.objectContaining({
        credentials: 'include',
      })
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.timeline_id).toBe('job_event:job-event-001');
  });
});
