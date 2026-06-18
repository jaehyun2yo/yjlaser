export type NotificationCategory = 'all' | 'webhard' | 'integration' | 'work-management';

export interface NotificationUnreadSummary {
  all: number;
  webhard: number;
  integration: number;
  workManagement: number;
}

export const NOTIFICATION_CATEGORY_OPTIONS: Array<{
  value: NotificationCategory;
  label: string;
  summaryKey: keyof NotificationUnreadSummary;
}> = [
  { value: 'all', label: '전체', summaryKey: 'all' },
  { value: 'webhard', label: '웹하드', summaryKey: 'webhard' },
  { value: 'integration', label: '통합관리', summaryKey: 'integration' },
  { value: 'work-management', label: '작업관리', summaryKey: 'workManagement' },
];

export function getNotificationCategory(type: string): Exclude<NotificationCategory, 'all'> {
  if (
    type === 'file_uploaded' ||
    type === 'webhard_company_mismatch' ||
    type === 'webhard_classify_failed'
  ) {
    return 'webhard';
  }

  if (
    type === 'company_approval_pending' ||
    type === 'company_created' ||
    type === 'company_status_updated' ||
    type === 'company_approved' ||
    type === 'booking_created' ||
    type === 'booking_updated' ||
    type === 'booking_cancelled' ||
    type === 'worker_created' ||
    type === 'worker_updated'
  ) {
    return 'integration';
  }

  return 'work-management';
}
