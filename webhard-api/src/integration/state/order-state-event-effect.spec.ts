import {
  ORDER_STATE_EVENT_EFFECT_DEFINITIONS,
  resolveOrderStateEventEffects,
} from './order-state-event-effect';

describe('ORDER_STATE_EVENT_EFFECT_DEFINITIONS', () => {
  it('대표 이벤트 타입을 계약서의 주문 상태 축으로 매핑한다', () => {
    expect(ORDER_STATE_EVENT_EFFECT_DEFINITIONS['drawing.classified']).toEqual([
      {
        target: 'order',
        axis: 'classification',
        dbField: 'classificationStatus',
        eventField: 'classification_status',
      },
    ]);
    expect(ORDER_STATE_EVENT_EFFECT_DEFINITIONS['nesting.completed']).toEqual([
      {
        target: 'order',
        axis: 'nesting',
        dbField: 'nestingStatus',
        eventField: 'nesting_status',
      },
    ]);
    expect(ORDER_STATE_EVENT_EFFECT_DEFINITIONS['invoice.failed']).toEqual([
      {
        target: 'order',
        axis: 'billing',
        dbField: 'billingStatus',
        eventField: 'billing_status',
      },
    ]);
  });

  it('이벤트 타입에 지정된 상태 축만 상태 변경 effect로 반환한다', () => {
    expect(
      resolveOrderStateEventEffects('drawing.classified', {
        classification_status: 'CLASSIFIED',
        billing_status: 'SENT',
      })
    ).toEqual({
      ok: true,
      effects: [
        {
          target: 'order',
          axis: 'classification',
          dbField: 'classificationStatus',
          eventField: 'classification_status',
          value: 'CLASSIFIED',
        },
      ],
    });

    expect(
      resolveOrderStateEventEffects('nesting.completed', {
        nesting_status: 'NESTING_COMPLETED',
        production_status: 'LASER_READY',
      })
    ).toEqual({
      ok: true,
      effects: [
        {
          target: 'order',
          axis: 'nesting',
          dbField: 'nestingStatus',
          eventField: 'nesting_status',
          value: 'NESTING_COMPLETED',
        },
      ],
    });
  });

  it('상태 효과가 없는 이벤트는 빈 effect 목록을 반환한다', () => {
    expect(resolveOrderStateEventEffects('worker.ping', { heartbeat: true })).toEqual({
      ok: true,
      effects: [],
    });
  });

  it('필수 상태 payload가 없거나 축에 없는 값이면 실패 이유를 반환한다', () => {
    expect(resolveOrderStateEventEffects('invoice.failed', { invoice_id: 'invoice-001' })).toEqual({
      ok: false,
      reason: 'MISSING_REQUIRED_STATUS',
      eventField: 'billing_status',
      effects: [],
    });

    expect(
      resolveOrderStateEventEffects('invoice.failed', { billing_status: 'CLASSIFIED' })
    ).toEqual({
      ok: false,
      reason: 'UNKNOWN_STATUS_VALUE',
      eventField: 'billing_status',
      value: 'CLASSIFIED',
      effects: [],
    });
  });
});
