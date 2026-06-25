export type OrderTimelineSourceModel = 'order_event' | 'job_event';

export type OrderTimelineOrderEventSource = {
  id: string;
  orderId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  source: string;
  actorName: string | null;
  data?: unknown;
  message: string | null;
  createdAt: Date;
};

export type OrderTimelineJobEventSource = {
  id: string;
  idempotencyKey?: string;
  eventType: string;
  eventVersion: number;
  sourceWorker: string;
  sourceVersion: string | null;
  orderId: string | null;
  contactId: string | null;
  inquiryNumber: string | null;
  workNumber: string | null;
  jobId: string | null;
  integrationRunId: string | null;
  workerLocalId: string | null;
  result: string;
  occurredAt: Date;
  receivedAt: Date;
  durationMs: number | null;
  processedCount: number | null;
  payload?: unknown;
  stateApplyStatus: string;
  failureId: string | null;
  orderEventId: string | null;
  createdAt: Date;
};

export type OrderTimelineEventReadModel = {
  timeline_id: string;
  source_model: OrderTimelineSourceModel;
  event_id: string;
  order_id: string;
  contact_id: string | null;
  inquiry_number: string | null;
  work_number: string | null;
  event_type: string;
  source: string;
  source_worker: string | null;
  occurred_at: string;
  received_at: string | null;
  created_at: string;
  result: string | null;
  state_apply_status: string | null;
  failure_id: string | null;
  order_event_id: string | null;
  job_id: string | null;
  from_status: string | null;
  to_status: string | null;
  actor_name: string | null;
  message: string | null;
  processed_count: number | null;
  duration_ms: number | null;
};

export type OrderTimelineReadModel = {
  order_id: string;
  contact_id: string | null;
  inquiry_number: string | null;
  work_number: string | null;
  events: OrderTimelineEventReadModel[];
};

export type OrderTimelineReadInput = {
  orderId: string;
  contactId?: string | null;
  inquiryNumber?: string | null;
  workNumber?: string | null;
  orderEvents: OrderTimelineOrderEventSource[];
  jobEvents: OrderTimelineJobEventSource[];
};

type SortableTimelineEvent = OrderTimelineEventReadModel & {
  sortOccurredAtMs: number;
  sortReceivedAtMs: number;
};

export function buildOrderTimelineReadModel(input: OrderTimelineReadInput): OrderTimelineReadModel {
  const events = [
    ...input.orderEvents.map((event) => mapOrderEventToTimelineEntry(input, event)),
    ...input.jobEvents.map((event) => mapJobEventToTimelineEntry(input, event)),
  ]
    .sort(compareTimelineEntries)
    .map(stripSortFields);

  return {
    order_id: input.orderId,
    contact_id: input.contactId ?? null,
    inquiry_number: input.inquiryNumber ?? null,
    work_number: input.workNumber ?? null,
    events,
  };
}

function mapOrderEventToTimelineEntry(
  input: OrderTimelineReadInput,
  event: OrderTimelineOrderEventSource
): SortableTimelineEvent {
  const occurredAt = event.createdAt;
  return {
    timeline_id: `order_event:${event.id}`,
    source_model: 'order_event',
    event_id: event.id,
    order_id: event.orderId,
    contact_id: input.contactId ?? null,
    inquiry_number: input.inquiryNumber ?? null,
    work_number: input.workNumber ?? null,
    event_type: event.eventType,
    source: event.source,
    source_worker: null,
    occurred_at: toIso(occurredAt),
    received_at: null,
    created_at: toIso(event.createdAt),
    result: null,
    state_apply_status: null,
    failure_id: null,
    order_event_id: null,
    job_id: null,
    from_status: event.fromStatus,
    to_status: event.toStatus,
    actor_name: event.actorName,
    message: event.message,
    processed_count: null,
    duration_ms: null,
    sortOccurredAtMs: occurredAt.getTime(),
    sortReceivedAtMs: event.createdAt.getTime(),
  };
}

function mapJobEventToTimelineEntry(
  input: OrderTimelineReadInput,
  event: OrderTimelineJobEventSource
): SortableTimelineEvent {
  return {
    timeline_id: `job_event:${event.id}`,
    source_model: 'job_event',
    event_id: event.id,
    order_id: event.orderId ?? input.orderId,
    contact_id: event.contactId ?? input.contactId ?? null,
    inquiry_number: event.inquiryNumber ?? input.inquiryNumber ?? null,
    work_number: event.workNumber ?? input.workNumber ?? null,
    event_type: event.eventType,
    source: event.sourceWorker,
    source_worker: event.sourceWorker,
    occurred_at: toIso(event.occurredAt),
    received_at: toIso(event.receivedAt),
    created_at: toIso(event.createdAt),
    result: event.result,
    state_apply_status: event.stateApplyStatus,
    failure_id: event.failureId,
    order_event_id: event.orderEventId,
    job_id: event.jobId,
    from_status: null,
    to_status: null,
    actor_name: null,
    message: null,
    processed_count: event.processedCount,
    duration_ms: event.durationMs,
    sortOccurredAtMs: event.occurredAt.getTime(),
    sortReceivedAtMs: event.receivedAt.getTime(),
  };
}

function compareTimelineEntries(
  first: SortableTimelineEvent,
  second: SortableTimelineEvent
): number {
  return (
    second.sortOccurredAtMs - first.sortOccurredAtMs ||
    second.sortReceivedAtMs - first.sortReceivedAtMs ||
    first.timeline_id.localeCompare(second.timeline_id)
  );
}

function stripSortFields(event: SortableTimelineEvent): OrderTimelineEventReadModel {
  const {
    sortOccurredAtMs: _sortOccurredAtMs,
    sortReceivedAtMs: _sortReceivedAtMs,
    ...dto
  } = event;
  return dto;
}

function toIso(date: Date): string {
  return date.toISOString();
}
