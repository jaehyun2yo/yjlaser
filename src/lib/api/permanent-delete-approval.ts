export const PERMANENT_DELETE_CONFIRMATION = 'PERMANENT_DELETE';

export const PERMANENT_DELETE_APPROVAL = {
  confirmPermanentDelete: true,
  confirmationText: PERMANENT_DELETE_CONFIRMATION,
} as const;

export type PermanentDeleteApproval = typeof PERMANENT_DELETE_APPROVAL;
