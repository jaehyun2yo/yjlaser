import {
  createWorkerContactNotification,
  getWorkerNotificationTarget,
  isWorkerContactNotificationUnread,
  loadWorkerContactNotifications,
  markAllWorkerContactNotificationsRead,
  markWorkerContactNotificationRead,
  markWorkerContactNotificationsReadByContactId,
  mergeWorkerContactNotifications,
  orderWorkerContactNotificationsByReadState,
  parseWorkerContactNotifications,
  pruneExpiredReadWorkerContactNotifications,
  saveWorkerContactNotifications,
  WORKER_NEW_CONTACT_NOTIFICATIONS_STORAGE_KEY,
} from '@/app/worker/_lib/workerNotifications';
import type { WorkerContactNotification } from '@/app/worker/_lib/workerNotifications';

class MemoryStorage implements Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('worker new contact notifications', () => {
  it('contact:created snake_case payload를 Worker 알림 항목으로 변환한다', () => {
    const notification = createWorkerContactNotification({
      id: 'contact-1',
      company_name: '테스트업체',
      inquiry_title: '260512-O-001 테스트업체 box.dxf',
      inquiry_number: '260512-O-001',
      work_number: null,
      process_stage: 'drawing',
      inquiry_type: 'cutting_request',
      source: 'webhard',
      created_at: '2026-05-12T07:00:00.000Z',
    });

    expect(notification).toEqual(
      expect.objectContaining({
        contactId: 'contact-1',
        companyName: '테스트업체',
        title: '260512-O-001 테스트업체 box.dxf',
        numberLabel: '260512-O-001',
        processStage: 'drawing',
        inquiryType: 'cutting_request',
        source: 'webhard',
        readAt: null,
      })
    );
    expect(isWorkerContactNotificationUnread(notification!)).toBe(true);
  });

  it('현장 공정 새 문의는 현장 탭의 해당 공정으로 이동한다', () => {
    const notification = createWorkerContactNotification({
      id: 'contact-field',
      companyName: '현장업체',
      inquiryTitle: 'laser.dxf',
      workNumber: '260512-F-001',
      processStage: 'laser',
      inquiryType: 'laser_cutting',
      source: 'webhard',
    });

    expect(notification).not.toBeNull();
    expect(getWorkerNotificationTarget(notification!)).toEqual({
      tab: 'field',
      subFilter: 'laser',
    });
  });

  it('외부웹하드 미분류 새 문의는 사무실 탭의 미분류 필터로 이동한다', () => {
    const notification = createWorkerContactNotification({
      id: 'contact-unclassified',
      company_name: '미분류업체',
      source: 'webhard',
      inquiry_type: null,
      process_stage: null,
    });

    expect(notification).not.toBeNull();
    expect(getWorkerNotificationTarget(notification!)).toEqual({
      tab: 'office',
      subFilter: 'unclassified',
    });
  });

  it('저장된 새 문의 알림과 수신 알림을 contactId 기준 최신 1개로 병합한다', () => {
    const stored = createWorkerContactNotification({
      id: 'contact-1',
      company_name: '기존업체',
      inquiry_title: 'old.dxf',
      created_at: '2026-05-12T07:00:00.000Z',
    });
    const incoming = createWorkerContactNotification({
      id: 'contact-1',
      company_name: '새업체',
      inquiry_title: 'new.dxf',
      created_at: '2026-05-12T07:05:00.000Z',
    });
    const second = createWorkerContactNotification({
      id: 'contact-2',
      company_name: '두번째업체',
      inquiry_title: 'second.dxf',
      created_at: '2026-05-12T07:06:00.000Z',
    });

    expect(stored).not.toBeNull();
    expect(incoming).not.toBeNull();
    expect(second).not.toBeNull();

    const merged = mergeWorkerContactNotifications([stored!], [incoming!, second!], 50);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(expect.objectContaining({ contactId: 'contact-2' }));
    expect(merged[1]).toEqual(
      expect.objectContaining({
        contactId: 'contact-1',
        companyName: '새업체',
        title: 'new.dxf',
      })
    );
  });

  it('새 문의 알림 목록을 storage에 저장하고 다시 복구한다', () => {
    const storage = new MemoryStorage();
    const notification = createWorkerContactNotification({
      id: 'contact-1',
      company_name: '테스트업체',
      inquiry_title: 'box.dxf',
      created_at: '2026-05-12T07:00:00.000Z',
    });

    expect(notification).not.toBeNull();

    saveWorkerContactNotifications(storage, [notification!]);

    expect(storage.getItem(WORKER_NEW_CONTACT_NOTIFICATIONS_STORAGE_KEY)).not.toBeNull();
    expect(loadWorkerContactNotifications(storage)).toEqual<WorkerContactNotification[]>([
      notification!,
    ]);
  });

  it('legacy storage 항목에 readAt이 없어도 미확인 알림으로 복구한다', () => {
    const parsed = parseWorkerContactNotifications(
      JSON.stringify([
        {
          id: 'legacy-contact:2026-05-12T07:00:00.000Z',
          contactId: 'legacy-contact',
          companyName: '레거시업체',
          title: 'legacy.dxf',
          numberLabel: null,
          processStage: null,
          inquiryType: null,
          source: 'website',
          createdAt: '2026-05-12T07:00:00.000Z',
          receivedAt: 1778569200000,
        },
      ])
    );

    expect(parsed).toEqual([
      expect.objectContaining({
        contactId: 'legacy-contact',
        readAt: null,
      }),
    ]);
    expect(isWorkerContactNotificationUnread(parsed[0])).toBe(true);
  });

  it('알림 id 또는 contactId 기준으로 읽음 처리하고 목록 순서는 유지한다', () => {
    const first = createWorkerContactNotification({
      id: 'contact-1',
      company_name: '첫번째업체',
      created_at: '2026-05-12T07:00:00.000Z',
    });
    const second = createWorkerContactNotification({
      id: 'contact-2',
      company_name: '두번째업체',
      created_at: '2026-05-12T07:01:00.000Z',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const byId = markWorkerContactNotificationRead([first!, second!], first!.id, 1234);
    expect(byId.map((item) => item.contactId)).toEqual(['contact-1', 'contact-2']);
    expect(byId[0].readAt).toBe(1234);
    expect(byId[1].readAt).toBeNull();

    const byContactId = markWorkerContactNotificationsReadByContactId(byId, 'contact-2', 5678);
    expect(byContactId[0].readAt).toBe(1234);
    expect(byContactId[1].readAt).toBe(5678);
    expect(byContactId.every((item) => !isWorkerContactNotificationUnread(item))).toBe(true);
  });

  it('모든 알림을 읽음 처리한다', () => {
    const first = createWorkerContactNotification({ id: 'contact-1', company_name: '첫번째업체' });
    const second = createWorkerContactNotification({ id: 'contact-2', company_name: '두번째업체' });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const marked = markAllWorkerContactNotificationsRead([first!, second!], 7777);

    expect(marked).toEqual([
      expect.objectContaining({ contactId: 'contact-1', readAt: 7777 }),
      expect.objectContaining({ contactId: 'contact-2', readAt: 7777 }),
    ]);
  });

  it('드롭다운 close 시 사용할 순서로 미확인 알림을 위에, 확인 알림을 아래에 배치한다', () => {
    const unreadOld = createWorkerContactNotification({
      id: 'contact-1',
      company_name: '미확인1',
      created_at: '2026-05-12T07:00:00.000Z',
    });
    const read = createWorkerContactNotification({
      id: 'contact-2',
      company_name: '확인',
      created_at: '2026-05-12T07:01:00.000Z',
    });
    const unreadNew = createWorkerContactNotification({
      id: 'contact-3',
      company_name: '미확인2',
      created_at: '2026-05-12T07:02:00.000Z',
    });

    expect(unreadOld).not.toBeNull();
    expect(read).not.toBeNull();
    expect(unreadNew).not.toBeNull();

    const ordered = orderWorkerContactNotificationsByReadState([
      unreadOld!,
      { ...read!, readAt: 1234 },
      unreadNew!,
    ]);

    expect(ordered.map((notification) => notification.contactId)).toEqual([
      'contact-1',
      'contact-3',
      'contact-2',
    ]);
  });

  it('읽은 지 3일 지난 알림만 제거하고 미확인 알림은 오래돼도 유지한다', () => {
    const now = 1778569200000;
    const unreadOld = createWorkerContactNotification({
      id: 'contact-unread-old',
      company_name: '오래된미확인',
    });
    const readExpired = createWorkerContactNotification({
      id: 'contact-read-expired',
      company_name: '만료된확인',
    });
    const readFresh = createWorkerContactNotification({
      id: 'contact-read-fresh',
      company_name: '최근확인',
    });

    expect(unreadOld).not.toBeNull();
    expect(readExpired).not.toBeNull();
    expect(readFresh).not.toBeNull();

    const pruned = pruneExpiredReadWorkerContactNotifications(
      [
        { ...unreadOld!, receivedAt: now - 10 * 24 * 60 * 60 * 1000 },
        { ...readExpired!, readAt: now - 3 * 24 * 60 * 60 * 1000 },
        { ...readFresh!, readAt: now - 2 * 24 * 60 * 60 * 1000 },
      ],
      now
    );

    expect(pruned.map((notification) => notification.contactId)).toEqual([
      'contact-unread-old',
      'contact-read-fresh',
    ]);
  });

  it('새 문의 알림 목록이 비면 storage 값을 제거한다', () => {
    const storage = new MemoryStorage();
    const notification = createWorkerContactNotification({
      id: 'contact-1',
      company_name: '테스트업체',
    });

    expect(notification).not.toBeNull();

    saveWorkerContactNotifications(storage, [notification!]);
    saveWorkerContactNotifications(storage, []);

    expect(storage.getItem(WORKER_NEW_CONTACT_NOTIFICATIONS_STORAGE_KEY)).toBeNull();
    expect(loadWorkerContactNotifications(storage)).toEqual([]);
  });
});
