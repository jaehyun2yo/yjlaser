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

describe('Operations read-only action contract', () => {
  beforeEach(() => {
    mockedUseOperationFailures.mockReturnValue({
      data: {
        items: [
          {
            failure_id: 'failure-001',
            job_id: 'job-001',
            order_id: 'order-001',
            source_worker: 'external_webhard_sync',
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
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOperationFailures>);

    mockedUseOrderTimeline.mockReturnValue({
      data: {
        order_id: 'order-001',
        contact_id: 123,
        company_name: '원컴퍼니',
        production_status: 'DXF_READY',
        confirmation_status: 'CONFIRMED',
        classification_status: 'CLASSIFIED',
        nesting_status: null,
        billing_status: null,
        events: [],
        failures: [],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOrderTimeline>);

    mockedUseOperationHeartbeats.mockReturnValue({
      data: {
        items: [
          {
            heartbeat_id: 'heartbeat-online',
            program_type: 'management_program',
            instance_name: 'mgmt-01',
            status: 'online',
            stored_status: 'online',
            version: '2.1.0',
            hostname: 'host-hidden',
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
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOperationHeartbeats>);
  });

  it('does not render operation execution buttons', () => {
    render(<OperationsDashboard />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /재시도|삭제|발송|동기화/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retry|delete|send|sync/i })).toBeNull();
  });
});
