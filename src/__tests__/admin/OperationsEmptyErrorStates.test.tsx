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

describe('Operations empty and error states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty states for failures, timeline, and heartbeat panels without actions', () => {
    mockedUseOperationFailures.mockReturnValue({
      data: {
        items: [],
        next_cursor: null,
        has_more: false,
        limit: 20,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOperationFailures>);
    mockedUseOrderTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOrderTimeline>);
    mockedUseOperationHeartbeats.mockReturnValue({
      data: {
        items: [],
        summary: {
          total: 0,
          online: 0,
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

    render(<OperationsDashboard />);

    expect(mockedUseOrderTimeline).toHaveBeenCalledWith(null);
    expect(screen.getByText('미해결 실패가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('연결된 주문이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('등록된 heartbeat가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders API error states and offline worker state without actions', () => {
    mockedUseOperationFailures.mockReturnValue({
      data: {
        items: [
          {
            failure_id: 'failure-001',
            job_id: 'job-001',
            order_id: 'order-001',
            contact_id: '11111111-2222-4333-8444-555555555555',
            inquiry_number: '260619-O-001',
            work_number: '260619-F-001',
            source_worker: 'management_program',
            event_type: 'drawing.classified',
            error_code: 'STATE_APPLY_FAILED',
            message: 'sanitized failure',
            retryable: false,
            retry_count: 1,
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
      isError: true,
    } as ReturnType<typeof useOperationFailures>);
    mockedUseOrderTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useOrderTimeline>);
    mockedUseOperationHeartbeats.mockReturnValue({
      data: {
        items: [
          {
            heartbeat_id: 'heartbeat-offline',
            program_type: 'nesting_program',
            instance_name: 'nest-01',
            status: 'offline',
            stored_status: 'offline',
            version: null,
            hostname: 'host-hidden',
            last_seen_at: '2026-06-20T00:30:00.000Z',
            lag_seconds: 2040,
            created_at: '2026-06-20T00:04:00.000Z',
            updated_at: '2026-06-20T00:30:00.000Z',
          },
        ],
        summary: {
          total: 1,
          online: 0,
          late: 0,
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

    render(<OperationsDashboard />);

    expect(screen.getByText('목록 조회 실패')).toBeInTheDocument();
    expect(screen.getByText('타임라인 조회 실패')).toBeInTheDocument();
    expect(screen.getAllByText('offline')).toHaveLength(2);
    expect(screen.getByText('nesting_program')).toBeInTheDocument();
    expect(screen.queryByText('host-hidden')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
