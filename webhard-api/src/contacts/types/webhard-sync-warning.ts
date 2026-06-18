export type WebhardSyncWarningCode =
  | 'NO_INQUIRY_NUMBER'
  | 'FOLDER_CREATE_FAILED'
  | 'RELOCATE_FAILED'
  | 'UNKNOWN';

export interface WebhardSyncWarning {
  code: WebhardSyncWarningCode;
  message: string;
}
