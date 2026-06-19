import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventEnvelopeDto } from './dto/event-envelope.dto';

const validEnvelope = {
  idempotency_key: 'management_program:outbox-123:drawing.classified',
  attempt_no: 1,
  event_type: 'drawing.classified',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:00:00+09:00',
  order_id: 'order-001',
  job_id: 'job-001',
  integration_run_id: 'run-001',
  worker_local_id: 'outbox-123',
  result: 'success',
  duration_ms: 1234,
  processed_count: 1,
  payload: {
    classification_status: 'CLASSIFIED',
  },
  metadata: {
    safe_keys_only: true,
  },
};

async function validateEnvelope(input: Record<string, unknown>) {
  return validate(plainToInstance(EventEnvelopeDto, input));
}

describe('EventEnvelopeDto', () => {
  it('정상 worker event envelope를 통과시킨다', async () => {
    await expect(validateEnvelope(validEnvelope)).resolves.toHaveLength(0);
  });

  it.each([
    'idempotency_key',
    'event_type',
    'event_version',
    'source_worker',
    'occurred_at',
    'result',
    'payload',
  ])('필수 필드 %s 누락을 거부한다', async (field) => {
    const input = { ...validEnvelope };
    delete input[field as keyof typeof input];

    const errors = await validateEnvelope(input);

    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('허용되지 않은 result 값을 거부한다', async () => {
    const errors = await validateEnvelope({
      ...validEnvelope,
      result: 'done',
    });

    expect(errors.map((error) => error.property)).toContain('result');
  });

  it('payload가 객체가 아니면 거부한다', async () => {
    const errors = await validateEnvelope({
      ...validEnvelope,
      payload: 'raw-text',
    });

    expect(errors.map((error) => error.property)).toContain('payload');
  });

  it('event_version, attempt_no, duration_ms, processed_count 숫자 범위를 검증한다', async () => {
    const errors = await validateEnvelope({
      ...validEnvelope,
      event_version: 0,
      attempt_no: 0,
      duration_ms: -1,
      processed_count: -1,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['event_version', 'attempt_no', 'duration_ms', 'processed_count'])
    );
  });

  it('occurred_at이 ISO 날짜 문자열이 아니면 거부한다', async () => {
    const errors = await validateEnvelope({
      ...validEnvelope,
      occurred_at: '2026/06/19 09:00',
    });

    expect(errors.map((error) => error.property)).toContain('occurred_at');
  });
});
