/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { OperationsDashboard } from '@/app/(admin)/admin/integration/operations/_components/OperationsDashboard';
import { useOperationFailures } from '@/app/(admin)/admin/integration/_lib/hooks';
import type { OperationFailure } from '@/app/(admin)/admin/integration/_lib/types';

jest.mock('@/app/(admin)/admin/integration/_lib/hooks', () => ({
  useOperationFailures: jest.fn(),
}));

const mockedUseOperationFailures = useOperationFailures as jest.MockedFunction<
  typeof useOperationFailures
>;

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
  });

  it('renders operation failure data in read-only dashboard panels', () => {
    render(<OperationsDashboard />);

    expect(screen.getByRole('heading', { name: '미해결 실패' })).toBeInTheDocument();
    expect(screen.getByText('1+')).toBeInTheDocument();
    expect(screen.getByText('external-webhard-sync')).toBeInTheDocument();
    expect(screen.getByText('STATE_APPLY_FAILED')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '주문 타임라인' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Worker heartbeat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /재시도|삭제|발송|동기화/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retry|delete|send|sync/i })).toBeNull();
  });
});
