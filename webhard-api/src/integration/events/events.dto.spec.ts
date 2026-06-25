import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventEnvelopeDto } from './dto/event-envelope.dto';
import {
  EventAcceptedResponseDto,
  EventDuplicateFailureResponseDto,
  EventDuplicateResponseDto,
  EventFailureResponseDto,
} from './dto/event-response.dto';

const validEnvelope = {
  idempotency_key: 'management_program:outbox-123:drawing.classified',
  attempt_no: 1,
  event_type: 'drawing.classified',
  event_version: 1,
  source_worker: 'management_program',
  source_version: '1.46.37',
  occurred_at: '2026-06-19T09:00:00+09:00',
  order_id: 'order-001',
  contact_id: '11111111-2222-4333-8444-555555555555',
  inquiry_number: '260619-O-001',
  work_number: '260619-F-001',
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

const validAppliedStateChange = {
  target: 'job',
  id: 'job-001',
  field: 'classification_status',
  value: 'CLASSIFIED',
};

const validAcceptedResponse = {
  event_id: 'evt-001',
  duplicate: false,
  accepted: true,
  applied_state_changes: [validAppliedStateChange],
};

const validDuplicateResponse = {
  event_id: 'evt-001',
  duplicate: true,
  accepted: true,
  applied_state_changes: [],
};

const validDuplicateFailureResponse = {
  event_id: 'evt-001',
  duplicate: true,
  accepted: false,
  state_apply_status: 'failed',
  failure_id: 'fail-001',
  applied_state_changes: [],
  error: {
    code: 'POPBILL_FAILED',
    message: 'popbill send failed',
    retryable: true,
  },
};

const validFailureResponse = {
  event_id: 'evt-001',
  duplicate: false,
  accepted: false,
  state_apply_status: 'failed',
  failure_id: 'fail-001',
  applied_state_changes: [],
  error: {
    code: 'STATE_APPLY_FAILED',
    message: 'state transition rejected',
    retryable: true,
  },
};

async function validateEnvelope(input: Record<string, unknown>) {
  return validate(plainToInstance(EventEnvelopeDto, input));
}

async function validateDto<T extends object>(
  dto: ClassConstructor<T>,
  input: Record<string, unknown>
) {
  return validate(plainToInstance(dto, input));
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

  it('Contact 중심 identity 필드의 UUID와 문자열 길이를 검증한다', async () => {
    const errors = await validateEnvelope({
      ...validEnvelope,
      contact_id: 'legacy-numeric-contact-id',
      inquiry_number: 'I'.repeat(101),
      work_number: 'W'.repeat(101),
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['contact_id', 'inquiry_number', 'work_number'])
    );
  });
});

describe('EventResponseDto', () => {
  it('신규 처리 응답 shape를 통과시킨다', async () => {
    await expect(
      validateDto(EventAcceptedResponseDto, validAcceptedResponse)
    ).resolves.toHaveLength(0);
  });

  it('신규 처리 응답에서 accepted/duplicate literal 값을 검증한다', async () => {
    const errors = await validateDto(EventAcceptedResponseDto, {
      ...validAcceptedResponse,
      duplicate: true,
      accepted: false,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['duplicate', 'accepted'])
    );
  });

  it('중복 처리 응답 shape를 통과시킨다', async () => {
    await expect(
      validateDto(EventDuplicateResponseDto, validDuplicateResponse)
    ).resolves.toHaveLength(0);
  });

  it('중복 처리 응답이 상태 변경 결과를 포함하면 거부한다', async () => {
    const errors = await validateDto(EventDuplicateResponseDto, {
      ...validDuplicateResponse,
      applied_state_changes: [validAppliedStateChange],
    });

    expect(errors.map((error) => error.property)).toContain('applied_state_changes');
  });

  it('실패한 중복 처리 응답 shape를 통과시킨다', async () => {
    await expect(
      validateDto(EventDuplicateFailureResponseDto, validDuplicateFailureResponse)
    ).resolves.toHaveLength(0);
  });

  it('상태 적용 실패 응답 shape를 통과시킨다', async () => {
    await expect(validateDto(EventFailureResponseDto, validFailureResponse)).resolves.toHaveLength(
      0
    );
  });

  it('상태 적용 실패 응답에서 실패 상태와 failure_id를 검증한다', async () => {
    const input: Record<string, unknown> = {
      ...validFailureResponse,
      state_apply_status: 'applied',
    };
    delete input.failure_id;
    delete input.error;

    const errors = await validateDto(EventFailureResponseDto, input);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['state_apply_status', 'failure_id', 'error'])
    );
  });
});
