/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { OperationFailuresTable } from '@/app/(admin)/admin/integration/operations/_components/OperationFailuresTable';
import type { OperationFailure } from '@/app/(admin)/admin/integration/_lib/types';

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
  last_event: {
    event_id: 'event-001',
    event_type: 'file_synced',
    source_worker: 'external-webhard-sync',
    occurred_at: '2026-06-20T01:04:00.000Z',
    result: 'failure',
    state_apply_status: 'failed',
  },
};

describe('OperationFailuresTable', () => {
  it('renders unresolved failure worker, errorCode, retryable, occurredAt columns', () => {
    render(<OperationFailuresTable failures={[failure]} />);

    expect(screen.getByRole('columnheader', { name: 'worker' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'errorCode' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'retryable' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'occurredAt' })).toBeInTheDocument();
    expect(screen.getByText('external-webhard-sync')).toBeInTheDocument();
    expect(screen.getByText('STATE_APPLY_FAILED')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders empty and error states without actions', () => {
    const { rerender } = render(<OperationFailuresTable failures={[]} />);

    expect(screen.getByText('미해결 실패가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<OperationFailuresTable isError />);

    expect(screen.getByText('목록 조회 실패')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
