import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkerNewContactNotifications } from '@/app/worker/_components/WorkerNewContactNotifications';
import type { WorkerContactNotification } from '@/app/worker/_lib/workerNotifications';

const notification: WorkerContactNotification = {
  id: 'contact-1:2026-05-12T07:00:00.000Z',
  contactId: 'contact-1',
  companyName: '테스트업체',
  title: 'box.dxf',
  numberLabel: '260512-O-001',
  processStage: 'drawing',
  inquiryType: 'cutting_request',
  source: 'webhard',
  createdAt: '2026-05-12T07:00:00.000Z',
  receivedAt: 1778569200000,
  readAt: null,
};

const secondNotification: WorkerContactNotification = {
  ...notification,
  id: 'contact-2:2026-05-12T07:01:00.000Z',
  contactId: 'contact-2',
  companyName: '두번째업체',
  title: 'plate.ai',
  numberLabel: '260512-S-002',
  createdAt: '2026-05-12T07:01:00.000Z',
  receivedAt: 1778569260000,
  readAt: null,
};

describe('WorkerNewContactNotifications', () => {
  it('새 문의 개수와 목록을 크게 표시하고 항목 클릭 시 읽음 처리하며 드롭다운을 유지한다', async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn();
    const onMarkRead = jest.fn();
    const onMarkAllRead = jest.fn();
    const onClose = jest.fn();
    const onClear = jest.fn();

    render(
      <WorkerNewContactNotifications
        notifications={[notification]}
        onOpen={onOpen}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onClose={onClose}
        onClear={onClear}
      />
    );

    expect(screen.getByLabelText('새 문의 알림 1건')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /새 문의 알림/ }));

    const dropdown = screen.getByTestId('worker-new-contact-dropdown');
    expect(dropdown).toHaveClass('w-96');
    expect(dropdown).toHaveClass('max-w-[calc(100vw-2rem)]');
    expect(dropdown).toHaveClass('data-[state=open]:duration-150');
    expect(screen.getByText('1건 · 미확인 1건')).toBeInTheDocument();
    const unreadDot = screen.getByTestId('worker-new-contact-unread-dot-contact-1');
    expect(unreadDot).toBeInTheDocument();
    expect(unreadDot).toHaveClass('relative', 'flex', 'h-2.5', 'w-2.5');
    expect(unreadDot).not.toHaveClass('mt-1.5');
    expect(unreadDot.parentElement).toHaveClass('items-center');
    expect(screen.getByText('테스트업체')).toBeInTheDocument();
    expect(screen.getByText('260512-O-001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /테스트업체 새 문의로 이동/ }));
    expect(onOpen).toHaveBeenCalledWith(notification);
    expect(onMarkRead).toHaveBeenCalledWith(notification.id);
    expect(screen.getByTestId('worker-new-contact-dropdown')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /새 문의 알림/ }));
    await user.click(screen.getByRole('button', { name: '비우기' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('모두 확인 버튼으로 현재 알림을 전부 읽음 처리한다', async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn();
    const onMarkRead = jest.fn();
    const onMarkAllRead = jest.fn();
    const onClear = jest.fn();

    render(
      <WorkerNewContactNotifications
        notifications={[notification, secondNotification]}
        onOpen={onOpen}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onClose={jest.fn()}
        onClear={onClear}
      />
    );

    await user.click(screen.getByRole('button', { name: /새 문의 알림/ }));

    expect(screen.getByText('2건 · 미확인 2건')).toBeInTheDocument();
    expect(screen.getByTestId('worker-new-contact-unread-dot-contact-1')).toBeInTheDocument();
    expect(screen.getByTestId('worker-new-contact-unread-dot-contact-2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '모두 확인' }));

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
  });

  it('읽음 알림은 회색 텍스트로 표시하고 빨간 새 문의 점을 숨긴다', async () => {
    const user = userEvent.setup();
    const readNotification: WorkerContactNotification = {
      ...notification,
      readAt: 1778569300000,
    };

    render(
      <WorkerNewContactNotifications
        notifications={[readNotification]}
        onOpen={jest.fn()}
        onMarkRead={jest.fn()}
        onMarkAllRead={jest.fn()}
        onClose={jest.fn()}
        onClear={jest.fn()}
      />
    );

    expect(screen.getByLabelText('새 문의 알림 0건')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /새 문의 알림/ }));

    expect(screen.getByText('1건 · 미확인 0건')).toBeInTheDocument();
    expect(screen.queryByTestId('worker-new-contact-unread-dot-contact-1')).toBeNull();
    expect(screen.getByText('테스트업체')).toHaveClass('text-gray-400');
    expect(screen.getByText('box.dxf')).toHaveClass('text-gray-400');
    expect(screen.getByText('260512-O-001')).toHaveClass('bg-gray-50', 'text-gray-400');
  });

  it('알림 목록은 처음 12개만 렌더하고 스크롤 하단에서 다음 묶음을 표시한다', async () => {
    const user = userEvent.setup();
    const notifications = Array.from({ length: 13 }, (_, index) => ({
      ...notification,
      id: `contact-${index + 1}:2026-05-12T07:00:00.000Z`,
      contactId: `contact-${index + 1}`,
      companyName: `업체${index + 1}`,
      title: `file-${index + 1}.dxf`,
    }));

    render(
      <WorkerNewContactNotifications
        notifications={notifications}
        onOpen={jest.fn()}
        onMarkRead={jest.fn()}
        onMarkAllRead={jest.fn()}
        onClose={jest.fn()}
        onClear={jest.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /새 문의 알림/ }));

    expect(screen.getByText('file-12.dxf')).toBeInTheDocument();
    expect(screen.queryByText('file-13.dxf')).toBeNull();

    const list = screen.getByTestId('worker-new-contact-list');
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollTop', { configurable: true, value: 700 });

    fireEvent.scroll(list);

    expect(screen.getByText('file-13.dxf')).toBeInTheDocument();
  });
});
