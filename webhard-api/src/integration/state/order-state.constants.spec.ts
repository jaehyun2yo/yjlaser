import {
  BILLING_STATUSES,
  CLASSIFICATION_STATUSES,
  CONFIRMATION_STATUSES,
  NESTING_STATUSES,
  ORDER_STATE_AXIS_DEFINITIONS,
  ORDER_STATE_AXIS_KEYS,
  PRODUCTION_STATUSES,
  isOrderStateAxis,
  isOrderStateValue,
} from './order-state.constants';

describe('order state constants', () => {
  it('계약 문서의 production 상태 축 값을 고정한다', () => {
    expect(PRODUCTION_STATUSES).toEqual([
      'RECEIVED',
      'FILE_RECEIVED',
      'DRAWING_REVIEW',
      'DRAWING_EDITING',
      'DXF_PREPARING',
      'DXF_READY',
      'LASER_READY',
      'LASER_COMPLETED',
      'OSIKAL_PENDING',
      'OSIKAL_COMPLETED',
      'DELIVERY_PENDING',
      'DELIVERED',
      'CLOSED',
      'BLOCKED',
    ]);
  });

  it('계약 문서의 병렬 상태 축 값을 고정한다', () => {
    expect(CONFIRMATION_STATUSES).toEqual([
      'DRAWING_REVIEW',
      'DRAWING_EDITING',
      'CONFIRMATION_READY',
      'CONFIRMATION_SENT',
      'CONFIRMATION_WAITING',
      'REVISION_REQUESTED',
      'CONFIRMED',
      'BLOCKED',
    ]);
    expect(CLASSIFICATION_STATUSES).toEqual([
      'DXF_READY',
      'CLASSIFICATION_PENDING',
      'CLASSIFIED',
      'BLOCKED',
    ]);
    expect(NESTING_STATUSES).toEqual([
      'DXF_READY',
      'NESTING_PENDING',
      'NESTING_COMPLETED',
      'BLOCKED',
    ]);
    expect(BILLING_STATUSES).toEqual([
      'NOT_BILLABLE',
      'BILLING_READY',
      'INVOICE_GENERATED',
      'SEND_PENDING',
      'SENT',
      'SEND_FAILED',
      'RESEND_APPROVED',
      'BLOCKED',
    ]);
  });

  it('각 상태 축의 DB field와 event field를 고정한다', () => {
    expect(ORDER_STATE_AXIS_KEYS).toEqual([
      'production',
      'confirmation',
      'classification',
      'nesting',
      'billing',
    ]);
    expect(ORDER_STATE_AXIS_DEFINITIONS.production).toMatchObject({
      dbField: 'productionStatus',
      eventField: 'production_status',
    });
    expect(ORDER_STATE_AXIS_DEFINITIONS.confirmation).toMatchObject({
      dbField: 'confirmationStatus',
      eventField: 'confirmation_status',
    });
    expect(ORDER_STATE_AXIS_DEFINITIONS.classification).toMatchObject({
      dbField: 'classificationStatus',
      eventField: 'classification_status',
    });
    expect(ORDER_STATE_AXIS_DEFINITIONS.nesting).toMatchObject({
      dbField: 'nestingStatus',
      eventField: 'nesting_status',
    });
    expect(ORDER_STATE_AXIS_DEFINITIONS.billing).toMatchObject({
      dbField: 'billingStatus',
      eventField: 'billing_status',
    });
  });

  it('상태 축과 상태값 type guard를 제공한다', () => {
    expect(isOrderStateAxis('production')).toBe(true);
    expect(isOrderStateAxis('legacy')).toBe(false);
    expect(isOrderStateValue('classification', 'CLASSIFIED')).toBe(true);
    expect(isOrderStateValue('classification', 'NESTING_COMPLETED')).toBe(false);
    expect(isOrderStateValue('billing', 'SEND_FAILED')).toBe(true);
  });

  it('각 축의 상태값은 중복 없이 BLOCKED를 포함한다', () => {
    for (const axis of ORDER_STATE_AXIS_KEYS) {
      const statuses = ORDER_STATE_AXIS_DEFINITIONS[axis].statuses;

      expect(new Set(statuses).size).toBe(statuses.length);
      expect(statuses).toContain('BLOCKED');
    }
  });
});
