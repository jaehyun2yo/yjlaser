import {
  ORDER_STATE_AXIS_DEFINITIONS,
  ORDER_STATE_AXIS_KEYS,
  isOrderStateValue,
} from './order-state.constants';
import { ORDER_STATE_TRANSITIONS, getAllowedOrderStateTransitions } from './order-state-transition';

describe('ORDER_STATE_TRANSITIONS', () => {
  it('production 상태 축의 허용 전이표를 계약서 기준으로 고정한다', () => {
    expect(ORDER_STATE_TRANSITIONS.production).toEqual({
      RECEIVED: ['FILE_RECEIVED', 'DRAWING_REVIEW', 'BLOCKED'],
      FILE_RECEIVED: ['DRAWING_REVIEW', 'BLOCKED'],
      DRAWING_REVIEW: ['DRAWING_EDITING', 'DXF_PREPARING', 'BLOCKED'],
      DRAWING_EDITING: ['DXF_PREPARING', 'BLOCKED'],
      DXF_PREPARING: ['DXF_READY', 'BLOCKED'],
      DXF_READY: ['LASER_READY', 'BLOCKED'],
      LASER_READY: ['LASER_COMPLETED', 'BLOCKED'],
      LASER_COMPLETED: ['OSIKAL_PENDING', 'OSIKAL_COMPLETED', 'DELIVERY_PENDING', 'BLOCKED'],
      OSIKAL_PENDING: ['OSIKAL_COMPLETED', 'BLOCKED'],
      OSIKAL_COMPLETED: ['DELIVERY_PENDING', 'BLOCKED'],
      DELIVERY_PENDING: ['DELIVERED', 'BLOCKED'],
      DELIVERED: ['CLOSED', 'BLOCKED'],
      CLOSED: [],
      BLOCKED: [],
    });
  });

  it('confirmation 상태 축의 허용 전이표를 계약서 기준으로 고정한다', () => {
    expect(ORDER_STATE_TRANSITIONS.confirmation).toEqual({
      DRAWING_REVIEW: ['DRAWING_EDITING', 'CONFIRMATION_READY', 'BLOCKED'],
      DRAWING_EDITING: ['CONFIRMATION_READY', 'BLOCKED'],
      CONFIRMATION_READY: ['CONFIRMATION_SENT', 'BLOCKED'],
      CONFIRMATION_SENT: ['CONFIRMATION_WAITING', 'BLOCKED'],
      CONFIRMATION_WAITING: ['CONFIRMED', 'REVISION_REQUESTED', 'BLOCKED'],
      REVISION_REQUESTED: ['DRAWING_EDITING', 'BLOCKED'],
      CONFIRMED: ['BLOCKED'],
      BLOCKED: [],
    });
  });

  it('classification, nesting, billing 상태 축의 허용 전이표를 계약서 기준으로 고정한다', () => {
    expect(ORDER_STATE_TRANSITIONS.classification).toEqual({
      DXF_READY: ['CLASSIFICATION_PENDING', 'BLOCKED'],
      CLASSIFICATION_PENDING: ['CLASSIFIED', 'BLOCKED'],
      CLASSIFIED: ['BLOCKED'],
      BLOCKED: [],
    });
    expect(ORDER_STATE_TRANSITIONS.nesting).toEqual({
      DXF_READY: ['NESTING_PENDING', 'BLOCKED'],
      NESTING_PENDING: ['NESTING_COMPLETED', 'BLOCKED'],
      NESTING_COMPLETED: ['BLOCKED'],
      BLOCKED: [],
    });
    expect(ORDER_STATE_TRANSITIONS.billing).toEqual({
      NOT_BILLABLE: ['BILLING_READY', 'BLOCKED'],
      BILLING_READY: ['INVOICE_GENERATED', 'BLOCKED'],
      INVOICE_GENERATED: ['SEND_PENDING', 'BLOCKED'],
      SEND_PENDING: ['SENT', 'SEND_FAILED', 'BLOCKED'],
      SENT: [],
      SEND_FAILED: ['RESEND_APPROVED', 'BLOCKED'],
      RESEND_APPROVED: ['SEND_PENDING', 'BLOCKED'],
      BLOCKED: [],
    });
  });

  it('각 축의 모든 상태는 전이 matrix에 entry가 있고 target은 같은 축 상태값이다', () => {
    for (const axis of ORDER_STATE_AXIS_KEYS) {
      const statuses = ORDER_STATE_AXIS_DEFINITIONS[axis].statuses;
      const transitionRows = ORDER_STATE_TRANSITIONS[axis];

      expect(Object.keys(transitionRows).sort()).toEqual([...statuses].sort());
      for (const [from, targets] of Object.entries(transitionRows)) {
        expect(isOrderStateValue(axis, from)).toBe(true);
        for (const target of targets) {
          expect(isOrderStateValue(axis, target)).toBe(true);
        }
      }
    }
  });

  it('상태 축과 시작 상태로 허용 다음 상태 목록을 조회한다', () => {
    expect(getAllowedOrderStateTransitions('billing', 'SEND_PENDING')).toEqual([
      'SENT',
      'SEND_FAILED',
      'BLOCKED',
    ]);
    expect(getAllowedOrderStateTransitions('production', 'CLOSED')).toEqual([]);
  });
});
