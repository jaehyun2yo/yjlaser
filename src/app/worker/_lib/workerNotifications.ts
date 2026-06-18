import type { ContactSource, InquiryType } from '@/lib/types/contact';
import type { ProcessStage } from '@/lib/utils/processStages';

export type WorkerNotificationTab = 'office' | 'field';
export type WorkerNotificationSubFilter = ProcessStage | 'all' | 'unclassified';

export interface WorkerContactNotification {
  id: string;
  contactId: string;
  companyName: string;
  title: string;
  numberLabel: string | null;
  processStage: ProcessStage;
  inquiryType: InquiryType | null;
  source: ContactSource | null;
  createdAt: string | null;
  receivedAt: number;
  readAt: number | null;
}

export const WORKER_NEW_CONTACT_NOTIFICATIONS_STORAGE_KEY =
  'yjlaser.worker.newContactNotifications.v1';

const MAX_WORKER_CONTACT_NOTIFICATIONS = 50;
const READ_NOTIFICATION_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

const FIELD_PROCESS_STAGES: ReadonlySet<NonNullable<ProcessStage>> = new Set([
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
]);

const PROCESS_STAGES: ReadonlySet<NonNullable<ProcessStage>> = new Set([
  'drawing',
  'sample',
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
]);

const INQUIRY_TYPES: ReadonlySet<InquiryType> = new Set([
  'cutting_request',
  'mold_request',
  'laser_cutting',
]);

const CONTACT_SOURCES: ReadonlySet<ContactSource> = new Set(['website', 'webhard', 'phone']);

function readString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

function readProcessStage(payload: Record<string, unknown>): ProcessStage {
  const value = readString(payload, 'process_stage', 'processStage');
  if (value && PROCESS_STAGES.has(value as NonNullable<ProcessStage>)) {
    return value as NonNullable<ProcessStage>;
  }
  return null;
}

function readInquiryType(payload: Record<string, unknown>): InquiryType | null {
  const value = readString(payload, 'inquiry_type', 'inquiryType');
  if (value && INQUIRY_TYPES.has(value as InquiryType)) return value as InquiryType;
  return null;
}

function readContactSource(payload: Record<string, unknown>): ContactSource | null {
  const value = readString(payload, 'source');
  if (value && CONTACT_SOURCES.has(value as ContactSource)) return value as ContactSource;
  return null;
}

export function createWorkerContactNotification(
  payload: Record<string, unknown>
): WorkerContactNotification | null {
  const contactId = readString(payload, 'id', 'contactId', 'contact_id');
  if (!contactId) return null;

  const companyName = readString(payload, 'company_name', 'companyName') ?? '업체 미확인';
  const title =
    readString(
      payload,
      'inquiry_title',
      'inquiryTitle',
      'drawing_file_name',
      'drawingFileName',
      'original_filename',
      'originalFilename'
    ) ?? '새 문의';
  const workNumber = readString(payload, 'work_number', 'workNumber');
  const inquiryNumber = readString(payload, 'inquiry_number', 'inquiryNumber');
  const createdAt = readString(payload, 'created_at', 'createdAt');

  return {
    id: `${contactId}:${createdAt ?? Date.now()}`,
    contactId,
    companyName,
    title,
    numberLabel: workNumber ?? inquiryNumber,
    processStage: readProcessStage(payload),
    inquiryType: readInquiryType(payload),
    source: readContactSource(payload),
    createdAt,
    receivedAt: Date.now(),
    readAt: null,
  };
}

export function getWorkerNotificationTarget(notification: WorkerContactNotification): {
  tab: WorkerNotificationTab;
  subFilter: WorkerNotificationSubFilter;
} {
  if (notification.source === 'webhard' && notification.inquiryType === null) {
    return { tab: 'office', subFilter: 'unclassified' };
  }

  if (notification.processStage !== null && FIELD_PROCESS_STAGES.has(notification.processStage)) {
    return { tab: 'field', subFilter: notification.processStage };
  }

  return {
    tab: 'office',
    subFilter: notification.processStage ?? null,
  };
}

export function mergeWorkerContactNotifications(
  current: WorkerContactNotification[],
  incoming: WorkerContactNotification[],
  limit = MAX_WORKER_CONTACT_NOTIFICATIONS
): WorkerContactNotification[] {
  let merged = [...current];

  incoming.forEach((notification) => {
    merged = [notification, ...merged.filter((item) => item.contactId !== notification.contactId)];
  });

  return merged.slice(0, limit);
}

export function isWorkerContactNotificationUnread(
  notification: WorkerContactNotification
): boolean {
  return notification.readAt === null;
}

export function markWorkerContactNotificationRead(
  notifications: WorkerContactNotification[],
  notificationId: string,
  readAt = Date.now()
): WorkerContactNotification[] {
  return notifications.map((notification) =>
    notification.id === notificationId && notification.readAt === null
      ? { ...notification, readAt }
      : notification
  );
}

export function markWorkerContactNotificationsReadByContactId(
  notifications: WorkerContactNotification[],
  contactId: string,
  readAt = Date.now()
): WorkerContactNotification[] {
  return notifications.map((notification) =>
    notification.contactId === contactId && notification.readAt === null
      ? { ...notification, readAt }
      : notification
  );
}

export function markAllWorkerContactNotificationsRead(
  notifications: WorkerContactNotification[],
  readAt = Date.now()
): WorkerContactNotification[] {
  return notifications.map((notification) =>
    notification.readAt === null ? { ...notification, readAt } : notification
  );
}

export function orderWorkerContactNotificationsByReadState(
  notifications: WorkerContactNotification[]
): WorkerContactNotification[] {
  return notifications
    .map((notification, index) => ({ notification, index }))
    .sort((left, right) => {
      const leftUnread = isWorkerContactNotificationUnread(left.notification);
      const rightUnread = isWorkerContactNotificationUnread(right.notification);
      if (leftUnread !== rightUnread) return leftUnread ? -1 : 1;
      return left.index - right.index;
    })
    .map(({ notification }) => notification);
}

export function pruneExpiredReadWorkerContactNotifications(
  notifications: WorkerContactNotification[],
  now = Date.now()
): WorkerContactNotification[] {
  return notifications.filter(
    (notification) =>
      notification.readAt === null || now - notification.readAt < READ_NOTIFICATION_RETENTION_MS
  );
}

function isWorkerContactNotification(value: unknown): value is WorkerContactNotification {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.contactId === 'string' &&
    typeof candidate.companyName === 'string' &&
    typeof candidate.title === 'string' &&
    (typeof candidate.numberLabel === 'string' || candidate.numberLabel === null) &&
    (candidate.processStage === null ||
      (typeof candidate.processStage === 'string' &&
        PROCESS_STAGES.has(candidate.processStage as NonNullable<ProcessStage>))) &&
    (candidate.inquiryType === null ||
      (typeof candidate.inquiryType === 'string' &&
        INQUIRY_TYPES.has(candidate.inquiryType as InquiryType))) &&
    (candidate.source === null ||
      (typeof candidate.source === 'string' &&
        CONTACT_SOURCES.has(candidate.source as ContactSource))) &&
    (typeof candidate.createdAt === 'string' || candidate.createdAt === null) &&
    typeof candidate.receivedAt === 'number' &&
    (candidate.readAt === undefined ||
      candidate.readAt === null ||
      typeof candidate.readAt === 'number')
  );
}

export function parseWorkerContactNotifications(
  rawValue: string | null
): WorkerContactNotification[] {
  if (!rawValue) return [];

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isWorkerContactNotification)
      .map((notification) => ({ ...notification, readAt: notification.readAt ?? null }))
      .slice(0, MAX_WORKER_CONTACT_NOTIFICATIONS);
  } catch {
    return [];
  }
}

export function loadWorkerContactNotifications(
  storage: Pick<Storage, 'getItem'>
): WorkerContactNotification[] {
  return parseWorkerContactNotifications(
    storage.getItem(WORKER_NEW_CONTACT_NOTIFICATIONS_STORAGE_KEY)
  );
}

export function saveWorkerContactNotifications(
  storage: Pick<Storage, 'removeItem' | 'setItem'>,
  notifications: WorkerContactNotification[]
): void {
  if (notifications.length === 0) {
    storage.removeItem(WORKER_NEW_CONTACT_NOTIFICATIONS_STORAGE_KEY);
    return;
  }

  storage.setItem(
    WORKER_NEW_CONTACT_NOTIFICATIONS_STORAGE_KEY,
    JSON.stringify(notifications.slice(0, MAX_WORKER_CONTACT_NOTIFICATIONS))
  );
}
