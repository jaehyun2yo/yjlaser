/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { WorkerHeartbeatPanel } from '@/app/(admin)/admin/integration/operations/_components/WorkerHeartbeatPanel';
import type { OperationHeartbeatSummary } from '@/app/(admin)/admin/integration/_lib/types';

const summary: OperationHeartbeatSummary = {
  total: 3,
  online: 1,
  late: 1,
  offline: 1,
};

const heartbeats = [
  {
    heartbeat_id: 'heartbeat-online',
    program_type: 'external_webhard_sync',
    instance_name: 'sync-01',
    status: 'online' as const,
    stored_status: 'online',
    version: '1.0.0',
    hostname: 'host-online',
    last_seen_at: '2026-06-20T01:04:00.000Z',
    lag_seconds: 60,
    created_at: '2026-06-20T00:04:00.000Z',
    updated_at: '2026-06-20T01:04:00.000Z',
  },
  {
    heartbeat_id: 'heartbeat-late',
    program_type: 'management_program',
    instance_name: 'mgmt-01',
    status: 'late' as const,
    stored_status: 'online',
    version: '2.1.0',
    hostname: null,
    last_seen_at: '2026-06-20T00:58:00.000Z',
    lag_seconds: 360,
    created_at: '2026-06-20T00:04:00.000Z',
    updated_at: '2026-06-20T00:58:00.000Z',
  },
  {
    heartbeat_id: 'heartbeat-offline',
    program_type: 'nesting_program',
    instance_name: 'nest-01',
    status: 'offline' as const,
    stored_status: 'offline',
    version: null,
    hostname: 'host-offline',
    last_seen_at: '2026-06-20T00:30:00.000Z',
    lag_seconds: 2040,
    created_at: '2026-06-20T00:04:00.000Z',
    updated_at: '2026-06-20T00:30:00.000Z',
  },
];

describe('WorkerHeartbeatPanel', () => {
  it('renders worker heartbeat status rows and summary without actions', () => {
    render(<WorkerHeartbeatPanel heartbeats={heartbeats} summary={summary} />);

    expect(screen.getAllByText('online')).toHaveLength(2);
    expect(screen.getAllByText('late')).toHaveLength(2);
    expect(screen.getAllByText('offline')).toHaveLength(2);
    expect(screen.getByText('external_webhard_sync')).toBeInTheDocument();
    expect(screen.getByText('management_program')).toBeInTheDocument();
    expect(screen.getByText('nesting_program')).toBeInTheDocument();
    expect(screen.getByText('sync-01')).toBeInTheDocument();
    expect(screen.queryByText('host-offline')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders loading, empty, and error states without actions', () => {
    const { rerender } = render(<WorkerHeartbeatPanel isLoading />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<WorkerHeartbeatPanel heartbeats={[]} />);

    expect(screen.getByText('등록된 heartbeat가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<WorkerHeartbeatPanel isError />);

    expect(screen.getByText('heartbeat 조회 실패')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
