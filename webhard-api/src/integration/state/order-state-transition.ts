import {
  type BillingStatus,
  type ClassificationStatus,
  type ConfirmationStatus,
  type NestingStatus,
  type OrderStateAxis,
  type ProductionStatus,
  isOrderStateValue,
} from './order-state.constants';

export type OrderStateTransitionMatrix = {
  production: Record<ProductionStatus, readonly ProductionStatus[]>;
  confirmation: Record<ConfirmationStatus, readonly ConfirmationStatus[]>;
  classification: Record<ClassificationStatus, readonly ClassificationStatus[]>;
  nesting: Record<NestingStatus, readonly NestingStatus[]>;
  billing: Record<BillingStatus, readonly BillingStatus[]>;
};

export type OrderStateTransitionFailureReason =
  | 'UNKNOWN_FROM_STATUS'
  | 'UNKNOWN_TO_STATUS'
  | 'TRANSITION_NOT_ALLOWED';

export type OrderStateTransitionValidationResult =
  | {
      allowed: true;
      reason: null;
      allowedTransitions: readonly string[];
    }
  | {
      allowed: false;
      reason: OrderStateTransitionFailureReason;
      allowedTransitions: readonly string[];
    };

export const ORDER_STATE_TRANSITIONS: OrderStateTransitionMatrix = {
  production: {
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
  },
  confirmation: {
    DRAWING_REVIEW: ['DRAWING_EDITING', 'CONFIRMATION_READY', 'BLOCKED'],
    DRAWING_EDITING: ['CONFIRMATION_READY', 'BLOCKED'],
    CONFIRMATION_READY: ['CONFIRMATION_SENT', 'BLOCKED'],
    CONFIRMATION_SENT: ['CONFIRMATION_WAITING', 'BLOCKED'],
    CONFIRMATION_WAITING: ['CONFIRMED', 'REVISION_REQUESTED', 'BLOCKED'],
    REVISION_REQUESTED: ['DRAWING_EDITING', 'BLOCKED'],
    CONFIRMED: ['BLOCKED'],
    BLOCKED: [],
  },
  classification: {
    DXF_READY: ['CLASSIFICATION_PENDING', 'BLOCKED'],
    CLASSIFICATION_PENDING: ['CLASSIFIED', 'BLOCKED'],
    CLASSIFIED: ['BLOCKED'],
    BLOCKED: [],
  },
  nesting: {
    DXF_READY: ['NESTING_PENDING', 'BLOCKED'],
    NESTING_PENDING: ['NESTING_COMPLETED', 'BLOCKED'],
    NESTING_COMPLETED: ['BLOCKED'],
    BLOCKED: [],
  },
  billing: {
    NOT_BILLABLE: ['BILLING_READY', 'BLOCKED'],
    BILLING_READY: ['INVOICE_GENERATED', 'BLOCKED'],
    INVOICE_GENERATED: ['SEND_PENDING', 'BLOCKED'],
    SEND_PENDING: ['SENT', 'SEND_FAILED', 'BLOCKED'],
    SENT: [],
    SEND_FAILED: ['RESEND_APPROVED', 'BLOCKED'],
    RESEND_APPROVED: ['SEND_PENDING', 'BLOCKED'],
    BLOCKED: [],
  },
};

export function getAllowedOrderStateTransitions(
  axis: OrderStateAxis,
  fromStatus: string
): readonly string[] {
  if (!isOrderStateValue(axis, fromStatus)) return [];

  switch (axis) {
    case 'production':
      return ORDER_STATE_TRANSITIONS.production[fromStatus as ProductionStatus];
    case 'confirmation':
      return ORDER_STATE_TRANSITIONS.confirmation[fromStatus as ConfirmationStatus];
    case 'classification':
      return ORDER_STATE_TRANSITIONS.classification[fromStatus as ClassificationStatus];
    case 'nesting':
      return ORDER_STATE_TRANSITIONS.nesting[fromStatus as NestingStatus];
    case 'billing':
      return ORDER_STATE_TRANSITIONS.billing[fromStatus as BillingStatus];
  }
}

export function validateOrderStateTransition(
  axis: OrderStateAxis,
  fromStatus: string,
  toStatus: string
): OrderStateTransitionValidationResult {
  if (!isOrderStateValue(axis, fromStatus)) {
    return {
      allowed: false,
      reason: 'UNKNOWN_FROM_STATUS',
      allowedTransitions: [],
    };
  }

  const allowedTransitions = getAllowedOrderStateTransitions(axis, fromStatus);
  if (!isOrderStateValue(axis, toStatus)) {
    return {
      allowed: false,
      reason: 'UNKNOWN_TO_STATUS',
      allowedTransitions,
    };
  }

  if (!allowedTransitions.includes(toStatus)) {
    return {
      allowed: false,
      reason: 'TRANSITION_NOT_ALLOWED',
      allowedTransitions,
    };
  }

  return {
    allowed: true,
    reason: null,
    allowedTransitions,
  };
}
