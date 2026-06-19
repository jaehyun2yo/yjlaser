export const PRODUCTION_STATUSES = [
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
] as const;

export const CONFIRMATION_STATUSES = [
  'DRAWING_REVIEW',
  'DRAWING_EDITING',
  'CONFIRMATION_READY',
  'CONFIRMATION_SENT',
  'CONFIRMATION_WAITING',
  'REVISION_REQUESTED',
  'CONFIRMED',
  'BLOCKED',
] as const;

export const CLASSIFICATION_STATUSES = [
  'DXF_READY',
  'CLASSIFICATION_PENDING',
  'CLASSIFIED',
  'BLOCKED',
] as const;

export const NESTING_STATUSES = [
  'DXF_READY',
  'NESTING_PENDING',
  'NESTING_COMPLETED',
  'BLOCKED',
] as const;

export const BILLING_STATUSES = [
  'NOT_BILLABLE',
  'BILLING_READY',
  'INVOICE_GENERATED',
  'SEND_PENDING',
  'SENT',
  'SEND_FAILED',
  'RESEND_APPROVED',
  'BLOCKED',
] as const;

export const ORDER_STATE_AXIS_KEYS = [
  'production',
  'confirmation',
  'classification',
  'nesting',
  'billing',
] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];
export type NestingStatus = (typeof NESTING_STATUSES)[number];
export type BillingStatus = (typeof BILLING_STATUSES)[number];
export type OrderStateAxis = (typeof ORDER_STATE_AXIS_KEYS)[number];

export const ORDER_STATE_AXIS_DEFINITIONS = {
  production: {
    dbField: 'productionStatus',
    eventField: 'production_status',
    statuses: PRODUCTION_STATUSES,
  },
  confirmation: {
    dbField: 'confirmationStatus',
    eventField: 'confirmation_status',
    statuses: CONFIRMATION_STATUSES,
  },
  classification: {
    dbField: 'classificationStatus',
    eventField: 'classification_status',
    statuses: CLASSIFICATION_STATUSES,
  },
  nesting: {
    dbField: 'nestingStatus',
    eventField: 'nesting_status',
    statuses: NESTING_STATUSES,
  },
  billing: {
    dbField: 'billingStatus',
    eventField: 'billing_status',
    statuses: BILLING_STATUSES,
  },
} as const;

export type OrderStateDbField = (typeof ORDER_STATE_AXIS_DEFINITIONS)[OrderStateAxis]['dbField'];
export type OrderStateEventField =
  (typeof ORDER_STATE_AXIS_DEFINITIONS)[OrderStateAxis]['eventField'];

export function isOrderStateAxis(value: string): value is OrderStateAxis {
  return value in ORDER_STATE_AXIS_DEFINITIONS;
}

export function isOrderStateValue(axis: OrderStateAxis, value: string): boolean {
  return (ORDER_STATE_AXIS_DEFINITIONS[axis].statuses as readonly string[]).includes(value);
}
