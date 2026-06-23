/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { OperationsDashboard } from '@/app/(admin)/admin/integration/operations/_components/OperationsDashboard';
import {
  useOperationHeartbeats,
  useOperationFailures,
  useOrderTimeline,
} from '@/app/(admin)/admin/integration/_lib/hooks';
import type {
  OperationFailure,
  OrderTimelineResponse,
} from '@/app/(admin)/admin/integration/_lib/types';

jest.mock('@/app/(admin)/admin/integration/_lib/hooks', () => ({
  useOperationHeartbeats: jest.fn(),
  useOperationFailures: jest.fn(),
  useOrderTimeline: jest.fn(),
}));

const mockedUseOperationHeartbeats = useOperationHeartbeats as jest.MockedFunction<
  typeof useOperationHeartbeats
>;
const mockedUseOperationFailures = useOperationFailures as jest.MockedFunction<
  typeof useOperationFailures
>;
const mockedUseOrderTimeline = useOrderTimeline as jest.MockedFunction<typeof useOrderTimeline>;

const failure: OperationFailure = {
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
};

const timeline: OrderTimelineResponse = {
  order_id: 'order-001',
  contact_id: 123,
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
};

describe('OperationsDashboard', () => {
  beforeEach(() => {
    mockedUseOperationFailures.mockReturnValue({
      data: {
        items: [failure],
        next_cursor: 'failure-001',
        has_more: true,
        limit: 20,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOperationFailures>);
    mockedUseOrderTimeline.mockReturnValue({
      data: timeline,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOrderTimeline>);
    mockedUseOperationHeartbeats.mockReturnValue({
      data: {
        items: [
          {
            heartbeat_id: 'heartbeat-late',
            program_type: 'management_program',
            instance_name: 'mgmt-01',
            status: 'late',
            stored_status: 'online',
            version: '2.1.0',
            hostname: 'host-late',
            last_seen_at: '2026-06-20T00:58:00.000Z',
            lag_seconds: 360,
            created_at: '2026-06-20T00:04:00.000Z',
            updated_at: '2026-06-20T00:58:00.000Z',
          },
          {
            heartbeat_id: 'heartbeat-offline',
            program_type: 'nesting_program',
            instance_name: 'nest-01',
            status: 'offline',
            stored_status: 'offline',
            version: null,
            hostname: 'host-offline',
            last_seen_at: '2026-06-20T00:30:00.000Z',
            lag_seconds: 2040,
            created_at: '2026-06-20T00:04:00.000Z',
            updated_at: '2026-06-20T00:30:00.000Z',
          },
        ],
        summary: {
          total: 2,
          online: 0,
          late: 1,
          offline: 1,
        },
        threshold_seconds: {
          late: 120,
          offline: 600,
        },
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOperationHeartbeats>);
  });

  it('renders operation failure data in read-only dashboard panels', () => {
    render(<OperationsDashboard />);

    expect(mockedUseOrderTimeline).toHaveBeenCalledWith('order-001');
    expect(screen.getByRole('heading', { name: '미해결 실패' })).toBeInTheDocument();
    expect(screen.getByText('1+')).toBeInTheDocument();
    expect(screen.getByText('external-webhard-sync')).toBeInTheDocument();
    expect(screen.getByText('STATE_APPLY_FAILED')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '주문 타임라인' })).toBeInTheDocument();
    expect(screen.getByText('drawing.classified')).toBeInTheDocument();
    expect(screen.getByText('원컴퍼니')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Worker heartbeat' })).toBeInTheDocument();
    expect(screen.getAllByText('management_program')).toHaveLength(2);
    expect(screen.getByText('nesting_program')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /재시도|삭제|발송|동기화/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retry|delete|send|sync/i })).toBeNull();
  });
});
