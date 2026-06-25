import { buildOrderTimelineReadModel } from './order-timeline-read';

const orderId = 'order-001';
const contactId = '11111111-2222-4333-8444-555555555555';
const inquiryNumber = '260619-O-001';
const workNumber = '260619-F-001';

function makeOrderEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-event-001',
    orderId,
    eventType: 'status_changed',
    fromStatus: 'received',
    toStatus: 'drawing',
    source: 'admin',
    actorName: '관리자',
    data: { note: 'legacy-order-event-data' },
    message: '상태 변경',
    createdAt: new Date('2026-06-19T09:03:00Z'),
    ...overrides,
  };
}

function makeJobEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-event-001',
    idempotencyKey: 'management_program:outbox-1',
    eventType: 'drawing.classified',
    eventVersion: 1,
    sourceWorker: 'management_program',
    sourceVersion: '1.2.3',
    orderId,
    contactId,
    inquiryNumber,
    workNumber,
    jobId: 'job-001',
    integrationRunId: null,
    workerLocalId: 'local-001',
    result: 'success',
    occurredAt: new Date('2026-06-19T09:05:00Z'),
    receivedAt: new Date('2026-06-19T09:05:03Z'),
    durationMs: 350,
    processedCount: 1,
    payload: { raw: 'worker-payload' },
    stateApplyStatus: 'applied',
    failureId: null,
    orderEventId: 'order-event-derived',
    createdAt: new Date('2026-06-19T09:05:04Z'),
    ...overrides,
  };
}

describe('Order timeline read model', () => {
  it('OrderEvent와 JobEvent를 충돌 없는 timeline id로 병합하고 occurred_at 내림차순 정렬한다', () => {
    const result = buildOrderTimelineReadModel({
      orderId,
      contactId,
      inquiryNumber,
      workNumber,
      orderEvents: [
        makeOrderEvent({
          id: 'shared-id',
          createdAt: new Date('2026-06-19T09:03:00Z'),
        }),
      ],
      jobEvents: [
        makeJobEvent({
          id: 'job-event-late',
          occurredAt: new Date('2026-06-19T09:05:00Z'),
          receivedAt: new Date('2026-06-19T09:05:01Z'),
        }),
        makeJobEvent({
          id: 'shared-id',
          occurredAt: new Date('2026-06-19T09:01:00Z'),
          receivedAt: new Date('2026-06-19T09:01:01Z'),
        }),
      ],
    });

    expect(result.order_id).toBe(orderId);
    expect(result).toMatchObject({
      contact_id: contactId,
      inquiry_number: inquiryNumber,
      work_number: workNumber,
    });
    expect(result.events.map((event) => event.timeline_id)).toEqual([
      'job_event:job-event-late',
      'order_event:shared-id',
      'job_event:shared-id',
    ]);
    expect(new Set(result.events.map((event) => event.timeline_id)).size).toBe(3);
  });

  it('legacy OrderEvent 필드를 timeline entry로 보존한다', () => {
    const result = buildOrderTimelineReadModel({
      orderId,
      contactId,
      inquiryNumber,
      workNumber,
      orderEvents: [makeOrderEvent()],
      jobEvents: [],
    });

    expect(result.events[0]).toMatchObject({
      timeline_id: 'order_event:order-event-001',
      source_model: 'order_event',
      event_id: 'order-event-001',
      order_id: orderId,
      contact_id: contactId,
      inquiry_number: inquiryNumber,
      work_number: workNumber,
      event_type: 'status_changed',
      source: 'admin',
      source_worker: null,
      from_status: 'received',
      to_status: 'drawing',
      actor_name: '관리자',
      message: '상태 변경',
      occurred_at: '2026-06-19T09:03:00.000Z',
      received_at: null,
      result: null,
      state_apply_status: null,
      failure_id: null,
    });
  });

  it('JobEvent 운영 필드를 timeline entry로 노출하되 raw payload와 idempotency key는 제외한다', () => {
    const result = buildOrderTimelineReadModel({
      orderId,
      contactId,
      inquiryNumber,
      workNumber,
      orderEvents: [],
      jobEvents: [makeJobEvent()],
    });

    expect(result.events[0]).toMatchObject({
      timeline_id: 'job_event:job-event-001',
      source_model: 'job_event',
      event_id: 'job-event-001',
      order_id: orderId,
      contact_id: contactId,
      inquiry_number: inquiryNumber,
      work_number: workNumber,
      event_type: 'drawing.classified',
      source: 'management_program',
      source_worker: 'management_program',
      job_id: 'job-001',
      result: 'success',
      state_apply_status: 'applied',
      failure_id: null,
      order_event_id: 'order-event-derived',
      processed_count: 1,
      duration_ms: 350,
      occurred_at: '2026-06-19T09:05:00.000Z',
      received_at: '2026-06-19T09:05:03.000Z',
    });
    expect(result.events[0]).not.toHaveProperty('payload');
    expect(result.events[0]).not.toHaveProperty('idempotency_key');
    expect(result.events[0]).not.toHaveProperty('idempotencyKey');
  });
});
