/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { OrderTimelinePanel } from '@/app/(admin)/admin/integration/operations/_components/OrderTimelinePanel';
import type { OrderTimelineResponse } from '@/app/(admin)/admin/integration/_lib/types';

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
    {
      timeline_id: 'order_event:order-event-002',
      source_model: 'order_event',
      event_id: 'order-event-002',
      order_id: 'order-001',
      event_type: 'status_changed',
      source: 'admin',
      source_worker: null,
      occurred_at: '2026-06-20T00:55:00.000Z',
      received_at: null,
      created_at: '2026-06-20T00:55:00.000Z',
      result: null,
      state_apply_status: null,
      failure_id: null,
      order_event_id: null,
      job_id: null,
      from_status: 'received',
      to_status: 'confirmed',
      actor_name: 'admin',
      message: 'hidden from panel',
      processed_count: null,
      duration_ms: null,
    },
  ],
  failures: [],
};

describe('OrderTimelinePanel', () => {
  it('renders merged OrderEvent and JobEvent timeline data without actions', () => {
    render(<OrderTimelinePanel orderId="order-001" timeline={timeline} />);

    expect(screen.getByText('order-001')).toBeInTheDocument();
    expect(screen.getByText('원컴퍼니')).toBeInTheDocument();
    expect(screen.getByText('JobEvent')).toBeInTheDocument();
    expect(screen.getByText('OrderEvent')).toBeInTheDocument();
    expect(screen.getByText('drawing.classified')).toBeInTheDocument();
    expect(screen.getByText('status_changed')).toBeInTheDocument();
    expect(screen.getByText('management_program')).toBeInTheDocument();
    expect(screen.getByText('success / applied')).toBeInTheDocument();
    expect(screen.queryByText('hidden from panel')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders disabled, empty, and error states without actions', () => {
    const { rerender } = render(<OrderTimelinePanel isLoading />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<OrderTimelinePanel />);

    expect(screen.getByText('연결된 주문이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<OrderTimelinePanel orderId="order-001" timeline={{ ...timeline, events: [] }} />);

    expect(screen.getByText('표시할 이벤트가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<OrderTimelinePanel orderId="order-001" isError />);

    expect(screen.getByText('타임라인 조회 실패')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
